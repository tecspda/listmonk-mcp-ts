import { config as loadDotEnv } from "dotenv";

export interface ListmonkConfig {
  url: string;
  username: string;
  password: string;
  timeout: number;
  maxRetries: number;
  debug: boolean;
  logLevel: string;
  serverName: string;
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

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeLogLevel(value: string | undefined): string {
  const level = value?.trim()?.toUpperCase() ?? "INFO";
  const allowed = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];
  return allowed.includes(level) ? level : "INFO";
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
    debug: parseBoolean(process.env.LISTMONK_MCP_DEBUG, false),
    logLevel: normalizeLogLevel(process.env.LISTMONK_MCP_LOG_LEVEL),
    serverName: process.env.LISTMONK_MCP_SERVER_NAME?.trim() || "Listmonk MCP Server",
  };
}
