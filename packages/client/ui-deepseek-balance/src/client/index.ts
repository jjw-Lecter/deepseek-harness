/**
 * DeepSeek account balance, browser half: one cell in the sidebar's brand row
 * showing what the credential this deployment configured can still spend.
 *
 * The cell reads the host's `/api/deepseek.balance` route on a cadence and on
 * every press. The host half owns which credential and endpoint that read
 * uses, so nothing about the account reaches the page but the amounts.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ui-sidebar SlotMap merge (the brand-status seat).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { DeepSeekBalanceInjected } from './contract.ts'
import { DeepSeekBalanceController } from './controller.ts'
import { DeepSeekBalanceBadge } from './DeepSeekBalanceBadge.tsx'
import { en, NS, zh, type DeepSeekBalanceKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar DeepSeek-balance cell copy. */
    deepSeekBalance: DeepSeekBalanceKey
  }
}

export type {
  DeepSeekBalanceBadgeProps,
} from './DeepSeekBalanceBadge.tsx'
export type {
  DeepSeekBalanceFailure, DeepSeekBalanceInjected, DeepSeekBalanceReading, DeepSeekBalanceState,
} from './contract.ts'

/** Services required for the locale registration and the sidebar status contribution. */
export const inject = ['slots', 'locale']

/**
 * Mount the balance cell and start its refresh cadence.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const controller = new DeepSeekBalanceController()
  ctx.effect(() => async () => { await controller.dispose() }, 'ui-deepseek-balance: refresh cadence')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-deepseek-balance: dictionaries')
  ctx.slots.inject('sidebar.brand.status', () => ctx.slots.register({
    name: 'sidebar.brand.status',
    id: 'deepseek-balance',
    locale: NS,
    inject: (): DeepSeekBalanceInjected => ({
      hooks: { balance: controller.store },
      refresh: () => { void controller.refresh() },
    }),
  }, DeepSeekBalanceBadge))
  controller.start()
}
