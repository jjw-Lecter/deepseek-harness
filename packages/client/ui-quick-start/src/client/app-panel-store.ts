/**
 * One embedded-application panel's state, keyed by action id.
 *
 * One instance is shared by every panel registration: switching the central
 * column away unmounts a panel, and the store is what keeps its phase for the
 * next look. A reload request is a revision bump, which remounts the frame
 * instead of reloading a document inside it. The phase is the discriminant, so
 * the failure branch carries the code its copy needs and no other branch
 * carries one.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { QuickStartLaunchFailureReason } from '../wire.ts'

/** One application action's panel state. */
export type AppPanelEntry =
  | { readonly phase: 'idle'; readonly revision: number }
  | { readonly phase: 'starting'; readonly revision: number }
  | { readonly phase: 'ready'; readonly revision: number }
  | {
    readonly phase: 'failed'
    /** Failure discriminant for localized copy. */
    readonly code: QuickStartLaunchFailureReason
    /** Host detail from the failed attempt; empty when the host stated none. */
    readonly detail: string
    readonly revision: number
  }

/** Panel state before anything was pressed: shared so the selector keeps one identity. */
export const IDLE_APP_PANEL: AppPanelEntry = Object.freeze({ phase: 'idle', revision: 0 })

/** Panel state of every application action, by action id. */
export interface AppPanelState {
  byId: Readonly<Record<string, AppPanelEntry>>
}

/** Store action set (annotated twin of the literal below; drift fails assignability). */
type AppPanelActions = {
  begin: (draft: AppPanelState, id: string) => void
  ready: (draft: AppPanelState, id: string) => void
  fail: (draft: AppPanelState, id: string, code: QuickStartLaunchFailureReason, detail: string) => void
  reload: (draft: AppPanelState, id: string) => void
}

/**
 * One action's current entry, or the shared idle one.
 * @param draft - the draft state.
 * @param id - the action's id.
 * @returns the stored entry, or {@link IDLE_APP_PANEL}.
 */
function entryOf(draft: AppPanelState, id: string): AppPanelEntry {
  return draft.byId[id] ?? IDLE_APP_PANEL
}

/**
 * Create the embedded-application panel store handle.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createAppPanelStore(): EngineStoreHandle<AppPanelState, AppPanelActions> {
  return defineStore({
    init: (): AppPanelState => ({ byId: {} }),
    actions: {
      begin: (d, id) => {
        d.byId = { ...d.byId, [id]: { phase: 'starting', revision: entryOf(d, id).revision } }
      },
      ready: (d, id) => {
        d.byId = { ...d.byId, [id]: { phase: 'ready', revision: entryOf(d, id).revision } }
      },
      fail: (d, id, code, detail) => {
        d.byId = { ...d.byId, [id]: { phase: 'failed', code, detail, revision: entryOf(d, id).revision } }
      },
      reload: (d, id) => {
        const entry = entryOf(d, id)
        d.byId = { ...d.byId, [id]: { ...entry, revision: entry.revision + 1 } }
      },
    },
  })
}
