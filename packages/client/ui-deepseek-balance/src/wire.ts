/**
 * The one host route the badge reads, plus the payloads both halves agree on.
 *
 * The browser never holds a credential: it asks the host that already holds one
 * for the account state, and the host answers with the amounts the provider
 * reported or a stable failure discriminant the badge localizes into its own
 * copy. Host detail rides `message` as a wire value and is shown verbatim.
 */

/** Exact Fetch route on the shared `/api` channel carrying the account balance. */
export const DEEPSEEK_BALANCE_PATH = '/api/deepseek.balance'

/** One currency's amounts, kept as the provider's own decimal strings. */
export interface BalanceAmountPayload {
  /** Provider currency code, such as `CNY` or `USD`. */
  readonly currency: string
  /** Total available balance, including granted and topped-up amounts. */
  readonly total: string
  /** Not-yet-expired granted balance. */
  readonly granted: string
  /** Topped-up balance. */
  readonly toppedUp: string
}

/** Balance facts one successful read produced. */
export interface BalanceReadyPayload {
  /** Present so a truncated or rewritten answer is distinguishable from this one. */
  readonly ok: true
  /** Whether the balance still covers API calls. */
  readonly available: boolean
  /** One entry per currency the provider reported, in provider order. */
  readonly balances: readonly BalanceAmountPayload[]
}

/** Why the balance could not be read. */
export type BalanceFailureReason =
  | 'not-configured'
  | 'unauthorized'
  | 'timeout'
  | 'unreachable'
  | 'invalid-response'

/** The failure the host reports instead of amounts. */
export interface BalanceFailurePayload {
  /** Present so a truncated or rewritten answer is distinguishable from this one. */
  readonly ok: false
  /** Stable discriminant; the badge maps it to its own copy. */
  readonly code: BalanceFailureReason
  /** Host-side detail, shown verbatim as the wire value it is. */
  readonly message: string
}

/** One decoded answer from {@link DEEPSEEK_BALANCE_PATH}. */
export type BalancePayload = BalanceReadyPayload | BalanceFailurePayload

const FAILURE_REASONS: readonly BalanceFailureReason[] = [
  'not-configured', 'unauthorized', 'timeout', 'unreachable', 'invalid-response',
]

/** Read one amount entry, dropping a field the provider did not state. */
function amountOf(value: unknown): BalanceAmountPayload | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { currency, total, granted, toppedUp } = value as Record<string, unknown>
  if (typeof currency !== 'string' || currency === '') return undefined
  if (typeof total !== 'string' || typeof granted !== 'string' || typeof toppedUp !== 'string') return undefined
  return { currency, total, granted, toppedUp }
}

/**
 * Decode one answer this package's host half served.
 *
 * The badge reads across the browser/host boundary, so an unreadable body —
 * a stale cached document, a truncated answer, a differently built host —
 * carries no balance rather than a guessed one. An amount entry missing a
 * stated field is dropped; a body with no readable field at all is refused.
 * @param value - the parsed JSON body.
 * @returns the decoded answer, or undefined when it is neither form.
 */
export function readBalancePayload(value: unknown): BalancePayload | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { ok, available, balances, code, message } = value as Record<string, unknown>
  if (ok === false) {
    if (typeof code !== 'string' || !FAILURE_REASONS.includes(code as BalanceFailureReason)) return undefined
    return { ok: false, code: code as BalanceFailureReason, message: typeof message === 'string' ? message : '' }
  }
  if (ok !== true || typeof available !== 'boolean' || !Array.isArray(balances)) return undefined
  const amounts: BalanceAmountPayload[] = []
  for (const entry of balances) {
    const amount = amountOf(entry)
    if (amount !== undefined) amounts.push(amount)
  }
  if (balances.length > 0 && amounts.length === 0) return undefined
  return { ok: true, available, balances: amounts }
}
