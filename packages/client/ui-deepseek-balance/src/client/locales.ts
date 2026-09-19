/**
 * `deepSeekBalance` namespace dictionary for the sidebar status cell.
 *
 * Amounts, currency codes, and the host's failure detail are wire values and
 * stay verbatim; every word around them is product copy and lives here.
 */

/** Dictionary namespace owned by this plugin. */
export const NS = 'deepSeekBalance'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'badge.aria': 'DeepSeek 余额 {amount}',
  'badge.placeholder': '—',
  'tip.loading': '正在读取余额…',
  'tip.available': '余额可用',
  'tip.unavailable': '余额不足，继续调用 API 会失败',
  'tip.amount': '总余额 {total}，其中充值 {toppedUp}、赠送 {granted}',
  'tip.updated': '更新于 {time}',
  'tip.refresh': '点击刷新',
  'failure.notConfigured': '还没有为此部署配置 API Key',
  'failure.unauthorized': 'API Key 被服务端拒绝',
  'failure.timeout': '读取余额超时',
  'failure.unreachable': '无法连接余额接口',
  'failure.invalidResponse': '余额接口返回了无法识别的数据',
} as const

/** The balance dictionary key union. */
export type DeepSeekBalanceKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Sidebar DeepSeek-balance badge copy. */
    deepSeekBalance: DeepSeekBalanceKey
  }
}

/** English dictionary, checked complete against the Chinese source of truth. */
export const en: Record<DeepSeekBalanceKey, string> = {
  'badge.aria': 'DeepSeek balance {amount}',
  'badge.placeholder': '—',
  'tip.loading': 'Reading the balance…',
  'tip.available': 'The balance covers API calls',
  'tip.unavailable': 'The balance is too low for further API calls',
  'tip.amount': 'Total {total}, of which topped up {toppedUp} and granted {granted}',
  'tip.updated': 'Updated at {time}',
  'tip.refresh': 'Click to refresh',
  'failure.notConfigured': 'No API key is configured for this deployment',
  'failure.unauthorized': 'The provider rejected the API key',
  'failure.timeout': 'The balance read timed out',
  'failure.unreachable': 'The balance endpoint is unreachable',
  'failure.invalidResponse': 'The balance endpoint answered unrecognized data',
}
