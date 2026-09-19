/**
 * DeepSeek account balance, node half: one exact `/api` route answering with
 * the balance the credential this harness holds can see.
 *
 * The route is registered on Connection's shared `/api` channel rather than as
 * a `webServer` route, so the Desktop host reaches it too (that host forwards
 * `/api` requests to the host process). The physical carrier owns trust and
 * authentication for the channel, and the request carries no parameters: the
 * endpoint and the credential are always this deployment's own configuration.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the Host Connection service merge (ctx.connection).
import type {} from '@deepseek-ai/dsh-client-connection'
// Type-only: pulls the credential service merge (ctx.credentials).
import type {} from '@deepseek-ai/dsh-credentials'
import { readDeepSeekBalance } from './balance.ts'
import { Config, resolveBalanceOptions, type ResolvedBalanceOptions } from './config.ts'
import {
  DEEPSEEK_BALANCE_PATH,
  type BalanceFailurePayload,
  type BalanceFailureReason,
  type BalanceReadyPayload,
} from './wire.ts'

export { Config } from './config.ts'

/** Plugin name for the Loader row that mounts this package. */
export const name = 'ui-deepseek-balance'

/** The shared API channel carrying the balance route, and the credential seam it resolves through. */
export const inject = ['connection', 'credentials']

/** Balance answers are live facts; a cached one would report an amount the account already moved past. */
const NO_STORE = { 'cache-control': 'no-store' } as const

/** HTTP status per failure; the badge reads the discriminant, the status serves ordinary HTTP callers. */
const STATUS: Readonly<Record<BalanceFailureReason, number>> = {
  'not-configured': 503,
  'unauthorized': 502,
  'timeout': 504,
  'unreachable': 502,
  'invalid-response': 502,
}

/**
 * Register the account-balance route.
 * @param ctx - Host plugin context carrying the shared Connection channel.
 * @param config - resolved plugin config (schema defaults applied).
 * @throws {Error} when the configured credential reference, endpoint, or deadline is unusable.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const options = resolveBalanceOptions(config)
  ctx.effect(() => ctx.connection.fetch.register({
    path: DEEPSEEK_BALANCE_PATH,
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: request => answer(ctx, options, request.signal),
  }), `ui-deepseek-balance: GET ${DEEPSEEK_BALANCE_PATH}`)
}

/** One failure answer in the payload both halves share. */
function failure(code: BalanceFailureReason, message: string): Response {
  const payload: BalanceFailurePayload = { ok: false, code, message }
  return Response.json(payload, { status: STATUS[code], headers: NO_STORE })
}

/**
 * Answer one balance request: resolve the key, read the provider, map the outcome.
 * @param ctx - Host plugin context.
 * @param options - resolved endpoint, credential reference, and deadline.
 * @param signal - the requesting client's lifetime.
 * @returns the balance answer.
 */
async function answer(ctx: Context, options: ResolvedBalanceOptions, signal: AbortSignal): Promise<Response> {
  // Resolution is per request, exactly as a provider request resolves its own
  // key, so a credential stored after boot reaches the next refresh without a
  // plugin restart.
  const resolved = await ctx.credentials.resolve(options.apiKeyEnv)
  const apiKey = resolved?.value
  if (apiKey === undefined || apiKey.length === 0) {
    return failure(
      'not-configured',
      `no credential for ${options.apiKeyEnv}; store it through the credentials service`
      + ' (the web Models page writes it), or export it in the launching environment',
    )
  }
  const outcome = await readDeepSeekBalance({ baseURL: options.baseURL, apiKey }, options.timeoutMs, signal)
  if (!outcome.ok) return failure(outcome.code, outcome.message)
  const payload: BalanceReadyPayload = { ok: true, available: outcome.available, balances: outcome.balances }
  return Response.json(payload, { headers: NO_STORE })
}
