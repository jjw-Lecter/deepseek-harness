/**
 * Registration: the seat installs only once the sidebar shell has declared the
 * hole, carries the injected actions into the component face, and routes a
 * press through the launcher — a session draft for a prompt action, a host
 * launch plus the panel for an application action.
 */

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import { apply, inject } from '@deepseek-ai/dsh-client-ui-quick-start/client'
import { QUICK_START_GLOBAL, type QuickStartAction } from '../src/actions.ts'
import { createAppPanelStore } from '../src/client/app-panel-store.ts'
import type { QuickStartAppPanelInjected, QuickStartInjected } from '../src/client/contract.ts'
import { QUICK_START_LAUNCH_PATH } from '../src/wire.ts'

type SessionId = SessionSummary['id']

const APP_KEY = 'quickstart-app:workbench'

const ACTIONS: QuickStartAction[] = [
  { kind: 'prompt', id: 'develop', label: '开发', prompt: 'start development' },
  { kind: 'prompt', id: 'design', label: '设计', prompt: 'design the UI' },
  {
    kind: 'app',
    id: 'workbench',
    label: '工作台',
    command: 'D:\\AiWAR3WorkFlow\\start.bat',
    url: 'http://localhost:5173/',
  },
]

const PROMPTS: QuickStartAction[] = ACTIONS.slice(0, 2)

/** Stand-in for the shell: declares the quick-start hole this plugin fills. */
function ShellFrame({ renderSlot }: PropsRenderSlots<'sidebar.quickstart'>) {
  return renderSlot('sidebar.quickstart', { wide: true })
}

/**
 * Assign the global the host half would have written into the served index.
 * @param value - the injected value, or undefined to leave the global absent.
 */
function injectActions(value: unknown): void {
  const globals = globalThis as unknown as Record<string, unknown>
  if (value === undefined) Reflect.deleteProperty(globals, QUICK_START_GLOBAL)
  else globals[QUICK_START_GLOBAL] = value
}

afterEach(() => {
  injectActions(undefined)
  vi.unstubAllGlobals()
})

/** One session row. */
function summary(id: string, blank: boolean): SessionSummary {
  return { id: id as SessionId, displayTitle: id, running: false, blank, updatedAt: 0 }
}

/** A list state holding the given rows, current set to the first. */
function listState(rows: SessionSummary[]): SessionListState {
  const byId: Record<SessionId, SessionSummary> = {}
  for (const row of rows) byId[row.id] = row
  return {
    ids: rows.map(row => row.id),
    byId,
    current: rows[0]?.id,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function bench(options: { blank?: boolean } = {}) {
  const ctx = new Context()
  const list = createSnapshotStore<SessionListState>(listState([summary('session-a', options.blank ?? true)]))
  const drafts: { sessionId: string; text: string }[] = []
  const selected: (string | null)[] = []
  ctx.provide('sessions', {
    list,
    scope: (id: SessionId) => ({ id }) as never,
  } as never)
  ctx.provide('conversation', {
    input: {
      for: (actx: { id: SessionId }) => ({
        setDraft: (text: string) => { drafts.push({ sessionId: actx.id, text }) },
      }),
    },
  } as never)
  ctx.provide('uiWorkspace', { startSession: () => {} } as never)
  ctx.provide('layout', { selectPanel: (id: string | null) => { selected.push(id) } } as never)
  ctx.provide('locale', { register: () => () => {}, subscribe: () => () => {} } as never)
  return { ctx, drafts, selected, list }
}

/**
 * Declare the holes the plugin waits for, exactly as ui-layout and ui-sidebar do.
 * @param ctx - a context whose slots registry is already mounted.
 * @returns the declaration's disposer.
 */
function declareShell(ctx: Context): () => void {
  return ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.quickstart': { kind: 'single', scope: 'root' },
      'main': { kind: 'keyed', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
    },
  }, ShellFrame)
}

/** Mount the browser half and declare the shell holes. */
async function mount(actions: QuickStartAction[], options: { blank?: boolean } = {}) {
  injectActions(actions)
  const b = bench(options)
  await b.ctx.plugin(SlotRegistry).await()
  const declare = declareShell(b.ctx)
  const fiber = b.ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ...b, declare, fiber }
}

/** The injected business face of one registered entry, in its own contract's terms. */
function faceOf(ctx: Context, slot: 'sidebar.quickstart' | 'main'): unknown {
  const entry = ctx.slots.entries(slot)[0]
  if (entry?.inject === undefined) throw new Error(`${slot} carries no injected face`)
  return (entry.inject as unknown as () => unknown)()
}

/** The quick-start seat's injected face. */
const seatFace = (ctx: Context): QuickStartInjected => faceOf(ctx, 'sidebar.quickstart') as QuickStartInjected

/** An application panel's injected face. */
const panelFace = (ctx: Context): QuickStartAppPanelInjected => faceOf(ctx, 'main') as QuickStartAppPanelInjected

describe('ui-quick-start browser half', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'sessions', 'conversation', 'uiWorkspace', 'layout', 'locale'])
  })

  it('contributes nothing without an injected action set', async () => {
    injectActions(undefined)
    const b = bench()
    await b.ctx.plugin(SlotRegistry).await()
    const declare = declareShell(b.ctx)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.ctx.slots.entries('sidebar.quickstart')).toEqual([])
    expect(b.ctx.slots.entries('main')).toEqual([])
    declare()
  })

  it('waits for the shell declaration before registering, and removes it on dispose', async () => {
    const b = bench()
    injectActions(ACTIONS)
    await b.ctx.plugin(SlotRegistry).await()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.ctx.slots.entries('sidebar.quickstart')).toEqual([])
    const declare = declareShell(b.ctx)
    expect(b.ctx.slots.entries('sidebar.quickstart')).toHaveLength(1)
    declare()
    await fiber.dispose()
    expect(b.ctx.slots.entries('sidebar.quickstart')).toEqual([])
  })

  it('hands the injected actions and a working launcher to the button column', async () => {
    const b = await mount(ACTIONS)
    const face = seatFace(b.ctx)
    expect(face.actions).toEqual(ACTIONS)
    // A blank session is current, so a prompt press lands in its draft.
    face.launch('design')
    expect(b.drafts).toEqual([{ sessionId: 'session-a', text: 'design the UI' }])
    // An id no action carries changes nothing.
    face.launch('missing')
    expect(b.drafts).toHaveLength(1)
  })

  it('hands a staged instruction to the session that becomes current', async () => {
    const b = await mount(ACTIONS, { blank: false })
    seatFace(b.ctx).launch('develop')
    expect(b.drafts).toEqual([])
    // The flow's own list change is what delivers the staged instruction.
    b.list.set(listState([summary('session-b', true), summary('session-a', false)]))
    expect(b.drafts).toEqual([{ sessionId: 'session-b', text: 'start development' }])
  })

  it('registers one panel and one sidebar row per application action', async () => {
    const b = await mount(ACTIONS)
    expect(b.ctx.slots.entries('main').map(entry => entry.options.key)).toEqual([APP_KEY])
    expect(b.ctx.slots.entries('sidebar.panellist').map(entry => [entry.options.id, entry.options.label]))
      .toEqual([[APP_KEY, '工作台']])
  })

  it('registers no panel for a set of prompt actions alone', async () => {
    const b = await mount(PROMPTS)
    expect(b.ctx.slots.entries('main')).toEqual([])
    expect(b.ctx.slots.entries('sidebar.panellist')).toEqual([])
    expect(b.ctx.slots.entries('sidebar.quickstart')).toHaveLength(1)
  })

  it('shares one panel instance between the entries that declare its store', async () => {
    const b = await mount(ACTIONS)
    const handle = b.ctx.slots.entries('main')[0]?.store as ReturnType<typeof createAppPanelStore>
    const instance = handle.create()
    expect(handle.create()).toBe(instance)
  })

  it('starts an application through the host route and shows its panel', async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetcher)
    const b = await mount(ACTIONS)
    panelFace(b.ctx).start('workbench')
    expect(b.selected).toEqual([APP_KEY])
    await vi.waitFor(() => { expect(fetcher).toHaveBeenCalledOnce() })
    const [path, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe(QUICK_START_LAUNCH_PATH)
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ id: 'workbench' }))
  })

  it('returns the central column to the session when a panel closes', async () => {
    const b = await mount(ACTIONS)
    panelFace(b.ctx).close()
    expect(b.selected).toEqual([null])
  })
})
