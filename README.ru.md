# Listmonk MCP Server (Bun)

![Listmonk MCP Server](docs/listmonk-mcp.jpg)

TypeScript-реализация MCP-сервера для Listmonk на Bun.

## Установка

```bash
cd /path/to/listmonk-mcp-ts
bun install
cp .env.example .env
```

## Запуск

```bash
bun run start
```

Можно указать отдельный env-файл:

```bash
bun run start -- --config /path/to/.env
```

Параметры CLI:
- `-c, --config` — путь к env-файлу
- `-d, --debug` — включить debug-режим
- `-v, --version` — вывести версию сервера

## Пример конфигурации MCP

```json
{
  "command": "bun",
  "args": ["run", "src/index.ts"],
  "cwd": "/path/to/listmonk-mcp-ts",
  "env": {
    "LISTMONK_MCP_URL": "http://localhost:9000",
    "LISTMONK_MCP_USERNAME": "admin",
    "LISTMONK_MCP_PASSWORD": "token"
  }
}
```

## Переменные окружения

- `LISTMONK_MCP_URL` — базовый URL Listmonk (обязательно)
- `LISTMONK_MCP_USERNAME` — имя API-пользователя (обязательно)
- `LISTMONK_MCP_PASSWORD` — API-токен (обязательно)
- `LISTMONK_MCP_TIMEOUT` — таймаут HTTP в секундах
- `LISTMONK_MCP_MAX_RETRIES` — количество повторов при сетевых ошибках
- `LISTMONK_MCP_DEBUG` — включить отладку (`true`/`false`)
- `LISTMONK_MCP_LOG_LEVEL` — уровень логирования
