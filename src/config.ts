import { realpathSync } from "node:fs";
import { config as loadDotEnv } from "dotenv";

export interface ListmonkConfig {
  url: string;
  username: string;
  password: string;
  timeout: number;
  maxRetries: number;
  serverName: string;
  // Каталог, из которого разрешено читать файлы; без него файловые инструменты отключены
  filesDir?: string;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function validateUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("LISTMONK_MCP_URL must start with http:// or https://");
  }

  return url.replace(/\/$/, "");
}

export function loadConfig(envFile?: string): ListmonkConfig {
  if (envFile) {
    const loaded = loadDotEnv({ path: envFile });
    if (loaded.error) {
      throw new Error(`Failed to load env file: ${envFile}`);
    }
  } else {
    loadDotEnv();
  }

  const url = validateUrl(process.env.LISTMONK_MCP_URL?.trim() || "");
  const username = process.env.LISTMONK_MCP_USERNAME?.trim() || "";
  const password = process.env.LISTMONK_MCP_PASSWORD?.trim() || "";
  const filesDir = process.env.LISTMONK_MCP_FILES_DIR?.trim();

  if (!url) {
    throw new Error("LISTMONK_MCP_URL is required");
  }

  if (!username) {
    throw new Error("LISTMONK_MCP_USERNAME is required");
  }

  if (!password) {
    throw new Error("LISTMONK_MCP_PASSWORD is required");
  }

  return {
    url,
    username,
    password,
    timeout: parseNumber(process.env.LISTMONK_MCP_TIMEOUT, 30),
    maxRetries: parseNumber(process.env.LISTMONK_MCP_MAX_RETRIES, 3),
    serverName: process.env.LISTMONK_MCP_SERVER_NAME?.trim() || "Listmonk MCP Server",
    // realpath, чтобы сравнение путей не обходилось через симлинки (например, /tmp → /private/tmp)
    filesDir: filesDir ? realpathSync(filesDir) : undefined,
  };
}
