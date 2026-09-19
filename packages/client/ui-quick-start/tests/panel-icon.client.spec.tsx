// @vitest-environment jsdom
/**
 * The panel row's glyph: a window frame drawn in the row's own ink, at the
 * square edge the sidebar asks for.
 */

import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { QuickStartPanelIcon } from '../src/client/QuickStartPanelIcon.tsx'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

/** Empty global standard-kit hooks (the glyph reads none of them). */
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

afterEach(cleanup)

function mount(size: number) {
  const props = {
    size,
    active: false,
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    usePanelInfo,
    useResource,
  } as PropsRuntime<'sidebar.panellist'>
  return render(<QuickStartPanelIcon {...props} />)
}

describe('QuickStartPanelIcon', () => {
  it('draws the glyph at the requested square edge, hidden from assistive use', () => {
    const view = mount(16)
    const svg = view.container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('16')
    expect(svg?.getAttribute('height')).toBe('16')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    // The row supplies the ink; the glyph never carries a color of its own.
    expect(view.container.querySelector('[fill="currentColor"]')).not.toBeNull()
  })
})
