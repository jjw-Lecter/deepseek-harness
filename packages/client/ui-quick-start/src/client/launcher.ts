/**
 * Quick-start launcher: turns one configured action into a session that
 * carries its instruction.
 *
 * The instruction cannot be written where the click happens. Opening the
 * Workspace creates or reuses a blank session asynchronously, so a click that
 * has no blank session to land on stages the instruction and hands the
 * receiving session over to the list applier — the same shape ui-agent-preset
 * uses to carry a preset choice to the session it composes.
 *
 * The stage names the session the click left behind, so the many list changes
 * a workspace connect publishes before its session arrives cannot consume it.
 * It is spent on the first current session that differs: a blank one takes the
 * instruction, and one that already carries history ends the launch, because
 * starter text written into work in progress would edit a conversation nobody
 * aimed at.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the Session Controller service merge (ctx.sessions).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: pulls the Conversation service merge (ctx.conversation).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the Workspace UI navigation service merge (ctx.uiWorkspace).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'

/** An instruction waiting for the session a launch opens. */
interface StagedLaunch {
  /** The action's opening instruction. */
  readonly prompt: string
  /** The session current when the click was made; undefined when none was. */
  readonly from: SessionSummary['id'] | undefined
}

/** Carries a launch instruction into the session the launch opens. */
export class QuickStartLauncher {
  /** The launch waiting for a session; cleared once it lands or is spent. */
  private staged: StagedLaunch | undefined

  /** @param ctx - the client root context the launch reads services from. */
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Start work from one configured instruction.
   *
   * A blank session already current takes the instruction directly — the
   * sidebar's New Session would only reopen that same session. Otherwise the
   * instruction is staged for the session the flow produces.
   * @param prompt - the action's opening instruction.
   */
  launch(prompt: string): void {
    const session = this.currentSession()
    if (session !== undefined && session.blank) {
      // A new click supersedes a launch still waiting for its session.
      this.staged = undefined
      this.fill(session.id, prompt)
      return
    }
    this.staged = { prompt, from: session?.id }
    this.ctx.uiWorkspace.startSession()
  }

  /**
   * Hand a staged instruction to the session that just became current.
   * Called on every session-list change; a no-op without a stage.
   */
  apply(): void {
    const staged = this.staged
    if (staged === undefined) return
    const session = this.currentSession()
    if (session === undefined) {
      // This click left a session and the list now reports none: the flow
      // opened nothing, so there is nothing left for the instruction to join.
      if (staged.from !== undefined) this.staged = undefined
      return
    }
    // The session the click left is not an answer to it.
    if (session.id === staged.from) return
    this.staged = undefined
    if (!session.blank) return
    this.fill(session.id, staged.prompt)
  }

  private currentSession(): SessionSummary | undefined {
    const list = this.ctx.sessions.list.getSnapshot()
    return list.current === undefined ? undefined : list.byId[list.current]
  }

  private fill(sessionId: SessionSummary['id'], prompt: string): void {
    const actx = this.ctx.sessions.scope(sessionId)
    if (actx === undefined) return
    this.ctx.conversation.input.for(actx).setDraft(prompt)
  }
}
