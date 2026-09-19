/**
 * Configuration: the defaults and every value a composition could hand
 * `apply` directly.
 */

import { describe, expect, it } from 'vitest'
import { PUBLIC_BASE_URL, resolveBalanceOptions } from '../src/config.ts'

describe('balance configuration', () => {
  it('defaults to the public endpoint and the standard credential reference', () => {
    expect(resolveBalanceOptions({})).toEqual({
      apiKeyEnv: 'DEEPSEEK_API_KEY',
      baseURL: PUBLIC_BASE_URL,
      timeoutMs: 10_000,
    })
  })

  it('carries a configured credential reference, endpoint, and deadline', () => {
    expect(resolveBalanceOptions({
      apiKeyEnv: 'TEAM_DEEPSEEK_KEY',
      baseURL: 'https://gateway.internal',
      timeoutMs: 2_500,
    })).toMatchObject({
      apiKeyEnv: 'TEAM_DEEPSEEK_KEY',
      baseURL: 'https://gateway.internal',
      timeoutMs: 2_500,
    })
  })

  it.each([
    ['a space', 'MY KEY'],
    ['a leading digit', '1KEY'],
    ['a hyphen', 'MY-KEY'],
    ['an empty name', ''],
  ])('refuses a credential reference containing %s', (_label, apiKeyEnv) => {
    expect(() => resolveBalanceOptions({ apiKeyEnv }))
      .toThrow(/apiKeyEnv .* is not an environment-variable name/)
  })

  it.each([
    ['a relative endpoint', 'api.deepseek.com'],
    ['a non-HTTP scheme', 'ftp://api.deepseek.com'],
    ['embedded credentials', 'https://user:secret@api.deepseek.com'],
    ['a query', 'https://api.deepseek.com?key=1'],
    ['a fragment', 'https://api.deepseek.com#balance'],
  ])('refuses %s', (_label, baseURL) => {
    expect(() => resolveBalanceOptions({ baseURL }))
      .toThrow(/baseURL must be an (?:absolute )?HTTP\(S\) root/)
  })

  it.each([
    ['zero', 0],
    ['a negative deadline', -1],
    ['a fractional deadline', 1.5],
    ['a deadline past the timer range', 2_147_483_648],
  ])('refuses %s', (_label, timeoutMs) => {
    expect(() => resolveBalanceOptions({ timeoutMs })).toThrow(/timeoutMs must be a positive integer/)
  })
})
