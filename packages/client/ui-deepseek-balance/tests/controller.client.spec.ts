/**
 * The browser reader: the cadence it arms, the read it joins, what it keeps
 * across a failed refresh, and how it stops.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEEPSEEK_BALANCE_PATH } from '../src/wire.ts'
import { DeepSeekBalanceController } from '../src/client/controller.ts'

const READING = {
  ok: true,
  available: true,
  balances: [{ currency: 'CNY', total: '110.00', granted: '0.00', toppedUp: '110.00' }],
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** A carrier answering every request with one payload. */
function answering(body: unknown, status = 200): Fetch {
  return async () => Response.json(body, { status })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('DeepSeekBalanceController', () => {
  it('defaults to the browser carrier, the product cadence, and the wall clock', async () => {
    const fetcher = vi.fn(answering(READING))
    vi.stubGlobal('fetch', fetcher)
    const controller = new DeepSeekBalanceController()
    controller.start()
    await vi.waitFor(() => { expect(controller.store.getSnapshot().phase).toBe('ready') })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(controller.store.getSnapshot().reading?.fetchedAt).toBeGreaterThan(0)
    await controller.dispose()
  })

  it.each([
    ['https://harness.example', 'https://harness.example'],
    ['null', 'http://dsh.internal'],
  ])('addresses the host through a %s page origin', async (origin, base) => {
    vi.stubGlobal('location', { origin })
    const fetcher = vi.fn(answering(READING))
    const controller = new DeepSeekBalanceController(fetcher)
    await controller.refresh()
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`${base}${DEEPSEEK_BALANCE_PATH}`)
    await controller.dispose()
  })

  it('reads once at start and then on the cadence', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(answering(READING))
    const controller = new DeepSeekBalanceController(fetcher, 1_000, () => 42)
    controller.start()
    expect(controller.store.getSnapshot()).toEqual({ phase: 'loading' })
    await vi.advanceTimersByTimeAsync(0)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(controller.store.getSnapshot()).toEqual({
      phase: 'ready',
      reading: { available: true, balances: READING.balances, fetchedAt: 42 },
    })
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`http://dsh.internal${DEEPSEEK_BALANCE_PATH}`)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(fetcher).toHaveBeenCalledTimes(4)
    await controller.dispose()
    await vi.advanceTimersByTimeAsync(4_000)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('arms one cadence when start is called twice', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(answering(READING))
    const controller = new DeepSeekBalanceController(fetcher, 1_000)
    controller.start()
    controller.start()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fetcher).toHaveBeenCalledTimes(3)
    await controller.dispose()
  })

  it('joins the read already in flight instead of asking twice', async () => {
    let release = (): void => {}
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => {
      release = () => { resolve(Response.json(READING)) }
    }))
    const controller = new DeepSeekBalanceController(fetcher)
    const first = controller.refresh()
    const second = controller.refresh()
    expect(second).toBe(first)
    release()
    await first
    expect(fetcher).toHaveBeenCalledOnce()
    await controller.dispose()
  })

  it('keeps the last amount when a refresh fails', async () => {
    let answer: () => Promise<Response> = () => Promise.resolve(Response.json(READING))
    const controller = new DeepSeekBalanceController(() => answer(), 1_000, () => 7)
    await controller.refresh()
    answer = () => Promise.resolve(Response.json(
      { ok: false, code: 'unauthorized', message: 'the provider rejected the credential (HTTP 401)' },
      { status: 502 },
    ))
    await controller.refresh()
    expect(controller.store.getSnapshot()).toEqual({
      phase: 'error',
      failure: { code: 'unauthorized', message: 'the provider rejected the credential (HTTP 401)' },
      reading: { available: true, balances: READING.balances, fetchedAt: 7 },
    })
  })

  it('reports a body it cannot read as an invalid response', async () => {
    const controller = new DeepSeekBalanceController(answering({ unexpected: true }, 200))
    await controller.refresh()
    expect(controller.store.getSnapshot()).toEqual({
      phase: 'error',
      failure: {
        code: 'invalid-response',
        message: 'the host answered HTTP 200 with no readable balance',
      },
    })
    await controller.dispose()
  })

  it('reports a body that is not JSON as an invalid response', async () => {
    const controller = new DeepSeekBalanceController(async () => new Response('not json', { status: 200 }))
    await controller.refresh()
    expect(controller.store.getSnapshot()).toMatchObject({
      phase: 'error',
      failure: { code: 'invalid-response' },
    })
    await controller.dispose()
  })

  it('reports a carrier failure that never reached the host', async () => {
    const controller = new DeepSeekBalanceController(() => Promise.reject(new Error('Failed to fetch')))
    await controller.refresh()
    expect(controller.store.getSnapshot()).toEqual({
      phase: 'error',
      failure: { code: 'unreachable', message: 'Failed to fetch' },
    })
    await controller.dispose()
  })

  it('reports a carrier failure that threw a non-Error value', async () => {
    const controller = new DeepSeekBalanceController(
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- the non-Error rejection is the case under test
      () => Promise.reject('socket closed'),
    )
    await controller.refresh()
    expect(controller.store.getSnapshot()).toMatchObject({
      phase: 'error',
      failure: { code: 'unreachable', message: 'socket closed' },
    })
    await controller.dispose()
  })

  it('abandons the read it aborts and publishes nothing for it', async () => {
    let seen: AbortSignal | undefined
    const controller = new DeepSeekBalanceController((_input, init) => new Promise((_resolve, reject) => {
      seen = init?.signal ?? undefined
      init?.signal?.addEventListener('abort', () => { reject(new Error('aborted')) })
    }))
    const pending = controller.refresh()
    await controller.dispose()
    await pending
    expect(seen?.aborted).toBe(true)
    expect(controller.store.getSnapshot()).toEqual({ phase: 'loading' })
  })

  it('ignores a refresh after disposal', async () => {
    const fetcher = vi.fn(answering(READING))
    const controller = new DeepSeekBalanceController(fetcher)
    await controller.dispose()
    await controller.refresh()
    controller.start()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
