# Agent Note: Sidebar DeepSeek balance

Status: implemented

English | [中文](2026-09-18-sidebar-deepseek-balance.zh.md)

## Problem

A session spends an account's credit, and the harness never says how much is left. The number exists — `GET /user/balance` answers it for the credential the deployment already configured — but it lives in another window, so the user learns the balance ran out from a failed request rather than before it.

## Decision

The sidebar's brand row gains a status seat, `sidebar.brand.status`: a root-scoped list rendered between the brand group and the column toggle, outside the New Session button's hit area. It exists in the expanded column only; the 56px rail carries no room for a status cell, and a figure that cannot be read is not worth a control.

[`@deepseek-ai/dsh-client-ui-deepseek-balance`](../../../../packages/client/ui-deepseek-balance/README.md) fills it with the deepseek account balance. The package has both faces. Its node half registers one exact Fetch route, `GET /api/deepseek.balance`, on Connection's shared `/api` channel, and its browser half registers one cell that reads that route on a 60-second cadence and on every press.

The route is on the shared channel rather than the `webServer`, for the reason the launch route is: the Desktop host forwards only `/api` requests to the host process, so a raw `webServer` route would exist on one surface and 405 on the other. The carrier owns trust and authentication for that channel, and the request carries no parameter at all — the credential reference and the endpoint are always the deployment's own configuration, never a value the browser supplies.

The host declares the credential seam and resolves the key once per read through `ctx.credentials.resolve`, against the same reference the Models page writes and the DeepSeek provider resolves, so a key stored after boot is the key the balance reflects. A composition that mounts no credential provider never activates this row. The configured reference is validated against the environment-variable grammar the credentials seam admits, because the seam's own constructor is not a classified Host export for a `packages/client` package and the dependency policy forbids an automated agent from adding one; `dsh-api-settings-controller` states the same grammar for its own input field.

The provider read carries the whole failure taxonomy: `not-configured`, `unauthorized`, `timeout`, `unreachable`, and `invalid-response`. The browser localizes each discriminant into its own copy and shows the host's detail line verbatim.

Amounts stay the provider's decimal strings. This package only displays them, so parsing them into binary floats could only introduce drift. A failed read keeps the last successful amount on screen under an error marker: the user is watching that figure, and blanking it would hide more than it protects — the tooltip carries the failure and the amount's age.

The provider body and the browser's own answer are both validated. The provider is an external service and the host is another process, so a missing flag, a non-array list, an entry without a stated amount, a truncated answer, or a differently built host yields no balance rather than a balance of zero.

## Alternatives considered

**A session-scoped figure in the Session header.** The balance is an account fact that no session owns; two sessions sharing one key would each render the same number, and a session with no request in flight would still show it. The sidebar column is present before any session exists, which is where the account belongs.

**Reading the balance in the browser half.** The key lives in the host process; putting it in the page to reach the provider directly would hand every page visitor a credential, and the Desktop surface could not reach an internal endpoint at all.

**A `webServer` route.** Rejected above: it would work on the Web surface and fail on the Desktop one.

**A configurable cadence.** A `dsh.client` row's `config` reaches the node half only, so a cadence the browser owns would need a second index-injection channel to carry one number. The interval is a product cadence for one cell; the deployment-varying facts — credential reference, endpoint, deadline — are config.

**Showing the amount only while a request is running.** The cell answers "can I start work", which is a question asked before a session exists.

**Reading `$DEEPSEEK_BASE_URL` and the ambient environment, as the provider does.** `dsh-launch-environment`'s exports are unclassified in the dependency policy's Host export lists, and that policy forbids an automated agent from adding an entry, so this row states its own endpoint and requires the credential seam instead. The cost is stated in the package README: a gateway deployment writes the same root twice, once for the provider route and once here.

**Auto-refreshing without a press.** A press is what makes the number trustworthy at the moment the user reads it, and it costs one small authenticated GET.

## Consequences

`dsh-web-app` mounts the row, so `dsh web` and the Desktop host both show the cell; a deployment overrides `apiKeyEnv`, `baseURL`, or `timeoutMs` on its own row. The cell reports an unconfigured credential instead of failing the load, so a deployment with no DeepSeek key still boots and simply shows a marked placeholder.

The shell change is additive: `sidebar.brand.status` is a new `list` seat, so `ui-brand-official`'s occupants and every existing registration are untouched, and an empty seat renders nothing.

A failed read leaves a stale amount visible with an error marker, which is a deliberate trade documented in the package README: the alternative is a blank cell that hides a figure the user is watching.

`balance.host.spec.ts` covers the provider read against a local server, `route.host.spec.ts` mounts the real plugin over a loopback provider, and the client specs cover decoding, the controller's cadence, join, disposal, and kept reading, the cell's states, and its registration; `ui-sidebar`'s specs and DOM snapshots carry the new seat.
