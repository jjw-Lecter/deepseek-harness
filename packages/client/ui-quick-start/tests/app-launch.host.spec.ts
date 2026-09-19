/**
 * Starting an application: the page decides readiness, the command is checked
 * only when it names a path, and every way of not answering ends as one of
 * three stated reasons. The process seam is stubbed, so no spec starts a real
 * application; the page each spec probes is its own server.
 */

import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QuickStartAppAction } from '../src/actions.ts'
import { detachedArgv, launchApp, resolveLaunchInternals } from '../src/app-launch.ts'

/** A port nothing listens on: a probe there fails at once on loopback. */
const CLOSED_PAGE = 'http://127.0.0.1:1/'

function action(overrides: Partial<QuickStartAppAction> = {}): QuickStartAppAction {
  return { kind: 'app', id: 'workbench', label: '工作台', command: 'start.bat', url: CLOSED_PAGE, ...overrides }
}

const servers: Server[] = []
const directories: string[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve) => { server.close(() => { resolve() }) })))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

/**
 * Serve one page, optionally refusing its first request.
 * @param refuseFirst - whether the first request is dropped instead of answered.
 * @returns the page's URL.
 */
async function page(refuseFirst = false): Promise<string> {
  let remaining = refuseFirst ? 1 : 0
  const server = createServer((request, response) => {
    if (remaining > 0) {
      remaining -= 1
      request.socket.destroy()
      return
    }
    response.end('ok')
  })
  servers.push(server)
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const { port } = server.address() as AddressInfo
  return `http://127.0.0.1:${String(port)}/`
}

/** A child stand-in reporting one lifecycle event on the next microtask. */
function childStub(event: 'spawn' | 'error', error?: unknown) {
  const emitter = new EventEmitter()
  queueMicrotask(() => { emitter.emit(event, error) })
  return {
    once: (name: string, listener: (value?: unknown) => void) => { emitter.once(name, listener) },
    unref: vi.fn(),
  }
}

/** A process starter reporting `event` and recording its calls. */
function starter(event: 'spawn' | 'error', failure: unknown = new Error('cannot start')) {
  return vi.fn(() => childStub(event, failure)) as unknown as typeof spawn
}

/** A live caller lifetime. */
const live = (): AbortSignal => new AbortController().signal

describe('detachedArgv', () => {
  it('hands a Windows script to start, which gives it its own console', () => {
    expect(detachedArgv('D:\\AiWAR3WorkFlow\\start.bat', 'win32'))
      .toEqual({ command: 'cmd.exe', args: ['/c', 'start', '', 'D:\\AiWAR3WorkFlow\\start.bat'] })
  })

  it('runs a script through sh elsewhere, as one argv entry', () => {
    expect(detachedArgv('/opt/start.sh', 'linux')).toEqual({ command: 'sh', args: ['/opt/start.sh'] })
  })
})

describe('resolveLaunchInternals', () => {
  it('falls back to the real process starter', () => {
    expect(resolveLaunchInternals({}).spawn).toBe(spawn)
  })

  it('keeps an injected starter', () => {
    const injected = starter('spawn')
    expect(resolveLaunchInternals({ spawn: injected }).spawn).toBe(injected)
  })
})

describe('launchApp', () => {
  it('counts an answering page as ready without starting anything', async () => {
    const spawner = starter('spawn')
    const outcome = await launchApp(action({ url: await page() }), 1_000, live(), { spawn: spawner })
    expect(outcome).toEqual({ status: 'ready' })
    expect(spawner).not.toHaveBeenCalled()
  })

  it('starts the command and waits for the page it brings up', async () => {
    const spawner = starter('spawn')
    const outcome = await launchApp(action({ url: await page(true) }), 5_000, live(), { spawn: spawner })
    expect(outcome).toEqual({ status: 'ready' })
    expect(spawner).toHaveBeenCalledWith(
      detachedArgv('start.bat', process.platform).command,
      [...detachedArgv('start.bat', process.platform).args],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    )
  })

  it('refuses an absolute command that names no file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-quick-start-'))
    directories.push(directory)
    const outcome = await launchApp(action({ command: join(directory, 'missing.bat') }), 1_000, live(), { spawn: starter('spawn') })
    expect(outcome).toEqual({
      status: 'failed',
      reason: 'missing-command',
      message: `command does not name a file: ${join(directory, 'missing.bat')}`,
    })
  })

  it('starts a command that names an existing file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-quick-start-'))
    directories.push(directory)
    const script = join(directory, 'start.bat')
    await writeFile(script, '@echo off\n')
    const spawner = starter('spawn')
    const outcome = await launchApp(action({ command: script }), 1, live(), { spawn: spawner })
    expect(outcome).toEqual({ status: 'failed', reason: 'timeout', message: `no answer from ${CLOSED_PAGE} within 1 ms` })
    expect(spawner).toHaveBeenCalledOnce()
  })

  it('reports a process that could not start', async () => {
    const outcome = await launchApp(action(), 1_000, live(), { spawn: starter('error') })
    expect(outcome).toEqual({ status: 'failed', reason: 'spawn-failed', message: 'cannot start' })
  })

  it('reports a rejected start that carried no error', async () => {
    const outcome = await launchApp(action(), 1_000, live(), { spawn: starter('error', 'no shell') })
    expect(outcome).toEqual({ status: 'failed', reason: 'spawn-failed', message: 'no shell' })
  })

  it('reports the deadline when the page never answers', async () => {
    const spawner = starter('spawn')
    const outcome = await launchApp(action(), 1, live(), { spawn: spawner })
    expect(outcome.status).toBe('failed')
    expect(outcome).toHaveProperty('reason', 'timeout')
    expect(spawner).toHaveBeenCalledOnce()
  })
})
