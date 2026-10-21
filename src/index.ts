#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { z } from "zod";
import packageJson from "../package.json";
import { loadConfig } from "./config.js";
import { JsonValue, ListmonkAPIError, ListmonkClient } from "./listmonkClient.js";
import { parseListResult, parseListTotal, pickData } from "./parse.js";

const VERSION = packageJson.version;

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

function parseArgs(argv: string[]) {
  const args = {
    configFile: undefined as string | undefined,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "-v" || arg === "--version") {
      args.version = true;
      continue;
    }

    if ((arg === "-c" || arg === "--config") && argv[i + 1]) {
      args.configFile = argv[i + 1];
      i += 1;
      continue;
    }
  }

  return args;
}

function formatError(error: unknown): string {
  if (error instanceof ListmonkAPIError) {
    const endpoint = error.endpoint ? ` (${error.endpoint})` : "";
    const status = error.statusCode ? ` [HTTP ${error.statusCode}]` : "";
    return `Error${endpoint}${status}: ${error.message}`;
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return `Error: ${String(error)}`;
}

function safeResponse(fn: () => Promise<string>): Promise<ToolResult> {
  return fn().then((text) => ({
    content: [{ type: "text" as const, text }],
  })).catch((error) => ({
    content: [{ type: "text" as const, text: formatError(error) }],
  }));
}

function formatSubscriber(subscriber: Record<string, unknown>): string {
  const lists = Array.isArray(subscriber.lists)
    ? subscriber.lists
        .map((value) => {
          const item = value as Record<string, unknown>;
          return `- ${String(item.name)} (ID: ${String(item.id)})`;
        })
        .join("\n")
    : "No lists";

  const attributes = subscriber.attribs && typeof subscriber.attribs === "object"
    ? Object.entries(subscriber.attribs as Record<string, unknown>)
        .map(([key, value]) => `- ${key}: ${String(value)}`)
        .join("\n")
    : "No attributes";

  return [
    `**ID:** ${subscriber.id}`,
    `**Email:** ${subscriber.email}`,
    `**Name:** ${subscriber.name}`,
    `**Status:** ${subscriber.status}`,
    `**Created:** ${subscriber.created_at}`,
    `**Updated:** ${subscriber.updated_at}`,
    "",
    "## Lists",
    lists,
    "",
    "## Attributes",
    attributes,
  ].join("\n");
}

const args = parseArgs(process.argv.slice(2));

if (args.version) {
  console.log(`listmonk-mcp-ts ${VERSION}`);
  process.exit(0);
}

let config;
try {
  config = loadConfig(args.configFile);
} catch (error) {
  console.error(formatError(error));
  process.exit(1);
}

const filesDir = config.filesDir;

/**
 * Разрешает путь к файлу для файловых инструментов. Читать можно только внутри
 * LISTMONK_MCP_FILES_DIR: иначе prompt injection в данных Listmonk может заставить
 * агента прочитать ~/.ssh или .env и отправить их письмом.
 */
async function resolveFilePath(filePath: string): Promise<string> {
  if (!filesDir) {
    throw new Error("File tools are disabled: set LISTMONK_MCP_FILES_DIR to the directory with your files");
  }

  // Одна общая ошибка: по ней нельзя понять, существует ли файл вне каталога
  const denied = new Error("file_path not found or outside LISTMONK_MCP_FILES_DIR");
  // realpath раскрывает симлинки, поэтому ссылка внутри каталога не выведет наружу
  const real = await realpath(resolve(filesDir, filePath)).catch(() => {
    throw denied;
  });
  if (real !== filesDir && !real.startsWith(filesDir + sep)) {
    throw denied;
  }

  return real;
}

const client = new ListmonkClient(config);
const server = new McpServer({
  name: config.serverName,
  version: VERSION,
});

// Health check
server.tool("check_listmonk_health", "Check if Listmonk server is healthy and accessible", {}, async (): Promise<ToolResult> =>
  safeResponse(async () => {
    const healthData = await client.healthCheck();
    return `Listmonk server is healthy at ${config.url}. Health data: ${JSON.stringify(healthData)}`;
  })
);

// Subscriber tools
server.tool(
  "add_subscriber",
  "Add a new subscriber to Listmonk",
  {
    email: z.string().email().describe("Subscriber email"),
    name: z.string().describe("Subscriber name"),
    lists: z.array(z.number()).default([]).describe("Mailing list IDs"),
    status: z.string().default("enabled").describe("Subscriber status (enabled, disabled, blocklisted)"),
    attributes: z.record(z.unknown()).optional().describe("Custom subscriber attributes"),
    preconfirm: z.boolean().default(false).describe("Whether to preconfirm subscriptions"),
  },
  async ({ email, name, lists, status, attributes, preconfirm }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.createSubscriber(
        email,
        name,
        status,
        lists,
        attributes as Record<string, any>,
        preconfirm,
      );
      const subscriber = pickData(result);
      const subscriberId = subscriber?.id ?? "unknown";
      return `Successfully added subscriber: ${email} (ID: ${subscriberId})`;
    }),
);

server.tool(
  "update_subscriber",
  "Update an existing subscriber",
  {
    subscriber_id: z.number().positive().describe("Subscriber ID"),
    email: z.string().email().optional().describe("New email"),
    name: z.string().optional().describe("New name"),
    status: z.string().optional().describe("New status"),
    lists: z.array(z.number()).optional().describe("New list IDs"),
    attributes: z.record(z.unknown()).optional().describe("New subscriber attributes"),
  },
  async ({ subscriber_id, email, name, status, lists, attributes }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.updateSubscriber(subscriber_id, {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        ...(status ? { status } : {}),
        ...(lists ? { lists } : {}),
        ...(attributes ? { attribs: attributes as Record<string, JsonValue> } : {}),
      });
      return `Successfully updated subscriber ${subscriber_id}`;
    }),
);

server.tool(
  "remove_subscriber",
  "Remove a subscriber from Listmonk",
  { subscriber_id: z.number().positive().describe("Subscriber ID") },
  async ({ subscriber_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.deleteSubscriber(subscriber_id);
      return `Successfully removed subscriber ${subscriber_id}`;
    }),
);

server.tool(
  "change_subscriber_status",
  "Change subscriber status",
  {
    subscriber_id: z.number().positive().describe("Subscriber ID"),
    status: z.string().describe("New status (enabled, disabled, blocklisted)"),
  },
  async ({ subscriber_id, status }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.setSubscriberStatus(subscriber_id, status);
      return `Successfully changed subscriber ${subscriber_id} status to ${status}`;
    }),
);

server.tool(
  "list_subscribers",
  "List all subscribers with basic info",
  {
    page: z.number().positive().default(1).describe("Page number"),
    per_page: z.number().positive().default(50).describe("Items per page"),
    query: z.string().optional().describe("Optional query string"),
  },
  async ({ page, per_page, query }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getSubscribers(page, per_page, "created_at", "desc", query);
      const subscribers = parseListResult(result);
      const total = parseListTotal(result, subscribers);

      if (subscribers.length === 0) {
        return "No subscribers found.";
      }

      const lines = subscribers.map((sub) => {
        const s = sub as Record<string, unknown>;
        const lists = Array.isArray(s.lists)
          ? s.lists.map((value) => (value as Record<string, unknown>).name || "").join(", ")
          : "";
        return `- **${s.name}** (${s.email}) - Status: ${s.status} - Lists: ${lists}`;
      });

      return `Total subscribers: ${total}\nShowing ${subscribers.length}\n\n${lines.join("\n")}`;
    }),
);

server.tool(
  "get_subscriber_by_id",
  "Get subscriber details by ID",
  { subscriber_id: z.number().positive().describe("Subscriber ID") },
  async ({ subscriber_id }): Promise<ToolResult> =>
    safeResponse(async () => formatSubscriber(pickData(await client.getSubscriber(subscriber_id)))),
);

server.tool(
  "get_subscriber_by_email",
  "Get subscriber details by email",
  { email: z.string().email().describe("Subscriber email") },
  async ({ email }): Promise<ToolResult> =>
    safeResponse(async () => formatSubscriber(pickData(await client.getSubscriberByEmail(email)))),
);

// List tools
server.tool(
  "get_mailing_lists",
  "Get all mailing lists",
  {},
  async (): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getLists();
      const lists = parseListResult(result);
      if (lists.length === 0) return "No mailing lists found.";

      const items = lists.map((value) => {
        const l = value as Record<string, unknown>;
        const tags = Array.isArray(l.tags) ? l.tags.join(", ") : "No tags";
        return `- ${l.name} (ID: ${l.id}) - Type: ${l.type} - Subscribers: ${l.subscriber_count || 0} - Tags: ${tags}`;
      });

      return `Found ${lists.length} mailing list(s):\n${items.join("\n")}`;
    }),
);

server.tool(
  "create_mailing_list",
  "Create a new mailing list",
  {
    name: z.string().describe("List name"),
    type: z.string().default("public"),
    optin: z.string().default("single"),
    tags: z.array(z.string()).optional(),
    description: z.string().optional(),
  },
  async ({ name, type, optin, tags, description }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.createList(name, type, optin, tags, description);
      const list = pickData(result);
      return `Successfully created mailing list '${name}' (ID: ${list.id || "unknown"})`;
    }),
);

server.tool(
  "update_mailing_list",
  "Update an existing mailing list",
  {
    list_id: z.number().positive().describe("List ID"),
    name: z.string().optional().describe("List name"),
    type: z.string().optional().describe("List type"),
    optin: z.string().optional().describe("Opt-in type"),
    tags: z.array(z.string()).optional().describe("List tags"),
    description: z.string().optional().describe("List description"),
  },
  async ({ list_id, name, type, optin, tags, description }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.updateList(list_id, { name, type, optin, tags, description });
      return `Successfully updated mailing list ${list_id}`;
    }),
);

server.tool(
  "delete_mailing_list",
  "Delete a mailing list",
  { list_id: z.number().positive().describe("List ID") },
  async ({ list_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.deleteList(list_id);
      return `Successfully deleted mailing list ${list_id}`;
    }),
);

server.tool(
  "get_list_subscribers_tool",
  "Get subscribers for a specific mailing list",
  {
    list_id: z.number().positive().describe("List ID"),
    page: z.number().positive().default(1),
    per_page: z.number().positive().default(20),
  },
  async ({ list_id, page, per_page }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getListSubscribers(list_id, page, per_page);
      const subscribers = parseListResult(result);
      const total = parseListTotal(result, subscribers);

      return `Successfully retrieved ${subscribers.length} subscribers for list ${list_id} (Total: ${total}, Page: ${page})`;
    }),
);

server.tool(
  "get_list_by_id",
  "Get mailing list details by ID",
  { list_id: z.number().positive().describe("List ID") },
  async ({ list_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getList(list_id);
      const listData = pickData(result);
      const tags = Array.isArray(listData.tags) ? listData.tags.join(", ") : "None";
      return [
        `**ID:** ${listData.id}`,
        `**Name:** ${listData.name}`,
        `**Type:** ${listData.type || "public"}`,
        `**Opt-in:** ${listData.optin || "single"}`,
        `**Subscribers:** ${listData.subscriber_count || 0}`,
        `**Created:** ${listData.created_at}`,
        `**Updated:** ${listData.updated_at}`,
        `**Tags:** ${tags}`,
        `**Description:** ${listData.description || "No description"}`,
      ].join("\n");
    }),
);

// Campaign tools
server.tool(
  "get_campaigns",
  "Get campaigns with optional status and pagination",
  {
    status: z.string().optional().describe("Filter by status"),
    page: z.number().positive().default(1).describe("Page number"),
    per_page: z.number().positive().default(20).describe("Items per page"),
  },
  async ({ status, page, per_page }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getCampaigns(page, per_page, status);
      const campaigns = parseListResult(result);
      const total = parseListTotal(result, campaigns);

      if (campaigns.length === 0) return "No campaigns found.";

      const lines = campaigns.map((value) => {
        const campaign = value as Record<string, unknown>;
        const listIds = Array.isArray(campaign.lists)
          ? campaign.lists.map((item) => String((item as Record<string, unknown>).id)).join(", ")
          : "";
        return `- ID: ${campaign.id} | ${campaign.name} | Status: ${campaign.status || "unknown"} | Sent: ${campaign.sent || 0}/${campaign.to_send || 0} | Lists: [${listIds}]`;
      });

      return `Found ${total} campaigns (showing ${campaigns.length}):\n${lines.join("\n")}`;
    }),
);

server.tool(
  "get_campaign",
  "Get detailed campaign by ID",
  { campaign_id: z.number().positive().describe("Campaign ID") },
  async ({ campaign_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getCampaign(campaign_id);
      const campaign = pickData(result);
      const listInfo = Array.isArray(campaign.lists)
        ? campaign.lists.map((item) => {
          const v = item as Record<string, unknown>;
          return `${v.name || ""} (${String(v.id)})`;
        }).join(", ")
        : "No lists";
      return [
        `Campaign ID: ${campaign.id}`,
        `Name: ${campaign.name}`,
        `Subject: ${campaign.subject}`,
        `Status: ${campaign.status}`,
        `Type: ${campaign.type || "regular"}`,
        `Template ID: ${campaign.template_id || "None"}`,
        `Lists: ${listInfo}`,
        `Content Type: ${campaign.content_type || "richtext"}`,
        `Sent: ${campaign.sent || 0}/${campaign.to_send || 0} | Views: ${campaign.views || 0} | Clicks: ${campaign.clicks || 0}`,
        "",
        "Body:",
        String(campaign.body || "No content"),
      ].join("\n");
    }),
);

server.tool(
  "get_campaign_preview",
  "Get campaign HTML preview",
  { campaign_id: z.number().positive().describe("Campaign ID") },
  async ({ campaign_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getCampaignPreview(campaign_id);
      const preview = pickData(result);
      return [
        `**Campaign ID:** ${campaign_id}`,
        "",
        "```html",
        String((preview as Record<string, unknown>).preview || "No preview available"),
        "```",
      ].join("\n");
    }),
);

server.tool(
  "create_campaign",
  "Create a new campaign",
  {
    name: z.string().describe("Campaign name"),
    subject: z.string().describe("Email subject"),
    lists: z.array(z.number().positive()).min(1).describe("List IDs"),
    type: z.string().default("regular"),
    content_type: z.string().default("richtext"),
    body: z.string().optional().describe("Campaign body"),
    template_id: z.number().positive().optional().describe("Template ID"),
    tags: z.array(z.string()).optional().describe("Campaign tags"),
  },
  async ({ name, subject, lists, type, content_type, body, template_id, tags }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.createCampaign({
        name,
        subject,
        lists,
        type,
        contentType: content_type,
        body,
        templateId: template_id,
        tags,
      });
      const campaign = pickData(result);
      return `Successfully created campaign '${name}' (ID: ${campaign.id || "unknown"})`;
    }),
);

server.tool(
  "update_campaign",
  "Update existing campaign",
  {
    campaign_id: z.number().positive().describe("Campaign ID"),
    name: z.string().optional().describe("Campaign name"),
    subject: z.string().optional().describe("Subject"),
    lists: z.array(z.number().positive()).optional().describe("List IDs"),
    body: z.string().optional().describe("Body"),
    tags: z.array(z.string()).optional().describe("Tags"),
  },
  async ({ campaign_id, name, subject, lists, body, tags }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.updateCampaign(campaign_id, { name, subject, lists, body, tags });
      return `Successfully updated campaign ${campaign_id}`;
    }),
);

server.tool(
  "send_campaign",
  "Send campaign immediately",
  { campaign_id: z.number().positive().describe("Campaign ID") },
  async ({ campaign_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.sendCampaign(campaign_id);
      return `Successfully sent campaign ${campaign_id}`;
    }),
);

server.tool(
  "schedule_campaign",
  "Schedule campaign for a future date",
  {
    campaign_id: z.number().positive().describe("Campaign ID"),
    send_at: z.string().describe("ISO datetime string (for example: 2024-12-25T10:00:00Z)"),
  },
  async ({ campaign_id, send_at }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.scheduleCampaign(campaign_id, send_at);
      return `Successfully scheduled campaign ${campaign_id} for ${send_at}`;
    }),
);

// Template tools
server.tool(
  "get_templates",
  "Get all templates",
  {},
  async (): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getTemplates();
      const templates = parseListResult(result);
      if (templates.length === 0) return "No templates found.";

      const lines = templates.map((value) => {
        const template = value as Record<string, unknown>;
        const isDefault = template.is_default ? " (DEFAULT)" : "";
        return `- ID: ${template.id} | ${template.name} | Type: ${template.type || "campaign"}${isDefault}`;
      });

      return `Found ${templates.length} templates:\n${lines.join("\n")}`;
    }),
);

server.tool(
  "get_template",
  "Get campaign or transactional template by ID",
  { template_id: z.number().positive().describe("Template ID") },
  async ({ template_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getTemplate(template_id);
      const template = pickData(result);
      return [
        `Template ID: ${template.id}`,
        `Name: ${template.name}`,
        `Type: ${template.type || "campaign"}`,
        `Default: ${template.is_default || false}`,
        `Subject: ${template.subject || ""}`,
        `Updated: ${template.updated_at}`,
        "",
        "Body:",
        String(template.body || "No content"),
      ].join("\n");
    }),
);

server.tool(
  "create_template",
  "Create a new template",
  {
    name: z.string().describe("Template name"),
    body: z.string().describe("Template HTML body"),
    type: z.string().default("campaign").describe("Template type: 'campaign' or 'tx' (transactional)"),
    is_default: z.boolean().default(false).describe("Whether this is default"),
    subject: z.string().optional().describe("Subject line (required for 'tx' transactional templates)"),
  },
  async ({ name, body, type, is_default, subject }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.createTemplate(name, body, type, is_default, subject);
      const template = pickData(result);
      return `Successfully created template '${name}' (ID: ${template.id || "unknown"})`;
    }),
);

server.tool(
  "update_template",
  "Update an existing template",
  {
    template_id: z.number().positive().describe("Template ID"),
    name: z.string().optional().describe("Template name"),
    body: z.string().optional().describe("Template body"),
    is_default: z.boolean().optional().describe("Default template flag"),
    subject: z.string().optional().describe("Subject line (required for 'tx' transactional templates)"),
  },
  async ({ template_id, name, body, is_default, subject }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.updateTemplate(template_id, {
        ...(name ? { name } : {}),
        ...(body ? { body } : {}),
        ...(is_default !== undefined ? { isDefault: is_default } : {}),
        ...(subject !== undefined ? { subject } : {}),
      });
      return `Successfully updated template ${template_id}`;
    }),
);

server.tool(
  "create_template_from_file",
  "Create a new template whose HTML body is read from a local file path (avoids passing large bodies inline)",
  {
    name: z.string().describe("Template name"),
    file_path: z.string().describe("Path to the template HTML file inside LISTMONK_MCP_FILES_DIR (absolute or relative to it)"),
    type: z.string().default("campaign").describe("Template type: 'campaign' or 'tx' (transactional)"),
    is_default: z.boolean().default(false).describe("Whether this is default"),
    subject: z.string().optional().describe("Subject line (required for 'tx' transactional templates)"),
  },
  async ({ name, file_path, type, is_default, subject }): Promise<ToolResult> =>
    safeResponse(async () => {
      const body = await readFile(await resolveFilePath(file_path), "utf8");
      const result = await client.createTemplate(name, body, type, is_default, subject);
      const template = pickData(result);
      return `Successfully created template '${name}' (ID: ${template.id || "unknown"}) from file (${body.length} chars)`;
    }),
);

server.tool(
  "update_template_from_file",
  "Update an existing template, reading its HTML body from a local file path (avoids passing large bodies inline)",
  {
    template_id: z.number().positive().describe("Template ID"),
    file_path: z.string().describe("Path to the template HTML file inside LISTMONK_MCP_FILES_DIR (absolute or relative to it)"),
    name: z.string().optional().describe("Template name"),
    is_default: z.boolean().optional().describe("Default template flag"),
    subject: z.string().optional().describe("Subject line (required for 'tx' transactional templates)"),
  },
  async ({ template_id, file_path, name, is_default, subject }): Promise<ToolResult> =>
    safeResponse(async () => {
      const body = await readFile(await resolveFilePath(file_path), "utf8");
      await client.updateTemplate(template_id, {
        body,
        ...(name ? { name } : {}),
        ...(is_default !== undefined ? { isDefault: is_default } : {}),
        ...(subject !== undefined ? { subject } : {}),
      });
      return `Successfully updated template ${template_id} from file (${body.length} chars)`;
    }),
);

server.tool(
  "delete_template",
  "Delete a template",
  { template_id: z.number().positive().describe("Template ID") },
  async ({ template_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.deleteTemplate(template_id);
      return `Successfully deleted template ${template_id}`;
    }),
);

server.tool(
  "send_transactional_email",
  "Send transactional email by template",
  {
    template_id: z.number().positive().describe("Template ID"),
    subscriber_email: z.string().email().describe("Recipient email"),
    data: z.record(z.unknown()).optional().describe("Template data"),
    content_type: z.string().default("html").describe("Content type"),
  },
  async ({ template_id, subscriber_email, data, content_type }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.sendTransactionalEmail(template_id, subscriber_email, data as Record<string, JsonValue> | undefined, content_type);
      return `Successfully sent transactional email to ${subscriber_email}`;
    }),
);

// Media tools
server.tool(
  "get_media_list",
  "Get uploaded media files",
  {},
  async (): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getMedia();
      const mediaItems = parseListResult(result);

      if (mediaItems.length === 0) {
        return "No media files found.";
      }

      const lines = mediaItems.map((value) => {
        const media = value as Record<string, unknown>;
        const created = typeof media.created_at === "string" ? media.created_at.substring(0, 10) : "Unknown";
        const size = media.meta && typeof media.meta === "object" && typeof (media.meta as Record<string, unknown>).size === "number"
          ? Math.round((media.meta as Record<string, unknown>).size as number / 1024 * 10) / 10
          : 0;
        return `- ID: ${media.id} | ${media.filename} | Title: ${media.title || media.filename || "No title"} | Size: ${size} KB | Created: ${created} | URL: ${media.url || "No URL"}`;
      });

      return `Found ${mediaItems.length} media files:\n${lines.join("\n")}`;
    }),
);

server.tool(
  "upload_media_file",
  "Upload a media file",
  {
    file_path: z.string().describe("Path to the media file inside LISTMONK_MCP_FILES_DIR (absolute or relative to it)"),
    title: z.string().optional().describe("Title"),
  },
  async ({ file_path, title }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.uploadMedia(await resolveFilePath(file_path), title);
      const media = pickData(result);
      return `Successfully uploaded '${media.filename || "unknown"}' (ID: ${media.id || "unknown"})\nURL: ${media.url || "No URL"}`;
    }),
);

server.tool(
  "rename_media",
  "Rename media title",
  {
    media_id: z.number().positive().describe("Media ID"),
    new_title: z.string().describe("New media title"),
  },
  async ({ media_id, new_title }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.updateMedia(media_id, new_title);
      return `Successfully renamed media ${media_id} to '${new_title}'`;
    }),
);

server.tool(
  "delete_media_file",
  "Delete media file",
  { media_id: z.number().positive().describe("Media ID") },
  async ({ media_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.deleteMedia(media_id);
      return `Successfully deleted media ${media_id}`;
    }),
);

// Campaign body editing tools
server.tool(
  "replace_in_campaign_body",
  "Search and replace text in a campaign body",
  {
    campaign_id: z.number().positive().describe("Campaign ID"),
    search: z.string().describe("Search text"),
    replace: z.string().describe("Replacement text"),
  },
  async ({ campaign_id, search, replace }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getCampaign(campaign_id);
      const campaign = pickData(result);
      const currentBody = String(campaign.body || "");
      const count = currentBody.split(search).length - 1;
      if (count === 0) return `Search text not found in campaign ${campaign_id}`;
      const newBody = currentBody.replaceAll(search, replace);
      await client.updateCampaign(campaign_id, {
        name: campaign.name as string,
        subject: campaign.subject as string,
        lists: Array.isArray(campaign.lists)
          ? campaign.lists.map((item) => Number((item as Record<string, unknown>).id))
          : [],
        body: newBody,
      });
      return `Successfully replaced ${count} occurrence(s) in campaign ${campaign_id}`;
    }),
);

server.tool(
  "regex_replace_in_campaign_body",
  "Regex replace in campaign body",
  {
    campaign_id: z.number().positive().describe("Campaign ID"),
    pattern: z.string().describe("Regex pattern"),
    replace: z.string().describe("Replacement pattern"),
  },
  async ({ campaign_id, pattern, replace }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getCampaign(campaign_id);
      const campaign = pickData(result);
      const currentBody = String(campaign.body || "");
      const regex = new RegExp(pattern, "g");
      const matches = currentBody.match(regex) || [];
      if (matches.length === 0) return `Pattern not found in campaign ${campaign_id}`;

      const newBody = currentBody.replace(regex, replace);
      await client.updateCampaign(campaign_id, {
        name: campaign.name as string,
        subject: campaign.subject as string,
        lists: Array.isArray(campaign.lists)
          ? campaign.lists.map((item) => Number((item as Record<string, unknown>).id))
          : [],
        body: newBody,
      });
      return `Successfully replaced ${matches.length} match(es) in campaign ${campaign_id}`;
    }),
);

server.tool(
  "batch_replace_in_campaign_body",
  "Batch replace in campaign body",
  {
    campaign_id: z.number().positive().describe("Campaign ID"),
    replacements: z.array(
      z.object({
        search: z.string().describe("Search text"),
        replace: z.string().describe("Replacement text"),
      }),
    ).describe("Replacement operations"),
  },
  async ({ campaign_id, replacements }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getCampaign(campaign_id);
      const campaign = pickData(result);
      const currentBody = String(campaign.body || "");
      let newBody = currentBody;
      let totalCount = 0;

      for (const item of replacements) {
        const search = String(item.search || "");
        if (!search) {
          continue;
        }
        const count = newBody.split(search).length - 1;
        newBody = newBody.replaceAll(search, String(item.replace || ""));
        totalCount += count;
      }

      if (totalCount === 0) {
        return `No search texts found in campaign ${campaign_id}`;
      }

      await client.updateCampaign(campaign_id, {
        name: campaign.name as string,
        subject: campaign.subject as string,
        lists: Array.isArray(campaign.lists)
          ? campaign.lists.map((item) => Number((item as Record<string, unknown>).id))
          : [],
        body: newBody,
      });

      return `Successfully completed ${replacements.length} replacement operation(s) with ${totalCount} total change(s) in campaign ${campaign_id}`;
    }),
);

(async () => {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(`listmonk-mcp-ts started: ${config.url}`);
  } catch (error) {
    console.error(formatError(error));
    process.exit(1);
  }

  // Недоступный Listmonk не мешает старту: клиент видит инструменты, ошибку покажет check_listmonk_health
  client.healthCheck().catch((error) => {
    console.error(`Warning: Listmonk is not reachable: ${formatError(error)}`);
  });
})();
