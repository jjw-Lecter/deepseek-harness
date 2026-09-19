/**
 * One provider read: the endpoint it addresses, the credential it presents,
 * and every answer — amounts, a rejection, a broken body, a deadline, and the
 * requesting client's own abort.
 */

import { describe, expect, it, vi } from 'vitest'
import { balanceEndpoint, readDeepSeekBalance, type BalanceConnection } from '../src/balance.ts'

const CONNECTION: BalanceConnection = { baseURL: 'https://api.deepseek.com', apiKey: 'sk-test' }

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** A carrier that answers every request with one response. */
function answering(response: Response): Fetch {
  return async () => response
}

/** A carrier that never answers until its request is aborted, as `fetch` behaves. */
const hanging: Fetch = (_input, init) => new Promise((_resolve, reject) => {
  const signal = init?.signal
  signal?.addEventListener('abort', () => {
    const reason: unknown = signal.reason
    // `fetch` rejects with the signal's own reason, which is not typed as an Error.
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- mirroring the carrier's rejection reason
    reject(reason ?? new Error('the request was aborted'))
  })
})

/** A provider body carrying one CNY balance. */
const BODY = {
  is_available: true,
  balance_infos: [
    { currency: 'CNY', total_balance: '110.00', granted_balance: '0.00', topped_up_balance: '110.00' },
  ],
}

/** The provider's answer for one JSON body. */
function answer(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('balanceEndpoint', () => {
  it('appends the endpoint below a root with or without a trailing slash', () => {
    expect(balanceEndpoint('https://api.deepseek.com')).toBe('https://api.deepseek.com/user/balance')
    expect(balanceEndpoint('https://api.deepseek.com/')).toBe('https://api.deepseek.com/user/balance')
  })
})

describe('readDeepSeekBalance', () => {
  it('presents the credential to the provider and returns its amounts', async () => {
    const fetcher = vi.fn(answering(answer(BODY)))
    const outcome = await readDeepSeekBalance(CONNECTION, 1_000, new AbortController().signal, fetcher)
    expect(outcome).toEqual({
      ok: true,
      available: true,
      balances: [{ currency: 'CNY', total: '110.00', granted: '0.00', toppedUp: '110.00' }],
    })
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.deepseek.com/user/balance')
    expect(init.headers).toEqual({ authorization: 'Bearer sk-test', accept: 'application/json' })
  })

  it('reports a provider that answers an empty balance list as a reading', async () => {
    const outcome = await readDeepSeekBalance(
      CONNECTION, 1_000, new AbortController().signal, answering(answer({ is_available: false, balance_infos: [] })),
    )
    expect(outcome).toEqual({ ok: true, available: false, balances: [] })
  })

  it('drops an amount entry the provider stated incompletely', async () => {
    const outcome = await readDeepSeekBalance(CONNECTION, 1_000, new AbortController().signal, answering(answer({
      is_available: true,
      balance_infos: [
        { currency: 'USD', total_balance: '12.50' },
        { currency: 'CNY', total_balance: '110.00', granted_balance: '0.00', topped_up_balance: '110.00' },
      ],
    })))
    expect(outcome).toEqual({
      ok: true,
      available: true,
      balances: [{ currency: 'CNY', total: '110.00', granted: '0.00', toppedUp: '110.00' }],
    })
  })

  it.each([
    ['a non-object entry', 'CNY'],
    ['a null entry', null],
    ['an entry with an empty currency', { ...BODY.balance_infos[0], currency: '' }],
  ])('drops %s beside a readable one', async (_label, entry) => {
    const outcome = await readDeepSeekBalance(CONNECTION, 1_000, new AbortController().signal, answering(answer({
      is_available: true,
      balance_infos: [entry, BODY.balance_infos[0]],
    })))
    expect(outcome).toEqual({
      ok: true,
      available: true,
      balances: [{ currency: 'CNY', total: '110.00', granted: '0.00', toppedUp: '110.00' }],
    })
  })

  it.each([
    ['a rejected credential', answer(BODY, 401), 'unauthorized'],
    ['a forbidden credential', answer(BODY, 403), 'unauthorized'],
    ['a provider failure', answer({ error: 'boom' }, 500), 'unreachable'],
  ])('maps %s to %s', async (_label, response, code) => {
    const outcome = await readDeepSeekBalance(CONNECTION, 1_000, new AbortController().signal, answering(response))
    expect(outcome).toMatchObject({ ok: false, code })
  })

  it('carries the provider status and body into an unreachable failure', async () => {
    const outcome = await readDeepSeekBalance(
      CONNECTION, 1_000, new AbortController().signal, answering(new Response('upstream is down', { status: 502 })),
    )
    expect(outcome).toEqual({
      ok: false,
      code: 'unreachable',
      message: 'the provider answered HTTP 502 upstream is down',
    })
  })

  it('reports a failed answer whose body could not be read at all', async () => {
    const bodyless = {
      ok: false,
      status: 503,
      text: () => Promise.reject(new Error('stream closed')),
    } as unknown as Response
    const outcome = await readDeepSeekBalance(CONNECTION, 1_000, new AbortController().signal, answering(bodyless))
    expect(outcome).toEqual({
      ok: false,
      code: 'unreachable',
      message: 'the provider answered HTTP 503',
    })
  })

  it('truncates detail so one failure message stays one line', async () => {
    const outcome = await readDeepSeekBalance(
      CONNECTION, 1_000, new AbortController().signal, answering(new Response('x'.repeat(400), { status: 500 })),
    )
    expect(outcome).toMatchObject({ ok: false, code: 'unreachable' })
    const message = (outcome as { message: string }).message
    expect(message.startsWith('the provider answered HTTP 500 xxx')).toBe(true)
    // The cap applies to the whole message, and the elision marks the cut.
    expect(message).toHaveLength(201)
    expect(message.endsWith('…')).toBe(true)
  })

  it.each([
    ['a body that is not JSON', new Response('not json', { status: 200 })],
    ['a body that is not an object', answer('"reading"')],
    ['a null body', answer(null)],
    ['a body missing the availability flag', answer({ balance_infos: [] })],
    ['a body whose balance list is not an array', answer({ is_available: true, balance_infos: 'CNY' })],
    ['a list whose every entry lacks an amount', answer({ is_available: true, balance_infos: [{ currency: 'CNY' }] })],
  ])('refuses %s', async (_label, response) => {
    const outcome = await readDeepSeekBalance(CONNECTION, 1_000, new AbortController().signal, answering(response))
    expect(outcome).toMatchObject({ ok: false, code: 'invalid-response' })
  })

  it('reports a transport failure that never reached the provider', async () => {
    const outcome = await readDeepSeekBalance(
      CONNECTION,
      1_000,
      new AbortController().signal,
      () => Promise.reject(new Error('connect ECONNREFUSED')),
    )
    expect(outcome).toEqual({ ok: false, code: 'unreachable', message: 'connect ECONNREFUSED' })
  })

  it('reports a transport failure that threw a non-Error value', async () => {
    const outcome = await readDeepSeekBalance(
      CONNECTION,
      1_000,
      new AbortController().signal,
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error rejection is the case under test
      () => Promise.reject('socket closed'),
    )
    expect(outcome).toEqual({ ok: false, code: 'unreachable', message: 'socket closed' })
  })

  it('reports a deadline the provider never answered within', async () => {
    const outcome = await readDeepSeekBalance(CONNECTION, 5, new AbortController().signal, hanging)
    expect(outcome).toEqual({
      ok: false,
      code: 'timeout',
      message: 'no answer from https://api.deepseek.com/user/balance within 5 ms',
    })
  })

  it('propagates the requesting client abort instead of reporting an outcome', async () => {
    const abort = new AbortController()
    const pending = readDeepSeekBalance(CONNECTION, 10_000, abort.signal, hanging)
    abort.abort(new Error('the client left'))
    await expect(pending).rejects.toThrow('the client left')
  })
})
