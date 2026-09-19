/**
 * The launcher's two arms: a blank session that is already current takes the
 * instruction directly, and a launch that has to open one stages it for the
 * session that arrives. The stage is spent once, on the first current session
 * that differs from the one the click left — so a workspace connect's earlier
 * list changes cannot consume it, and starter text never lands in work it was
 * not aimed at.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import { QuickStartLauncher } from '../src/client/launcher.ts'

type SessionId = SessionSummary['id']

function summary(id: string, blank: boolean): SessionSummary {
  return {
    id: id as SessionId,
    displayTitle: id,
    running: false,
    blank,
    updatedAt: 0,
  }
}

function listState(current: SessionSummary | undefined, rows: SessionSummary[] = []): SessionListState {
  const byId: Record<SessionId, SessionSummary> = {}
  for (const row of current === undefined ? rows : [...rows, current]) byId[row.id] = row
  return {
    ids: Object.keys(byId) as SessionId[],
    byId,
    current: current?.id,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  }
}

function bench(options: { current?: SessionSummary; scoped?: boolean } = {}) {
  const list = createSnapshotStore<SessionListState>(listState(options.current))
  const drafts: { sessionId: string; text: string }[] = []
  const startSession = vi.fn()
  const scoped = options.scoped ?? true
  const ctx = {
    sessions: {
      list,
      scope: (id: SessionId) => scoped ? { id } as never : undefined,
    },
    conversation: {
      input: {
        for: (actx: { id: SessionId }) => ({
          setDraft: (text: string) => { drafts.push({ sessionId: actx.id, text }) },
        }),
      },
    },
    uiWorkspace: { startSession },
  } as unknown as ClientContext
  return { launcher: new QuickStartLauncher(ctx), list, drafts, startSession }
}

describe('QuickStartLauncher', () => {
  it('fills the blank session that is already current instead of opening another', () => {
    const b = bench({ current: summary('session-a', true) })
    b.launcher.launch('start the work')
    expect(b.drafts).toEqual([{ sessionId: 'session-a', text: 'start the work' }])
    expect(b.startSession).not.toHaveBeenCalled()
  })

  it('stages the instruction and starts a session when the current one has history', () => {
    const b = bench({ current: summary('session-a', false) })
    b.launcher.launch('start the work')
    expect(b.drafts).toEqual([])
    expect(b.startSession).toHaveBeenCalledOnce()
    // Still on the session the click left: the flow has produced nothing yet.
    b.launcher.apply()
    expect(b.drafts).toEqual([])
    b.list.set(listState(summary('session-b', true), [summary('session-a', false)]))
    b.launcher.apply()
    expect(b.drafts).toEqual([{ sessionId: 'session-b', text: 'start the work' }])
  })

  it('drops the stage on a different session carrying history rather than editing its draft', () => {
    const b = bench({ current: summary('session-a', false) })
    b.launcher.launch('start the work')
    b.list.set(listState(summary('session-c', false), [summary('session-a', false)]))
    b.launcher.apply()
    b.list.set(listState(summary('session-b', true), [summary('session-c', false)]))
    b.launcher.apply()
    expect(b.drafts).toEqual([])
  })

  it('drops the stage when a click that left a session ends with none current', () => {
    const b = bench({ current: summary('session-a', false) })
    b.launcher.launch('start the work')
    b.list.set(listState(undefined, [summary('session-a', false)]))
    b.launcher.apply()
    b.list.set(listState(summary('session-b', true), [summary('session-a', false)]))
    b.launcher.apply()
    expect(b.drafts).toEqual([])
  })

  it('keeps the stage while no session is current and none was at the click', () => {
    const b = bench()
    b.launcher.launch('start the work')
    b.launcher.apply()
    expect(b.drafts).toEqual([])
    b.list.set(listState(summary('session-a', true)))
    b.launcher.apply()
    expect(b.drafts).toEqual([{ sessionId: 'session-a', text: 'start the work' }])
  })

  it('consumes one stage on one session', () => {
    const b = bench()
    b.launcher.launch('start the work')
    b.list.set(listState(summary('session-a', true)))
    b.launcher.apply()
    b.launcher.apply()
    expect(b.drafts).toHaveLength(1)
  })

  it('lets a later click supersede a launch still waiting for its session', () => {
    const b = bench()
    b.launcher.launch('start the work')
    b.list.set(listState(summary('session-a', true)))
    b.launcher.launch('do something else')
    b.launcher.apply()
    expect(b.drafts).toEqual([{ sessionId: 'session-a', text: 'do something else' }])
  })

  it('writes nothing when the session exposes no scope', () => {
    const b = bench({ current: summary('session-a', true), scoped: false })
    b.launcher.launch('start the work')
    expect(b.drafts).toEqual([])
    expect(b.startSession).not.toHaveBeenCalled()
  })

  it('is a no-op without a stage', () => {
    const b = bench({ current: summary('session-a', true) })
    b.launcher.apply()
    expect(b.drafts).toEqual([])
  })
})
