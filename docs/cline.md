# Cline Setup

1. Install [Bun](https://bun.sh) 1.1 or newer: `curl -fsSL https://bun.sh/install | bash`.
2. Create an API user in Listmonk (*Users* → new user of type *API*) and copy its token.
3. In VS Code, open the [Cline](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) panel, click *MCP Servers* → *Configure*. This opens `cline_mcp_settings.json`.
4. Add the server:

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

5. Save the file. Cline restarts the server on its own.

Do not add `send_campaign`, `schedule_campaign` or `send_transactional_email` to Cline's auto-approve list: they send real email.

`LISTMONK_MCP_FILES_DIR` is optional: without it the file tools are disabled. All variables are described in the [main README](../README.md#configuration).
