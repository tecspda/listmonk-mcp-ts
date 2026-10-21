# VS Code Setup

For the built-in MCP support in VS Code (GitHub Copilot agent mode).

1. Install [Bun](https://bun.sh) 1.1 or newer: `curl -fsSL https://bun.sh/install | bash`.
2. Create an API user in Listmonk (*Users* → new user of type *API*) and copy its token.
3. Open the MCP config: `.vscode/mcp.json` for one project, or the command *MCP: Open User Configuration* for all projects.
4. Add the server. VS Code asks for the token once and keeps it in its secret storage, so the token is not written to the file:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "listmonk-token",
      "description": "Listmonk API token",
      "password": true
    }
  ],
  "servers": {
    "listmonk": {
      "type": "stdio",
      "command": "bunx",
      "args": ["listmonk-mcp-ts"],
      "env": {
        "LISTMONK_MCP_URL": "https://listmonk.example.com",
        "LISTMONK_MCP_USERNAME": "api_user",
        "LISTMONK_MCP_PASSWORD": "${input:listmonk-token}",
        "LISTMONK_MCP_FILES_DIR": "/path/to/email-templates"
      }
    }
  }
}
```

5. Start the server from the *Start* link above it in `mcp.json`, or from the tools list in Copilot Chat.

`LISTMONK_MCP_FILES_DIR` is optional: without it the file tools are disabled. All variables are described in the [main README](../README.md#configuration).
