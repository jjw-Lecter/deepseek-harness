---
description: "Configured launch actions under New Session in the Web sidebar: a prompt action opens a session whose composer already holds its opening instruction, and an application action starts a configured local program on the host and embeds its page in the central panel; for users and maintainers of deployment-specific entry points."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-quick-start

English | [中文](README.zh.md)

## Summary

This package puts a deployment's named entry points in the sidebar, directly under New Session. Each configured action is one button in one of two forms. A prompt action opens a session whose composer already holds that action's opening instruction, so the instruction stays editable before it is sent. An application action starts a program this host holds and embeds that program's page in the central column, so a local tool the deployment depends on is one press away. The action set is deployment configuration, so an unconfigured deployment renders no seat.

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

Mount this plugin in a deployment's roster and give its row the actions to offer:

```yaml
- id: ui-quick-start
  name: '@deepseek-ai/dsh-client-ui-quick-start'
  config:
    launchReadyMs: 180000
    actions:
      - id: wc3-development
        label: 开发
        prompt: >-
          开始魔兽争霸 3 RPG 的开发工作：先读工作室约束，再按开工角色推进，
          并在改动前报告基线。
      - id: studio
        label: 工作台
        command: 'D:\AiWAR3WorkFlow\start.bat'
        url: 'http://localhost:5173/'
```

An entry states its form by the fields it carries, and `resolveActions` refuses an entry that states both forms or neither:

| Form | Fields | A press does |
|---|---|---|
| prompt | `prompt` | Opens a session whose composer holds the instruction. |
| application | `command` and `url` | Starts `command` on the host and opens the panel embedding `url`. |

`id` and `label` are required and non-empty for both forms: `id` is the stable key a press reports and the identity that must be unique, and `label` is the button text, its accessible name, and the application panel's title. `url` must be an absolute http(s) URL, because the panel embeds it. Actions render in configuration order, and a set that could not be rendered, told apart, or launched fails the load that configured it.

`launchReadyMs` is the deadline, in milliseconds, for a started application's page to answer (default 120000). It is a failure bound, not a delay: a page that answers sooner is used immediately, and the application keeps running when the press reports the deadline.

### What a prompt press does

A press opens a session and writes its instruction into that session's composer. Nothing is sent: the instruction waits in the input until the user presses Enter, and remains editable. When a blank session is already the current one, that session takes the instruction — starting another would only reopen it — and when the current session already carries conversation, the press opens the session the Workspace flow produces and the instruction lands there.

### What an application press does

A press selects the action's panel and asks the host to start the application. The host answers once the page answers, and the panel then embeds it. A page that already answers means the application is running, so nothing is started — pressing twice, or pressing while someone else started it, opens the page instead of starting a second copy. A failed press reports its reason in the panel with a retry, and the panel's own start control presents the same press when the user arrives there first.

The application panel carries the action's label, a reload control once the page is up, and a control returning the central column to the current Session. Reload remounts the frame rather than asking a cross-origin document to reload itself.

### On the rail

The collapsed sidebar shows one square control per action carrying the label's first character, because the rail has no room for text and the configuration carries no icon. The whole label remains the accessible name, and the tooltip carries it on hover. An application action also registers a sidebar row under the launch buttons, whose glyph the harness draws; the row selects the panel the same way the button does.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package has both faces. Its node half resolves the row's `config` and pushes one `global` row into the index injection table, which the Web server and the Desktop host both render; the browser half reads that global. The config cannot travel any other way: the browser boot composes its plugin rows from the boot manifest, which carries no `config`, so `dsh-client-connection` hands its recovery timing across by the same injection. The node half is [`src/index.ts`](src/index.ts), the browser half [`src/client/index.ts`](src/client/index.ts), and [`src/actions.ts`](src/actions.ts) is the shape both read.

The seat registers through `ctx.slots.inject('sidebar.quickstart', ...)`, so it installs whether this row activates before or after the sidebar shell that declares the hole, and withdraws with that declaration. Each application action registers twice more the same way: a keyed `main` entry keyed `quickstart-app:<id>`, which is the panel, and a `sidebar.panellist` entry that gives it a navigation row.

Opening a Workspace reaches its session asynchronously, so a prompt press that has no blank session to land on records the instruction and lets the session-list subscription deliver it — the shape [`ui-agent-preset`](../ui-agent-preset/README.md) uses to carry a preset choice to the session it composes. The stage names the session the press left behind, so the list changes a connect publishes before its session arrives cannot spend it; it is spent on the first different current session, and a session carrying history ends the launch instead of taking the text.

An application press posts the action's `id` to `POST /api/quickstart.launch`. The route is a Fetch route on Connection's shared `/api` channel, not a `webServer` route: the Desktop host forwards only `/api` requests to the Host process, so a raw `webServer` route would work on the Web surface and answer 405 on the Desktop one. The physical carrier owns trust and authentication for that channel, and the request names an action only — the command is always the deployment's own configuration. [`src/app-launch.ts`](src/app-launch.ts) then probes `url`, spawns the configured command detached when nothing answers, and waits for the page.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the launch actions are not enough. They move from the seat this package fills to the shell that declares it and the flows a press drives.

- [ui-sidebar](../ui-sidebar/README.md) — declares `sidebar.quickstart` and `sidebar.panellist`, and renders both under New Session.
- [ui-layout](../ui-layout/README.md) — declares the keyed `main` slot an application panel occupies, and the `ctx.layout.selectPanel` a press uses.
- [ui-workspace](../ui-workspace/README.md) — the New Session flow a prompt press starts.
- [ui-conversation](../ui-conversation/README.md) — the per-session composer the instruction is written into.
- [ui-agent-preset](../ui-agent-preset/README.md) — the same stage-then-apply shape, for a preset choice rather than an instruction.
- [client-connection](../connection/README.md) — the shared `/api` channel carrying the launch route.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the composer draft a prompt press writes: the instruction reaches the model as an ordinary user message only once the user sends it, and an application press reaches no model input.

#### KV Cache effect

None at load or press. The session's first request carries the instruction as its first user message, exactly as if it had been typed.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the current seat. They are current package constraints, not a general launcher comparison or a task backlog.

- **Labels are not localized** — an action's `label` is deployment configuration, so one string serves every UI locale; the package's own dictionaries carry only the panel's copy.
- **A prompt press replaces a blank session's draft** — the action's instruction becomes the whole draft, so text already typed into that blank session is lost. The seat exists to start a session on an instruction, and a merge would leave an ambiguous opening.
- **A prompt press with no Workspace waits** — when the sidebar's New Session clears to the no-session view (this deployment has no Workspace), the stage stays until a blank session becomes current, which is the next session the user opens.
- **A started application inherits this process's environment** — the child is spawned with the ambient environment, so any credential the Host was launched with is visible to it. Scrubbing needs `scrubbedParentEnv` from `dsh-subprocess`, whose cross-install classification the dependency policy reserves for human review; until that edge is classified, the deployment's own command is the trust boundary.
- **The embedded page must allow framing, and serves no session identity** — the panel is an ordinary cross-origin frame in the harness document: a page that refuses framing cannot be embedded, and the page cannot read the harness session. Only the harness reads the page's URL, which the deployment configured.
- **Readiness is the page answering, not the application working** — any HTTP answer from `url` counts, so a wrong service on that port satisfies the press, and a page that answers before its own data is loaded satisfies it early. The wait is bounded by `launchReadyMs`; the started application is never terminated at that point.
- **One launch is in flight per browser and per action** — concurrent presses share the attempt, and the Host tracks its own in-flight attempt per action id; a second Harness window pressing the same action starts a second process, because nothing shared records "already starting" across processes.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The two forms, the `/api` channel decision, the panel's registration as a keyed `main` entry, and the rejected alternatives are recorded in the [application-launch Agent Note](../../../.agents/notes/implemented/feature/2026-09-18-sidebar-application-launch.md); the prompt form is the [quick-start Agent Note](../../../.agents/notes/implemented/feature/2026-09-16-sidebar-quick-start-actions.md).

</details>

**Runtime invariant:** No companion is published. The seat owns one registration and one list subscription, and each application action owns its panel, its navigation row, and one shared store — all installed through the plugin fiber and removed with it.
