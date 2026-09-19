---
description: "Web 侧栏中「新建会话」下方的可配置开工按钮：prompt 动作新建一个会话并把开场指令预填进输入框，application 动作在宿主上启动已配置的本地程序并把它的页面嵌入中栏；供部署专属入口的用户与维护者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-quick-start

[English](README.md) | 中文

## 概述

本包把部署命名的开工入口放进侧栏，紧贴「新建会话」下方。每个已配置动作就是一个按钮，并有两种形态。prompt 动作新建一个会话，并把该动作的开场指令预填进输入框，因此指令在发出前始终可编辑。application 动作启动本宿主持有的一个程序，并把该程序的页面嵌入中栏，因此部署依赖的本地工具只需按一下。动作集属于部署配置，未配置的部署不会渲染任何座位。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本插件挂到部署的插件名单，并在它的行上给出要提供的动作：

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

每一项由它携带的字段表明自己的形态，`resolveActions` 会拒绝同时表明两种形态、或一种都不表明的项：

| 形态 | 字段 | 按下后做什么 |
|---|---|---|
| prompt | `prompt` | 新建一个会话，输入框里已有该指令。 |
| application | `command` 与 `url` | 在宿主上启动 `command`，并打开嵌入 `url` 的面板。 |

两种形态都要求 `id` 与 `label` 非空：`id` 是按下时报出的稳定键，也是必须唯一的身标识；`label` 是按钮文本、它的可访问名称，以及 application 面板的标题。`url` 必须是绝对 http(s) URL，因为面板要嵌入它。动作按配置顺序渲染；无法渲染、无法区分或无法启动的动作集会使其所在的加载失败。

`launchReadyMs` 是已启动应用的页面必须应答的时限（毫秒，默认 120000）。它是失败上界而不是等待时长：应答更早的页面会立即被使用，而按下报出超时时应用仍在运行。

### prompt 动作按下后会发生什么

按下后新建一个会话，并把该动作的指令写进这个会话的输入框。不会发送：指令留在输入框里等用户按回车，并且始终可编辑。当前会话本来就是空白会话时，由它接收这条指令——另起一个只会重新打开同一个会话；当前会话已有对话内容时，按下按钮会打开工作区流程产出的会话，指令落在那里。

### application 动作按下后会发生什么

按下后选中该动作的面板，并请宿主启动这个应用。宿主等到页面应答后才答复，随后面板把它嵌入。页面本来就有应答说明应用已在运行，因此不会再启动一次——连按两次，或在别人已经启动它时按下，都只是打开页面，而不是起第二份。失败的按下会在面板里报出原因并提供重试；用户先打开面板时，面板自己的启动控件呈现同一次按下。

application 面板带有该动作的标签、页面就绪后的重新加载控件，以及把中栏交还给当前会话的控件。重新加载是重挂载这个 frame，而不是要求一个跨源文档自行重载。

### 折叠栏上的形态

侧栏折叠后，每个动作显示为一个方块控件，内容是该标签的第一个字符，因为折叠栏放不下文本，而配置里不带图标。完整标签仍然作为可访问名称，并在悬停时由提示承载。application 动作还会在开工按钮下方注册一行侧栏导航行，字形由 harness 绘制；该行与按钮一样选中这个面板。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包同时具有两个面。它的 node 半部解析该行的 `config`，并向索引注入表推入一条 `global` 行，Web 服务端与桌面端宿主都会渲染这张表；浏览器半部读取该全局量。配置无法走别的通道：浏览器启动从 boot manifest 组合插件行，而该 manifest 不携带 `config`，因此 `dsh-client-connection` 也以同样的注入传递它的恢复时序。node 半部是 [`src/index.ts`](src/index.ts)，浏览器半部是 [`src/client/index.ts`](src/client/index.ts)，而 [`src/actions.ts`](src/actions.ts) 是两者共同读取的形状。

座位通过 `ctx.slots.inject('sidebar.quickstart', ...)` 注册，因此无论本行在声明该洞的侧栏外壳之前还是之后激活都能安装，并随该声明一起撤回。每个 application 动作还以同样方式多注册两处：一条键为 `quickstart-app:<id>` 的 `main` 键控条目，它就是面板；以及一条 `sidebar.panellist` 条目，为它提供导航行。

打开工作区是异步到达其会话的，因此没有空白会话可落地的 prompt 按下会先记下指令，交给会话列表订阅投递——这正是 [`ui-agent-preset`](../ui-agent-preset/README.zh.md) 把预设选择送进它所组合的会话时使用的形态。这份暂存记下按下时所在的会话，因此连接过程在会话到达前发布的列表变化不会把它消耗掉；它只被第一个不同的当前会话花掉，而带历史的会话会结束这次启动而不是接收文本。

application 按下会把该动作的 `id` POST 到 `/api/quickstart.launch`。这条路由是 Connection 共享 `/api` 通道上的一条 Fetch 路由，而不是 `webServer` 路由：桌面端宿主只把 `/api` 请求转发给宿主进程，因此裸的 `webServer` 路由会在 Web 面可用、在桌面端应答 405。该通道的信任与鉴权由物理承载方负责，而请求只报出动作名——命令始终是部署自己的配置。随后 [`src/app-launch.ts`](src/app-launch.ts) 探测 `url`，在无人应答时以分离方式启动已配置命令，并等待页面。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当开工按钮不够用时阅读以下页面。它们从本包填充的座位进入声明它的外壳，以及按下按钮所驱动的流程。

- [ui-sidebar](../ui-sidebar/README.zh.md)——声明 `sidebar.quickstart` 与 `sidebar.panellist`，并在「新建会话」下方渲染两者。
- [ui-layout](../ui-layout/README.zh.md)——声明 application 面板占用的 `main` 键控槽，以及按下时使用的 `ctx.layout.selectPanel`。
- [ui-workspace](../ui-workspace/README.zh.md)——prompt 按下启动的「新建会话」流程。
- [ui-conversation](../ui-conversation/README.zh.md)——写入该指令的按会话输入框。
- [ui-agent-preset](../ui-agent-preset/README.zh.md)——同样的「先暂存再落地」形态，承载的是预设选择而非指令。
- [client-connection](../connection/README.zh.md)——承载该启动路由的共享 `/api` 通道。

-----

<a id="model-experience"></a>
## 模型体验

间接，经由 prompt 按下写入的输入框草稿：只有用户发送后，这条指令才作为一条普通用户消息进入模型；application 按下不触及任何模型输入。

#### KV Cache 影响

加载和按下时都没有影响。该会话的首次请求把指令作为第一条用户消息携带，与手动输入完全一致。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了当前座位。它们是当前包约束，不是启动器方案对比或任务积压。

- **标签不做本地化**——动作的 `label` 属于部署配置，同一个字符串服务所有界面语言；本包自己的词典只承载面板文案。
- **prompt 按下会替换空白会话的草稿**——动作指令会整体成为草稿，因此该空白会话里已经输入的文字会丢失。本座位的用途就是让会话以一条指令开局，合并会留下含义不明的开场。
- **没有工作区时 prompt 按下会等待**——当侧栏的「新建会话」清空到无会话视图（该部署没有任何工作区）时，暂存会保留到下一个空白会话成为当前会话，也就是用户之后打开的那个会话。
- **被启动的应用继承本进程的环境**——子进程带着环境启动，因此宿主启动时带的任何凭据对它可见。清洗需要 `dsh-subprocess` 的 `scrubbedParentEnv`，而依赖策略把它的跨安装分类保留给人工评审；在该边缘被分类之前，部署自己的命令就是信任边界。
- **被嵌入的页面必须允许被框入，且不携带会话身份**——该面板是 harness 文档里一个普通的跨源 frame：拒绝被框入的页面无法嵌入，页面也读不到 harness 会话。只有 harness 读取配置里的页面 URL。
- **就绪以页面应答为准，而不是应用真的可用**——`url` 上任何 HTTP 应答都算数，因此端口上的错误服务也能满足这次按下，页面在自身数据加载完之前先应答也会提前满足。等待由 `launchReadyMs` 限定；到点不会终止已启动的应用。
- **每个浏览器、每个动作同时只有一次启动在飞**——并发的按下共用同一次尝试，宿主也按动作 id 跟踪自己的在飞尝试；第二个 harness 窗口按下同一动作会再起一个进程，因为没有任何共享记录写着「正在启动」。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

两种形态、`/api` 通道的选择、面板以 `main` 键控条目注册，以及被否决的备选方案，记录在 [application-launch Agent Note](../../../.agents/notes/implemented/feature/2026-09-18-sidebar-application-launch.zh.md)；prompt 形态记录在 [quick-start Agent Note](../../../.agents/notes/implemented/feature/2026-09-16-sidebar-quick-start-actions.zh.md)。

</details>

**运行时不变式：** 不发布伴生入口。本座位持有一个注册和一个列表订阅，每个 application 动作各持有自己的面板、导航行与一个共享 store——全部通过插件 fiber 安装，并随它一起移除。
