/**
 * The configured set is the browser half's only source, so the field checks,
 * the form check, and the identity check live here rather than in render code,
 * which has no later point at which to resolve any of them.
 */

import { describe, expect, it } from 'vitest'
import type { QuickStartActionEntry } from '../src/config.ts'
import { Config, DEFAULT_LAUNCH_READY_MS, resolveActions } from '../src/config.ts'

const PROMPTS: QuickStartActionEntry[] = [
  { id: 'develop', label: '开发', prompt: 'start development' },
  { id: 'design', label: '设计', prompt: 'design the UI' },
]

const APP: QuickStartActionEntry = {
  id: 'workbench',
  label: '工作台',
  command: 'D:\\AiWAR3WorkFlow\\start.bat',
  url: 'http://localhost:5173/',
}

describe('quick-start configuration', () => {
  it('defaults to no actions and the documented launch deadline', () => {
    expect(Config({})).toEqual({ actions: [], launchReadyMs: DEFAULT_LAUNCH_READY_MS })
  })

  it('accepts a configured set unchanged', () => {
    expect(Config({ actions: PROMPTS })).toEqual({ actions: PROMPTS, launchReadyMs: DEFAULT_LAUNCH_READY_MS })
    expect(resolveActions(PROMPTS)).toEqual([
      { kind: 'prompt', id: 'develop', label: '开发', prompt: 'start development' },
      { kind: 'prompt', id: 'design', label: '设计', prompt: 'design the UI' },
    ])
  })

  it('tags an application entry with the form it states', () => {
    expect(resolveActions([APP])).toEqual([{
      kind: 'app',
      id: 'workbench',
      label: '工作台',
      command: APP.command,
      url: APP.url,
    }])
  })

  it('keeps a configured launch deadline', () => {
    expect(Config({ actions: [APP], launchReadyMs: 5_000 }).launchReadyMs).toBe(5_000)
  })

  it.each([
    ['id', { id: '', label: '开发', prompt: 'go' }, 'ui-quick-start: action "" has an empty id'],
    ['label', { id: 'develop', label: '', prompt: 'go' }, 'ui-quick-start: action "develop" has an empty label'],
    ['prompt', { id: 'develop', label: '开发', prompt: '' }, 'ui-quick-start: action "develop" has an empty prompt'],
    ['command', { ...APP, command: '' }, 'ui-quick-start: action "workbench" has an empty command'],
    ['url', { ...APP, url: '' }, 'ui-quick-start: action "workbench" has an empty url'],
  ])('refuses an empty %s', (_field, entry, message) => {
    expect(() => resolveActions([entry])).toThrow(message)
  })

  it.each([
    [
      'a url without a command',
      { id: 'workbench', label: '工作台', url: 'http://localhost:5173/' },
      'ui-quick-start: action "workbench" declares a url without a command',
    ],
    [
      'a command without a url',
      { id: 'workbench', label: '工作台', command: 'start.bat' },
      'ui-quick-start: action "workbench" declares a command without a url',
    ],
    [
      'both forms at once',
      { ...APP, prompt: 'go' },
      'ui-quick-start: action "workbench" declares both a prompt and a command',
    ],
    [
      'neither form',
      { id: 'workbench', label: '工作台' },
      'ui-quick-start: action "workbench" declares neither a prompt nor a command',
    ],
  ])('refuses an entry stating %s', (_label, entry, message) => {
    expect(() => resolveActions([entry])).toThrow(message)
  })

  it.each([
    ['a bare authority', 'localhost:5173'],
    ['a value that is not a URL at all', 'not a page'],
    ['a non-http scheme', 'file:///D:/AiWAR3WorkFlow/index.html'],
  ])('refuses %s as a page', (_label, url) => {
    expect(() => resolveActions([{ ...APP, url }]))
      .toThrow('ui-quick-start: action "workbench" declares a url that is not an absolute http(s) URL')
  })

  it('refuses two actions a reader could not tell apart', () => {
    expect(() => resolveActions([PROMPTS[0]!, { ...PROMPTS[0]!, label: 'Another' }]))
      .toThrow('ui-quick-start: duplicate action id "develop"')
  })
})
