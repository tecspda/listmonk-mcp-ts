# External Listmonk Compose Tutorial

If Listmonk is already running in another environment (remote VM, managed hosting, another Docker stack),
this server needs only API credentials and does **not** require PostgreSQL locally.

## 1) MCP against an existing Listmonk API

To use MCP with an external Listmonk instance, set these environment variables in your MCP client:

- `LISTMONK_MCP_URL` – base URL of Listmonk API
- `LISTMONK_MCP_USERNAME` – API user name
- `LISTMONK_MCP_PASSWORD` – API token

No `POSTGRES_*` variables are required in this mode.

```json
{
  "command": "bun",
  "args": ["run", "src/index.ts"],
  "cwd": "/path/to/listmonk-mcp-ts",
  "env": {
    "LISTMONK_MCP_URL": "https://listmonk.example.com",
    "LISTMONK_MCP_USERNAME": "api_user",
    "LISTMONK_MCP_PASSWORD": "api_token"
  }
}
```

## 2) Dockerized MCP for local development (optional)

If you prefer running MCP inside Docker while pointing to external Listmonk, use this compose template:

```yaml
services:
  listmonk-mcp:
    image: oven/bun:1-alpine
    container_name: listmonk-mcp-ts
    restart: unless-stopped
    working_dir: /app
    volumes:
      - .:/app:rw
    command: ["sh", "-lc", "bun install --frozen-lockfile && bun run src/index.ts"]
    environment:
      LISTMONK_MCP_URL: "https://listmonk.example.com"
      LISTMONK_MCP_USERNAME: "api_user"
      LISTMONK_MCP_PASSWORD: "api_token"
```

Run with:

```bash
docker compose up -d listmonk-mcp
```

Useful when:

- You need MCP runtime isolated inside containers.
- You already maintain credentials in `.env` and inject them via your deployment pipeline.

```dotenv
LISTMONK_MCP_URL=https://listmonk.example.com
LISTMONK_MCP_USERNAME=api_user
LISTMONK_MCP_PASSWORD=api_token
```
