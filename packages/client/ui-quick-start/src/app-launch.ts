/**
 * Starting one configured application on this host, and waiting for its page.
 *
 * The application is launched detached with no stdio pipe, so it outlives dsh;
 * on Windows it is handed to `start`, which gives a configured script the
 * console window a double-click would. Readiness is the page answering, not the
 * launcher exiting — a script that backgrounds its servers returns at once — so
 * a press waits for the URL and reports the deadline when it stops waiting.
 */
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { QuickStartAppAction } from './actions.ts'

/** Interval between page probes while a started application comes up. */
const PROBE_INTERVAL_MS = 500

/** Per-probe deadline; a page that hangs is not ready, and the next probe asks again. */
const PROBE_TIMEOUT_MS = 2_000

/** Why a launch ended without the page answering. */
export type AppLaunchFailureReason = 'missing-command' | 'spawn-failed' | 'timeout'

/** How one launch attempt ended. */
export type AppLaunchOutcome =
  | { readonly status: 'ready' }
  | {
    readonly status: 'failed'
    readonly reason: AppLaunchFailureReason
    /** Host detail for the panel; the browser localizes the reason itself. */
    readonly message: string
  }

/** Injectable process seam for deterministic tests. */
export interface AppLaunchInternals {
  /** Process starter; the real one is `node:child_process`'s spawn. */
  spawn?: typeof spawn
}

/** The process seam after its one explicit defaulting step. */
export interface ResolvedAppLaunchInternals {
  spawn: typeof spawn
}

/**
 * Resolve the injectable process seam against the running host.
 * @param internals - injectable facts.
 * @returns the completed facts.
 */
export function resolveLaunchInternals(internals: AppLaunchInternals = {}): ResolvedAppLaunchInternals {
  return { spawn: internals.spawn ?? spawn }
}

/**
 * The argv that runs one configured command detached on a platform.
 *
 * Windows has no execute bit and a `.bat` is not an image, so the command goes
 * through `start`, which gives it its own console window and returns at once;
 * `sh` runs the script elsewhere, taking the path as one argv entry so no shell
 * re-parses it.
 * @param command - the configured program or script.
 * @param platform - the host platform.
 * @returns the program to spawn and its arguments.
 */
export function detachedArgv(
  command: string,
  platform: NodeJS.Platform,
): { readonly command: string; readonly args: readonly string[] } {
  return platform === 'win32'
    ? { command: 'cmd.exe', args: ['/c', 'start', '', command] }
    : { command: 'sh', args: [command] }
}

/**
 * Whether one path names a file this host holds.
 * @param path - candidate path.
 * @returns true when the path exists and is a regular file.
 */
async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    // Swallows ENOENT/EACCES: an unreadable path is not a launcher.
    return false
  }
}

/**
 * Whether the application's page answers.
 * @param url - the configured page.
 * @returns true when the host answered, whatever the status.
 */
async function probePage(url: string): Promise<boolean> {
  try {
    await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    return true
  } catch {
    // Swallows connection and timeout failures alike: a page that does not
    // answer is not ready, and the next probe asks again.
    return false
  }
}

/**
 * Run one configured command detached, resolving once it started.
 * @param command - the configured program or script.
 * @param starter - process starter.
 * @returns after the process started; rejects when it did not.
 */
function startDetached(command: string, starter: typeof spawn): Promise<void> {
  const argv = detachedArgv(command, process.platform)
  return new Promise((resolve, reject) => {
    const child = starter(argv.command, [...argv.args], {
      detached: true,
      // No pipe, no window of our own: on Windows the launcher gives the
      // configured script its console, and nothing here waits on its output.
      stdio: 'ignore',
      windowsHide: false,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve()
    })
  })
}

/**
 * Start one configured application unless its page already answers, then wait
 * for that page.
 *
 * A page that already answers means the application is running: nothing is
 * spawned, which keeps a press idempotent against servers someone else started.
 * @param action - the configured application action.
 * @param readyMs - deadline for the page to answer, in milliseconds.
 * @param signal - caller lifetime; an abort ends the wait.
 * @param internals - process seam for deterministic tests.
 * @returns the outcome; a failure names why the waiting stopped.
 */
export async function launchApp(
  action: QuickStartAppAction,
  readyMs: number,
  signal: AbortSignal,
  internals: AppLaunchInternals = {},
): Promise<AppLaunchOutcome> {
  const facts = resolveLaunchInternals(internals)
  if (await probePage(action.url)) return { status: 'ready' }
  if (isAbsolute(action.command) && !await isFile(action.command)) {
    return {
      status: 'failed',
      reason: 'missing-command',
      message: `command does not name a file: ${action.command}`,
    }
  }
  try {
    await startDetached(action.command, facts.spawn)
  } catch (error) {
    return {
      status: 'failed',
      reason: 'spawn-failed',
      message: error instanceof Error ? error.message : String(error),
    }
  }
  const until = Date.now() + readyMs
  for (;;) {
    if (await probePage(action.url)) return { status: 'ready' }
    if (signal.aborted || Date.now() >= until) {
      return {
        status: 'failed',
        reason: 'timeout',
        message: `no answer from ${action.url} within ${String(readyMs)} ms`,
      }
    }
    await delay(PROBE_INTERVAL_MS)
  }
}
