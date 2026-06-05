# Listmonk MCP Server (Bun)

![Listmonk MCP Server](docs/listmonk-mcp.jpg)

TypeScript implementation of a Listmonk MCP server powered by Bun.

## Installation

```bash
cd /path/to/listmonk-mcp-ts
bun install
cp .env.example .env
```

## Run

```bash
bun run start
```

You can pass a specific env file:

```bash
bun run start -- --config /path/to/.env
```

CLI options:
- `-c, --config` — path to an env file
- `-d, --debug` — enable debug mode
- `-v, --version` — print server version

## MCP configuration example

```json
{
  "command": "bun",
  "args": ["run", "src/index.ts"],
  "cwd": "/path/to/listmonk-mcp-ts",
  "env": {
    "LISTMONK_MCP_URL": "http://localhost:9000",
    "LISTMONK_MCP_USERNAME": "admin",
    "LISTMONK_MCP_PASSWORD": "token"
  }
}
```

## Environment variables

- `LISTMONK_MCP_URL` — Listmonk base URL (required)
- `LISTMONK_MCP_USERNAME` — API username (required)
- `LISTMONK_MCP_PASSWORD` — API token (required)
- `LISTMONK_MCP_TIMEOUT` — HTTP timeout in seconds
- `LISTMONK_MCP_MAX_RETRIES` — number of retry attempts for network errors
- `LISTMONK_MCP_DEBUG` — enable debug mode (`true`/`false`)
- `LISTMONK_MCP_LOG_LEVEL` — log level

### Alternative language

- Russian: [README.ru.md](./README.ru.md)
