/**
 * `quickStart` namespace dictionaries for the embedded-application panel.
 *
 * A button's label is configuration and stays untranslated; everything around
 * it — phases, failures, and the panel's own controls — is product copy and
 * lives here.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'quickStart'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'app.idle.title': '尚未启动',
  'app.idle.hint': '启动后，应用页面会嵌入这里。',
  'app.start': '启动',
  'app.starting': '正在启动 {label}…',
  'app.starting.hint': '首次启动要等服务就绪，通常需要十几秒到一分钟。',
  'app.reload': '重新加载',
  'app.back': '返回会话',
  'app.retry': '重试',
  'app.failure.unknownAction': '这个启动项已不在配置里。',
  'app.failure.launchFailed': '启动失败。',
  'app.failure.timeout': '等待应用响应超时，应用可能仍在启动。',
} as const

/** The quick-start dictionary key union. */
export type QuickStartKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Embedded-application panel copy. */
    quickStart: QuickStartKey
  }
}

/** English dictionary, checked complete against the Chinese source of truth. */
export const en: Record<QuickStartKey, string> = {
  'app.idle.title': 'Not started',
  'app.idle.hint': 'Starting it embeds the application page here.',
  'app.start': 'Start',
  'app.starting': 'Starting {label}…',
  'app.starting.hint': 'The first start waits for the service to come up, usually tens of seconds.',
  'app.reload': 'Reload',
  'app.back': 'Back to session',
  'app.retry': 'Retry',
  'app.failure.unknownAction': 'This start action is no longer configured.',
  'app.failure.launchFailed': 'The application could not be started.',
  'app.failure.timeout': 'The application did not answer in time; it may still be starting.',
}
