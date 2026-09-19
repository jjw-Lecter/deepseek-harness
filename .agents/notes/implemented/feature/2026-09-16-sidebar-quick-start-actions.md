# Agent Note: Sidebar quick-start actions

Status: implemented

English | [中文](2026-09-16-sidebar-quick-start-actions.zh.md)

## Problem

Starting the same kind of work costs the same paragraph every time. The sidebar's New Session button opens a session and says nothing about what the session is for, so a deployment whose users repeatedly begin from one of a few standing requests — a project workflow, a studio role, a domain task — has no way to name them. The user retypes the request, and the retyped wording is not the request the deployment intended.

## Decision

`sidebar.quickstart` is a single root-scoped hole in the sidebar shell, rendered directly under New Session and above the global panel rows. The shell gives its occupant the column state (`wide`) and nothing else: what a press does is the registrant's business.

[`@deepseek-ai/dsh-client-ui-quick-start`](../../../../packages/client/ui-quick-start/README.md) fills it from a configured `actions` list, whose entries come in two forms, tagged by the host half while it resolves the configuration. A **prompt** entry `{ id, label, prompt }` opens a session on a press and writes `prompt` into that session's composer through `ctx.conversation.input.for(actx).setDraft`; nothing is sent, so the instruction stays editable and the user's Enter is what spends a request. An **application** entry `{ id, label, command, url }` starts a program this host holds and opens the panel embedding its page, which the [application-launch note](2026-09-18-sidebar-application-launch.md) records.

The package has both faces, because a `dsh.client` row's `config` reaches only its node half: the browser boot composes plugin rows from the boot manifest (`WebBootEntry`), which carries no `config`, and `bootClient` calls `loader.create({ name })`. The node half resolves the config and pushes one `global` row into the index injection table that both the Web server and the Desktop host render; the browser half reads that global. [`dsh-client-connection`](../../../../packages/client/connection/README.md) hands its recovery timing across by the same injection.

Which session receives it follows the New Session flow. A blank session already current takes the instruction directly, because starting another would reopen it. Otherwise the press records the instruction and `ctx.uiWorkspace.startSession()` opens the session the Workspace flow produces; the session-list subscription delivers the instruction when that session becomes current. The record names the session the press left behind, so the list changes a connect publishes before its session arrives cannot spend it, and a different current session that already carries conversation ends the launch rather than taking the text.

A load refuses an `actions` list that could not be rendered, told apart, or launched — an empty `id` or `label`, an entry stating both forms or neither, an empty field of the form it does state, a `url` that is not an absolute http(s) URL, or a repeated `id` — because none of those failures has a later resolution point in the browser, which has no config to point back at. An empty list is not a failure: the seat renders nothing.

`dsh-web-app` configures four actions for this deployment's Warcraft III RPG studio: development, UI design, and numerical balance, each opening with the instruction that routes work through `C:\Users\10639\.agents\skills\gamestart`, plus the studio's own workbench, which starts `D:\AiWAR3WorkFlow\start.bat` and embeds its page.

## Alternatives considered

**Agent presets per role.** A preset composes what an agent runs with — tools, prompt sections — and is fixed for the session it created. These entry points differ in what the user asks for, not in what the session is allowed to do; expressing them as presets would add compositions that share one behavior and compete with the preset surface that already owns composition choice.

**A button in the composer's own action row.** The composer holds the draft the instruction would replace, so the control would sit next to what it edits. It would not sit on the screen that starts work: the hero composer is one surface, and the sidebar is present on all of them.

**Buttons hardcoded in the shipped shell.** Writing one deployment's domain copy into the client source makes the product carry a configuration. The package holds the mechanism and the deployment row holds the actions, so another deployment changes them without a source change.

**Reading the row config in the browser half.** The natural-looking option, and the one a `dsh.client` row's `Config` declaration suggests. It does not work: the boot manifest that composes browser rows carries no config, so such a row always runs on schema defaults. Only the node half sees what the deployment configured, which is why the set crosses on the index injection table.

**A deployment-specific preset or prompt file.** A preset composes an agent rather than naming a request, and a file the package reads at runtime would put deployment data behind a path the package has no contract for.

**Sending the instruction on the press.** A press that immediately spends a request and starts editing files leaves no point at which the instruction can be corrected, and makes an accidental click expensive.

## Consequences

The configured actions reach the desktop and `dsh web` through the `dsh-web-app` bundle patch, so this deployment's domain copy lives in the deployment's own composition layer rather than in a package. Another deployment overrides the row's config.

An action's `label` is configuration and therefore not localized; one string serves every UI locale. The collapsed rail shows the label's first character, because the rail has no room for text and the configuration carries no icon.

A prompt press replaces a blank session's whole draft, so text already typed into that blank session is lost. The seat exists to start a session on its instruction, and merging two openings would leave an ambiguous first message.

When the deployment has no Workspace, the sidebar's New Session clears to the no-session view and a prompt press has no session to open. It ends there when a session was current; when none was, the instruction waits for the next blank session to become current. An application press depends on no session at all.

Component and controller specs cover the two arms, the stage's spend and abandon paths, the refusal at load, the rail form, and the application form's panel and launch path; `ui-sidebar`'s specs and DOM snapshots carry the new hole.
