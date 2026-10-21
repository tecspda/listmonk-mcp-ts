# Listmonk MCP Server

![Listmonk MCP Server](listmonk-mcp.jpg)

An MCP (Model Context Protocol) server for Listmonk, providing programmatic access to newsletter management through AI assistants and IDEs.

## Features

- Bun-native MCP server for Listmonk with a zero-config, stdio-first runtime profile
- End-to-end subscriber lifecycle support: create, list/search, update, status changes, and remove
- Mailing list administration with bulk operations, membership introspection, and tag-aware workflows
- Campaign lifecycle from draft to send: query, preview, create, edit, schedule, and execute
- Template management for both campaign and transactional content with preview rendering
- Transactional email dispatching with runtime template data injection
- Campaign content manipulation helpers (search/replace, regex, batch replacements) for automated copy updates
- Media asset management for files used in campaign/template bodies
- Built-in Listmonk health checks and consistent tool-level error reporting

## Quick Start

1. **Install the server:**
   ```bash
   git clone https://github.com/tecspda/listmonk-mcp-ts.git
   cd listmonk-mcp-ts
   ```

2. **Create API credentials in Listmonk:**
   - Go to Listmonk Admin → Users
   - Create a new API user and token

3. **Choose your setup:**
   - [Claude Desktop](./claude-desktop.md) - Claude Desktop app configuration
   - [VS Code](./vscode.md) - VS Code MCP settings  
   - [Cline](./cline.md) - Cline extension configuration
   - [Windsurf & Cursor](./windsurf-cursor.md) - Windsurf and Cursor IDE setup

## Configuration

All setups use the same basic configuration format:

```json
{
  "command": "bun",
  "args": ["run", "src/index.ts"],
    "cwd": "/path/to/listmonk-mcp-ts",
  "env": {
    "LISTMONK_MCP_URL": "http://localhost:9000",
    "LISTMONK_MCP_USERNAME": "your-api-username", 
    "LISTMONK_MCP_PASSWORD": "your-api-token"
  }
}
```

## API Coverage

The MCP server implements 40 MCP tools, covering the most used Listmonk workflows:

- **Health and diagnostics**: `check_listmonk_health` validates base connectivity and API availability before other operations.
- **Subscribers**: `add_subscriber`, `update_subscriber`, `remove_subscriber`, `change_subscriber_status`, `list_subscribers`, `get_subscriber_by_id`, `get_subscriber_by_email` for create/read/update/delete, status transitions, search, and lookups by ID or email.
- **Mailing lists**: `get_mailing_lists`, `create_mailing_list`, `update_mailing_list`, `delete_mailing_list`, `get_list_subscribers_tool`, `get_list_by_id` provide list CRUD and subscriber membership introspection.
- **Campaigns**: `get_campaigns`, `get_campaign`, `get_campaign_preview`, `create_campaign`, `update_campaign`, `send_campaign`, `schedule_campaign` for campaign authoring, retrieval, previewing, sending, and scheduling.
- **Templates**: `get_templates`, `get_template`, `create_template`, `update_template`, `create_template_from_file`, `update_template_from_file`, `delete_template` cover template list/get/update workflows and preview rendering.
- **Transactional email**: `send_transactional_email` sends one-off transactional messages through a Listmonk template with dynamic data.
- **Media assets**: `get_media_list`, `upload_media_file`, `rename_media`, `delete_media_file` manage image/file assets used in campaigns and templates.
- **Campaign content editing helpers**: `replace_in_campaign_body`, `regex_replace_in_campaign_body`, `batch_replace_in_campaign_body` provide body-level text transforms for quick content automation and localization workflows.
