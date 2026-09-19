/**
 * The host half: the configured set reaches the browser as one index-injection
 * row, an empty set contributes nothing, a refused load contributes nothing
 * either, and the launch route exists only where an application action does.
 */

import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectionFetchRoute } from '@deepseek-ai/dsh-client-connection'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
import { QUICK_START_GLOBAL } from '../src/actions.ts'
import type { QuickStartActionEntry } from '../src/config.ts'
import { apply, Config } from '../src/index.ts'
import { QUICK_START_LAUNCH_PATH } from '../src/wire.ts'

const PROMPTS: QuickStartActionEntry[] = [
  { id: 'develop', label: '开发', prompt: 'start development' },
  { id: 'design', label: '设计', prompt: 'design the UI' },
]

const APP: QuickStartActionEntry = {
  id: 'workbench',
  label: '工作台',
  command: 'D:\\AiWAR3WorkFlow\\start.bat',
  url: 'http://localhost:5173/',
}

/** Stand-in for the composition's Connection service: records route registrations. */
function bench(): { ctx: Context; routes: ConnectionFetchRoute[] } {
  const ctx = new Context()
  const routes: ConnectionFetchRoute[] = []
  ctx.provide('connection', {
    fetch: { register: (route: ConnectionFetchRoute) => { routes.push(route); return vi.fn() } },
  } as never)
  return { ctx, routes }
}

/** Collect the rows this context's listeners contribute to one index table. */
function rowsOf(ctx: Context): IndexInjection[] {
  const table: IndexInjection[] = []
  ctx.emit('webserver/index-inject', table)
  return table
}

/** Mount the host half with one configured set. */
async function mount(actions: QuickStartActionEntry[]) {
  const b = bench()
  const plugin = b.ctx.plugin({ inject: ['connection'], apply, Config }, Config({ actions }))
  await plugin.await()
  return { ...b, plugin }
}

describe('ui-quick-start host half', () => {
  it('injects nothing when no action is configured', async () => {
    const b = await mount([])
    expect(rowsOf(b.ctx)).toEqual([])
    expect(b.routes).toEqual([])
  })

  it('publishes the configured actions as one global row, tagged by form', async () => {
    const b = await mount([...PROMPTS, APP])
    expect(rowsOf(b.ctx)).toEqual([{
      kind: 'global',
      name: QUICK_START_GLOBAL,
      value: [
        { kind: 'prompt', id: 'develop', label: '开发', prompt: 'start development' },
        { kind: 'prompt', id: 'design', label: '设计', prompt: 'design the UI' },
        { kind: 'app', id: 'workbench', label: '工作台', command: APP.command, url: APP.url },
      ],
    }])
  })

  it('withdraws its row with the plugin', async () => {
    const b = await mount(PROMPTS)
    expect(rowsOf(b.ctx)).toHaveLength(1)
    await b.plugin.dispose()
    expect(rowsOf(b.ctx)).toEqual([])
  })

  it('serves no launch route for a set that starts no application', async () => {
    const b = await mount(PROMPTS)
    expect(b.routes).toEqual([])
  })

  it('registers the launch route on the shared API channel once', async () => {
    const b = await mount([...PROMPTS, APP])
    expect(b.routes.map(route => [route.path, route.methods, route.requestBody]))
      .toEqual([[QUICK_START_LAUNCH_PATH, ['POST'], 'buffered']])
  })

  it('refuses a set the browser half could not render, and injects nothing', async () => {
    const b = bench()
    const fiber = b.ctx.plugin(
      { inject: ['connection'], apply, Config },
      Config({ actions: [{ id: 'develop', label: '', prompt: 'go' }] }),
    )
    await expect(fiber.await()).rejects.toThrow('ui-quick-start: action "develop" has an empty label')
    expect(rowsOf(b.ctx)).toEqual([])
    expect(b.routes).toEqual([])
  })

  it('accepts a config a hand-built composition passes without schema defaults', () => {
    // The Loader resolves the schema; a composition that calls apply directly
    // supplies what it supplies, so the two optional members default here.
    const empty = bench()
    apply(empty.ctx, {})
    expect(rowsOf(empty.ctx)).toEqual([])
    expect(empty.routes).toEqual([])

    const b = bench()
    apply(b.ctx, { actions: [APP] })
    expect(rowsOf(b.ctx)).toHaveLength(1)
    expect(b.routes.map(route => route.path)).toEqual([QUICK_START_LAUNCH_PATH])
  })
})
