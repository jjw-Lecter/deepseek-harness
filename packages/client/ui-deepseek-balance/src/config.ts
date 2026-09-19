/**
 * Plugin configuration and its one explicit resolve step from raw config to
 * validated connection facts.
 */

import Schema from '@deepseek-ai/schemastery'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CredentialRef } from '@deepseek-ai/dsh-credentials'

/** Credential reference resolved when the row names none. */
const DEFAULT_API_KEY_ENV = 'DEEPSEEK_API_KEY'

/** Public API root; a gateway deployment states its own endpoint on the row. */
export const PUBLIC_BASE_URL = 'https://api.deepseek.com'

/**
 * The credential-reference grammar `dsh-credentials` admits: a POSIX shell
 * identifier, which is what an environment variable may be named. Stated here
 * because this package validates its own config field before branding it.
 */
const CREDENTIAL_REF = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Deadline for one provider read (default one read of a small JSON document). */
const DEFAULT_TIMEOUT_MS = 10_000

/** Largest delay `setTimeout` and `AbortSignal.timeout` accept. */
const MAX_TIMEOUT_MS = 2_147_483_647

/**
 * Plugin config, validated by the same-named schemastery schema. The row this
 * package is mounted from states which credential and endpoint the balance
 * read uses; the browser half carries no configuration, because a `dsh.client`
 * row's `config` reaches its host half only.
 */
export interface Config {
  /** Credential reference (environment-variable name) resolved per request; defaults to `DEEPSEEK_API_KEY`. */
  readonly apiKeyEnv?: string
  /** Endpoint base; defaults to the public API. A gateway deployment states its own root here. */
  readonly baseURL?: string
  /** Deadline for one provider read, in milliseconds (default 10000). */
  readonly timeoutMs?: number
}

/** Validate the balance plugin's configuration. */
export const Config: Schema<Config> = Schema.object({
  apiKeyEnv: Schema.string().role('credential-ref').pattern(CREDENTIAL_REF).default(DEFAULT_API_KEY_ENV),
  baseURL: Schema.string(),
  timeoutMs: Schema.number().step(1).min(1).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
})

/** One resolved configuration's complete read facts. */
export interface ResolvedBalanceOptions {
  /** Credential reference resolved per request, so a changed key reaches the next read. */
  readonly apiKeyEnv: CredentialRef
  /** Validated provider root. */
  readonly baseURL: string
  /** Deadline for one provider read. */
  readonly timeoutMs: number
}

/**
 * Resolve, validate, and detach the read facts.
 *
 * Programmatic construction may bypass Schemastery normalization, so every
 * default and bound is re-judged here: the composition entry fails at load
 * rather than answering an unusable route for the rest of the run.
 * @param config - raw plugin config.
 * @returns validated read facts plus the credential reference.
 * @throws {Error} when the credential reference, endpoint, or deadline is unusable.
 */
export function resolveBalanceOptions(config: Config): ResolvedBalanceOptions {
  const apiKeyEnv = config.apiKeyEnv ?? DEFAULT_API_KEY_ENV
  if (!CREDENTIAL_REF.test(apiKeyEnv)) {
    throw new Error(
      `ui-deepseek-balance: apiKeyEnv "${apiKeyEnv}" is not an environment-variable name`,
    )
  }
  const baseURL = config.baseURL ?? PUBLIC_BASE_URL
  let parsed: URL
  try {
    parsed = new URL(baseURL)
  } catch {
    // Swallows the parse failure: an endpoint that is not a URL is exactly the refusal.
    throw new Error('ui-deepseek-balance: baseURL must be an absolute HTTP(S) root')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username !== '' || parsed.password !== '' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error('ui-deepseek-balance: baseURL must be an HTTP(S) root without credentials, query, or fragment')
  }
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(
      `ui-deepseek-balance: timeoutMs must be a positive integer no greater than ${String(MAX_TIMEOUT_MS)}`,
    )
  }
  return { apiKeyEnv: brandString<CredentialRef>(apiKeyEnv), baseURL, timeoutMs }
}
