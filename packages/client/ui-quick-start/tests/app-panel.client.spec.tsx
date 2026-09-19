// @vitest-environment jsdom
/**
 * The panel's four phases and its controls: the start control before a launch,
 * the phase line while the host starts the application, the embedded frame once
 * it answers, and the failure copy with its retry.
 */

import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { QuickStartAppAction } from '../src/actions.ts'
import { createAppPanelStore } from '../src/client/app-panel-store.ts'
import { QuickStartAppPanel } from '../src/client/QuickStartAppPanel.tsx'
import type { QuickStartAppPanelProps } from '../src/client/QuickStartAppPanel.tsx'

const ACTION: QuickStartAppAction = {
  kind: 'app',
  id: 'workbench',
  label: '工作台',
  command: 'D:\\AiWAR3WorkFlow\\start.bat',
  url: 'http://localhost:5173/',
}

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

/** Empty global standard-kit hooks (the panel reads none of them, and the stub shows the key). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

type AttentionSnapshot = Parameters<Parameters<QuickStartAppPanelProps['useSessionPendingInteraction']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionPendingInteraction: QuickStartAppPanelProps['useSessionPendingInteraction'] = selector => selector(noAttention)

afterEach(cleanup)

function mount() {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const instance = createAppPanelStore().create()
  const start = vi.fn()
  const close = vi.fn()
  const props: QuickStartAppPanelProps = {
    useSessions: emptySessions(),
    useSessionPendingInteraction,
    usePanelInfo,
    useResource,
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(instance),
    actions: instance.actions,
    t: (key: string) => key,
    action: ACTION,
    start,
    close,
  }
  render(<QuickStartAppPanel {...props} />)
  return { instance, start, close }
}

/** The embedded frame, by its accessible title. */
const frame = (): HTMLIFrameElement => screen.getByTitle('工作台') as HTMLIFrameElement

describe('QuickStartAppPanel', () => {
  it('offers the start control before anything was launched', () => {
    const b = mount()
    expect(screen.getByText('app.idle.title')).toBeDefined()
    expect(screen.getByText('app.idle.hint')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'app.start' }))
    expect(b.start).toHaveBeenCalledExactlyOnceWith('workbench')
  })

  it('reports the starting phase while the host starts the application', () => {
    const b = mount()
    act(() => { b.instance.actions.begin('workbench') })
    expect(screen.getByText('app.starting')).toBeDefined()
    expect(screen.getByText('app.starting.hint')).toBeDefined()
    expect(screen.queryByRole('button', { name: 'app.start' })).toBeNull()
  })

  it('embeds the page once the application answered', () => {
    const b = mount()
    act(() => { b.instance.actions.ready('workbench') })
    expect(frame().getAttribute('src')).toBe(ACTION.url)
    fireEvent.click(screen.getByRole('button', { name: 'app.back' }))
    expect(b.close).toHaveBeenCalledOnce()
  })

  it('remounts the frame instead of asking the page to reload itself', () => {
    const b = mount()
    act(() => { b.instance.actions.ready('workbench') })
    const before = frame()
    fireEvent.click(screen.getByRole('button', { name: 'app.reload' }))
    expect(frame()).not.toBe(before)
    expect(frame().getAttribute('src')).toBe(ACTION.url)
  })

  it.each([
    ['an unknown action', 'unknown-action', 'app.failure.unknownAction'],
    ['a timeout', 'launch-timeout', 'app.failure.timeout'],
    ['a failed start', 'launch-failed', 'app.failure.launchFailed'],
  ] as const)('names %s and offers a retry', (_label, code, copy) => {
    const b = mount()
    act(() => { b.instance.actions.fail('workbench', code, 'cannot start') })
    expect(screen.getByText(copy)).toBeDefined()
    expect(screen.getByText('cannot start')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: 'app.retry' }))
    expect(b.start).toHaveBeenCalledExactlyOnceWith('workbench')
  })

  it('omits the detail line when the host stated none', () => {
    const b = mount()
    act(() => { b.instance.actions.fail('workbench', 'launch-failed', '') })
    expect(screen.getByText('app.failure.launchFailed')).toBeDefined()
    expect(screen.queryByText('cannot start')).toBeNull()
  })

  it('shows reload only once the page is up', () => {
    const b = mount()
    expect(screen.queryByRole('button', { name: 'app.reload' })).toBeNull()
    act(() => { b.instance.actions.ready('workbench') })
    expect(screen.getByRole('button', { name: 'app.reload' })).toBeDefined()
  })
})
