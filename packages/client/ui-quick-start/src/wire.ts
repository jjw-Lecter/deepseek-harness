/**
 * The one host route a press travels: the request names a configured action by
 * id, so the command a launch runs is always the deployment's own configuration
 * and never a value the browser supplies.
 */

/** Exact Fetch route on the shared `/api` channel carrying every application launch. */
export const QUICK_START_LAUNCH_PATH = '/api/quickstart.launch'

/** Request body: which configured action to start. */
export interface QuickStartLaunchRequest {
  /** Id of a configured application action. */
  readonly id: string
}

/** Success payload: the application's page answered. */
export interface QuickStartLaunchReadyPayload {
  /** Present so a truncated or rewritten answer is distinguishable from this one. */
  readonly ok: true
}

/** Why a launch ended without the page answering. */
export type QuickStartLaunchFailureReason = 'unknown-action' | 'launch-failed' | 'launch-timeout'

/** Failure payload: the discriminant the browser localizes, plus host detail for the panel. */
export interface QuickStartLaunchFailurePayload {
  /** Stable discriminant; the browser maps it to its own copy. */
  readonly code: QuickStartLaunchFailureReason
  /** Host-side detail, shown verbatim as the wire value it is. */
  readonly message: string
}

/**
 * Read one launch request at the wire.
 * @param value - the parsed JSON body.
 * @returns the request, or undefined when it names no action.
 */
export function readLaunchRequest(value: unknown): QuickStartLaunchRequest | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { id } = value as Record<string, unknown>
  return typeof id === 'string' && id !== '' ? { id } : undefined
}
