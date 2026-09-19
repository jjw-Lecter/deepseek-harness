/**
 * Launch-action configuration and the registrant-side faces the quick-start
 * seats read: the sidebar button column, and one embedded-application panel
 * per configured application action.
 */
import type { QuickStartAction, QuickStartAppAction } from '../actions.ts'

/** Registration-side business share of the sidebar quick-start seat. */
export interface QuickStartInjected {
  /** Configured actions in configuration order; empty renders no seat. */
  actions: readonly QuickStartAction[]
  /** @param id - the action to launch. */
  launch: (id: string) => void
}

/** Registration-side business share of one embedded-application panel. */
export interface QuickStartAppPanelInjected {
  /** The application action this panel serves. */
  action: QuickStartAppAction
  /** @param id - the application action to start. */
  start: (id: string) => void
  /** Return the central column to the current Session. */
  close: () => void
}
