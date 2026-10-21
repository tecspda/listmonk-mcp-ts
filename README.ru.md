# Listmonk MCP Server

![Listmonk MCP Server](docs/listmonk-mcp.jpg)

[MCP](https://modelcontextprotocol.io)-сервер для [Listmonk](https://listmonk.app), self-hosted менеджера рассылок. Через него ИИ-агенты (Claude Code, Claude Desktop, Cursor, Cline, VS Code и другие) управляют подписчиками, списками, кампаниями, шаблонами и медиафайлами, а также отправляют транзакционные письма через ваш Listmonk.

TypeScript-порт [rhnvrm/listmonk-mcp](https://github.com/rhnvrm/listmonk-mcp) от Rohan Verma, дополненный шаблонами из файлов, правкой текста кампаний и защищённым доступом к файлам.

Написан на TypeScript, работает на [Bun](https://bun.sh).

[English version](./README.md)

## Возможности

- **Подписчики:** добавление, изменение, удаление, смена статуса, поиск по SQL-запросам Listmonk, поиск по ID или email.
- **Списки рассылки:** создание, изменение, удаление, просмотр, список участников.
- **Кампании:** создание, изменение, превью, отправка сразу или по расписанию. Правка текста кампании через обычную замену, регулярные выражения и пакетную замену.
- **Шаблоны:** создание, изменение, удаление, просмотр. Большие HTML-шаблоны (например, экспорт из MJML) можно загружать прямо из файла.
- **Транзакционные письма:** отправка `tx`-шаблона одному получателю со своими данными.
- **Медиафайлы:** загрузка, переименование, удаление, просмотр.

## Требования

- [Bun](https://bun.sh) версии 1.1 или новее.
- Listmonk с **API-пользователем**. В админке Listmonk откройте *Users*, создайте пользователя типа *API* и скопируйте его токен. Дайте ему роль только с теми правами, которые нужны агенту.

## Быстрый старт

Установка в один клик (после неё замените адрес, пользователя и токен-заглушки в MCP-настройках клиента):

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=listmonk&config=eyJjb21tYW5kIjoiYnVueCIsImFyZ3MiOlsibGlzdG1vbmstbWNwLXRzIl0sImVudiI6eyJMSVNUTU9OS19NQ1BfVVJMIjoiaHR0cHM6Ly9saXN0bW9uay5leGFtcGxlLmNvbSIsIkxJU1RNT05LX01DUF9VU0VSTkFNRSI6ImFwaV91c2VyIiwiTElTVE1PTktfTUNQX1BBU1NXT1JEIjoieW91ci1hcGktdG9rZW4ifX0%3D)
[![Install in VS Code](https://img.shields.io/badge/Install_in-VS_Code-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect/mcp/install?name=listmonk&config=%7B%22command%22%3A%22bunx%22%2C%22args%22%3A%5B%22listmonk-mcp-ts%22%5D%2C%22env%22%3A%7B%22LISTMONK_MCP_URL%22%3A%22https%3A//listmonk.example.com%22%2C%22LISTMONK_MCP_USERNAME%22%3A%22api_user%22%2C%22LISTMONK_MCP_PASSWORD%22%3A%22your-api-token%22%7D%7D)

### Claude Code

```bash
claude mcp add --transport stdio --scope user \
  --env LISTMONK_MCP_URL=https://listmonk.example.com \
  --env LISTMONK_MCP_USERNAME=api_user \
  --env LISTMONK_MCP_PASSWORD=your-api-token \
  listmonk -- bunx listmonk-mcp-ts
```

### Claude Desktop, Cursor, Cline и другие клиенты

Добавьте сервер в MCP-конфиг клиента (раздел `mcpServers`):

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

Где лежит конфиг у разных клиентов: [Claude Desktop](docs/claude-desktop.md), [Cursor и Windsurf](docs/windsurf-cursor.md), [Cline](docs/cline.md), [VS Code](docs/vscode.md).

Клиент сам запускает сервер при открытии сессии и останавливает при её закрытии. Держать его запущенным не нужно.

## Настройка

| Переменная | Обязательна | По умолчанию | Описание |
|---|---|---|---|
| `LISTMONK_MCP_URL` | да | | Адрес Listmonk, `http://` или `https://` |
| `LISTMONK_MCP_USERNAME` | да | | Имя API-пользователя |
| `LISTMONK_MCP_PASSWORD` | да | | Токен API-пользователя |
| `LISTMONK_MCP_FILES_DIR` | нет | | Каталог, из которого файловые инструменты могут читать файлы. Без него они отключены |
| `LISTMONK_MCP_TIMEOUT` | нет | `30` | Таймаут HTTP, в секундах |
| `LISTMONK_MCP_MAX_RETRIES` | нет | `3` | Число повторов при сетевых ошибках. Повторяются только GET-запросы |
| `LISTMONK_MCP_SERVER_NAME` | нет | `Listmonk MCP Server` | Имя сервера, которое видит клиент |

Переменные также можно задать в файле `.env` в рабочем каталоге или в файле, переданном через `--config /path/to/.env`.

Параметры командной строки: `-c, --config <файл>` загружает env-файл, `-v, --version` выводит версию.

## Инструменты

| Раздел | Инструменты |
|---|---|
| Проверка связи | `check_listmonk_health` |
| Подписчики | `add_subscriber`, `update_subscriber`, `remove_subscriber`, `change_subscriber_status`, `list_subscribers`, `get_subscriber_by_id`, `get_subscriber_by_email` |
| Списки рассылки | `get_mailing_lists`, `get_list_by_id`, `get_list_subscribers_tool`, `create_mailing_list`, `update_mailing_list`, `delete_mailing_list` |
| Кампании | `get_campaigns`, `get_campaign`, `get_campaign_preview`, `create_campaign`, `update_campaign`, `send_campaign`, `schedule_campaign` |
| Текст кампании | `replace_in_campaign_body`, `regex_replace_in_campaign_body`, `batch_replace_in_campaign_body` |
| Шаблоны | `get_templates`, `get_template`, `create_template`, `update_template`, `create_template_from_file`, `update_template_from_file`, `delete_template` |
| Транзакционные письма | `send_transactional_email` |
| Медиафайлы | `get_media_list`, `upload_media_file`, `rename_media`, `delete_media_file` |

### Шаблоны из файла

Передавать большой HTML через вызов инструмента долго, и модель может исказить его при копировании. `create_template_from_file` и `update_template_from_file` читают текст шаблона из файла, поэтому сохранённый шаблон байт в байт совпадает с файлом. Для `tx`-шаблонов поле `subject` обязательно.

Путь к файлу можно указать абсолютный или относительно `LISTMONK_MCP_FILES_DIR`.

## Безопасность

- **Доступ к файлам ограничен каталогом `LISTMONK_MCP_FILES_DIR`.** `create_template_from_file`, `update_template_from_file` и `upload_media_file` отклоняют любой путь вне этого каталога, в том числе через симлинки, и отключены, если переменная не задана. В именах подписчиков, текстах кампаний и других данных из Listmonk могут оказаться инструкции, написанные посторонними (prompt injection). Без ограничения такой текст мог бы заставить агента прочитать `~/.ssh` или `.env` и отправить их письмом.
- **Не отключайте подтверждение для отправляющих инструментов.** `send_campaign`, `schedule_campaign` и `send_transactional_email` отправляют настоящие письма. Не разрешайте их вызов без подтверждения в настройках клиента.
- **Используйте отдельного API-пользователя** с ролью, ограниченной нужными агенту правами, а не учётную запись администратора.
- **Не храните токен в общих файлах.** Если MCP-конфиг лежит в репозитории или синхронизируется, передавайте токен через переменные окружения.

## Разработка

```bash
git clone https://github.com/tecspda/listmonk-mcp-ts.git
cd listmonk-mcp-ts
bun install
cp .env.example .env   # заполните данные своего Listmonk
bun run start          # запуск сервера
bun run dev            # запуск с перезагрузкой при изменениях
bun run check          # проверка типов
bun test               # тесты
```

Чтобы подключить локальную копию к MCP-клиенту, укажите `"command": "bun", "args": ["run", "/path/to/listmonk-mcp-ts/src/index.ts"]`.

Нужен Listmonk для тестов? См. [настройку через Docker](docs/docker-setup.md).

## Лицензия

[MIT](LICENSE)
