/**
 * The central panel one configured application owns.
 *
 * Before the first press it offers the start control; while the host starts the
 * application it reports that phase, and once the page answers it embeds the
 * page itself. The frame is keyed by the store's revision, so reload remounts
 * the application instead of asking a cross-origin document to reload itself.
 */
import clsx from 'clsx'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-layout SlotMap merge (the 'main' keyed seat).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { QuickStartLaunchFailureReason } from '../wire.ts'
import { IDLE_APP_PANEL, type createAppPanelStore } from './app-panel-store.ts'
import type { QuickStartAppPanelInjected } from './contract.ts'
import { NS, type QuickStartKey } from './locales.ts'
import css from './QuickStartAppPanel.module.css'

/** Full props of one embedded-application panel. */
export type QuickStartAppPanelProps =
  PropsRuntime<'main'>
  & PropsStore<ReturnType<typeof createAppPanelStore>>
  & InjectFace<QuickStartAppPanelInjected>
  & PropsLocale<typeof NS>

/**
 * The copy line for a failed launch.
 * @param code - the host's discriminant.
 * @returns the dictionary key naming that failure.
 */
function failureKey(code: QuickStartLaunchFailureReason): QuickStartKey {
  switch (code) {
    case 'unknown-action': return 'app.failure.unknownAction'
    case 'launch-timeout': return 'app.failure.timeout'
    case 'launch-failed': return 'app.failure.launchFailed'
  }
}

/**
 * Render one application's panel.
 * @param props - composed slot props (the action, the store, injected controls, copy).
 * @returns the panel element tree.
 */
export function QuickStartAppPanel({ action, start, close, useStore, actions, t }: QuickStartAppPanelProps) {
  const entry = useStore(snapshot => snapshot.byId[action.id]) ?? IDLE_APP_PANEL
  return (
    <div className={css.root} data-quick-start-app={action.id}>
      <div className={css.header}>
        <span className={css.title}>{action.label}</span>
        <span className={css.spacer} />
        {entry.phase === 'ready' && (
          <button
            type="button"
            className={css.control}
            onClick={() => { actions.reload(action.id) }}
          >
            {t('app.reload')}
          </button>
        )}
        <button type="button" className={css.control} onClick={close}>{t('app.back')}</button>
      </div>
      {entry.phase === 'ready' && (
        <iframe key={entry.revision} className={css.frame} src={action.url} title={action.label} />
      )}
      {entry.phase === 'idle' && (
        <div className={css.state}>
          <p className={css.stateTitle}>{t('app.idle.title')}</p>
          <p className={css.stateHint}>{t('app.idle.hint')}</p>
          <button type="button" className={css.primary} onClick={() => { start(action.id) }}>
            {t('app.start')}
          </button>
        </div>
      )}
      {entry.phase === 'starting' && (
        <div className={clsx(css.state, css.busy)}>
          <p className={css.stateTitle}>{t('app.starting', { label: action.label })}</p>
          <p className={css.stateHint}>{t('app.starting.hint')}</p>
        </div>
      )}
      {entry.phase === 'failed' && (
        <div className={css.state}>
          <p className={css.stateTitle}>{t(failureKey(entry.code))}</p>
          {entry.detail !== '' && <p className={css.detail}>{entry.detail}</p>}
          <button type="button" className={css.primary} onClick={() => { start(action.id) }}>
            {t('app.retry')}
          </button>
        </div>
      )}
    </div>
  )
}
