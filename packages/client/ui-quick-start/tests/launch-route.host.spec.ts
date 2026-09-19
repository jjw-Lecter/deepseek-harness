/**
 * The launch route: what a press may ask for, and every answer the browser can
 * receive. A request names a configured action only — the command stays
 * configuration — and two presses for one action share one attempt.
 */

import { EventEmitter } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import type { QuickStartActionEntry } from '../src/config.ts'
import { apply, Config } from '../src/index.ts'
import { internals } from '../src/internals.ts'
import {
  QUICK_START_LAUNCH_PATH,
  type QuickStartLaunchFailurePayload,
  type QuickStartLaunchReadyPayload,
} from '../src/wire.ts'

/** A port nothing listens on: a probe there fails at once on loopback. */
const CLOSED_PAGE = 'http://127.0.0.1:1/'

const servers: Server[] = []

afterEach(async () => {
  internals.launch = {}
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => { server.close(() => { resolve() }) })))
})

/**
 * Serve one page, optionally dropping its first request.
 * @param refuseFirst - whether the first request is dropped instead of answered.
 * @returns the page's URL.
 */
async function page(refuseFirst = false): Promise<string> {
  let remaining = refuseFirst ? 1 : 0
  const server = createServer((request, response) => {
    if (remaining > 0) {
      remaining -= 1
      request.socket.destroy()
      return
    }
    response.end('ok')
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${String(port)}/`
}

/** A process starter that reports one lifecycle event and records its calls. */
function starter(event: 'spawn' | 'error') {
  return vi.fn(() => {
    const emitter = new EventEmitter()
    queueMicrotask(() => { emitter.emit(event, new Error('cannot start')) })
    return { once: (name: string, listener: (value?: unknown) => void) => { emitter.once(name, listener) }, unref: () => {} }
  })
}

/**
 * Mount the host half and hand back its launch route.
 * @param actions - the configured set.
 * @param readyMs - configured launch deadline.
 * @returns the registered route.
 */
async function routeFor(actions: QuickStartActionEntry[], readyMs?: number): Promise<ConnectionFetchRoute> {
  const ctx = new Context()
  const routes: ConnectionFetchRoute[] = []
  ctx.provide('connection', {
    fetch: { register: (route: ConnectionFetchRoute) => { routes.push(route); return vi.fn() } },
  } as never)
  await ctx.plugin(
    { inject: ['connection'], apply, Config },
    Config({ actions, ...(readyMs === undefined ? {} : { launchReadyMs: readyMs }) }),
  ).await()
  const route = routes[0]
  if (route === undefined) throw new Error('the launch route was not registered')
  return route
}

/** One launch request, as the browser sends it. */
const launch = (route: ConnectionFetchRoute, body: string): Promise<Response> =>
  route.fetch(new Request(`http://127.0.0.1${QUICK_START_LAUNCH_PATH}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }))

const promptAction: QuickStartActionEntry = { id: 'develop', label: '开发', prompt: 'start development' }
const appAction: QuickStartActionEntry = { id: 'workbench', label: '工作台', command: 'start.bat', url: CLOSED_PAGE }

describe('quick-start launch route', () => {
  it('refuses a body that is not JSON', async () => {
    const route = await routeFor([promptAction, appAction])
    const response = await launch(route, 'not json')
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('body is not JSON')
  })

  it.each([
    ['no id', '{}'],
    ['a non-string id', '{"id":7}'],
    ['a blank id', '{"id":""}'],
    ['a null body', 'null'],
    ['a body that is not an object', '"workbench"'],
  ])(
    'refuses a body with %s',
    async (_label, body) => {
      const route = await routeFor([promptAction, appAction])
      const response = await launch(route, body)
      expect(response.status).toBe(400)
      expect(await response.text()).toBe('body must be JSON with a string "id"')
    },
  )

  it.each([
    ['an action nothing configures', 'missing'],
    ['an action that opens a session', 'develop'],
  ])('answers 404 for %s', async (_label, id) => {
    const route = await routeFor([promptAction, appAction])
    const response = await launch(route, JSON.stringify({ id }))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      code: 'unknown-action',
      message: `no configured application action named ${JSON.stringify(id)}`,
    } satisfies QuickStartLaunchFailurePayload)
  })

  it('answers ready when the page already serves', async () => {
    const spawner = starter('spawn')
    internals.launch = { spawn: spawner as never }
    const route = await routeFor([{ id: 'workbench', label: '工作台', command: 'start.bat', url: await page() }])
    const response = await launch(route, '{"id":"workbench"}')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true } satisfies QuickStartLaunchReadyPayload)
    expect(spawner).not.toHaveBeenCalled()
  })

  it('shares one attempt between two presses for the same action', async () => {
    const spawner = starter('spawn')
    internals.launch = { spawn: spawner as never }
    const route = await routeFor([{ id: 'workbench', label: '工作台', command: 'start.bat', url: await page(true) }], 5_000)
    const [first, second] = await Promise.all([
      launch(route, '{"id":"workbench"}'),
      launch(route, '{"id":"workbench"}'),
    ])
    expect([first.status, second.status]).toEqual([200, 200])
    expect(spawner).toHaveBeenCalledOnce()
  })

  it('answers launch-failed when the process cannot start', async () => {
    internals.launch = { spawn: starter('error') as never }
    const route = await routeFor([{ id: 'workbench', label: '工作台', command: 'start.bat', url: CLOSED_PAGE }])
    const response = await launch(route, '{"id":"workbench"}')
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      code: 'launch-failed',
      message: 'cannot start',
    } satisfies QuickStartLaunchFailurePayload)
  })

  it('answers launch-timeout when the page never serves', async () => {
    internals.launch = { spawn: starter('spawn') as never }
    const route = await routeFor([{ id: 'workbench', label: '工作台', command: 'start.bat', url: CLOSED_PAGE }], 1_000)
    const response = await launch(route, '{"id":"workbench"}')
    expect(response.status).toBe(504)
    expect(await response.json()).toEqual({
      code: 'launch-timeout',
      message: `no answer from ${CLOSED_PAGE} within 1000 ms`,
    } satisfies QuickStartLaunchFailurePayload)
  })
})
