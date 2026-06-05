# Cline Setup

Add the Listmonk MCP server to Cline extension in VS Code.

## Configuration

1. Install [Cline extension](https://marketplace.visualstudio.com/items?itemName=saoudrizwan.claude-dev) in VS Code
2. Open Cline settings
3. Add MCP server configuration:

```json
{
  "mcpServers": {
    "listmonk": {
      "command": "bun",
      "args": ["run", "src/index.ts"],
      "env": {
        "LISTMONK_MCP_URL": "http://localhost:9000",
        "LISTMONK_MCP_USERNAME": "your-api-username",
        "LISTMONK_MCP_PASSWORD": "your-api-token"
      }
    }
  }
}
```

## Environment Variables

- `LISTMONK_MCP_URL`: Your Listmonk server URL
- `LISTMONK_MCP_USERNAME`: API user created in Admin → Users
- `LISTMONK_MCP_PASSWORD`: API token (not user password)

## Prerequisites

1. **Install Bun**:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Create API user and token** in Listmonk admin interface:
   - Go to Admin → Users in your Listmonk instance
   - Create a new API user and token

3. **Restart VS Code** after adding configuration
