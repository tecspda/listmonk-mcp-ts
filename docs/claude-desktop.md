# Claude Desktop Setup

1. Install [Bun](https://bun.sh) 1.1 or newer: `curl -fsSL https://bun.sh/install | bash`.
2. Create an API user in Listmonk (*Users* → new user of type *API*) and copy its token.
3. Open the Claude Desktop config file (*Settings* → *Developer* → *Edit Config*):
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
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

5. Restart Claude Desktop.

If Claude Desktop cannot find `bunx`, use the full path from `which bunx` (for example `/Users/you/.bun/bin/bunx`) as `command`.

`LISTMONK_MCP_FILES_DIR` is optional: without it the file tools are disabled. All variables are described in the [main README](../README.md#configuration).
