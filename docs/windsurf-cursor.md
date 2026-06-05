# Windsurf & Cursor Setup

Add the Listmonk MCP server to Windsurf or Cursor IDEs.

## Windsurf Configuration

Add to your Windsurf MCP settings:

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

## Cursor Configuration

Add to your Cursor MCP settings:

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

3. **Restart your IDE** after adding configuration
