---
description: "Web sidebar DeepSeek account balance: the amount the configured credential can still spend, read from the provider's balance endpoint by the host and shown in the sidebar's brand row on a cadence and on press."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-deepseek-balance

English | [中文](README.zh.md)

## Summary

This package puts the DeepSeek account balance in the Web sidebar, beside the brand. Its host half reads `GET {baseURL}/user/balance` with the credential this deployment configured, and its browser half shows the amount and re-reads it on a cadence and on every press. Because the figure decides whether a session can still call the API, a failed read keeps the last amount on screen and marks it rather than blanking it. Nothing about the account but the amounts reaches the page: the credential never leaves the host process.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the package in a Web composition and point it at the credential the deployment bills:

```yaml
- id: ui-deepseek-balance
  name: '@deepseek-ai/dsh-client-ui-deepseek-balance'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    baseURL: https://api.deepseek.com
    timeoutMs: 10000
```

### When to choose it

Choose it when a deployment authenticates with a DeepSeek key whose remaining credit its users care about — a shared or metered key, a gateway billed per account. Skip it when sessions authenticate some other way: a key with no balance endpoint, or an ambient OAuth identity, leaves the cell reporting an unconfigured credential. The cell is read-only; spending policy, budgets, and alerts belong to the provider's own account console.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | Credential reference the host resolves per read. |
| `baseURL` | `https://api.deepseek.com` | Provider root the balance endpoint hangs below. |
| `timeoutMs` | `10000` | Deadline for one provider read. |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-client-ui-deepseek-balance) is the exhaustive source for every accepted field.

### The credential

The plugin declares `connection` and `credentials` and resolves `apiKeyEnv` once per read through `ctx.credentials.resolve` — the same call the DeepSeek provider makes, against the same reference the Models page writes. The local credential provider already layers the process environment, the invoking directory's `.env`, the Harness home's `.env`, and the managed store, so an exported key needs no second configuration path. Resolution is per read, so a key stored after boot reaches the next refresh without restarting the plugin. A missing or empty key is not a failure of the row: the cell reports that the configuration is missing, and the next read picks the key up. A composition that mounts no credential provider never activates this row.

### What the cell shows

The cell is a button carrying the amount in the provider's own decimal string with its currency mark (`¥110.00`, `$12.50`; an unknown currency code keeps its own spelling). Pressing it reads again. A state dot appears beside the amount when the account no longer covers API calls (warning) or the last read failed (error), and the tooltip states the amount's breakdown, when it arrived, the failure's reason with the host's own detail, and that pressing refreshes.

The browser re-reads every 60 seconds while a page is open. A failed refresh keeps the previous amount and its age visible, so a transient provider or network failure does not hide a figure the user is watching.

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package has both faces. The node half ([`src/index.ts`](src/index.ts)) registers one exact Fetch route, `GET /api/deepseek.balance`, on Connection's shared `/api` channel; the browser half ([`src/client/index.ts`](src/client/index.ts)) registers one cell into the sidebar's `sidebar.brand.status` seat and reads that route. The route is a channel route rather than a `webServer` route because the Desktop host forwards only `/api` requests to the host process, and the physical carrier owns trust and authentication for the channel — the request names no parameter at all, so the credential and endpoint are always this deployment's own configuration.

[`src/balance.ts`](src/balance.ts) performs one read: it addresses `{baseURL}/user/balance`, presents the key as a bearer token, bounds the whole read with `timeoutMs`, and maps every answer to one of five failure discriminants. Amounts stay the provider's decimal strings, because this package only displays them. A caller's abort propagates instead of becoming a failure, so a closed page does not leave a provider read behind.

[`src/wire.ts`](src/wire.ts) is the one payload both halves agree on, and the browser validates it: an unreadable body, a truncated answer, or a differently built host carries no balance rather than a guessed one. [`src/client/controller.ts`](src/client/controller.ts) owns the cadence and publishes through the inject `hooks` compartment, so the cell subscribes through the renderer's `useBalance` hook and holds no subscription machinery of its own. [`src/client/DeepSeekBalanceBadge.tsx`](src/client/DeepSeekBalanceBadge.tsx) is a pure function of that state plus the package's locale dictionary.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.brand.status` and renders it in the expanded brand row.
- [client-connection](../connection/README.md) — the shared `/api` channel carrying the balance route.
- [llm-deepseek](../../llm/llm-deepseek/README.md) — the provider whose credential and endpoint conventions this package follows.
- [session-log-export](../../session-query/session-log-export/README.md) — the same two-face package form: a host route plus the browser control that reads it.
- [ui-open-in-app](../ui-open-in-app/README.md) — another host-backed sidebar/header cell, with its own host route and browser controller.

-----

<a id="model-experience"></a>
## Model Experience

None, as the cell reads a provider account endpoint and renders it beside the sidebar brand; the amount never enters a prompt, a tool schema, or a session event.

#### KV Cache effect

None. The package adds no model request and no model-visible text: its reads are authenticated HTTP calls to the provider's account endpoint.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the current cell. They are current package constraints, not a provider comparison.

- **The refresh cadence is a product constant** — the browser re-reads every 60 seconds, and a `dsh.client` row's `config` reaches only the node half, so a deployment cannot retune it without a source change.
- **The cell renders in the expanded brand row only** — the 56px collapsed rail carries no room for a currency figure, so a collapsed sidebar shows no balance at all.
- **The provider root comes from this row** — `$DEEPSEEK_BASE_URL` is not read, so a deployment whose provider route points at a gateway states that same root on this row's `baseURL`.
- **Only the credential reference and the provider root are configurable** — a gateway that serves the balance endpoint at another path, or that needs extra headers, is not supported.
- **One currency is shown** — the cell and its tooltip present the first entry the provider reports; an account reporting several currencies sees the rest only through the provider's own console.
- **A stale amount stays visible** — after a failed read the pill keeps the last successful amount with an error marker, so the figure on screen can be older than the failure the tooltip names.
- **The figure is per credential, not per session** — two deployments sharing one key show the same balance, and nothing attributes spending to a session.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The seat, the route, the failure taxonomy, the decision to keep a stale amount, and the rejected alternatives are recorded in the [DeepSeek balance Agent Note](../../../.agents/notes/implemented/feature/2026-09-18-sidebar-deepseek-balance.md).

</details>

**Runtime invariant:** No companion is published. The package owns one route registration and one cell registration, both installed through the plugin fiber; the controller's cadence and its in-flight read are removed by the same fiber's disposer, and the specs assert the registration, the disposal, and the published state directly.
