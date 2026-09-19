/**
 * Registration: the cell installs only once the sidebar shell has declared the
 * brand-status seat, carries a live balance face, and leaves with its plugin.
 */

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import { apply, inject } from '../src/client/index.ts'
import type { DeepSeekBalanceInjected } from '../src/client/contract.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { DEEPSEEK_BALANCE_PATH } from '../src/wire.ts'

const READING = {
  ok: true,
  available: true,
  balances: [{ currency: 'CNY', total: '110.00', granted: '0.00', toppedUp: '110.00' }],
}

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** Stand-in for the sidebar shell: declares the brand-status seat this plugin fills. */
function ShellFrame({ renderSlot }: PropsRenderSlots<'sidebar.brand.status'>) {
  return renderSlot('sidebar.brand.status', {})
}

/** The shell declaration's registration options, as ui-sidebar spells them. */
const SHELL_CHILDREN = { 'sidebar.brand.status': { kind: 'list', scope: 'root' } } as const

/** A browser context with the two services this plugin injects. */
function bench() {
  const ctx = new Context()
  const dictionaries: [string, { zh: unknown; en: unknown }][] = []
  ctx.provide('locale', {
    register: (namespace: string, dicts: { zh: unknown; en: unknown }) => {
      dictionaries.push([namespace, dicts])
      return () => {}
    },
  } as never)
  return { ctx, dictionaries }
}

/**
 * Mount the browser half over one HTTP carrier.
 * @param fetcher - carrier the browser reads the balance route with.
 * @returns the bench, the plugin fiber, and a declaration the spec can time itself.
 */
async function mount(fetcher: Fetch) {
  vi.stubGlobal('fetch', fetcher)
  const b = bench()
  await b.ctx.plugin(SlotRegistry).await()
  const declare = () => b.ctx.slots.register({ name: 'root', children: SHELL_CHILDREN }, ShellFrame)
  const fiber = b.ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ...b, declare, fiber }
}

/** The injected business face of the registered cell. */
function faceOf(ctx: Context): DeepSeekBalanceInjected {
  const entry = ctx.slots.entries('sidebar.brand.status')[0]
  if (entry?.inject === undefined) throw new Error('the balance cell carries no injected face')
  return (entry.inject as unknown as () => DeepSeekBalanceInjected)()
}

/** The carrier most specs need: one successful reading. */
const answering = (): Fetch => async () => Response.json(READING)

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ui-deepseek-balance browser half', () => {
  it('declares only the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale'])
  })

  it('registers its dictionaries', async () => {
    const b = await mount(answering())
    expect(b.dictionaries).toEqual([[NS, { zh, en }]])
    await b.fiber.dispose()
  })

  it('waits for the sidebar declaration before registering, and removes the cell on dispose', async () => {
    const b = await mount(answering())
    expect(b.ctx.slots.entries('sidebar.brand.status')).toEqual([])
    const declare = b.declare()
    expect(b.ctx.slots.entries('sidebar.brand.status')[0]?.options.id).toBe('deepseek-balance')
    declare()
    await b.fiber.dispose()
    expect(b.ctx.slots.entries('sidebar.brand.status')).toEqual([])
  })

  it('hands the cell a live balance source and a working refresh', async () => {
    const fetcher = vi.fn(answering())
    const b = await mount(fetcher)
    b.declare()
    const face = faceOf(b.ctx)
    await vi.waitFor(() => { expect(face.hooks.balance.getSnapshot().phase).toBe('ready') })
    expect(face.hooks.balance.getSnapshot().reading?.balances).toEqual(READING.balances)
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(`http://dsh.internal${DEEPSEEK_BALANCE_PATH}`)
    face.refresh()
    await vi.waitFor(() => { expect(fetcher).toHaveBeenCalledTimes(2) })
    await b.fiber.dispose()
  })

  it('stops reading the host once disposed, even from a callback already handed out', async () => {
    const fetcher = vi.fn(answering())
    const b = await mount(fetcher)
    b.declare()
    const face = faceOf(b.ctx)
    await vi.waitFor(() => { expect(fetcher).toHaveBeenCalledOnce() })
    await b.fiber.dispose()
    face.refresh()
    await Promise.resolve()
    expect(fetcher).toHaveBeenCalledOnce()
  })
})
