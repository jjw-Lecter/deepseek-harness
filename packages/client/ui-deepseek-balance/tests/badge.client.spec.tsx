// @vitest-environment jsdom
/**
 * The cell's presentation: the amount it shows for each currency, the state
 * marker, the placeholder before any reading, the press that refreshes, and
 * the tooltip that explains the figure and every failure.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { DeepSeekBalanceState } from '../src/client/contract.ts'
import { DeepSeekBalanceBadge, type DeepSeekBalanceBadgeProps } from '../src/client/DeepSeekBalanceBadge.tsx'
import { zh } from '../src/client/locales.ts'

const AMOUNT = { currency: 'CNY', total: '110.00', granted: '0.00', toppedUp: '110.00' }

/** A selector hook bound to one fixed state. */
function hookFor(state: DeepSeekBalanceState) {
  return function useBalance<S>(selector: (snapshot: DeepSeekBalanceState) => S): S {
    return selector(state)
  }
}

/**
 * Render the cell over one state.
 * @param state - the published balance state.
 * @returns the recorded refresh calls and the rendered container.
 */
function mount(state: DeepSeekBalanceState) {
  const refresh = vi.fn()
  const props = {
    useBalance: hookFor(state),
    refresh,
    t: makeTranslate(zh),
  } as unknown as DeepSeekBalanceBadgeProps
  const view = render(<DeepSeekBalanceBadge {...props} />)
  return { refresh, view }
}

/** The state marker the cell currently shows, if any. */
function dotState(container: HTMLElement): string | null {
  return container.querySelector('[data-state]')?.getAttribute('data-state') ?? null
}

afterEach(cleanup)

describe('DeepSeekBalanceBadge', () => {
  it('marks an amount by its currency and refreshes on press', () => {
    const b = mount({ phase: 'ready', reading: { available: true, balances: [AMOUNT], fetchedAt: 0 } })
    const button = screen.getByRole('button', { name: 'DeepSeek 余额 ¥110.00' })
    expect(button.textContent).toBe('¥110.00')
    expect(dotState(b.view.container)).toBeNull()
    fireEvent.click(button)
    expect(b.refresh).toHaveBeenCalledOnce()
  })

  it.each([
    ['USD', '$12.50'],
    ['EUR', 'EUR 12.50'],
  ])('spells %s amounts with their own mark', (currency, expected) => {
    mount({
      phase: 'ready',
      reading: { available: true, balances: [{ ...AMOUNT, currency, total: '12.50' }], fetchedAt: 0 },
    })
    expect(screen.getByRole('button').textContent).toBe(expected)
  })

  it('shows a placeholder before the first reading arrives', () => {
    const b = mount({ phase: 'loading' })
    expect(screen.getByRole('button').textContent).toBe('—')
    expect(dotState(b.view.container)).toBeNull()
  })

  it('marks a balance that no longer covers API calls', () => {
    const b = mount({ phase: 'ready', reading: { available: false, balances: [AMOUNT], fetchedAt: 0 } })
    expect(screen.getByRole('button').textContent).toBe('¥110.00')
    expect(dotState(b.view.container)).toBe('warning')
  })

  it('marks a failed read that has no amount to keep', () => {
    const b = mount({ phase: 'error', failure: { code: 'not-configured', message: 'no credential' } })
    expect(screen.getByRole('button').textContent).toBe('—')
    expect(dotState(b.view.container)).toBe('error')
  })

  it('keeps the last amount while a refresh fails', () => {
    const b = mount({
      phase: 'error',
      failure: { code: 'unreachable', message: 'Failed to fetch' },
      reading: { available: true, balances: [AMOUNT], fetchedAt: 0 },
    })
    expect(screen.getByRole('button').textContent).toBe('¥110.00')
    expect(dotState(b.view.container)).toBe('error')
  })

  it('explains the figure, its amounts, its freshness, and the press', () => {
    const { view } = mount({ phase: 'ready', reading: { available: true, balances: [AMOUNT], fetchedAt: 0 } })
    fireEvent.focus(screen.getByRole('button'))
    const tooltip = view.container.querySelector('[role="tooltip"]')?.textContent ?? ''
    expect(tooltip).toContain('总余额 ¥110.00，其中充值 ¥110.00、赠送 ¥0.00')
    expect(tooltip).toContain('余额可用')
    expect(tooltip).toContain('更新于 ')
    expect(tooltip).toContain('点击刷新')
  })

  it('states a low balance and no amount breakdown when the provider reported none', () => {
    const { view } = mount({ phase: 'ready', reading: { available: false, balances: [], fetchedAt: 0 } })
    fireEvent.focus(screen.getByRole('button'))
    const tooltip = view.container.querySelector('[role="tooltip"]')?.textContent ?? ''
    expect(tooltip).toContain('余额不足，继续调用 API 会失败')
    expect(tooltip).not.toContain('总余额')
  })

  it('states that the first read is still running', () => {
    const { view } = mount({ phase: 'loading' })
    fireEvent.focus(screen.getByRole('button'))
    expect(view.container.querySelector('[role="tooltip"]')?.textContent)
      .toContain('正在读取余额… · 点击刷新')
  })

  it('localizes the failure and quotes the host detail verbatim', () => {
    const { view } = mount({
      phase: 'error',
      failure: { code: 'timeout', message: 'no answer within 10000 ms' },
    })
    fireEvent.focus(screen.getByRole('button'))
    expect(view.container.querySelector('[role="tooltip"]')?.textContent)
      .toContain('读取余额超时 — no answer within 10000 ms')
  })

  it('states a failure the host explained no further', () => {
    const { view } = mount({ phase: 'error', failure: { code: 'unauthorized', message: '' } })
    fireEvent.focus(screen.getByRole('button'))
    expect(view.container.querySelector('[role="tooltip"]')?.textContent)
      .toContain('API Key 被服务端拒绝 · 点击刷新')
  })
})
