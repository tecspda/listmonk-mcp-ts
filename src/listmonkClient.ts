import { extname } from "node:path";
import { ListmonkConfig } from "./config.js";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface RequestOptions {
  params?: Record<string, string | number | boolean | null | undefined>;
  json?: JsonValue | Record<string, JsonValue>;
}

export class ListmonkAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: unknown,
    public endpoint?: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = "ListmonkAPIError";
    if (cause) {
      this.cause = cause;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isObject(value: unknown): value is Record<string, JsonValue> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export class ListmonkClient {
  private readonly baseUrl: string;

  constructor(private readonly config: ListmonkConfig) {
    this.baseUrl = config.url.replace(/\/$/, "");
  }

  private authorizationHeader(): string {
    return `token ${this.config.username}:${this.config.password}`;
  }

  private headers(contentType = true): Headers {
    const headers = new Headers();
    headers.set("User-Agent", "Listmonk-MCP-Server-Bun/0.1.0");
    headers.set("Accept", "application/json");
    headers.set("Authorization", this.authorizationHeader());
    if (contentType) {
      headers.set("Content-Type", "application/json");
    }

    return headers;
  }

  private buildUrl(endpoint: string): URL {
    const trimmed = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = new URL(`${this.baseUrl}${trimmed}`);

    return url;
  }

  private async parseResponse(response: Response): Promise<Record<string, JsonValue>> {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      const parsed: unknown = JSON.parse(text);
      if (isObject(parsed)) {
        return parsed;
      }
      if (Array.isArray(parsed)) {
        return { data: parsed as JsonValue } as Record<string, JsonValue>;
      }
      return { data: parsed as JsonValue };
    } catch {
      return { text };
    }
  }

  private async request<T extends Record<string, JsonValue>>(
    method: string,
    endpoint: string,
    options: RequestOptions = {},
    retryCount = 0,
  ): Promise<T> {
    const timeout = this.config.timeout * 1000;
    const url = this.buildUrl(endpoint);

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value === undefined || value === null || value === "") {
          continue;
        }
        url.searchParams.set(key, String(value));
      }
    }

    const init: RequestInit = {
      method,
      headers: this.headers(method !== "GET"),
      signal: AbortSignal.timeout(timeout),
    };

    if (options.json && method !== "GET") {
      init.body = JSON.stringify(options.json);
    }

    try {
      const response = await fetch(url.toString(), init);
      const data = await this.parseResponse(response);

      if (!response.ok) {
        const message = (isObject(data) && "message" in data && typeof data.message === "string")
          ? data.message
          : `HTTP ${response.status}`;
        throw new ListmonkAPIError(message, response.status, data, endpoint);
      }

      return data as T;
    } catch (error) {
      if (error instanceof ListmonkAPIError) {
        throw error;
      }

      if (retryCount < this.config.maxRetries) {
        await sleep(2 ** retryCount * 1000);
        return this.request<T>(method, endpoint, options, retryCount + 1);
      }

      throw new ListmonkAPIError(
        `Request failed: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        endpoint,
        error,
      );
    }
  }

  async healthCheck(): Promise<Record<string, JsonValue>> {
    return this.request<Record<string, JsonValue>>("GET", "/api/health");
  }

  async getSubscribers(
    page = 1,
    perPage = 20,
    orderBy = "created_at",
    order = "desc",
    query?: string,
  ): Promise<Record<string, JsonValue>> {
    return this.request("GET", "/api/subscribers", {
      params: { page, per_page: perPage, order_by: orderBy, order, ...(query ? { query } : {}) },
    });
  }

  async getSubscriber(subscriberId: number): Promise<Record<string, JsonValue>> {
    return this.request("GET", `/api/subscribers/${subscriberId}`);
  }

  async getSubscriberByEmail(email: string): Promise<Record<string, JsonValue>> {
    const response = await this.request("GET", "/api/subscribers", {
      params: { query: `subscribers.email = '${email}'` },
    });

    const data = response.data;
    const results = isObject(data) && Array.isArray((data as Record<string, JsonValue>).results)
      ? (data as Record<string, JsonValue>).results as unknown[]
      : Array.isArray(data)
      ? (data as unknown[])
      : [];

    if (Array.isArray(results) && results.length > 0) {
      return { ...response, data: results[0] as Record<string, JsonValue> };
    }

    throw new ListmonkAPIError(`Subscriber with email ${email} not found`, 404);
  }

  async createSubscriber(
    email: string,
    name: string,
    status = "enabled",
    lists: number[] = [],
    attribs: Record<string, JsonValue> = {},
    preconfirmSubscriptions = false,
  ): Promise<Record<string, JsonValue>> {
    return this.request("POST", "/api/subscribers", {
      json: {
        email,
        name,
        status,
        lists,
        attribs,
        preconfirm_subscriptions: preconfirmSubscriptions,
      },
    });
  }

  async updateSubscriber(
    subscriberId: number,
    payload: {
      email?: string;
      name?: string;
      status?: string;
      lists?: number[];
      attribs?: Record<string, JsonValue>;
    },
  ): Promise<Record<string, JsonValue>> {
    return this.request("PUT", `/api/subscribers/${subscriberId}`, { json: payload });
  }

  async deleteSubscriber(subscriberId: number): Promise<Record<string, JsonValue>> {
    return this.request("DELETE", `/api/subscribers/${subscriberId}`);
  }

  async setSubscriberStatus(subscriberId: number, status: string): Promise<Record<string, JsonValue>> {
    return this.updateSubscriber(subscriberId, { status });
  }

  async getLists(): Promise<Record<string, JsonValue>> {
    return this.request("GET", "/api/lists");
  }

  async getList(listId: number): Promise<Record<string, JsonValue>> {
    return this.request("GET", `/api/lists/${listId}`);
  }

  async createList(
    name: string,
    type = "public",
    optin = "single",
    tags: string[] = [],
    description?: string,
  ): Promise<Record<string, JsonValue>> {
    return this.request("POST", "/api/lists", {
      json: {
        name,
        type,
        optin,
        tags,
        ...(description ? { description } : {}),
      },
    });
  }

  async updateList(
    listId: number,
    payload: {
      name?: string;
      type?: string;
      optin?: string;
      tags?: string[];
      description?: string;
    },
  ): Promise<Record<string, JsonValue>> {
    return this.request("PUT", `/api/lists/${listId}`, { json: payload });
  }

  async deleteList(listId: number): Promise<Record<string, JsonValue>> {
    return this.request("DELETE", `/api/lists/${listId}`);
  }

  async getListSubscribers(
    listId: number,
    page = 1,
    perPage = 20,
  ): Promise<Record<string, JsonValue>> {
    return this.request("GET", "/api/subscribers", {
      params: { page, per_page: perPage, list_id: listId },
    });
  }

  async getCampaigns(
    page = 1,
    perPage = 20,
    status?: string,
  ): Promise<Record<string, JsonValue>> {
    return this.request("GET", "/api/campaigns", {
      params: { page, per_page: perPage, ...(status ? { status } : {}) },
    });
  }

  async getCampaign(campaignId: number): Promise<Record<string, JsonValue>> {
    return this.request("GET", `/api/campaigns/${campaignId}`);
  }

  async createCampaign(payload: {
    name: string;
    subject: string;
    lists: number[];
    type?: string;
    contentType?: string;
    body?: string;
    templateId?: number;
    tags?: string[];
  }): Promise<Record<string, JsonValue>> {
    return this.request("POST", "/api/campaigns", {
      json: {
        name: payload.name,
        subject: payload.subject,
        lists: payload.lists,
        type: payload.type ?? "regular",
        content_type: payload.contentType ?? "richtext",
        ...(payload.body ? { body: payload.body } : {}),
        ...(payload.templateId ? { template_id: payload.templateId } : {}),
        tags: payload.tags ?? [],
      },
    });
  }

  async updateCampaign(
    campaignId: number,
    payload: {
      name?: string;
      subject?: string;
      lists?: number[];
      body?: string;
      tags?: string[];
    },
  ): Promise<Record<string, JsonValue>> {
    if (!payload.lists) {
      const current = await this.getCampaign(campaignId);
      const raw = (current.data as Record<string, JsonValue>) ?? {};
      const rawLists = Array.isArray(raw.lists) ? raw.lists : [];
      payload.lists = rawLists
        .map((value) => (isObject(value) ? Number(value.id) : undefined))
        .filter((value): value is number => Number.isFinite(value));
    }

    return this.request("PUT", `/api/campaigns/${campaignId}`, { json: payload });
  }

  async sendCampaign(campaignId: number): Promise<Record<string, JsonValue>> {
    return this.request("PUT", `/api/campaigns/${campaignId}/status`, {
      json: { status: "running" },
    });
  }

  async scheduleCampaign(campaignId: number, sendAt: string): Promise<Record<string, JsonValue>> {
    return this.request("PUT", `/api/campaigns/${campaignId}/status`, {
      json: { status: "scheduled", send_at: sendAt },
    });
  }

  async getCampaignPreview(campaignId: number): Promise<Record<string, JsonValue>> {
    return this.request("GET", `/api/campaigns/${campaignId}/preview`);
  }

  async getTemplates(): Promise<Record<string, JsonValue>> {
    return this.request("GET", "/api/templates");
  }

  async getTemplate(templateId: number): Promise<Record<string, JsonValue>> {
    return this.request("GET", `/api/templates/${templateId}`);
  }

  async createTemplate(
    name: string,
    body: string,
    type = "campaign",
    isDefault = false,
  ): Promise<Record<string, JsonValue>> {
    return this.request("POST", "/api/templates", {
      json: {
        name,
        body,
        type,
        is_default: isDefault,
      },
    });
  }

  async updateTemplate(
    templateId: number,
    payload: {
      name?: string;
      body?: string;
      isDefault?: boolean;
    },
  ): Promise<Record<string, JsonValue>> {
    if (!payload.body && !payload.name && payload.isDefault === undefined) {
      const current = await this.getTemplate(templateId);
      const currentData = (current.data as Record<string, JsonValue>) ?? {};
      payload = {
        name: (currentData.name as string | undefined),
        body: (currentData.body as string | undefined),
        isDefault: Boolean(currentData.is_default),
      };
    }

    return this.request("PUT", `/api/templates/${templateId}`, { json: payload });
  }

  async deleteTemplate(templateId: number): Promise<Record<string, JsonValue>> {
    return this.request("DELETE", `/api/templates/${templateId}`);
  }

  async sendTransactionalEmail(
    templateId: number,
    subscriberEmail: string,
    data: Record<string, JsonValue> = {},
    contentType = "html",
  ): Promise<Record<string, JsonValue>> {
    return this.request("POST", "/api/tx", {
      json: {
        template_id: templateId,
        subscriber_email: subscriberEmail,
        data,
        content_type: contentType,
      },
    });
  }

  async getMedia(): Promise<Record<string, JsonValue>> {
    return this.request("GET", "/api/media");
  }

  async uploadMedia(filePath: string, title?: string): Promise<Record<string, JsonValue>> {
    const path = filePath;
    const file = Bun.file(path);

    if (!(await file.exists())) {
      throw new ListmonkAPIError(`File not found: ${filePath}`, 404);
    }

    const extension = extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };

    const binary = await file.arrayBuffer();
    const formData = new FormData();
    formData.append("file", new Blob([binary], { type: contentTypes[extension] || "application/octet-stream" }), file.name);

    if (title) {
      formData.append("title", title);
    }

    const headers = this.headers(false);
    const response = await fetch(this.buildUrl("/api/media").toString(), {
      method: "POST",
      headers,
      body: formData,
      signal: AbortSignal.timeout(this.config.timeout * 1000),
    });

    const data = await this.parseResponse(response);
    if (!response.ok) {
      const message = isObject(data) && "message" in data && typeof data.message === "string"
        ? data.message
        : `HTTP ${response.status}`;
      throw new ListmonkAPIError(message, response.status, data, "/api/media");
    }

    return data as Record<string, JsonValue>;
  }

  async updateMedia(mediaId: number, title: string): Promise<Record<string, JsonValue>> {
    return this.request("PUT", `/api/media/${mediaId}`, { json: { title } });
  }

  async deleteMedia(mediaId: number): Promise<Record<string, JsonValue>> {
    return this.request("DELETE", `/api/media/${mediaId}`);
  }
}
