/**
 * One browser-side reader of the host's balance route: it decides when the
 * badge asks, keeps the last answer, and reports every failure in the badge's
 * own terms.
 *
 * The cadence lives here rather than in the page: the host half cannot
 * configure the browser half (`dsh.client` rows carry no `config` to the boot
 * manifest), and this interval is a product cadence for a whole-column badge
 * rather than a deployment choice.
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { DEEPSEEK_BALANCE_PATH, readBalancePayload } from '../wire.ts'
import type {
  DeepSeekBalanceFailure, DeepSeekBalanceReading, DeepSeekBalanceState,
} from './contract.ts'

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** How often the badge re-reads the balance while a page is open. */
export const BALANCE_REFRESH_INTERVAL_MS = 60_000

const INITIAL: DeepSeekBalanceState = { phase: 'loading' }

/** Resolve the browser's Host base with the connection carrier's null-origin fallback. */
function hostBase(): string {
  const origin = (globalThis as { location?: { origin?: string } }).location?.origin
  return origin !== undefined && origin !== 'null' ? origin : 'http://dsh.internal'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Owns the refresh cadence and publishes the badge's state. */
export class DeepSeekBalanceController {
  /** uSES-safe state source bound to the cell's `useBalance` hook. */
  readonly store: SnapshotStore<DeepSeekBalanceState> = createSnapshotStore(INITIAL)

  private timer: ReturnType<typeof setInterval> | undefined
  /** The read in flight; a refresh during one joins it instead of asking twice. */
  private active: { readonly abort: AbortController; readonly done: Promise<void> } | undefined
  private disposed = false

  /**
   * @param fetcher - HTTP carrier for the host route.
   * @param intervalMs - cadence between reads while a page stays open.
   * @param now - clock used to stamp a reading, injectable for tests.
   */
  constructor(
    private readonly fetcher: Fetch = (input, init) => fetch(input, init),
    private readonly intervalMs: number = BALANCE_REFRESH_INTERVAL_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Read once now and then on the cadence.
   * @returns after the first read started and the interval is armed.
   */
  start(): void {
    if (this.disposed || this.timer !== undefined) return
    void this.refresh()
    this.timer = setInterval(() => { void this.refresh() }, this.intervalMs)
  }

  /**
   * Read the balance now; two calls during one read share that read.
   * @returns after the read settled, or immediately when this controller is disposed.
   */
  refresh(): Promise<void> {
    if (this.active !== undefined) return this.active.done
    if (this.disposed) return Promise.resolve()
    const abort = new AbortController()
    const done = this.run(abort.signal).finally(() => { this.active = undefined })
    this.active = { abort, done }
    return done
  }

  /**
   * Stop the cadence, abort the read in flight, and reach quiescence.
   * @returns after the abandoned read settled.
   */
  async dispose(): Promise<void> {
    this.disposed = true
    if (this.timer !== undefined) clearInterval(this.timer)
    this.timer = undefined
    const active = this.active
    if (active === undefined) return
    active.abort.abort()
    await active.done
  }

  private async run(signal: AbortSignal): Promise<void> {
    try {
      const response = await this.fetcher(new URL(DEEPSEEK_BALANCE_PATH, hostBase()), { signal })
      const payload = readBalancePayload(await response.json().catch(() => undefined))
      if (payload === undefined) {
        this.publishFailure({
          code: 'invalid-response',
          message: `the host answered HTTP ${String(response.status)} with no readable balance`,
        })
        return
      }
      if (payload.ok) {
        this.publishReady({ available: payload.available, balances: payload.balances, fetchedAt: this.now() })
        return
      }
      this.publishFailure({ code: payload.code, message: payload.message })
    } catch (error) {
      // A disposed controller aborts its own read; that abort is not an answer.
      if (signal.aborted) return
      // A carrier failure never reached the host, so no code came back with it.
      this.publishFailure({ code: 'unreachable', message: messageOf(error) })
    }
  }

  private publishReady(reading: DeepSeekBalanceReading): void {
    this.store.set({ phase: 'ready', reading })
  }

  private publishFailure(failure: DeepSeekBalanceFailure): void {
    const previous = this.store.getSnapshot().reading
    this.store.set({ phase: 'error', failure, ...previous === undefined ? {} : { reading: previous } })
  }
}
