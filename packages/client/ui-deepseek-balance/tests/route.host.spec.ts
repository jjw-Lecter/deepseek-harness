/**
 * The balance route on a real Host composition: which credential it resolves,
 * what it answers for every provider outcome, and that it leaves with its
 * plugin. The provider itself is a real HTTP server on loopback, so the read
 * crosses `fetch` exactly as it does in the product.
 */

import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import { apply, Config, inject, name } from '../src/index.ts'
import { DEEPSEEK_BALANCE_PATH } from '../src/wire.ts'

/** The provider body one answer carries. */
const BODY = {
  is_available: true,
  balance_infos: [
    { currency: 'CNY', total_balance: '110.00', granted_balance: '0.00', topped_up_balance: '110.00' },
  ],
}

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => { server.close(() => { resolve() }) })))
})

/**
 * Serve one balance answer and record what the caller presented.
 * @param status - HTTP status to answer with.
 * @param body - response body text.
 * @returns the provider root plus the recorded requests.
 */
async function provider(status = 200, body = JSON.stringify(BODY)) {
  const requests: { url: string | undefined; authorization: string | undefined }[] = []
  const server = createServer((request, response) => {
    requests.push({ url: request.url, authorization: request.headers.authorization })
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(body)
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const { port } = server.address() as AddressInfo
  return { baseURL: `http://127.0.0.1:${String(port)}`, requests }
}

interface BenchOptions {
  /** Value the credential seam resolves for the configured reference. */
  readonly apiKey?: string
}

/** Stand-in for the composition's Connection and credential services. */
function bench(options: BenchOptions = {}) {
  const ctx = new Context()
  const routes: ConnectionFetchRoute[] = []
  const disposed = vi.fn()
  ctx.provide('connection', {
    fetch: {
      register: (route: ConnectionFetchRoute) => {
        routes.push(route)
        return () => { disposed(); return Promise.resolve() }
      },
    },
  } as never)
  ctx.provide('credentials', {
    resolve: (ref: string) => Promise.resolve(options.apiKey === undefined ? undefined : { value: options.apiKey, source: ref }),
  } as never)
  return { ctx, routes, disposed }
}

/**
 * Mount the host half and hand back its route.
 * @param config - the row's config subset.
 * @param options - composition facts.
 * @returns the bench plus the mounted fiber.
 */
async function mount(config: Partial<Config> = {}, options: BenchOptions = {}) {
  const b = bench(options)
  const fiber = b.ctx.plugin({ inject: [...inject], apply, Config, name }, config)
  await fiber.await()
  const route = b.routes[0]
  if (route === undefined) throw new Error('the balance route was not registered')
  return { ...b, fiber, route }
}

/** One balance request, as the browser sends it. */
const read = (route: ConnectionFetchRoute): Promise<Response> =>
  route.fetch(new Request(`http://127.0.0.1${DEEPSEEK_BALANCE_PATH}`))

describe('ui-deepseek-balance host half', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['connection', 'credentials'])
  })

  it('registers one GET route on the shared API channel', async () => {
    const provider1 = await provider()
    const b = await mount({ baseURL: provider1.baseURL }, { apiKey: 'sk-live' })
    expect(b.routes.map(route => [route.path, route.methods, route.requestBody]))
      .toEqual([[DEEPSEEK_BALANCE_PATH, ['GET'], 'buffered']])
    expect(b.disposed).not.toHaveBeenCalled()
  })

  it('answers the amounts the provider reported and presents the resolved credential', async () => {
    const provider1 = await provider()
    const b = await mount({ baseURL: provider1.baseURL }, { apiKey: 'sk-live' })
    const response = await read(b.route)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      ok: true,
      available: true,
      balances: [{ currency: 'CNY', total: '110.00', granted: '0.00', toppedUp: '110.00' }],
    })
    expect(provider1.requests).toEqual([{ url: '/user/balance', authorization: 'Bearer sk-live' }])
  })

  it('answers a provider root with a trailing slash at the same endpoint', async () => {
    const provider1 = await provider()
    const b = await mount({ baseURL: `${provider1.baseURL}/` }, { apiKey: 'sk-live' })
    await read(b.route)
    expect(provider1.requests[0]?.url).toBe('/user/balance')
  })

  it('answers not-configured while the credential seam holds no value', async () => {
    const provider1 = await provider()
    const b = await mount({ baseURL: provider1.baseURL }, {})
    const response = await read(b.route)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({
      ok: false,
      code: 'not-configured',
      message: 'no credential for DEEPSEEK_API_KEY; store it through the credentials service'
        + ' (the web Models page writes it), or export it in the launching environment',
    })
    expect(provider1.requests).toEqual([])
  })

  it('treats an empty stored credential as unconfigured', async () => {
    const b = await mount({}, { apiKey: '' })
    const response = await read(b.route)
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ code: 'not-configured' })
  })

  it('reads the credential reference the row configured', async () => {
    const provider1 = await provider()
    const b = await mount({ baseURL: provider1.baseURL, apiKeyEnv: 'TEAM_DEEPSEEK_KEY' }, { apiKey: 'sk-team' })
    await read(b.route)
    expect(provider1.requests[0]?.authorization).toBe('Bearer sk-team')
  })

  it('answers unauthorized when the provider rejects the credential', async () => {
    const provider1 = await provider(401, '{"error":"Authentication Fails"}')
    const b = await mount({ baseURL: provider1.baseURL }, { apiKey: 'sk-stale' })
    const response = await read(b.route)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      ok: false,
      code: 'unauthorized',
      message: 'the provider rejected the credential (HTTP 401)',
    })
  })

  it('answers unreachable when the provider fails', async () => {
    const provider1 = await provider(500, 'upstream exploded')
    const b = await mount({ baseURL: provider1.baseURL }, { apiKey: 'sk-live' })
    const response = await read(b.route)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ ok: false, code: 'unreachable' })
  })

  it('answers invalid-response when the provider body is not a balance', async () => {
    const provider1 = await provider(200, '{"unexpected":true}')
    const b = await mount({ baseURL: provider1.baseURL }, { apiKey: 'sk-live' })
    const response = await read(b.route)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ ok: false, code: 'invalid-response' })
  })

  it('answers a deadline the provider never met', async () => {
    const b = await mount({ baseURL: 'http://127.0.0.1:1', timeoutMs: 1_000 }, { apiKey: 'sk-live' })
    const response = await read(b.route)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ ok: false, code: 'unreachable' })
  })

  it('withdraws the route with its plugin', async () => {
    const provider1 = await provider()
    const b = await mount({ baseURL: provider1.baseURL }, { apiKey: 'sk-live' })
    await b.fiber.dispose()
    expect(b.disposed).toHaveBeenCalledOnce()
  })

  it('refuses a configuration the route could not use', async () => {
    const b = bench()
    await expect(b.ctx.plugin({ inject: [...inject], apply, Config, name }, { baseURL: 'not a url' }).await())
      .rejects.toThrow('baseURL must be an absolute HTTP(S) root')
    expect(b.routes).toEqual([])
  })

  it('accepts a config a hand-built composition passes without schema defaults', async () => {
    // A composition calling apply directly supplies what it supplies, so the
    // optional members default in the resolver rather than the schema.
    const provider1 = await provider()
    const b = bench({ apiKey: 'sk-live' })
    apply(b.ctx, { baseURL: provider1.baseURL })
    expect(b.routes.map(route => route.path)).toEqual([DEEPSEEK_BALANCE_PATH])
    expect((await read(b.routes[0] as ConnectionFetchRoute)).status).toBe(200)
  })
})
