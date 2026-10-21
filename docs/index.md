# Listmonk MCP Server

An MCP (Model Context Protocol) server for Listmonk, providing programmatic access to newsletter management through AI assistants and IDEs.

## Features

- Complete Listmonk API integration with async operations
- Subscriber management (CRUD with query/pagination support)
- List management with tags support
- Campaign creation, management, and sending
- Template management for campaigns and transactional messages
- Transactional email sending with template data
- Type-safe operations with Pydantic models

## Installation

### Using Bun (Recommended)

Install and run from repository with Bun:

```bash
# Install dependencies
bun install

# Run
bun run start
```

## Quick Start

1. **Install dependencies and run using Bun:**
   ```bash
   bun install
   bun run start
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

## What is MCP?

The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely connect to external data sources and tools. This server implements MCP to provide AI assistants with direct access to Listmonk's newsletter management capabilities.

## Requirements

- Bun
- Running Listmonk instance
- API credentials from Listmonk admin panel

---

📚 **Documentation built with MkDocs Material**
