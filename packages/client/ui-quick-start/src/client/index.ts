/**
 * Quick-start launch actions, browser half: the configured buttons under New
 * Session, each opening a session that already carries its opening
 * instruction, or starting a configured application and opening the panel that
 * embeds its page. The set arrives through the index global the host half
 * assigns, so an unconfigured deployment renders nothing here.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the Session Controller service merge (ctx.sessions).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the Conversation service merge (ctx.conversation).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the Layout service merge (ctx.layout).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the SlotRegistry service merge (ctx.slots).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ui-sidebar SlotMap merge (the quick-start seat and the panel rows).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the Workspace UI navigation service merge (ctx.uiWorkspace).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { QUICK_START_GLOBAL, readActions, type QuickStartAppAction } from '../actions.ts'
import { AppPanelLauncher, panelKeyOf } from './app-launcher.ts'
import { createAppPanelStore } from './app-panel-store.ts'
import type { QuickStartAppPanelInjected, QuickStartInjected } from './contract.ts'
import { QuickStartLauncher } from './launcher.ts'
import { en, NS, zh } from './locales.ts'
import { QuickStartAppPanel } from './QuickStartAppPanel.tsx'
import { QuickStartButtons } from './QuickStartButtons.tsx'
import { QuickStartPanelIcon } from './QuickStartPanelIcon.tsx'

export type { QuickStartAction } from '../actions.ts'

/** Panel rows sort ascending; these sit after any control rows a deployment adds. */
const PANEL_ORDER = 100

/** Services required by the quick-start plugin. */
export const inject = ['slots', 'sessions', 'conversation', 'uiWorkspace', 'layout', 'locale']

/**
 * Mount the sidebar quick-start seat and one central panel per application action.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  const actions = readActions((globalThis as unknown as Record<string, unknown>)[QUICK_START_GLOBAL])
  if (actions.length === 0) return
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-quick-start: dictionaries')
  const launcher = new QuickStartLauncher(ctx)
  // Connecting a Workspace either creates a blank session or reuses one, and
  // the press predates it — so a staged instruction lands when the session
  // arrives, not when the button was pressed.
  ctx.effect(
    () => ctx.sessions.list.subscribe(() => { launcher.apply() }),
    'ui-quick-start: staged launch',
  )
  const apps = actions.filter((action): action is QuickStartAppAction => action.kind === 'app')
  // One instance behind every panel registration, so an application's phase
  // survives the central column being switched away and back.
  const handle = createAppPanelStore()
  const instance = handle.create()
  const store = { ...handle, create: () => instance }
  const appLauncher = new AppPanelLauncher(instance.actions, (id) => { ctx.layout.selectPanel(id) })
  const launch = (id: string): void => {
    const action = actions.find(candidate => candidate.id === id)
    if (action === undefined) return
    if (action.kind === 'prompt') launcher.launch(action.prompt)
    else void appLauncher.start(action)
  }
  ctx.slots.inject('sidebar.quickstart', () => ctx.slots.register({
    name: 'sidebar.quickstart',
    inject: (): QuickStartInjected => ({ actions, launch }),
  }, QuickStartButtons))
  if (apps.length === 0) return
  ctx.slots.inject('main', function* () {
    for (const action of apps) {
      yield ctx.slots.register({
        name: 'main',
        key: panelKeyOf(action),
        locale: NS,
        store,
        inject: (): QuickStartAppPanelInjected => ({
          action,
          start: launch,
          close: () => { ctx.layout.selectPanel(null) },
        }),
      }, QuickStartAppPanel)
    }
  })
  ctx.slots.inject('sidebar.panellist', function* () {
    for (const action of apps) {
      yield ctx.slots.register({
        name: 'sidebar.panellist',
        id: panelKeyOf(action),
        order: PANEL_ORDER,
        label: action.label,
      }, QuickStartPanelIcon)
    }
  })
}
