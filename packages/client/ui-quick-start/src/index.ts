/**
 * Quick-start launch actions, node half: resolve the configured set, hand it to
 * the browser half through the served index, and serve the one route that
 * starts a configured application.
 *
 * A `dsh.client` row's `config` reaches this half only — the browser boot
 * composes its plugin rows without one — so the set travels as an index
 * injection, the channel `dsh-client-connection` uses for its recovery timing.
 * Both the Web server and the Desktop host render that injection table.
 *
 * The launch route is registered on Connection's shared `/api` channel rather
 * than as a webServer route: the Desktop host forwards only `/api` requests to
 * the host process, so a raw webServer route would exist on one surface and 405
 * on the other. Connection's physical carrier owns trust and authentication for
 * that channel, and the request names an action id only — the command is always
 * this deployment's own configuration.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IndexInjection } from '@deepseek-ai/dsh-host-webserver'
// Type-only: pulls the Host Connection service merge (ctx.connection).
import type {} from '@deepseek-ai/dsh-client-connection'
import { QUICK_START_GLOBAL, type QuickStartAppAction } from './actions.ts'
import { launchApp, type AppLaunchOutcome } from './app-launch.ts'
import { Config, DEFAULT_LAUNCH_READY_MS, resolveActions } from './config.ts'
import { internals } from './internals.ts'
import {
  QUICK_START_LAUNCH_PATH,
  readLaunchRequest,
  type QuickStartLaunchFailurePayload,
  type QuickStartLaunchReadyPayload,
} from './wire.ts'

export { Config } from './config.ts'
export type { QuickStartAction } from './actions.ts'
export type { QuickStartActionEntry } from './config.ts'

/** The shared API channel carrying the launch route. */
export const inject = ['connection']

/** Launch outcomes are live facts; a cached answer would report a stale phase. */
const NO_STORE = { 'cache-control': 'no-store' } as const

/**
 * Publish the launch actions this deployment offers, and serve presses on a
 * configured application.
 * @param ctx - Host plugin context.
 * @param config - resolved plugin config (schema defaults applied).
 * @throws {Error} when the configured set cannot be rendered or told apart.
 */
export function apply(ctx: Context, config: Config = Config({})): void {
  const actions = resolveActions(config.actions ?? [])
  if (actions.length === 0) return
  ctx.on('webserver/index-inject', (table: IndexInjection[]) => {
    table.push({ kind: 'global', name: QUICK_START_GLOBAL, value: actions })
  })
  const apps = actions.filter((action): action is QuickStartAppAction => action.kind === 'app')
  if (apps.length === 0) return
  const readyMs = config.launchReadyMs ?? DEFAULT_LAUNCH_READY_MS
  /** The attempt in flight per action, so two presses start one application. */
  const launches = new Map<string, Promise<AppLaunchOutcome>>()

  /**
   * Start one action, joining the attempt already running for it.
   * @param action - the configured action.
   * @param signal - the requesting client's lifetime.
   * @returns the running or new attempt's outcome.
   */
  const launchOnce = (action: QuickStartAppAction, signal: AbortSignal): Promise<AppLaunchOutcome> => {
    const existing = launches.get(action.id)
    if (existing !== undefined) return existing
    const attempt = launchApp(action, readyMs, signal, internals.launch).finally(() => { launches.delete(action.id) })
    launches.set(action.id, attempt)
    return attempt
  }

  ctx.effect(() => ctx.connection.fetch.register({
    path: QUICK_START_LAUNCH_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request): Promise<Response> => {
      let body: unknown
      try {
        body = await request.json()
      } catch {
        // Swallows the parse failure: a non-JSON body is exactly the refusal.
        return new Response('body is not JSON', { status: 400 })
      }
      const parsed = readLaunchRequest(body)
      if (parsed === undefined) return new Response('body must be JSON with a string "id"', { status: 400 })
      const action = apps.find(candidate => candidate.id === parsed.id)
      if (action === undefined) {
        const failure: QuickStartLaunchFailurePayload = {
          code: 'unknown-action',
          message: `no configured application action named ${JSON.stringify(parsed.id)}`,
        }
        return Response.json(failure, { status: 404, headers: NO_STORE })
      }
      const outcome = await launchOnce(action, request.signal)
      if (outcome.status === 'ready') {
        const ready: QuickStartLaunchReadyPayload = { ok: true }
        return Response.json(ready, { headers: NO_STORE })
      }
      const failure: QuickStartLaunchFailurePayload = {
        code: outcome.reason === 'timeout' ? 'launch-timeout' : 'launch-failed',
        message: outcome.message,
      }
      return Response.json(failure, { status: outcome.reason === 'timeout' ? 504 : 502, headers: NO_STORE })
    },
  }), `ui-quick-start: POST ${QUICK_START_LAUNCH_PATH}`)
}
