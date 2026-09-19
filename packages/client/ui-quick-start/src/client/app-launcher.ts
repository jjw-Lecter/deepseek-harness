/**
 * Turns one press into a running application.
 *
 * The browser never learns a command: it names the configured action and the
 * host runs what that action declared. The panel is selected before the request
 * leaves, so the press shows where its progress is reported, and one launch at
 * a time is enough — a second press while one is in flight joins it rather than
 * starting the application twice.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { QuickStartAppAction } from '../actions.ts'
import {
  QUICK_START_LAUNCH_PATH,
  type QuickStartLaunchFailurePayload,
  type QuickStartLaunchFailureReason,
  type QuickStartLaunchRequest,
} from '../wire.ts'
import type { createAppPanelStore } from './app-panel-store.ts'

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** Failure facts the panel can render: a localized discriminant plus host detail. */
export interface AppLaunchFailure {
  readonly code: QuickStartLaunchFailureReason
  readonly detail: string
}

/**
 * Main-slot key and sidebar-panel id of one application action's panel.
 * @param action - the configured action.
 * @returns the key this action's panel registers and is selected by.
 */
export function panelKeyOf(action: QuickStartAppAction): MainPanelId {
  return `quickstart-app:${action.id}` as MainPanelId
}

/**
 * Read one failure payload the host sent.
 *
 * The answer is a wire value, so an unreadable body or an unknown code has one
 * meaning: the press failed for reasons the host stated no better.
 * @param response - the non-ok response.
 * @returns the code to localize and the host's detail line.
 */
async function failureOf(response: Response): Promise<AppLaunchFailure> {
  const fallback = response.status === 504 ? 'launch-timeout' : 'launch-failed'
  try {
    const payload = await response.json() as Partial<QuickStartLaunchFailurePayload>
    const code = payload.code
    return {
      code: code === 'unknown-action' || code === 'launch-timeout' || code === 'launch-failed' ? code : fallback,
      detail: typeof payload.message === 'string' ? payload.message : '',
    }
  } catch {
    // Swallows the parse failure: an unreadable body states no better reason.
    return { code: fallback, detail: '' }
  }
}

/** Starts configured applications and reports their phases into the panel store. */
export class AppPanelLauncher {
  /** The launch in flight; a press during one joins it. */
  private pending: Promise<void> | undefined

  /**
   * @param actions - bound writes of the panel store shared with the panel entries.
   * @param selectPanel - shows the panel the launch reports into.
   * @param fetcher - HTTP carrier for the launch request.
   */
  constructor(
    private readonly actions: BoundActions<ReturnType<typeof createAppPanelStore>>,
    private readonly selectPanel: (id: MainPanelId | null) => void,
    private readonly fetcher: Fetch = (input, init) => fetch(input, init),
  ) {}

  /**
   * Start one configured application and open its panel.
   * @param action - the action whose button was pressed.
   * @returns after the host answered and the phase was published.
   */
  start(action: QuickStartAppAction): Promise<void> {
    this.pending ??= this.run(action).finally(() => { this.pending = undefined })
    return this.pending
  }

  private async run(action: QuickStartAppAction): Promise<void> {
    this.actions.begin(action.id)
    this.selectPanel(panelKeyOf(action))
    let failure: AppLaunchFailure
    try {
      const response = await this.fetcher(QUICK_START_LAUNCH_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: action.id } satisfies QuickStartLaunchRequest),
      })
      if (response.ok) {
        this.actions.ready(action.id)
        return
      }
      failure = await failureOf(response)
    } catch (error) {
      // A carrier failure never reached the host, so nothing was started.
      failure = { code: 'launch-failed', detail: error instanceof Error ? error.message : String(error) }
    }
    this.actions.fail(action.id, failure.code, failure.detail)
  }
}
