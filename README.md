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
- `-v, --version` — print server version

## Templates from file

For large HTML bodies (e.g. MJML-exported emails), passing the body inline through an
LLM tool call is error-prone. Two tools read the body straight from a local file:

- `create_template_from_file` — `{ name, file_path, type, subject?, is_default? }`
- `update_template_from_file` — `{ template_id, file_path, name?, subject?, is_default? }`

The file at `file_path` is read as UTF-8 and used verbatim as the template body, so the
stored template is byte-identical to the source file (no transcription drift). `subject`
is required for `tx` (transactional) templates.

File tools (these two and `upload_media_file`) only read files inside
`LISTMONK_MCP_FILES_DIR` and are disabled when it is not set. This keeps a prompt
injection in Listmonk data from making the agent read `~/.ssh` or `.env` and mail it out.

## MCP configuration example

Via `bunx` (requires [Bun](https://bun.sh)):

```json
{
  "command": "bunx",
  "args": ["listmonk-mcp-ts"],
  "env": {
    "LISTMONK_MCP_URL": "http://localhost:9000",
    "LISTMONK_MCP_USERNAME": "admin",
    "LISTMONK_MCP_PASSWORD": "token"
  }
}
```

From a local checkout:

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
- `LISTMONK_MCP_MAX_RETRIES` — number of retry attempts for network errors (GET requests only)
- `LISTMONK_MCP_FILES_DIR` — directory the file tools may read from (file tools are disabled without it)

### Alternative language

- Russian: [README.ru.md](./README.ru.md)
