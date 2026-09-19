/**
 * The client launch carrier: one press publishes the starting phase and shows
 * the panel, the host's answer settles the phase, and a second press while one
 * is in flight joins it rather than starting the application twice.
 */

import { describe, expect, it, vi } from 'vitest'
import type { QuickStartAppAction } from '../src/actions.ts'
import { AppPanelLauncher, panelKeyOf } from '../src/client/app-launcher.ts'
import { IDLE_APP_PANEL, createAppPanelStore, type AppPanelEntry, type AppPanelState } from '../src/client/app-panel-store.ts'
import { QUICK_START_LAUNCH_PATH } from '../src/wire.ts'

const ACTION: QuickStartAppAction = {
  kind: 'app',
  id: 'workbench',
  label: '工作台',
  command: 'D:\\AiWAR3WorkFlow\\start.bat',
  url: 'http://localhost:5173/',
}

const PANEL_KEY = 'quickstart-app:workbench'

function bench(fetcher: (input: string | URL, init?: RequestInit) => Promise<Response>) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const instance = createAppPanelStore().create()
  const selectPanel = vi.fn()
  const launcher = new AppPanelLauncher(instance.actions, selectPanel, fetcher)
  return { instance, selectPanel, launcher }
}

/** The panel state of the one action these specs start. */
const entryOf = (instance: { getSnapshot: () => AppPanelState }): AppPanelEntry =>
  instance.getSnapshot().byId['workbench'] ?? IDLE_APP_PANEL

describe('panelKeyOf', () => {
  it('namespaces the panel key by action id', () => {
    expect(panelKeyOf(ACTION)).toBe(PANEL_KEY)
  })
})

describe('AppPanelLauncher', () => {
  it('posts the action id and settles on ready', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }))
    const b = bench(fetcher)
    await b.launcher.start(ACTION)
    expect(b.selectPanel).toHaveBeenCalledExactlyOnceWith(PANEL_KEY)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(QUICK_START_LAUNCH_PATH, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ id: 'workbench' }),
    }))
    expect(entryOf(b.instance)).toEqual({ phase: 'ready', revision: 0 })
  })

  it('publishes the starting phase before the host answers', async () => {
    let settle: (response: Response) => void = () => {}
    const fetcher = () => new Promise<Response>((resolve) => { settle = resolve })
    const b = bench(fetcher)
    const started = b.launcher.start(ACTION)
    expect(entryOf(b.instance).phase).toBe('starting')
    expect(b.selectPanel).toHaveBeenCalledWith(PANEL_KEY)
    settle(Response.json({ ok: true }))
    await started
    expect(entryOf(b.instance).phase).toBe('ready')
  })

  it('keeps the host detail of a failed launch', async () => {
    const b = bench(async () => Response.json({ code: 'launch-failed', message: 'cannot start' }, { status: 502 }))
    await b.launcher.start(ACTION)
    expect(entryOf(b.instance)).toMatchObject({ phase: 'failed', code: 'launch-failed', detail: 'cannot start' })
  })

  it('reads the failure discriminant the host sent', async () => {
    const b = bench(async () => Response.json({ code: 'launch-timeout', message: 'too slow' }, { status: 504 }))
    await b.launcher.start(ACTION)
    expect(entryOf(b.instance)).toMatchObject({ phase: 'failed', code: 'launch-timeout', detail: 'too slow' })
  })

  it.each([
    ['an unreadable body', async () => new Response('gateway down', { status: 504 }), 'launch-timeout'],
    ['an unknown code', async () => Response.json({ code: 'other' }, { status: 502 }), 'launch-failed'],
    ['a non-string detail', async () => Response.json({ code: 'launch-failed', message: 7 }, { status: 502 }), 'launch-failed'],
  ])('falls back on %s', async (_label, fetcher, code) => {
    const b = bench(fetcher)
    await b.launcher.start(ACTION)
    expect(entryOf(b.instance)).toMatchObject({ phase: 'failed', code, detail: '' })
  })

  it('reports a carrier failure that never reached the host', async () => {
    const b = bench(async () => { throw new Error('network down') })
    await b.launcher.start(ACTION)
    expect(entryOf(b.instance)).toMatchObject({ phase: 'failed', code: 'launch-failed', detail: 'network down' })
  })

  it('reports a carrier rejection that carried no error', async () => {
    const b = bench(async () => { throw 'network down' })
    await b.launcher.start(ACTION)
    expect(entryOf(b.instance)).toMatchObject({ phase: 'failed', code: 'launch-failed', detail: 'network down' })
  })

  it('joins a second press to the launch already in flight', async () => {
    let settle: (response: Response) => void = () => {}
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { settle = resolve }))
    const b = bench(fetcher)
    const first = b.launcher.start(ACTION)
    const second = b.launcher.start(ACTION)
    settle(Response.json({ ok: true }))
    await Promise.all([first, second])
    expect(fetcher).toHaveBeenCalledOnce()
    expect(b.selectPanel).toHaveBeenCalledOnce()
  })
})
