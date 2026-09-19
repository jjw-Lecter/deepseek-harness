// @vitest-environment jsdom
/**
 * The seat's presentation: one labelled button per configured action of either
 * form, the rail's single-character form, and the press that reaches the
 * launcher.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QuickStartButtons } from '../src/client/QuickStartButtons.tsx'
import type { QuickStartButtonsProps } from '../src/client/QuickStartButtons.tsx'
import type { QuickStartAction } from '../src/actions.ts'

const ACTIONS: QuickStartAction[] = [
  { kind: 'prompt', id: 'develop', label: '开发', prompt: 'start development' },
  { kind: 'prompt', id: 'design', label: '设计', prompt: 'design the UI' },
  { kind: 'app', id: 'workbench', label: '工作台', command: 'start.bat', url: 'http://localhost:5173/' },
]

afterEach(cleanup)

function mount(overrides: Partial<QuickStartButtonsProps> = {}) {
  const launch = vi.fn()
  const props = {
    wide: true,
    actions: ACTIONS,
    launch,
    ...overrides,
  } as QuickStartButtonsProps
  const view = render(<QuickStartButtons {...props} />)
  return { launch, view }
}

describe('QuickStartButtons', () => {
  it('renders one labelled button per action and launches the pressed one', () => {
    const b = mount()
    const buttons = screen.getAllByRole('button')
    expect(buttons.map(button => button.textContent)).toEqual(['开发', '设计', '工作台'])
    fireEvent.click(screen.getByRole('button', { name: '工作台' }))
    expect(b.launch).toHaveBeenCalledExactlyOnceWith('workbench')
  })

  it('shows one character per action on the rail, labelled for assistive use', () => {
    mount({ wide: false })
    const buttons = screen.getAllByRole('button')
    // Accessible names stay the full labels even though the glyph is one character.
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['开发', '设计', '工作台'])
    expect(buttons.map(button => button.textContent)).toEqual(['开', '设', '工'])
  })

  it('shows no glyph for an action whose label carries no character', () => {
    mount({ wide: false, actions: [{ kind: 'prompt', id: 'blank', label: '', prompt: 'go' }] })
    expect(screen.getByRole('button').textContent).toBe('')
  })

  it('renders nothing when no action is configured', () => {
    const b = mount({ actions: [] })
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(b.view.container.firstChild).toBeNull()
  })
})
