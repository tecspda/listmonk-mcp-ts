# Docker Setup

This page covers two Docker paths:

- **Local Listmonk stack** (includes PostgreSQL) — use the file `docs/listmonk-docker-compose.yml`.
- **External Listmonk API** (no local Listmonk/PostgreSQL required) — see [Docker with External Listmonk](./external-listmonk-compose.md).

## Local Listmonk Setup

1. **Use the provided Docker Compose file (`docs/listmonk-docker-compose.yml`):**
   ```bash
   # Copy the compose file to your desired location
   cp docs/listmonk-docker-compose.yml docker-compose.yml
   ```

2. **Start Listmonk:**
   ```bash
   docker-compose up -d
   ```

3. **Access Listmonk:**
   - Open http://localhost:9000
   - Follow the setup wizard
   - Create an admin user
   - Go to Settings → Users to create API credentials

## Docker Compose Configuration (Local Stack)

The provided configuration includes:

- **Listmonk**: Newsletter management application
- **PostgreSQL**: Database backend
- **Persistent volumes**: For data retention
- **Environment variables**: Pre-configured for development

## API Setup

After Listmonk is running:

1. Access the admin panel at http://localhost:9000
2. Go to Settings → Users
3. Create a new API user with appropriate permissions
4. Generate an API token
5. Use these credentials in your MCP configuration

## Production Considerations

For production deployment:

- Change default passwords
- Use proper SSL certificates  
- Configure proper backup strategies
- Review security settings
- Use environment-specific configuration files
