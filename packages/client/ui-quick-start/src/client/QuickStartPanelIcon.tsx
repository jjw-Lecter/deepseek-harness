/**
 * Sidebar row glyph for an embedded-application panel: a window frame whose
 * body carries the launch mark, drawn from `currentColor` so the row's own
 * rest/active ink applies.
 */
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-sidebar SlotMap merge (the panel-row seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the panel's row glyph.
 * @param props - the panel row's owner share (requested square edge).
 * @returns the glyph element.
 */
export function QuickStartPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="2.75" y="4.25" width="18.5" height="15.5" rx="2.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.75 9.25H21.25" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.2" cy="6.75" r="0.9" fill="currentColor" />
      <circle cx="9" cy="6.75" r="0.9" fill="currentColor" />
      <path d="M9.8 11.5V17L15 14.25L9.8 11.5Z" fill="currentColor" />
    </svg>
  )
}
