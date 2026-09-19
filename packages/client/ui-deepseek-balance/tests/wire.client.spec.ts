/**
 * Decoding one answer from the balance route: the amounts it carries, each
 * failure discriminant, and every body that is neither.
 */

import { describe, expect, it } from 'vitest'
import { readBalancePayload } from '../src/wire.ts'

const AMOUNT = { currency: 'CNY', total: '110.00', granted: '0.00', toppedUp: '110.00' }

describe('readBalancePayload', () => {
  it('decodes a reading with its amounts', () => {
    expect(readBalancePayload({ ok: true, available: true, balances: [AMOUNT] }))
      .toEqual({ ok: true, available: true, balances: [AMOUNT] })
  })

  it('decodes a reading with no amounts', () => {
    expect(readBalancePayload({ ok: true, available: false, balances: [] }))
      .toEqual({ ok: true, available: false, balances: [] })
  })

  it.each(['not-configured', 'unauthorized', 'timeout', 'unreachable', 'invalid-response'])(
    'decodes a %s failure',
    (code) => {
      expect(readBalancePayload({ ok: false, code, message: 'detail' }))
        .toEqual({ ok: false, code, message: 'detail' })
    },
  )

  it('decodes a failure that carried no detail', () => {
    expect(readBalancePayload({ ok: false, code: 'timeout', message: 7 }))
      .toEqual({ ok: false, code: 'timeout', message: '' })
  })

  it.each([
    ['a failure with an unknown code', { ok: false, code: 'melted', message: 'detail' }],
    ['a failure without a code', { ok: false, message: 'detail' }],
    ['a reading missing the availability flag', { ok: true, balances: [] }],
    ['a reading whose balance list is not an array', { ok: true, available: true, balances: 'CNY' }],
    ['a reading whose every entry is incomplete', { ok: true, available: true, balances: [{ currency: 'CNY' }] }],
    ['a body that is not an object', 'reading'],
    ['a body with neither discriminant', { available: true, balances: [] }],
  ])('refuses %s', (_label, body) => {
    expect(readBalancePayload(body)).toBeUndefined()
  })

  it('refuses a null body', () => {
    expect(readBalancePayload(null)).toBeUndefined()
  })

  it.each([
    ['a non-object entry', 'CNY'],
    ['an entry without a currency', { total: '1.00', granted: '0.00', toppedUp: '0.00' }],
    ['an entry with an empty currency', { ...AMOUNT, currency: '' }],
    ['an entry with a non-string amount', { ...AMOUNT, total: 1 }],
  ])('drops %s beside a readable one', (_label, entry) => {
    expect(readBalancePayload({ ok: true, available: true, balances: [entry, AMOUNT] }))
      .toEqual({ ok: true, available: true, balances: [AMOUNT] })
  })

  it('refuses a null entry beside a readable one', () => {
    expect(readBalancePayload({ ok: true, available: true, balances: [null, AMOUNT] }))
      .toEqual({ ok: true, available: true, balances: [AMOUNT] })
  })
})
