# Cursor and Windsurf Setup

1. Install [Bun](https://bun.sh) 1.1 or newer: `curl -fsSL https://bun.sh/install | bash`.
2. Create an API user in Listmonk (*Users* → new user of type *API*) and copy its token.
3. Open the MCP config file:
   - **Cursor:** `~/.cursor/mcp.json` for all projects, or `.cursor/mcp.json` in a project.
   - **Windsurf:** `~/.codeium/windsurf/mcp_config.json`, or *Settings* → *Cascade* → *MCP Servers* → *View raw config*.
4. Add the server. The format is the same for both editors:

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

5. Reload the MCP servers in the editor settings, or restart the editor.

Do not put a project-level config with a real token into git. Use the global file for the token instead.

`LISTMONK_MCP_FILES_DIR` is optional: without it the file tools are disabled. All variables are described in the [main README](../README.md#configuration).
