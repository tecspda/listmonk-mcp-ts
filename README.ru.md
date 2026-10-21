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
- `-v, --version` — вывести версию сервера

## Шаблоны из файла

Большие HTML-тела (например, MJML-экспорт писем) ненадёжно передавать инлайном через
вызов инструмента LLM. Два инструмента читают тело прямо из локального файла:

- `create_template_from_file` — `{ name, file_path, type, subject?, is_default? }`
- `update_template_from_file` — `{ template_id, file_path, name?, subject?, is_default? }`

Файл по пути `file_path` читается как UTF-8 и используется как тело шаблона дословно —
сохранённый шаблон байт-в-байт совпадает с исходным файлом (без искажений при переносе).
Поле `subject` обязательно для `tx`-шаблонов (транзакционных).

Файловые инструменты (эти два и `upload_media_file`) читают файлы только внутри
`LISTMONK_MCP_FILES_DIR` и отключены, если переменная не задана. Так prompt injection
в данных Listmonk не заставит агента прочитать `~/.ssh` или `.env` и отправить их письмом.

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
- `LISTMONK_MCP_MAX_RETRIES` — количество повторов при сетевых ошибках (только для GET-запросов)
- `LISTMONK_MCP_FILES_DIR` — каталог, из которого файловые инструменты могут читать файлы (без него они отключены)
