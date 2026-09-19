/**
 * The sidebar's launch actions, directly under New Session.
 *
 * Each button names a way into work that is not a blank session; pressing one
 * opens a session whose composer already holds that action's opening
 * instruction, so the instruction is editable before it is sent. The set comes
 * from configuration and the seat renders nothing when it is empty.
 *
 * The rail has no room for a label and the configuration carries no icon, so
 * the collapsed column shows the label's first character; the tooltip carries
 * the whole label there.
 */
import clsx from 'clsx'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-sidebar SlotMap merge (the quick-start seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { QuickStartInjected } from './contract.ts'
import css from './QuickStartButtons.module.css'

/** Full props of the sidebar quick-start seat. */
export type QuickStartButtonsProps =
  PropsRuntime<'sidebar.quickstart'> & InjectFace<QuickStartInjected>

/**
 * The one character the rail shows for an action.
 * @param label - the action's configured label.
 * @returns the label's first character, or an empty string for a blank label.
 */
function railGlyph(label: string): string {
  return Array.from(label)[0] ?? ''
}

/**
 * Render the configured launch actions.
 * @param props - composed slot props (column state + injected action set).
 * @returns the button column, or null when nothing is configured.
 */
export function QuickStartButtons({ wide, actions, launch }: QuickStartButtonsProps) {
  if (actions.length === 0) return null
  return (
    <div className={clsx(css.root, !wide && css.rail)}>
      {actions.map(action => (
        // Expanded, the button carries its own label — tooltip only on the rail.
        <Tooltip key={action.id} label={action.label} delayMs={500} disabled={wide}>
          <button
            type="button"
            className={css.action}
            data-quick-start={action.id}
            aria-label={action.label}
            onClick={() => { launch(action.id) }}
          >
            {wide
              ? <span className={css.label}>{action.label}</span>
              : <span className={css.glyph} aria-hidden="true">{railGlyph(action.label)}</span>}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}
