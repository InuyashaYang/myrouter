# MyRouter

Local LLM gateway that exposes Anthropic Messages API and forwards to an upstream that speaks OpenAI Chat Completions.

Designed for: using a single local endpoint to power tools like Claude Code / OpenAI-compatible clients, while keeping model allowlists and upstream credentials on your machine.

## Features

- Anthropic Messages API: `POST /v1/messages`
- Model allowlist (by group): request `model` must be allowed
- Tools mapping: Anthropic `tools`/`tool_use`/`tool_result` -> OpenAI `tools`/`tool_calls`/`tool` role
- Streaming: OpenAI SSE -> Anthropic event-stream (when upstream supports `stream:true`)
- Built-in Admin UI (sidebar): configure upstream URL/key, local/admin keys, allowlist, timeout; test and docs inside
- Double-click launcher on Windows: auto-install deps (first run) and open Admin UI

## Quick Start (Windows)

1) Install Node.js (v20+ recommended; v22 tested)

2) Double-click `Start-MyRouter.cmd`

- It starts the gateway in background and opens `http://127.0.0.1:8787/admin`
- Configure `Upstream Base URL` + `Upstream API Key` in the UI and Save

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

1) Environment variables (locks the field; UI changes won't override)
2) Runtime config file: `config.runtime.json` (written by Admin UI)
3) Defaults

Runtime config file path:

- default: `config.runtime.json` (project root)
- override: `RUNTIME_CONFIG_PATH=...`

Example config: `config.runtime.example.json`

## Adding GPT/Codex models

MyRouter uses an allowlist: it only checks that the requested `model` is allowed.
If your upstream also supports GPT/Codex-style model ids, add them in `/admin` -> Allowed Models.

Tip: the Admin UI has a button to append a common GPT/Codex preset list.

### Environment Variables

```text
LISTEN_HOST=127.0.0.1
LISTEN_PORT=8787

UPSTREAM_BASE_URL=http://152.53.52.170:3003
UPSTREAM_API_KEY=sk-...

LOCAL_API_KEYS=local-key-1,local-key-2
ADMIN_API_KEYS=admin-key-1,admin-key-2

ALLOWED_MODELS=claude-sonnet-4-5-20250929,claude-sonnet-4-5-20250929-thinking
REQUEST_TIMEOUT_MS=60000
DISABLE_STREAMING=true
```

## Authentication

Two independent keys:

- Local key (protects `/v1/messages`, `/v1/models`)
  - `x-api-key: <key>` or `Authorization: Bearer <key>`
- Admin key (protects `/admin/config` and other `/admin/*` APIs)
  - `x-admin-key: <key>` or `Authorization: Bearer <key>`

Bootstrap mode:

- If no admin key is configured, the Admin UI is accessible from loopback only (when listening on `127.0.0.1`) so you can set it.

## Endpoints

- `GET /healthz`
- `GET /v1/models`
- `POST /v1/messages` (Anthropic Messages API)

Admin:

- `GET /admin` (UI)
- `GET /admin/config`
- `PUT /admin/config`

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

## Open Source

MIT licensed. See `LICENSE`.

## Security Notes

- Keep the gateway bound to `127.0.0.1`.
- Do not commit `config.runtime.json`.
- Do not paste upstream keys into issues.
