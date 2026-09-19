/**
 * The DeepSeek account balance, as one cell in the sidebar's brand row.
 *
 * The cell shows the amount the account last reported and is itself the
 * refresh control: a read is one click away, and the tooltip states what the
 * figure means, when it arrived, and why the last read failed when it did. A
 * failed refresh keeps the previous amount on screen — the user is watching
 * that figure, and blanking it would hide more than it protects.
 */
import clsx from 'clsx'
import { StateDot, Tooltip, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-sidebar SlotMap merge (the brand-status seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { BalanceFailureReason } from '../wire.ts'
import type { DeepSeekBalanceInjected, DeepSeekBalanceState } from './contract.ts'
import { NS, type DeepSeekBalanceKey } from './locales.ts'
import css from './DeepSeekBalanceBadge.module.css'

/** Full props of the sidebar balance cell. */
export type DeepSeekBalanceBadgeProps =
  PropsRuntime<'sidebar.brand.status'>
  & PropsLocale<typeof NS>
  & InjectFace<DeepSeekBalanceInjected>

/** Currency marks the provider issues; a code outside this map keeps its own spelling. */
const CURRENCY_MARKS: Readonly<Record<string, string>> = { CNY: '¥', USD: '$' }

/** Localized line stating why a read produced no amounts. */
const FAILURE_KEYS: Readonly<Record<BalanceFailureReason, DeepSeekBalanceKey>> = {
  'not-configured': 'failure.notConfigured',
  'unauthorized': 'failure.unauthorized',
  'timeout': 'failure.timeout',
  'unreachable': 'failure.unreachable',
  'invalid-response': 'failure.invalidResponse',
}

/**
 * One amount as the provider stated it, marked by its currency.
 * @param currency - provider currency code.
 * @param value - the provider's decimal string.
 * @returns the display text for that amount.
 */
function amountText(currency: string, value: string): string {
  const mark = CURRENCY_MARKS[currency]
  return mark === undefined ? `${currency} ${value}` : `${mark}${value}`
}

/** The state marker, or undefined while the cell has nothing to warn about. */
function dotOf(state: DeepSeekBalanceState): StateDotState | undefined {
  if (state.failure !== undefined) return 'error'
  if (state.reading !== undefined && !state.reading.available) return 'warning'
  return undefined
}

/**
 * The tooltip's single line: what the figure is, how fresh it is, and what the
 * last read reported.
 * @param state - the published balance state.
 * @param t - the bound namespace translator.
 * @returns the bubble text.
 */
function tooltipOf(state: DeepSeekBalanceState, t: TranslateNS<typeof NS>): string {
  const parts: string[] = []
  const reading = state.reading
  const primary = reading?.balances.at(0)
  if (reading === undefined) {
    parts.push(t('tip.loading'))
  } else {
    if (primary !== undefined) {
      parts.push(t('tip.amount', {
        total: amountText(primary.currency, primary.total),
        toppedUp: amountText(primary.currency, primary.toppedUp),
        granted: amountText(primary.currency, primary.granted),
      }))
    }
    parts.push(t(reading.available ? 'tip.available' : 'tip.unavailable'))
    parts.push(t('tip.updated', { time: new Date(reading.fetchedAt).toLocaleTimeString() }))
  }
  const failure = state.failure
  if (failure !== undefined) {
    const line = t(FAILURE_KEYS[failure.code])
    parts.push(failure.message === '' ? line : `${line} — ${failure.message}`)
  }
  parts.push(t('tip.refresh'))
  return parts.join(' · ')
}

/**
 * Render the balance cell.
 * @param props - bound balance state, the refresh action, and localized copy.
 * @returns the amount cell and its tooltip.
 */
export function DeepSeekBalanceBadge({ useBalance, refresh, t }: DeepSeekBalanceBadgeProps) {
  const state = useBalance(snapshot => snapshot)
  const primary = state.reading?.balances.at(0)
  const amount = primary === undefined
    ? t('badge.placeholder')
    : amountText(primary.currency, primary.total)
  const dot = dotOf(state)
  return (
    <Tooltip label={tooltipOf(state, t)} side="bottom" delayMs={500}>
      <button
        type="button"
        className={css.badge}
        aria-label={t('badge.aria', { amount })}
        onClick={refresh}
      >
        {dot === undefined ? null : <StateDot state={dot} size={8} className={css.dot} />}
        <span className={clsx(css.amount, primary === undefined && css.placeholder)}>{amount}</span>
      </button>
    </Tooltip>
  )
}
