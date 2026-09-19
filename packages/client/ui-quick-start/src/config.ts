/**
 * Host-side quick-start configuration: the schema a cordis.yml row fills, and
 * the check that refuses a set the browser half could not render.
 */
import z from '@deepseek-ai/schemastery'
import type { QuickStartAction } from './actions.ts'

/** Default deadline for a started application's page to answer, in milliseconds. */
export const DEFAULT_LAUNCH_READY_MS = 120_000

/**
 * One configured action as a cordis.yml row writes it. An entry states its form
 * by the fields it carries — `prompt`, or `command` with `url` — and
 * {@link resolveActions} rejects an entry that states both or neither.
 */
export interface QuickStartActionEntry {
  /** Stable identity of the action. */
  id: string
  /** Button text and accessible name. */
  label: string
  /** Opening instruction, for an action that opens a session. */
  prompt?: string
  /** Program or script the host runs, for an action that starts an application. */
  command?: string
  /** Page the panel embeds once the application answers. */
  url?: string
}

/** Quick-start launch actions configuration. */
export interface Config {
  /** Launch actions in the order they render; an empty list installs nothing. */
  actions?: QuickStartActionEntry[]
  /**
   * Deadline in milliseconds for a started application's page to answer; the
   * press fails at this point, and the application keeps running.
   * @default DEFAULT_LAUNCH_READY_MS
   */
  launchReadyMs?: number
}

/** Validated quick-start configuration. */
export const Config: z<Config> = z.object({
  actions: z.array(z.object({
    id: z.string(),
    label: z.string(),
    prompt: z.string(),
    command: z.string(),
    url: z.string(),
  })).default([]),
  launchReadyMs: z.natural().min(1_000).max(600_000).default(DEFAULT_LAUNCH_READY_MS),
})

/**
 * Whether one configured url can be embedded as a page.
 * @param url - the configured value.
 * @returns true for an absolute http(s) URL.
 */
function isEmbeddableUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol)
  } catch {
    // Swallows the parse error: an unparsable url is exactly the refused case.
    return false
  }
}

/**
 * Resolve one entry into the tagged action both halves carry, or refuse it.
 * @param entry - one configured entry.
 * @returns the tagged action.
 * @throws {Error} when the entry states no single form, or an empty field.
 */
function resolveEntry(entry: QuickStartActionEntry): QuickStartAction {
  const { id, label, prompt, command, url } = entry
  const name = JSON.stringify(id)
  if (url !== undefined && command === undefined) {
    throw new Error(`ui-quick-start: action ${name} declares a url without a command`)
  }
  if (command !== undefined && url === undefined) {
    throw new Error(`ui-quick-start: action ${name} declares a command without a url`)
  }
  if (prompt !== undefined && command !== undefined) {
    throw new Error(`ui-quick-start: action ${name} declares both a prompt and a command`)
  }
  if (prompt === undefined && command === undefined) {
    throw new Error(`ui-quick-start: action ${name} declares neither a prompt nor a command`)
  }
  if (prompt !== undefined) {
    if (prompt === '') throw new Error(`ui-quick-start: action ${name} has an empty prompt`)
    return { kind: 'prompt', id, label, prompt }
  }
  // Both fields are present past the pairing checks; the assertion keeps the
  // narrowing local instead of re-reading optional members below.
  const [start, page] = [command as string, url as string]
  if (start === '') throw new Error(`ui-quick-start: action ${name} has an empty command`)
  if (page === '') throw new Error(`ui-quick-start: action ${name} has an empty url`)
  if (!isEmbeddableUrl(page)) {
    throw new Error(`ui-quick-start: action ${name} declares a url that is not an absolute http(s) URL`)
  }
  return { kind: 'app', id, label, command: start, url: page }
}

/**
 * Assert the configured actions can be rendered and launched.
 *
 * Schemastery checks the field types, not whether a field says anything,
 * whether the fields state one form, or whether two actions are
 * distinguishable, and every one of those failures would be silent in the
 * browser: a blank field draws an unreadable button, a repeated id keys two
 * rows alike, and an action with no single form has no press behavior at all.
 * None has a later resolution point, so they fail the load that configured them.
 * @param entries - the configured action list.
 * @returns the same actions, tagged with the form each one states.
 * @throws {Error} when a field is empty, a form is unclear, or an id repeats.
 */
export function resolveActions(entries: readonly QuickStartActionEntry[]): readonly QuickStartAction[] {
  const seen = new Set<string>()
  const resolved: QuickStartAction[] = []
  for (const entry of entries) {
    const field = entry.id === '' ? 'id' : entry.label === '' ? 'label' : undefined
    if (field !== undefined) {
      throw new Error(`ui-quick-start: action ${JSON.stringify(entry.id)} has an empty ${field}`)
    }
    if (seen.has(entry.id)) throw new Error(`ui-quick-start: duplicate action id ${JSON.stringify(entry.id)}`)
    seen.add(entry.id)
    resolved.push(resolveEntry(entry))
  }
  return resolved
}
