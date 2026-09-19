/**
 * The badge's business face: the observable the renderer binds to a hook, and
 * the one action the cell can take.
 */

import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { BalanceAmountPayload, BalanceFailureReason } from '../wire.ts'

/** Balance facts one successful read produced, with the moment they arrived. */
export interface DeepSeekBalanceReading {
  /** Whether the balance still covers API calls, as the provider stated it. */
  readonly available: boolean
  /** One entry per currency the provider reported. */
  readonly balances: readonly BalanceAmountPayload[]
  /** Browser clock reading at the answer. */
  readonly fetchedAt: number
}

/** Why the latest read produced no amounts. */
export interface DeepSeekBalanceFailure {
  /** Stable discriminant mapped to this package's own copy. */
  readonly code: BalanceFailureReason
  /** Host or carrier detail, shown verbatim as the wire value it is. */
  readonly message: string
}

/**
 * What the badge renders. A failed refresh keeps the last reading, so a
 * transient failure shows the amount the account last reported plus the reason
 * it could not be confirmed, instead of blanking a figure the user is watching.
 */
export interface DeepSeekBalanceState {
  /** Reading phase: nothing yet, the provider's last answer, or a failed read. */
  readonly phase: 'loading' | 'ready' | 'error'
  /** Last successful reading; absent until one succeeds. */
  readonly reading?: DeepSeekBalanceReading
  /** Latest failure; absent while the last read succeeded or none ran. */
  readonly failure?: DeepSeekBalanceFailure
}

/** Browser operations and state injected into the sidebar status cell. */
export interface DeepSeekBalanceInjected {
  hooks: { balance: ObservableSnapshot<DeepSeekBalanceState> }
  /** Read the balance now, joining the read already in flight when there is one. */
  refresh: () => void
}
