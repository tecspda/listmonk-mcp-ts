#!/usr/bin/env bun
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { z } from "zod";
import packageJson from "../package.json";
import { loadConfig } from "./config.js";
import { JsonValue, ListmonkAPIError, ListmonkClient } from "./listmonkClient.js";
import { parseListResult, parseListTotal, pickData } from "./parse.js";

const VERSION = packageJson.version;

// Подсказки клиенту: что инструмент меняет, чтобы агент знал, где просить подтверждение
const READ_ONLY: ToolAnnotations = { readOnlyHint: true };
const CREATE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };
const MODIFY: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: true };
const BODY_EDIT: ToolAnnotations = { ...MODIFY, idempotentHint: false };
const SEND: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false };

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

function formatSubscriberLine(subscriber: unknown): string {
  const s = subscriber as Record<string, unknown>;
  const lists = Array.isArray(s.lists)
    ? s.lists.map((value) => (value as Record<string, unknown>).name || "").join(", ")
    : "";
  return `- **${s.name}** (${s.email}) - ID: ${s.id} - Status: ${s.status} - Lists: ${lists}`;
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
server.tool(
  "check_listmonk_health",
  "Check that the Listmonk server is reachable and responding, and return its health data. Makes a single request with no retries. Use it first when other tools fail with connection errors.",
  {},
  READ_ONLY,
  async (): Promise<ToolResult> =>
  safeResponse(async () => {
    const healthData = await client.healthCheck();
    return `Listmonk server is healthy at ${config.url}. Health data: ${JSON.stringify(healthData)}`;
  })
);

// Subscriber tools
server.tool(
  "add_subscriber",
  "Create a new subscriber and optionally subscribe them to mailing lists. Fails if a subscriber with the same email already exists. Returns the new subscriber ID. To change an existing subscriber use update_subscriber.",
  {
    email: z.string().email().describe("Subscriber email"),
    name: z.string().describe("Subscriber name"),
    lists: z.array(z.number()).default([]).describe("IDs of the mailing lists to subscribe them to (see get_mailing_lists); empty means no lists"),
    status: z.string().default("enabled").describe("enabled (can receive mail), disabled, or blocklisted (never mailed)"),
    attributes: z.record(z.unknown()).optional().describe("Free-form JSON object stored with the subscriber, e.g. {\"city\": \"Berlin\"}"),
    preconfirm: z.boolean().default(false).describe("If true, subscriptions to double opt-in lists are marked confirmed and no confirmation email is sent"),
  },
  CREATE,
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
  "Update an existing subscriber's email, name, status, list memberships or attributes. Only the fields you provide are sent to Listmonk. When `lists` or `attributes` is provided it is sent as the full new value, not merged with the old one. To only change status use change_subscriber_status.",
  {
    subscriber_id: z.number().positive().describe("Subscriber ID"),
    email: z.string().email().optional().describe("New email"),
    name: z.string().optional().describe("New name"),
    status: z.string().optional().describe("New status: enabled, disabled or blocklisted"),
    lists: z.array(z.number()).optional().describe("Full new set of mailing list IDs; replaces the current memberships"),
    attributes: z.record(z.unknown()).optional().describe("Full new attributes object; replaces the current attributes"),
  },
  MODIFY,
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
  "Permanently delete a subscriber and all their list subscriptions. This cannot be undone. To stop mailing someone but keep their record, use change_subscriber_status with 'blocklisted' instead.",
  { subscriber_id: z.number().positive().describe("Subscriber ID") },
  MODIFY,
  async ({ subscriber_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.deleteSubscriber(subscriber_id);
      return `Successfully removed subscriber ${subscriber_id}`;
    }),
);

server.tool(
  "change_subscriber_status",
  "Change only a subscriber's status to enabled, disabled or blocklisted. Blocklisted subscribers are excluded from all campaigns. Use remove_subscriber to delete the record instead.",
  {
    subscriber_id: z.number().positive().describe("Subscriber ID"),
    status: z.string().describe("New status (enabled, disabled, blocklisted)"),
  },
  MODIFY,
  async ({ subscriber_id, status }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.setSubscriberStatus(subscriber_id, status);
      return `Successfully changed subscriber ${subscriber_id} status to ${status}`;
    }),
);

server.tool(
  "list_subscribers",
  "List subscribers, newest first, one page at a time. Returns the total subscriber count and each subscriber's name, email, status and list names. Use `query` to filter with a SQL expression; use get_subscriber_by_email when you already know the address.",
  {
    page: z.number().positive().default(1).describe("Page number, starting at 1"),
    per_page: z.number().positive().default(50).describe("Subscribers per page"),
    query: z.string().optional().describe("Optional SQL condition on the subscribers table, e.g. subscribers.name LIKE '%john%' or subscribers.status = 'blocklisted'. Omit to list everyone"),
  },
  READ_ONLY,
  async ({ page, per_page, query }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getSubscribers(page, per_page, "created_at", "desc", query);
      const subscribers = parseListResult(result);
      const total = parseListTotal(result, subscribers);

      if (subscribers.length === 0) {
        return "No subscribers found.";
      }

      return `Total subscribers: ${total}\nShowing ${subscribers.length}\n\n${subscribers.map(formatSubscriberLine).join("\n")}`;
    }),
);

server.tool(
  "get_subscriber_by_id",
  "Get one subscriber by numeric ID: email, name, status, timestamps, list memberships and custom attributes. Returns an error if the ID does not exist. Use get_subscriber_by_email when you only know the address.",
  { subscriber_id: z.number().positive().describe("Subscriber ID") },
  READ_ONLY,
  async ({ subscriber_id }): Promise<ToolResult> =>
    safeResponse(async () => formatSubscriber(pickData(await client.getSubscriber(subscriber_id)))),
);

server.tool(
  "get_subscriber_by_email",
  "Look up one subscriber by exact email address and return the same details as get_subscriber_by_id. Returns a not-found error if no subscriber has that address.",
  { email: z.string().email().describe("Subscriber email") },
  READ_ONLY,
  async ({ email }): Promise<ToolResult> =>
    safeResponse(async () => formatSubscriber(pickData(await client.getSubscriberByEmail(email)))),
);

// List tools
server.tool(
  "get_mailing_lists",
  "List mailing lists with ID, type, subscriber count and tags. Use it to find the list IDs required by add_subscriber, create_campaign and other tools.",
  {},
  READ_ONLY,
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
  "Create a mailing list and return its ID, which other tools use to subscribe people and target campaigns. A list is public or private and uses single or double opt-in.",
  {
    name: z.string().describe("List name"),
    type: z.string().default("public").describe("public (can appear on subscription forms) or private (internal only)"),
    optin: z.string().default("single").describe("single (subscribed at once) or double (subscriber must confirm by email)"),
    tags: z.array(z.string()).optional().describe("Labels for organising lists"),
    description: z.string().optional().describe("Short description of the list"),
  },
  CREATE,
  async ({ name, type, optin, tags, description }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.createList(name, type, optin, tags, description);
      const list = pickData(result);
      return `Successfully created mailing list '${name}' (ID: ${list.id || "unknown"})`;
    }),
);

server.tool(
  "update_mailing_list",
  "Update a mailing list's name, type, opt-in mode, tags or description. Only the fields you provide are sent. Existing subscribers are not removed.",
  {
    list_id: z.number().positive().describe("List ID"),
    name: z.string().optional().describe("List name"),
    type: z.string().optional().describe("public or private"),
    optin: z.string().optional().describe("single or double"),
    tags: z.array(z.string()).optional().describe("List tags"),
    description: z.string().optional().describe("List description"),
  },
  MODIFY,
  async ({ list_id, name, type, optin, tags, description }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.updateList(list_id, { name, type, optin, tags, description });
      return `Successfully updated mailing list ${list_id}`;
    }),
);

server.tool(
  "delete_mailing_list",
  "Permanently delete a mailing list and its subscriptions. The subscribers themselves are kept and only leave this list. This cannot be undone.",
  { list_id: z.number().positive().describe("List ID") },
  MODIFY,
  async ({ list_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.deleteList(list_id);
      return `Successfully deleted mailing list ${list_id}`;
    }),
);

server.tool(
  "get_list_subscribers_tool",
  "List the subscribers of one mailing list, one page at a time, with name, email and status, plus the list's total subscriber count. Use get_mailing_lists to find list IDs.",
  {
    list_id: z.number().positive().describe("List ID"),
    page: z.number().positive().default(1).describe("Page number, starting at 1"),
    per_page: z.number().positive().default(20).describe("Subscribers per page"),
  },
  READ_ONLY,
  async ({ list_id, page, per_page }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.getListSubscribers(list_id, page, per_page);
      const subscribers = parseListResult(result);
      const total = parseListTotal(result, subscribers);

      if (subscribers.length === 0) {
        return `No subscribers found for list ${list_id} (Total: ${total}, Page: ${page}).`;
      }

      return `List ${list_id}: total subscribers ${total}, showing ${subscribers.length} (page ${page})\n\n${subscribers.map(formatSubscriberLine).join("\n")}`;
    }),
);

server.tool(
  "get_list_by_id",
  "Get one mailing list by ID: name, type, opt-in mode, subscriber count, tags, description and timestamps.",
  { list_id: z.number().positive().describe("List ID") },
  READ_ONLY,
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
  "List campaigns, one page at a time, with ID, name, status, sent/total progress and target list IDs. Optionally filter by status. Use get_campaign for one campaign's full details and body.",
  {
    status: z.string().optional().describe("Only campaigns with this status: draft, scheduled, running, paused, cancelled or finished. Omit for all"),
    page: z.number().positive().default(1).describe("Page number, starting at 1"),
    per_page: z.number().positive().default(20).describe("Campaigns per page"),
  },
  READ_ONLY,
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
  "Get one campaign by ID: name, subject, status, type, template, target lists, send progress, view and click counts, and the full body (which can be large).",
  { campaign_id: z.number().positive().describe("Campaign ID") },
  READ_ONLY,
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
  "Render a preview of the campaign as the HTML subscribers would see. Read-only: nothing is sent. Use it to check a campaign before send_campaign or schedule_campaign.",
  { campaign_id: z.number().positive().describe("Campaign ID") },
  READ_ONLY,
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
  "Create a campaign in draft status; nothing is sent yet. `body` is the message content and `template_id` selects the layout template that wraps it. Returns the new campaign ID. Next, review it with get_campaign_preview, then start it with send_campaign or schedule_campaign.",
  {
    name: z.string().describe("Campaign name"),
    subject: z.string().describe("Email subject"),
    lists: z.array(z.number().positive()).min(1).describe("IDs of the mailing lists to send to, at least one (see get_mailing_lists)"),
    type: z.string().default("regular").describe("regular (normal campaign) or optin (asks subscribers to confirm a double opt-in subscription)"),
    content_type: z.string().default("richtext").describe("Format of body: richtext, html, markdown or plain"),
    body: z.string().optional().describe("Message content in the chosen content_type; can also be added later with update_campaign"),
    template_id: z.number().positive().optional().describe("Layout template that wraps the body (see get_templates); omit to use the default campaign template"),
    tags: z.array(z.string()).optional().describe("Labels for organising campaigns"),
  },
  CREATE,
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
  "Update a campaign's name, subject, target lists, body or tags. Only the fields you provide are sent, and the target lists are kept if you omit `lists`. Use it before sending, because Listmonk may reject edits once a campaign is running. Does not send anything.",
  {
    campaign_id: z.number().positive().describe("Campaign ID"),
    name: z.string().optional().describe("Campaign name"),
    subject: z.string().optional().describe("New email subject line"),
    lists: z.array(z.number().positive()).optional().describe("Full new set of target list IDs; omit to keep the current lists"),
    body: z.string().optional().describe("New message content; replaces the whole current body"),
    tags: z.array(z.string()).optional().describe("Tags"),
  },
  MODIFY,
  async ({ campaign_id, name, subject, lists, body, tags }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.updateCampaign(campaign_id, { name, subject, lists, body, tags });
      return `Successfully updated campaign ${campaign_id}`;
    }),
);

server.tool(
  "send_campaign",
  "Start sending a campaign to its target lists right now by setting its status to running. This emails real subscribers and cannot be undone, so check get_campaign_preview first. It returns as soon as sending starts and delivery continues in the background; follow progress with get_campaign. To send later use schedule_campaign.",
  { campaign_id: z.number().positive().describe("Campaign ID") },
  SEND,
  async ({ campaign_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.sendCampaign(campaign_id);
      return `Campaign ${campaign_id} is now running. Check progress with get_campaign.`;
    }),
);

server.tool(
  "schedule_campaign",
  "Schedule a campaign to start sending automatically at a future date and time. Nothing is sent now. Use send_campaign to send immediately instead.",
  {
    campaign_id: z.number().positive().describe("Campaign ID"),
    send_at: z.string().describe("Future start time in ISO 8601 format with a timezone, e.g. 2026-12-25T10:00:00Z"),
  },
  MODIFY,
  async ({ campaign_id, send_at }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.scheduleCampaign(campaign_id, send_at);
      return `Successfully scheduled campaign ${campaign_id} for ${send_at}`;
    }),
);

// Template tools
server.tool(
  "get_templates",
  "List all templates (campaign layouts and transactional) with ID, name, type and default flag. Use the IDs with create_campaign, send_transactional_email or update_template.",
  {},
  READ_ONLY,
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
  "Get one template by ID: name, type (campaign or tx), default flag, subject (tx only), update time and the full HTML body, which can be large.",
  { template_id: z.number().positive().describe("Template ID") },
  READ_ONLY,
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
  "Create a template and return its ID. Type 'campaign' is a layout that wraps campaign bodies; type 'tx' is a transactional email template that needs a subject and is sent with send_transactional_email. For large HTML bodies prefer create_template_from_file.",
  {
    name: z.string().describe("Template name"),
    body: z.string().describe("Full template HTML. A 'campaign' template must contain {{ template \"content\" . }} where the campaign body goes"),
    type: z.string().default("campaign").describe("Template type: 'campaign' or 'tx' (transactional)"),
    is_default: z.boolean().default(false).describe("Whether this is default"),
    subject: z.string().optional().describe("Subject line (required for 'tx' transactional templates)"),
  },
  CREATE,
  async ({ name, body, type, is_default, subject }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.createTemplate(name, body, type, is_default, subject);
      const template = pickData(result);
      return `Successfully created template '${name}' (ID: ${template.id || "unknown"})`;
    }),
);

server.tool(
  "update_template",
  "Update a template's name, body, default flag or subject. Only the fields you provide are sent, and a provided `body` replaces the old one completely. For large HTML bodies prefer update_template_from_file.",
  {
    template_id: z.number().positive().describe("Template ID"),
    name: z.string().optional().describe("Template name"),
    body: z.string().optional().describe("New full template HTML; replaces the whole current body"),
    is_default: z.boolean().optional().describe("Default template flag"),
    subject: z.string().optional().describe("Subject line (required for 'tx' transactional templates)"),
  },
  MODIFY,
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
  "Create a template whose HTML body is read from a UTF-8 file inside LISTMONK_MCP_FILES_DIR, so large bodies such as MJML exports are stored byte for byte. Otherwise identical to create_template. Fails if LISTMONK_MCP_FILES_DIR is not set or the path is outside it.",
  {
    name: z.string().describe("Template name"),
    file_path: z.string().describe("Path to the template HTML file inside LISTMONK_MCP_FILES_DIR (absolute or relative to it)"),
    type: z.string().default("campaign").describe("Template type: 'campaign' or 'tx' (transactional)"),
    is_default: z.boolean().default(false).describe("Whether this is default"),
    subject: z.string().optional().describe("Subject line (required for 'tx' transactional templates)"),
  },
  CREATE,
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
  "Update an existing template, replacing its HTML body with the contents of a UTF-8 file inside LISTMONK_MCP_FILES_DIR. Otherwise identical to update_template. Fails if LISTMONK_MCP_FILES_DIR is not set or the path is outside it.",
  {
    template_id: z.number().positive().describe("Template ID"),
    file_path: z.string().describe("Path to the template HTML file inside LISTMONK_MCP_FILES_DIR (absolute or relative to it)"),
    name: z.string().optional().describe("Template name"),
    is_default: z.boolean().optional().describe("Default template flag"),
    subject: z.string().optional().describe("Subject line (required for 'tx' transactional templates)"),
  },
  MODIFY,
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
  "Permanently delete a template by ID. This cannot be undone. Check get_templates first so you do not delete one that is still needed.",
  { template_id: z.number().positive().describe("Template ID") },
  MODIFY,
  async ({ template_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.deleteTemplate(template_id);
      return `Successfully deleted template ${template_id}`;
    }),
);

server.tool(
  "send_transactional_email",
  "Send one transactional email right away, using a 'tx' template, to a subscriber that already exists in Listmonk. The email cannot be recalled. `data` fills the template variables. Create tx templates with create_template (type 'tx').",
  {
    template_id: z.number().positive().describe("ID of a template of type 'tx' (see get_templates)"),
    subscriber_email: z.string().email().describe("Email of an existing subscriber to send to"),
    data: z.record(z.unknown()).optional().describe("Key/value data for the template, available there as {{ .Tx.Data.<key> }}"),
    content_type: z.string().default("html").describe("Body format: html, markdown or plain"),
  },
  SEND,
  async ({ template_id, subscriber_email, data, content_type }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.sendTransactionalEmail(template_id, subscriber_email, data as Record<string, JsonValue> | undefined, content_type);
      return `Successfully sent transactional email to ${subscriber_email}`;
    }),
);

// Media tools
server.tool(
  "get_media_list",
  "List uploaded media files with ID, filename, title, size, creation date and public URL. The URL can be used in campaign and template HTML.",
  {},
  READ_ONLY,
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
  "Upload a file from LISTMONK_MCP_FILES_DIR to the Listmonk media library and return its ID and public URL for use in campaign bodies. Fails if LISTMONK_MCP_FILES_DIR is not set or the path is outside it. Image types (jpg, png, gif, webp, svg) get the right MIME type; other types upload as generic binary and Listmonk may reject them.",
  {
    file_path: z.string().describe("Path to the media file inside LISTMONK_MCP_FILES_DIR (absolute or relative to it)"),
    title: z.string().optional().describe("Display title in the media library; defaults to the filename"),
  },
  CREATE,
  async ({ file_path, title }): Promise<ToolResult> =>
    safeResponse(async () => {
      const result = await client.uploadMedia(await resolveFilePath(file_path), title);
      const media = pickData(result);
      return `Successfully uploaded '${media.filename || "unknown"}' (ID: ${media.id || "unknown"})\nURL: ${media.url || "No URL"}`;
    }),
);

server.tool(
  "rename_media",
  "Change a media file's display title in the media library. The filename and public URL stay the same, so existing links keep working.",
  {
    media_id: z.number().positive().describe("Media ID"),
    new_title: z.string().describe("New media title"),
  },
  MODIFY,
  async ({ media_id, new_title }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.updateMedia(media_id, new_title);
      return `Successfully renamed media ${media_id} to '${new_title}'`;
    }),
);

server.tool(
  "delete_media_file",
  "Permanently delete a media file. Campaigns or templates that still link to its URL will show a broken file. This cannot be undone.",
  { media_id: z.number().positive().describe("Media ID") },
  MODIFY,
  async ({ media_id }): Promise<ToolResult> =>
    safeResponse(async () => {
      await client.deleteMedia(media_id);
      return `Successfully deleted media ${media_id}`;
    }),
);

// Campaign body editing tools
server.tool(
  "replace_in_campaign_body",
  "Replace every occurrence of a literal text in a campaign's body (case-sensitive, not a regex) and save the campaign. Reports how many replacements were made and changes nothing if the text is not found. For patterns use regex_replace_in_campaign_body; for several replacements in one save use batch_replace_in_campaign_body.",
  {
    campaign_id: z.number().positive().describe("Campaign ID"),
    search: z.string().describe("Exact text to find (case-sensitive, not a regex)"),
    replace: z.string().describe("Text to put in place of every match; may be empty to delete"),
  },
  BODY_EDIT,
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
  "Replace all matches of a JavaScript regular expression in a campaign's body and save the campaign. Reports how many matches were replaced and changes nothing if there is no match. An invalid pattern returns an error. For plain text use replace_in_campaign_body.",
  {
    campaign_id: z.number().positive().describe("Campaign ID"),
    pattern: z.string().describe("JavaScript regular expression source without slashes, applied globally, e.g. https://old\\.example\\.com"),
    replace: z.string().describe("Replacement text; may use capture groups such as $1"),
  },
  BODY_EDIT,
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
  "Apply several literal search and replace pairs to a campaign's body in the given order, then save once. Later pairs see the result of earlier ones, and empty search texts are skipped. Nothing is saved if no pair matches.",
  {
    campaign_id: z.number().positive().describe("Campaign ID"),
    replacements: z.array(
      z.object({
        search: z.string().describe("Exact text to find"),
        replace: z.string().describe("Replacement text"),
      }),
    ).describe("Search/replace pairs applied in order; each search is a literal, case-sensitive text"),
  },
  BODY_EDIT,
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
