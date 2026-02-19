# MyRouter

Local LLM gateway that exposes Anthropic Messages API and forwards to an upstream that speaks OpenAI Chat Completions.

Designed for: using a single local endpoint to power tools like Claude Code / OpenAI-compatible clients, while keeping model allowlists and upstream credentials on your machine.

## Features

- Anthropic Messages API: `POST /v1/messages`
- Model allowlist (by group): request `model` must be allowed
- Tools mapping: Anthropic `tools`/`tool_use`/`tool_result` -> OpenAI `tools`/`tool_calls`/`tool` role
- Streaming: OpenAI SSE -> Anthropic event-stream (when upstream supports `stream:true`)
- Built-in UI (sidebar): docs + test helper
- Double-click launcher on Windows: auto-install deps (first run) and open Admin UI

## Quick Start (Windows)

1) Install Node.js (v20+ recommended; v22 tested)

2) Double-click `Start-MyRouter.cmd`

- It starts the gateway in background and opens `http://127.0.0.1:8787/admin`
- Configure `config.runtime.json` manually (see below)

Stop:

```powershell
scripts\stop.ps1
```

Logs:

- `gateway.out.log`
- `gateway.err.log`

### Pretty icon (Windows shortcut)

Windows `.cmd` files can't have a real icon. To get a nice icon, create a Desktop shortcut:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install_shortcut.ps1 -Name "MyRouter"
```

Optionally set your own `.ico`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install_shortcut.ps1 -Name "MyRouter" -IconPath "C:\\path\\to\\icon.ico"
```

## Run (Manual)

Install deps:

```bash
npm install
```

Run:

```bash
npm run start
```

Default listen:

- `LISTEN_HOST=127.0.0.1`
- `LISTEN_PORT=8787`

## Configuration

MyRouter supports 3 sources (highest priority first):

1) Environment variables (locks the field)
2) Runtime config file: `config.runtime.json`
3) Defaults

Runtime config file path:

- default: `config.runtime.json` (project root)
- override: `RUNTIME_CONFIG_PATH=...`

Example config: `config.runtime.example.json`

## Adding GPT/Codex models

MyRouter uses an allowlist: it only checks that the requested `model` is allowed.
If your upstream also supports GPT/Codex-style model ids, add them in `/admin` -> Allowed Models.

Tip: the UI has a button to append a common GPT/Codex preset list.

### Environment Variables

```text
LISTEN_HOST=127.0.0.1
LISTEN_PORT=8787

UPSTREAM_BASE_URL=http://152.53.52.170:3003
UPSTREAM_API_KEY=sk-...

LOCAL_API_KEYS=local-key-1,local-key-2

ALLOWED_MODELS=claude-sonnet-4-5-20250929,claude-sonnet-4-5-20250929-thinking
REQUEST_TIMEOUT_MS=60000
DISABLE_STREAMING=true
```

## Authentication

- Local key (protects `/v1/messages`, `/v1/models`)
  - `x-api-key: <key>` or `Authorization: Bearer <key>`

## Endpoints

- `GET /healthz`
- `GET /v1/models`
- `POST /v1/messages` (Anthropic Messages API)

UI:

- `GET /admin` (UI)

Docs:

- `GET /docs` (served, also shown inside `/admin` sidebar)

## Example Request (PowerShell)

```powershell
$body = @{
  model = "claude-sonnet-4-5-20250929-thinking"
  max_tokens = 64
  messages = @(
    @{
      role = "user"
      content = @(
        @{ type = "text"; text = "say ok" }
      )
    }
  )
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:8787/v1/messages" `
  -Headers @{ "x-api-key" = "local-key-1" } `
  -ContentType "application/json" `
  -Body $body
```

## 14. Codex / Responses 接入（MyRouter）

为了兼容新版 Codex CLI（优先走 `/v1/responses`），MyRouter 现支持两种路由模式：

- `responses_passthrough`：`POST /v1/responses` 直通上游 `POST /v1/responses`（推荐）
- `responses_via_chat_adapter`：把 Responses 请求适配成 ChatCompletions 再转发（仅兜底）

### 推荐配置（优先）

当上游已支持 `/v1/responses` 时，使用直通模式。

- 本地入口：`http://127.0.0.1:8787/v1/responses`
- 本地鉴权：`Authorization: Bearer <LOCAL_API_KEY>` 或 `x-api-key: <LOCAL_API_KEY>`
- 上游入口（网关内部）：`{UPSTREAM_BASE_URL}/v1/responses`

### Codex 客户端如何填写

在 Codex / OpenAI 兼容客户端中：

- Base URL：`http://127.0.0.1:8787/v1`
- API Key：`<LOCAL_API_KEY>`（不是上游 key）
- Model：需在 `Allowed Models` 白名单内（例如 `gpt-5.2-codex`）

### 请求形态说明

Codex 常用的是 Responses API 形态（包含 `input`）：

- `model`: 字符串
- `input`: 消息数组（`type=message`，内容块常见 `type=input_text`）
- `stream`: 建议开启 `true`
- `tools`: 可选，函数工具定义

### 排查要点（重点）

若出现 `field messages is required`，通常表示请求被错误转发到 chat 形态且 `messages` 为空。请检查：

- 请求路径是否误走了 `/v1/chat/completions`
- 运行进程是否为最新版本（避免旧进程“版本漂移”）
- 调试日志中的：
  - `upstream.request.url`
  - `routeMode`
  - `mappedMessageCount`（仅 adapter 模式）

### 建议的运维策略

- 默认使用 `responses_passthrough`
- 仅在上游异常时临时切 `responses_via_chat_adapter`
- 保留调试字段一段时间，便于快速定位路由/映射问题

## Open Source

MIT licensed. See `LICENSE`.

## Security Notes

- Keep the gateway bound to `127.0.0.1`.
- Do not commit `config.runtime.json`.
- Do not paste upstream keys into issues.
