/**
 * Reading the injected global: the host half's output crosses the document
 * boundary, so an absent global, a value that is not an action list, and one
 * unusable entry each degrade without taking the usable buttons with them.
 */

import { describe, expect, it } from 'vitest'
import { readActions, type QuickStartAction } from '../src/actions.ts'

const ACTION: QuickStartAction = { kind: 'prompt', id: 'develop', label: '开发', prompt: 'start development' }
const APP: QuickStartAction = {
  kind: 'app',
  id: 'workbench',
  label: '工作台',
  command: 'D:\\AiWAR3WorkFlow\\start.bat',
  url: 'http://localhost:5173/',
}

describe('readActions', () => {
  it('reads an injected action list of both forms in order', () => {
    const second: QuickStartAction = { kind: 'prompt', id: 'design', label: '设计', prompt: 'design the UI' }
    expect(readActions([ACTION, second, APP])).toEqual([ACTION, second, APP])
  })

  it.each([
    ['an absent global', undefined],
    ['a non-array value', { actions: [ACTION] }],
    ['a scalar', 'develop'],
  ])('reads nothing from %s', (_label, value) => {
    expect(readActions(value)).toEqual([])
  })

  it.each([
    ['a non-object entry', 'develop'],
    ['a null entry', null],
    ['a blank id', { kind: 'prompt', id: '', label: '开发', prompt: 'go' }],
    ['a missing kind', { id: 'develop', label: '开发', prompt: 'go' }],
    ['an unknown kind', { kind: 'other', id: 'develop', label: '开发', prompt: 'go' }],
    ['a missing label', { kind: 'prompt', id: 'develop', prompt: 'go' }],
    ['a non-string label', { kind: 'prompt', id: 'develop', label: 7, prompt: 'go' }],
    ['a blank prompt', { kind: 'prompt', id: 'develop', label: '开发', prompt: '' }],
    ['a blank command', { kind: 'app', id: 'workbench', label: '工作台', command: '', url: 'http://localhost:5173/' }],
    ['a missing url', { kind: 'app', id: 'workbench', label: '工作台', command: 'start.bat' }],
  ])('drops %s without failing its neighbours', (_label, entry) => {
    expect(readActions([entry, ACTION])).toEqual([ACTION])
  })
})
