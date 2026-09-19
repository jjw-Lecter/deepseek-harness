---
description: "Web 侧边栏的 DeepSeek 账户余额：宿主按已配置的凭据读取服务商余额接口，并在侧边栏品牌行按时刷新与点击刷新显示凭据还能花掉的金额。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-deepseek-balance

[English](README.md) | 中文

## 概述

本包把 DeepSeek 账户余额放到 Web 侧边栏的品牌旁。node 半部用部署配置的凭据读取 `GET {baseURL}/user/balance`，浏览器半部显示金额，并按固定节奏与每次点击重新读取。这个数字决定会话是否还能调用 API，因此读取失败时保留上一次的金额并加标记，而不是清空。除金额外没有任何账户信息进入页面：凭据始终留在宿主进程内。

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

在 Web 组合中挂载本包，并指向该部署计费所用的凭据：

```yaml
- id: ui-deepseek-balance
  name: '@deepseek-ai/dsh-client-ui-deepseek-balance'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
    baseURL: https://api.deepseek.com
    timeoutMs: 10000
```

### 何时选用

当部署使用的 DeepSeek Key 的剩余额度是用户关心的事实时选用它——共享或计量的 Key、按账户计费的网关。会话以其他方式鉴权时不必选用：没有余额接口的 Key 或环境 OAuth 身份只会让该单元报告凭据未配置。该单元只读；消费策略、预算与告警属于服务商自己的账户控制台。

### 配置

| 字段 | 默认值 | 含义 |
|---|---|---|
| `apiKeyEnv` | `DEEPSEEK_API_KEY` | 宿主每次读取时解析的凭据引用。 |
| `baseURL` | `https://api.deepseek.com` | 余额接口所挂载的服务商根地址。 |
| `timeoutMs` | `10000` | 单次服务商读取的截止时间。 |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-client-ui-deepseek-balance)是全部可接受字段的完整来源。

### 凭据

本插件声明 `connection` 与 `credentials`，并在每次读取时通过 `ctx.credentials.resolve` 解析一次 `apiKeyEnv`——这与 DeepSeek 提供方调用的是同一个方法，针对的是 Models 页面写入的同一个引用。本地凭据提供方本身已分层合并进程环境、调用目录的 `.env`、Harness home 的 `.env` 与托管存储，因此导出的 Key 不需要第二条配置途径。解析按每次读取进行，因此启动后才存入的 Key 无需重启插件即可在下次刷新生效。Key 缺失或为空不是该行的失败：该单元报告配置缺失，下一次读取会接住这个 Key。没有挂载凭据提供方的组合永远不会激活这一行。

### 单元显示什么

该单元是一个按钮，显示服务商给出的十进制字符串金额及其货币符号（`¥110.00`、`$12.50`；未知货币代码保留自身写法）。按下即重新读取。账户已不足以继续调用 API（警告）或上次读取失败（错误）时，金额旁会出现状态圆点；提示气泡说明金额构成、读取时间、失败原因及宿主给出的细节，以及按下即可刷新。

页面打开期间浏览器每 60 秒重新读取一次。刷新失败时保留上一次的金额及其时间，因此服务商或网络的瞬时故障不会隐藏用户正在关注的数字。

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包同时具有两个面。node 半部（[`src/index.ts`](src/index.ts)）在 Connection 共享的 `/api` 通道上注册一条精确 Fetch 路由 `GET /api/deepseek.balance`；浏览器半部（[`src/client/index.ts`](src/client/index.ts)）向侧边栏的 `sidebar.brand.status` 席位注册一个单元并读取该路由。这条路由是通道路由而非 `webServer` 路由，因为桌面宿主只把 `/api` 请求转发给宿主进程，并且由物理载体负责该通道的信任与鉴权——请求本身不带任何参数，因此凭据与端点始终来自本部署自己的配置。

[`src/balance.ts`](src/balance.ts) 执行一次读取：它访问 `{baseURL}/user/balance`，以 bearer token 出示 Key，用 `timeoutMs` 限定整次读取，并把每种应答映射到五个失败判别值之一。金额保持服务商给出的十进制字符串，因为本包只负责显示。调用方的中止会继续向上传播而不是变成失败，因此页面关闭不会留下未完成的服务商读取。

[`src/wire.ts`](src/wire.ts) 是两面共同约定的唯一载荷，且由浏览器校验：无法解析的主体、被截断的应答或另行构建的宿主都不会带来猜测出来的余额。[`src/client/controller.ts`](src/client/controller.ts) 持有刷新节奏并通过注入的 `hooks` 隔间发布状态，因此该单元经由渲染器的 `useBalance` 钩子订阅，自身不携带任何订阅机制。[`src/client/DeepSeekBalanceBadge.tsx`](src/client/DeepSeekBalanceBadge.tsx) 只是该状态与本包 locale 字典的纯函数。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-sidebar](../ui-sidebar/README.zh.md) —— 声明 `sidebar.brand.status` 并在展开的品牌行中渲染它。
- [client-connection](../connection/README.zh.md) —— 承载余额路由的共享 `/api` 通道。
- [llm-deepseek](../../llm/llm-deepseek/README.zh.md) —— 本包沿用的凭据与端点约定的提供方。
- [session-log-export](../../session-query/session-log-export/README.zh.md) —— 相同的双面包形式：一条宿主路由加上读取它的浏览器控件。
- [ui-open-in-app](../ui-open-in-app/README.zh.md) —— 另一个由宿主支撑的侧边栏／标题栏单元，自带宿主路由与浏览器控制器。

-----

<a id="model-experience"></a>
## 模型体验

无；该单元读取服务商的账户接口并在侧边栏品牌旁渲染，金额从不进入提示词、工具 schema 或会话事件。

#### KV Cache 影响

无。该包不新增任何模型请求或模型可见文本：它的读取是对服务商账户接口的鉴权 HTTP 调用。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

这些限制界定了当前单元。它们是当前的包约束，不是服务商横向对比。

- **刷新节奏是产品常量** —— 浏览器每 60 秒重新读取，而 `dsh.client` 行的 `config` 只到达 Node 半，因此部署不改源码就无法调整它。
- **该单元只在展开的品牌行中渲染** —— 56px 的收起轨道放不下货币金额，因此侧边栏收起时完全看不到余额。
- **服务商根地址来自本行配置** —— 本包不读取 `$DEEPSEEK_BASE_URL`，因此提供方路由指向网关的部署要在本行的 `baseURL` 上写出同一个根地址。
- **只有凭据引用与服务商根地址可配置** —— 余额接口位于其他路径、或需要额外请求头的网关不受支持。
- **只显示一种货币** —— 单元及其提示气泡呈现服务商给出的第一条记录；报告多种货币的账户只能通过服务商自己的控制台查看其余金额。
- **过期金额仍会保留在屏幕上** —— 读取失败后胶囊保留上次成功的金额并带错误标记，因此屏幕上的数字可能早于提示气泡所指出的失败。
- **该数字按凭据而非按会话** —— 共用同一个 Key 的两个部署显示相同余额，且没有任何信息把花费归属到某个会话。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

该席位、路由、失败分类、保留过期金额的决策以及被否决的备选方案记录在 [DeepSeek 余额 Agent Note](../../../.agents/notes/implemented/feature/2026-09-18-sidebar-deepseek-balance.zh.md)。

</details>

**运行时不变式：** 不发布伴随包。本包持有一条路由注册与一个单元注册，二者都通过插件 fiber 安装；控制器的刷新节奏与在途读取由同一 fiber 的 disposer 移除，而规格直接断言注册、卸载与已发布状态。
