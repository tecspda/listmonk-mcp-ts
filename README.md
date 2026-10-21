# Listmonk MCP Server

![Listmonk MCP Server](docs/listmonk-mcp.jpg)

An [MCP](https://modelcontextprotocol.io) server for [Listmonk](https://listmonk.app), the self-hosted newsletter and mailing list manager. It lets AI agents (Claude Code, Claude Desktop, Cursor, Cline, VS Code and others) manage subscribers, mailing lists, campaigns, templates and media, and send transactional email through your Listmonk instance.

TypeScript port of [rhnvrm/listmonk-mcp](https://github.com/rhnvrm/listmonk-mcp) by Rohan Verma, extended with file-based templates, campaign body editing and hardened file access.

Written in TypeScript, runs on [Bun](https://bun.sh).

[Русская версия](./README.ru.md)

## Features

- **Subscribers:** add, update, delete, change status, search with Listmonk SQL queries, look up by ID or email.
- **Mailing lists:** create, update, delete, list, list members.
- **Campaigns:** create, update, preview, send now, schedule. Edit the body with plain-text, regex and batch replace.
- **Templates:** create, update, delete, read. Large HTML bodies (for example MJML exports) can be loaded straight from a file.
- **Transactional email:** send a `tx` template to one recipient with custom data.
- **Media:** upload, rename, delete, list.

## Requirements

- [Bun](https://bun.sh) 1.1 or newer.
- Listmonk with an **API user**. In the Listmonk admin, open *Users*, create a user of type *API* and copy its token. Give it a role with only the permissions the agent needs.

## Quick start

### Claude Code

```bash
claude mcp add --transport stdio --scope user \
  --env LISTMONK_MCP_URL=https://listmonk.example.com \
  --env LISTMONK_MCP_USERNAME=api_user \
  --env LISTMONK_MCP_PASSWORD=your-api-token \
  listmonk -- bunx listmonk-mcp-ts
```

### Claude Desktop, Cursor, Cline and other clients

Add the server to the client's MCP config (`mcpServers` section):

```json
{
  "mcpServers": {
    "listmonk": {
      "command": "bunx",
      "args": ["listmonk-mcp-ts"],
      "env": {
        "LISTMONK_MCP_URL": "https://listmonk.example.com",
        "LISTMONK_MCP_USERNAME": "api_user",
        "LISTMONK_MCP_PASSWORD": "your-api-token",
        "LISTMONK_MCP_FILES_DIR": "/path/to/email-templates"
      }
    }
  }
}
```

Where the config file lives for each client: [Claude Desktop](docs/claude-desktop.md), [Cursor and Windsurf](docs/windsurf-cursor.md), [Cline](docs/cline.md), [VS Code](docs/vscode.md).

The server is started by the client when a session opens and stops with it. You do not need to keep it running.

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `LISTMONK_MCP_URL` | yes | | Listmonk base URL, `http://` or `https://` |
| `LISTMONK_MCP_USERNAME` | yes | | API user name |
| `LISTMONK_MCP_PASSWORD` | yes | | API user token |
| `LISTMONK_MCP_FILES_DIR` | no | | Directory the file tools may read from. File tools are disabled when it is not set |
| `LISTMONK_MCP_TIMEOUT` | no | `30` | HTTP timeout, seconds |
| `LISTMONK_MCP_MAX_RETRIES` | no | `3` | Retries on network errors. Only GET requests are retried |
| `LISTMONK_MCP_SERVER_NAME` | no | `Listmonk MCP Server` | Server name reported to the client |

Variables can also come from a `.env` file in the working directory, or from a file passed with `--config /path/to/.env`.

CLI options: `-c, --config <file>` loads an env file, `-v, --version` prints the version.

## Tools

| Area | Tools |
|---|---|
| Health | `check_listmonk_health` |
| Subscribers | `add_subscriber`, `update_subscriber`, `remove_subscriber`, `change_subscriber_status`, `list_subscribers`, `get_subscriber_by_id`, `get_subscriber_by_email` |
| Mailing lists | `get_mailing_lists`, `get_list_by_id`, `get_list_subscribers_tool`, `create_mailing_list`, `update_mailing_list`, `delete_mailing_list` |
| Campaigns | `get_campaigns`, `get_campaign`, `get_campaign_preview`, `create_campaign`, `update_campaign`, `send_campaign`, `schedule_campaign` |
| Campaign body | `replace_in_campaign_body`, `regex_replace_in_campaign_body`, `batch_replace_in_campaign_body` |
| Templates | `get_templates`, `get_template`, `create_template`, `update_template`, `create_template_from_file`, `update_template_from_file`, `delete_template` |
| Transactional | `send_transactional_email` |
| Media | `get_media_list`, `upload_media_file`, `rename_media`, `delete_media_file` |

### Templates from a file

Passing a large HTML body inline through a tool call is slow and the model can change it while copying. `create_template_from_file` and `update_template_from_file` read the body from a file instead, so the stored template matches the file byte for byte. `subject` is required for `tx` templates.

The file path can be absolute or relative to `LISTMONK_MCP_FILES_DIR`.

## Security

- **File access is limited to `LISTMONK_MCP_FILES_DIR`.** `create_template_from_file`, `update_template_from_file` and `upload_media_file` refuse any path outside it, symlinks included, and are disabled when it is not set. Subscriber names, campaign bodies and other data read from Listmonk may contain instructions written by strangers (prompt injection). Without this limit such text could make the agent read `~/.ssh` or `.env` and email it out.
- **Keep approval on for sending tools.** `send_campaign`, `schedule_campaign` and `send_transactional_email` send real email. Do not auto-approve them in your client.
- **Use a dedicated API user** with a role limited to what the agent needs, not an admin account.
- **Keep the token out of shared files.** If your MCP config is committed or synced, pass the token through the environment instead.

## Development

```bash
git clone https://github.com/tecspda/listmonk-mcp-ts.git
cd listmonk-mcp-ts
bun install
cp .env.example .env   # fill in your Listmonk details
bun run start          # run the server
bun run dev            # run with reload on change
bun run check          # type check
bun test               # tests
```

To run a local checkout from an MCP client, use `"command": "bun", "args": ["run", "/path/to/listmonk-mcp-ts/src/index.ts"]`.

Need a Listmonk instance for testing? See [Docker setup](docs/docker-setup.md).

## License

[MIT](LICENSE)
