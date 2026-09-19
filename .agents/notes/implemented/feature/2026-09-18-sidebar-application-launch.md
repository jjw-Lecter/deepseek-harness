# Agent Note: Sidebar application launch and embedded panel

Status: implemented

English | [中文](2026-09-18-sidebar-application-launch.zh.md)

## Problem

A deployment's recurring opening move is often "bring that tool up": the studio's own dev server, a designer, a map editor. The [quick-start seat](2026-09-16-sidebar-quick-start-actions.md) could only open a session carrying an instruction, so the user still started the tool by hand — finding and double-clicking a `start.bat`, waiting for its servers, opening its page — before the work the instruction described could begin. The page that starts the work and the page where the work happens stayed in two windows, and nothing in the harness knew the tool's state.

## Decision

A quick-start action becomes a closed union of two forms, tagged by the host half while it resolves the configuration: `{ kind: 'prompt', id, label, prompt }` and `{ kind: 'app', id, label, command, url }`. An entry states its form by the fields it carries; `resolveActions` refuses an entry stating both forms or neither, and both halves switch on the tag rather than re-deriving the form.

An application press posts the action's `id` to `POST /api/quickstart.launch` — a Fetch route on Connection's shared `/api` channel. It is not a `webServer` route because the Desktop host forwards only `/api/*` requests to the Host process: a `webServer` route would answer on the Web surface and return 405 inside the Desktop application. The command never crosses the wire; the request names an action, and the command is the deployment's own configuration.

The host half starts the configured command detached with no stdio pipe, so the application outlives dsh. Windows runs it through `cmd.exe /c start "" <command>`, which gives a configured script the console window a double-click would give it and returns at once; elsewhere `sh` takes the script path as one argv entry, so no shell re-parses it. Readiness is the page answering: `url` is probed first — an answering page means the application is already running, so nothing is spawned — and then repeatedly after the spawn until `launchReadyMs` runs out. A command naming an absolute path is checked to be a file before it is run, so a stale configuration fails the press instead of the deadline.

The browser half registers one keyed `main` panel per application action, keyed `quickstart-app:<id>`, plus one `sidebar.panellist` row that selects it. Every panel registration shares one store instance keyed by action id, so an application's phase survives the central column being switched away and back, and one launcher writes it. The panel embeds `url` in an iframe once the phase is ready; reload bumps a revision that remounts the frame, which is the only way to reload a cross-origin document the harness cannot reach into.

## Alternatives considered

**Opening the page in a browser window.** The Desktop shell denies `window.open` and refuses navigation away from its own scheme, so from the Desktop application the page could only leave the harness window through a host-side native opener; the deployment's own requirement was to work in one window. A browser tab is also outside the panel's controls, so its reload and return gestures would have nowhere to live.

**`shell.overlay` for the page.** The frame-wide floating layer is the additive seat for badges, toasts, and status pills: click-through by default, no column geometry, no navigation row. A whole application belongs in the main column, which already owns panel selection and the sidebar rows that select it.

**A right-sidebar dock tab.** That subsystem's tabs are session-scoped and their kinds are defined by its own contracts; a deployment tool available in every session would have to manufacture a session-scoped tab for a page that reads no session.

**A `webServer` route.** The natural home for a host capability, and unreachable inside the Desktop application. Connection's shared channel is the one transport both surfaces carry, and its physical carrier owns the Host/Origin fence and browser authentication for every route on it.

**Spawning through `ctx.subprocess`.** The managed-subprocess capability owns a process range and terminates it during teardown, which would end the user's tool servers together with dsh, and its request model has no detached mode. The launched application must outlive the harness.

**Scrubbing the child environment with `scrubbedParentEnv`.** That helper is exactly the right one, but it is not among the dependency policy's classified host exports, and that list forbids additions by automated agents. The child therefore inherits the ambient environment; the package README records the gap and the trust boundary it leaves.

**Letting the browser poll the URL.** A cross-origin probe from the harness document needs CORS or `no-cors` semantics and reports only what one browser can observe. The Host already runs on the same machine as the page and can wait without the page holding a request per attempt.

**Running the command through a shell string.** Expressible arguments would come at the cost of re-parsing a configured path in a shell. The command is a program or script path, and each platform adapter builds the argv itself.

## Consequences

An application action adds a host capability to the composition that configures it: the route exists only where at least one application action does, and the deadline (`launchReadyMs`, default 120000) bounds the wait without terminating the application.

Presses are idempotent against a running application but not against another harness process: the Host coalesces attempts per action id, and the browser coalesces presses, while nothing shared records "already starting" across processes.

A press never depends on a session, a workspace, or a model turn; the panel is a root-scoped keyed entry that renders its action's own phase, and the deployment's page is loaded from configuration rather than from session data.

Component, registration, launcher, route, and spawn specs cover the two action forms, the refusal cases, the phase machine, the readiness probe, the three failure reasons, the shared attempt, and the coalesced press; [`packages/client/ui-quick-start/tests`](../../../../packages/client/ui-quick-start/tests) holds them.
