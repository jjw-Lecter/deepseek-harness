/**
 * The quick-start action set: the shape both halves agree on, the global name
 * the host half assigns in the served index, and the browser-side reader.
 *
 * Two forms reach one button column. A `prompt` action opens a session that
 * already carries an instruction; an `app` action starts a local application
 * on the host and opens its page in the central panel. The host half tags each
 * configured entry with its form while resolving it, so both halves switch on
 * one discriminant instead of re-deriving the form from which fields are set.
 */

/** Pressing the button opens a session whose composer already holds the instruction. */
export interface QuickStartPromptAction {
  /** Discriminant: this action starts a session. */
  readonly kind: 'prompt'
  /** Stable identity of the action; it keys the rendered button. */
  readonly id: string
  /** Button text, and the button's accessible name. */
  readonly label: string
  /** Opening instruction written into the new session's composer. */
  readonly prompt: string
}

/** Pressing the button starts a local application and opens its page in the panel. */
export interface QuickStartAppAction {
  /** Discriminant: this action starts an application. */
  readonly kind: 'app'
  /** Stable identity of the action; it keys the rendered button and the panel. */
  readonly id: string
  /** Button text, the button's accessible name, and the panel's title. */
  readonly label: string
  /** Program or script the host runs; it never crosses the wire from the browser. */
  readonly command: string
  /** Page the panel embeds once the application answers. */
  readonly url: string
}

/** One configured launch action: a button, in one of its two forms. */
export type QuickStartAction = QuickStartPromptAction | QuickStartAppAction

/**
 * Global the host half assigns while rendering the index. The Web server and
 * the Desktop host both render that injection table, so one assignment reaches
 * both surfaces.
 */
export const QUICK_START_GLOBAL = '__DSH_QUICK_START__'

/**
 * Accept one serialized action.
 * @param value - one element of the injected array.
 * @returns the action, or undefined when a field could not carry a button.
 */
function actionOf(value: unknown): QuickStartAction | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { kind, id, label } = value as Record<string, unknown>
  if (typeof id !== 'string' || id === '') return undefined
  if (typeof label !== 'string' || label === '') return undefined
  if (kind === 'prompt') {
    const { prompt } = value as Record<string, unknown>
    return typeof prompt === 'string' && prompt !== '' ? { kind, id, label, prompt } : undefined
  }
  if (kind === 'app') {
    const { command, url } = value as Record<string, unknown>
    if (typeof command !== 'string' || command === '') return undefined
    if (typeof url !== 'string' || url === '') return undefined
    return { kind, id, label, command, url }
  }
  return undefined
}

/**
 * Read the action set the host half injected into the page.
 *
 * The host half refuses a configuration it could not render and serializes the
 * resolved set into the document, so this reads one producer's own output
 * across the document boundary. An absent global means no row is configured;
 * a value that is not an action list — a truncated or rewritten document —
 * carries no action to render, and one unusable entry is dropped rather than
 * failing every button beside it.
 * @param value - the global's value, or undefined when nothing assigned it.
 * @returns the actions to render, in injected order.
 */
export function readActions(value: unknown): readonly QuickStartAction[] {
  if (!Array.isArray(value)) return []
  const actions: QuickStartAction[] = []
  for (const entry of value) {
    const action = actionOf(entry)
    if (action !== undefined) actions.push(action)
  }
  return actions
}
