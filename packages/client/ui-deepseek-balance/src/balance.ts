/**
 * One read of the DeepSeek account balance, and the whole failure taxonomy the
 * badge localizes.
 *
 * The provider endpoint is `GET {baseURL}/user/balance`, answered with
 * `{ is_available, balance_infos: [{ currency, total_balance, granted_balance,
 * topped_up_balance }] }`. Amounts stay the provider's decimal strings: this
 * package only displays them, so re-parsing them into binary floats could only
 * introduce drift.
 */

import type { BalanceAmountPayload, BalanceFailureReason } from './wire.ts'

/** Connection facts one balance read needs. */
export interface BalanceConnection {
  /** Provider root; the endpoint is this value plus `/user/balance`. */
  readonly baseURL: string
  /** Credential sent as the bearer token. */
  readonly apiKey: string
}

/** One read's outcome: the provider's amounts, or why there are none. */
export type BalanceReadOutcome =
  | { readonly ok: true; readonly available: boolean; readonly balances: readonly BalanceAmountPayload[] }
  | { readonly ok: false; readonly code: BalanceFailureReason; readonly message: string }

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** Longest provider or transport detail carried into a failure message. */
const MAX_DETAIL_CHARS = 200

/**
 * The provider endpoint one read addresses.
 * @param baseURL - configured provider root, with or without a trailing slash.
 * @returns the absolute balance endpoint.
 */
export function balanceEndpoint(baseURL: string): string {
  return `${baseURL.replace(/\/+$/u, '')}/user/balance`
}

/** Truncate untrusted detail so one failure message stays one line. */
function detailOf(value: string): string {
  const collapsed = value.replace(/\s+/gu, ' ').trim()
  return collapsed.length > MAX_DETAIL_CHARS ? `${collapsed.slice(0, MAX_DETAIL_CHARS)}…` : collapsed
}

/**
 * Read the provider's own body.
 *
 * The provider is an external service, so its body is a wire value: a missing
 * flag, a non-array list, or a list whose every entry lacks a stated amount
 * means this harness cannot show a balance rather than a balance of zero.
 * @param value - the parsed JSON body.
 * @returns the reading, or undefined when the body is not one.
 */
function readingOf(value: unknown): { available: boolean; balances: readonly BalanceAmountPayload[] } | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { is_available: isAvailable, balance_infos: infos } = value as Record<string, unknown>
  if (typeof isAvailable !== 'boolean' || !Array.isArray(infos)) return undefined
  const balances: BalanceAmountPayload[] = []
  for (const entry of infos) {
    if (typeof entry !== 'object' || entry === null) continue
    const { currency, total_balance: total, granted_balance: granted, topped_up_balance: toppedUp } =
      entry as Record<string, unknown>
    if (typeof currency !== 'string' || currency === '') continue
    if (typeof total !== 'string' || typeof granted !== 'string' || typeof toppedUp !== 'string') continue
    balances.push({ currency, total, granted, toppedUp })
  }
  if (infos.length > 0 && balances.length === 0) return undefined
  return { available: isAvailable, balances }
}

/**
 * Read the account balance once.
 * @param connection - provider root and the credential to authenticate with.
 * @param timeoutMs - deadline for the whole read.
 * @param signal - the requesting client's lifetime; an abort here propagates instead of becoming an outcome.
 * @param fetcher - HTTP carrier, injectable for tests.
 * @returns the provider's amounts, or the failure the badge reports.
 * @throws the abort reason when `signal` aborts before the provider answers.
 */
export async function readDeepSeekBalance(
  connection: BalanceConnection,
  timeoutMs: number,
  signal: AbortSignal,
  fetcher: Fetch = fetch,
): Promise<BalanceReadOutcome> {
  const endpoint = balanceEndpoint(connection.baseURL)
  const deadline = AbortSignal.timeout(timeoutMs)
  let response: Response
  try {
    response = await fetcher(endpoint, {
      headers: { authorization: `Bearer ${connection.apiKey}`, accept: 'application/json' },
      signal: AbortSignal.any([signal, deadline]),
    })
  } catch (error) {
    // The requesting client went away: its own abort is not a balance answer.
    if (signal.aborted) throw error
    if (deadline.aborted) {
      return { ok: false, code: 'timeout', message: `no answer from ${endpoint} within ${String(timeoutMs)} ms` }
    }
    return {
      ok: false,
      code: 'unreachable',
      message: detailOf(error instanceof Error ? error.message : String(error)),
    }
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    // A rejected credential is a configuration state the user can fix, so it
    // is told apart from an unreachable or failing provider.
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        code: 'unauthorized',
        message: `the provider rejected the credential (HTTP ${String(response.status)})`,
      }
    }
    return {
      ok: false,
      code: 'unreachable',
      message: detailOf(`the provider answered HTTP ${String(response.status)} ${detail}`),
    }
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    // Swallows the parse failure: a body that is not JSON is exactly the refusal.
    return { ok: false, code: 'invalid-response', message: `${endpoint} answered a body that is not JSON` }
  }
  const reading = readingOf(body)
  if (reading === undefined) {
    return { ok: false, code: 'invalid-response', message: `${endpoint} answered an unrecognized balance body` }
  }
  return { ok: true, available: reading.available, balances: reading.balances }
}
