import type { ConnectedMcpClient } from "../mcp/mcpClient.js";
import type { McpToolInfo } from "../mcp/types.js";
import type { ProspectNotionRow } from "../prospects/types.js";
import { logger } from "../utils/logger.js";
import type {
  NotionDatabaseRef,
  NotionPageRef,
  NotionProspectWriteResult,
  NotionToolConfig,
  NotionToolMapping
} from "./types.js";

type JsonObject = Record<string, unknown>;

const HOSTED_TOOL_NAMES: Record<keyof NotionToolMapping, string> = {
  search: "notion-search",
  fetch: "notion-fetch",
  createPages: "notion-create-pages",
  updatePage: "notion-update-page",
  createDatabase: "notion-create-database",
  queryDataSources: "notion-query-data-sources"
};

export function formatTools(tools: McpToolInfo[]): string {
  return tools
    .map((tool) => `- ${tool.name}${tool.description ? `: ${tool.description}` : ""}`)
    .join("\n");
}

function getToolText(tool: McpToolInfo): string {
  return `${tool.name} ${tool.description ?? ""}`.toLowerCase().replace(/[-_]/g, " ");
}

function hasTool(tools: McpToolInfo[], name: string): boolean {
  return tools.some((tool) => tool.name === name);
}

function exactOrConfigured(
  tools: McpToolInfo[],
  configured: string | null,
  hostedName: string
): string | null {
  if (configured) {
    return configured;
  }

  return hasTool(tools, hostedName) ? hostedName : null;
}

function findTool(tools: McpToolInfo[], predicate: (text: string) => boolean): string | null {
  return tools.find((tool) => predicate(getToolText(tool)))?.name ?? null;
}

function resolveToolMapping(
  tools: McpToolInfo[],
  configuredTools: NotionToolConfig
): NotionToolMapping {
  return {
    search:
      exactOrConfigured(tools, configuredTools.search, HOSTED_TOOL_NAMES.search) ??
      findTool(tools, (text) => text.includes("search") && text.includes("notion")),
    fetch:
      exactOrConfigured(tools, configuredTools.fetch, HOSTED_TOOL_NAMES.fetch) ??
      findTool(tools, (text) => text.includes("fetch") && text.includes("notion")),
    createPages:
      exactOrConfigured(
        tools,
        configuredTools.createPages,
        HOSTED_TOOL_NAMES.createPages
      ) ??
      findTool(
        tools,
        (text) =>
          (text.includes("create pages") || text.includes("create page")) &&
          !text.includes("attachment") &&
          !text.includes("search") &&
          !text.includes("fetch") &&
          !text.includes("query")
      ),
    updatePage:
      exactOrConfigured(tools, configuredTools.updatePage, HOSTED_TOOL_NAMES.updatePage) ??
      findTool(
        tools,
        (text) => text.includes("update page") && !text.includes("search")
      ),
    createDatabase:
      exactOrConfigured(
        tools,
        configuredTools.createDatabase,
        HOSTED_TOOL_NAMES.createDatabase
      ) ??
      findTool(
        tools,
        (text) =>
          text.includes("create database") &&
          !text.includes("search") &&
          !text.includes("fetch") &&
          !text.includes("query")
      ),
    queryDataSources:
      exactOrConfigured(
        tools,
        configuredTools.queryDataSources,
        HOSTED_TOOL_NAMES.queryDataSources
      ) ??
      findTool(
        tools,
        (text) =>
          text.includes("query data sources") ||
          text.includes("query data source")
      )
  };
}

function requireTool(
  mapping: NotionToolMapping,
  key: keyof NotionToolMapping,
  purpose: string,
  tools: McpToolInfo[],
  envVarName: string
): string {
  const tool = mapping[key];
  if (tool) {
    if (!hasTool(tools, tool)) {
      throw new Error(
        [
          `Configured Notion MCP tool "${tool}" for ${purpose} was not found.`,
          "",
          "Available tools:",
          formatTools(tools),
          "",
          `Check ${envVarName}.`
        ].join("\n")
      );
    }

    return tool;
  }

  throw new Error(
    [
      `Could not find a Notion MCP tool for ${purpose}.`,
      "",
      "Available tools:",
      formatTools(tools),
      "",
      `Set ${envVarName} or update the adapter mapping.`
    ].join("\n")
  );
}

function parseJsonText(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeMcpResult(result: unknown): unknown {
  if (!result || typeof result !== "object") {
    return result;
  }

  const object = result as JsonObject;
  if (object.isError) {
    throw new Error(`Notion MCP tool returned an error: ${JSON.stringify(result)}`);
  }

  if ("structuredContent" in object && object.structuredContent) {
    return object.structuredContent;
  }

  if ("toolResult" in object) {
    return object.toolResult;
  }

  const content = object.content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (
        item &&
        typeof item === "object" &&
        "text" in item &&
        typeof item.text === "string"
      ) {
        return parseJsonText(item.text);
      }

      return item;
    });
  }

  return result;
}

function resultToText(result: unknown): string {
  const normalized = normalizeMcpResult(result);

  if (typeof normalized === "string") {
    return normalized;
  }

  if (Array.isArray(normalized)) {
    return normalized
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .join("\n");
  }

  return JSON.stringify(normalized);
}

function collectObjects(value: unknown, output: JsonObject[] = []): JsonObject[] {
  if (!value || typeof value !== "object") {
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjects(item, output);
    }
    return output;
  }

  const object = value as JsonObject;
  output.push(object);

  for (const child of Object.values(object)) {
    collectObjects(child, output);
  }

  return output;
}

function readPlainText(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(readPlainText).filter(Boolean).join(" ").trim() || null;
  }

  const object = value as JsonObject;
  if (typeof object.plain_text === "string") {
    return object.plain_text;
  }
  if (typeof object.content === "string") {
    return object.content;
  }
  if (typeof object.name === "string") {
    return object.name;
  }
  if (typeof object.title === "string") {
    return object.title;
  }
  if (object.text) {
    return readPlainText(object.text);
  }
  if (object.title) {
    return readPlainText(object.title);
  }

  return null;
}

function readTitle(object: JsonObject): string | null {
  const direct = readPlainText(object.title);
  if (direct) {
    return direct;
  }

  const properties = object.properties;
  if (properties && typeof properties === "object") {
    for (const property of Object.values(properties as JsonObject)) {
      const title = readPlainText(property);
      if (title) {
        return title;
      }
    }
  }

  return null;
}

function getObjectKind(object: JsonObject): "page" | "database" | null {
  if (object.object === "page" || object.type === "page") {
    return "page";
  }

  if (object.object === "database" || object.type === "database") {
    return "database";
  }

  return null;
}

function getParentPageId(object: JsonObject): string | null {
  const parent = object.parent;
  if (!parent || typeof parent !== "object") {
    return null;
  }

  const parentObject = parent as JsonObject;
  if (typeof parentObject.page_id === "string") {
    return parentObject.page_id;
  }
  if (typeof parentObject.pageId === "string") {
    return parentObject.pageId;
  }

  return null;
}

function parseFirstIdFromResult(result: unknown): string | null {
  const objects = collectObjects(normalizeMcpResult(result));
  const objectId = objects.find((object) => typeof object.id === "string")?.id;
  if (typeof objectId === "string") {
    return objectId;
  }

  const text = resultToText(result);
  return (
    text.match(/(?:page|database|block):\/\/([a-f0-9-]{32,36})/i)?.[1] ??
    text.match(/\b([a-f0-9]{32}|[a-f0-9-]{36})\b/i)?.[1] ??
    null
  );
}

function parseFirstDataSourceUrl(result: unknown): string | null {
  const text = resultToText(result);
  return text.match(/<data-source\s+url="(collection:\/\/[^"]+)"/i)?.[1] ?? null;
}

function parseDataSourceIdFromUrl(url: string | null): string | null {
  if (!url) {
    return null;
  }

  return url.replace(/^collection:\/\//, "").trim() || null;
}

function dataSourceUrlFromId(dataSourceId: string | null): string | null {
  return dataSourceId ? `collection://${dataSourceId}` : null;
}

function findPageRefByTitle(
  result: unknown,
  title: string,
  debug: boolean
): NotionPageRef | null {
  const normalizedTitle = title.trim().toLowerCase();
  const objects = collectObjects(normalizeMcpResult(result));
  const typedMatches = objects.filter((object) => {
    const id = typeof object.id === "string" ? object.id : null;
    const objectTitle = readTitle(object);
    return (
      id &&
      objectTitle?.trim().toLowerCase() === normalizedTitle &&
      getObjectKind(object) === "page"
    );
  });

  if (typedMatches.length > 0) {
    return {
      id: typedMatches[0].id as string,
      title: readTitle(typedMatches[0]) ?? title
    };
  }

  const fallbackMatches = objects.filter((object) => {
    const id = typeof object.id === "string" ? object.id : null;
    const objectTitle = readTitle(object);
    return (
      id &&
      objectTitle?.trim().toLowerCase() === normalizedTitle &&
      getObjectKind(object) === null
    );
  });

  if (fallbackMatches.length > 0 && debug) {
    logger.warn("Notion page search result did not expose object type; using title/id fallback.");
  }

  return fallbackMatches[0]
    ? { id: fallbackMatches[0].id as string, title: readTitle(fallbackMatches[0]) ?? title }
    : null;
}

function findDatabaseRefsByTitle(
  result: unknown,
  title: string,
  parentPageId: string | null,
  debug: boolean
): NotionDatabaseRef[] {
  const normalizedTitle = title.trim().toLowerCase();
  const objects = collectObjects(normalizeMcpResult(result));
  const candidates = objects
    .filter((object) => {
      const id = typeof object.id === "string" ? object.id : null;
      const objectTitle = readTitle(object);
      const kind = getObjectKind(object);
      return (
        id &&
        objectTitle?.trim().toLowerCase() === normalizedTitle &&
        (kind === "database" || kind === null)
      );
    })
    .map((object) => ({
      id: object.id as string,
      title: readTitle(object) ?? title,
      kind: getObjectKind(object),
      parentPageId: getParentPageId(object),
      dataSourceUrl: parseFirstDataSourceUrl(object),
      dataSourceId: parseDataSourceIdFromUrl(parseFirstDataSourceUrl(object))
    }));

  const typedCandidates = candidates.filter((candidate) => candidate.kind === "database");
  const usableCandidates = typedCandidates.length > 0 ? typedCandidates : candidates;

  if (typedCandidates.length === 0 && usableCandidates.length > 0 && debug) {
    logger.warn("Notion database search result did not expose object type; using title/id fallback.");
  }

  if (parentPageId) {
    const parentMatches = usableCandidates.filter(
      (candidate) => candidate.parentPageId === parentPageId
    );
    if (parentMatches.length > 0) {
      return parentMatches.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        kind: "database",
        dataSourceId: candidate.dataSourceId,
        dataSourceUrl: candidate.dataSourceUrl
      }));
    }

    const parentUnknown = usableCandidates.filter((candidate) => !candidate.parentPageId);
    if (parentUnknown.length > 0 && debug) {
      logger.warn("Notion database parent page could not be verified from MCP search result.");
    }

    if (parentUnknown.length > 1) {
      throw new Error(
        `Multiple Notion databases titled "${title}" were found and the SDRAgent parent page could not be verified.\nPlease configure the exact database id or improve the MCP tool mapping.`
      );
    }

    return parentUnknown.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      kind: "database",
      dataSourceId: candidate.dataSourceId,
      dataSourceUrl: candidate.dataSourceUrl
    }));
  }

  if (usableCandidates.length > 1) {
    throw new Error(
      `Multiple Notion databases titled "${title}" were found and no parent page was provided for validation.`
    );
  }

  return usableCandidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    kind: "database",
    dataSourceId: candidate.dataSourceId,
    dataSourceUrl: candidate.dataSourceUrl
  }));
}

function formatToolMapping(mapping: NotionToolMapping): string {
  return [
    `search: ${mapping.search ?? "(missing)"}`,
    `fetch: ${mapping.fetch ?? "(missing)"}`,
    `createPages: ${mapping.createPages ?? "(missing)"}`,
    `createDatabase: ${mapping.createDatabase ?? "(missing)"}`,
    `queryDataSources: ${mapping.queryDataSources ?? "(missing)"}`,
    `updatePage: ${mapping.updatePage ?? "(missing)"}`
  ].join("\n");
}

function assertDisallowedMapping(
  mapping: NotionToolMapping,
  key: keyof NotionToolMapping,
  disallowed: string[]
): void {
  const tool = mapping[key];
  if (!tool || !disallowed.includes(tool)) {
    return;
  }

  throw new Error(
    [
      "Invalid Notion MCP tool mapping:",
      `${key} resolved to ${tool}.`,
      "This is not allowed."
    ].join("\n")
  );
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

export class NotionMcpClient {
  private readonly toolMapping: NotionToolMapping;

  constructor(
    private readonly mcp: ConnectedMcpClient,
    private readonly tools: McpToolInfo[],
    configuredTools: NotionToolConfig,
    private readonly debug: boolean
  ) {
    this.toolMapping = resolveToolMapping(tools, configuredTools);
    assertDisallowedMapping(this.toolMapping, "createPages", [
      "notion-create-attachment",
      "notion-search",
      "notion-fetch",
      "notion-update-page"
    ]);
    assertDisallowedMapping(this.toolMapping, "createDatabase", [
      "notion-search",
      "notion-fetch",
      "notion-query-database-view",
      "notion-query-data-sources"
    ]);
    assertDisallowedMapping(this.toolMapping, "updatePage", ["notion-search"]);
  }

  getFormattedTools(): string {
    return formatTools(this.tools);
  }

  getFormattedToolMapping(): string {
    return formatToolMapping(this.toolMapping);
  }

  validateWriteCapabilities(params: {
    needsCreatePage: boolean;
    needsCreateDatabase: boolean;
    needsCreateRows: boolean;
    parentPageId: string | null;
    hasDataSource: boolean;
  }): void {
    if (params.needsCreatePage && !params.parentPageId) {
      throw new Error("NOTION_PARENT_PAGE_ID is required to create the SDRAgent page.");
    }

    if (params.needsCreatePage || params.needsCreateRows) {
      requireTool(
        this.toolMapping,
        "createPages",
        params.needsCreatePage ? "creating pages" : "creating database rows",
        this.tools,
        "NOTION_MCP_TOOL_CREATE_PAGES"
      );
    }

    if (params.needsCreateDatabase) {
      try {
        requireTool(
          this.toolMapping,
          "createDatabase",
          "creating databases",
          this.tools,
          "NOTION_MCP_TOOL_CREATE_DATABASE"
        );
      } catch (error) {
        throw new Error(
          `${(error as Error).message}\n\nEither configure NOTION_MCP_TOOL_CREATE_DATABASE or create the Prospects database manually and configure NOTION_PROSPECTS_DATABASE_ID.`
        );
      }
    }

    if (params.needsCreateRows && !params.hasDataSource && !params.needsCreateDatabase) {
      requireTool(
        this.toolMapping,
        "fetch",
        "fetching database data source metadata",
        this.tools,
        "NOTION_MCP_TOOL_FETCH"
      );
    }

    if (params.needsCreateRows) {
      requireTool(
        this.toolMapping,
        "queryDataSources",
        "querying data sources before creating prospect rows",
        this.tools,
        "NOTION_MCP_TOOL_QUERY_DATA_SOURCES"
      );
    }
  }

  private callTool(
    tool: string,
    purpose: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (this.debug) {
      logger.info(`Calling Notion MCP tool: ${tool}`);
      logger.info(`Purpose: ${purpose}`);
      logger.info(`Arguments keys: ${Object.keys(args).join(", ") || "(none)"}`);
    }

    return this.mcp.callTool(tool, args);
  }

  private assertSearchQuery(query: string, purpose: string): void {
    if (!query.trim()) {
      throw new Error(`Notion search query is required before calling the search tool for ${purpose}.`);
    }
  }

  async findPageByTitle(title: string): Promise<NotionPageRef | null> {
    this.assertSearchQuery(title, "find page by title");
    const tool = requireTool(
      this.toolMapping,
      "search",
      "searching pages",
      this.tools,
      "NOTION_MCP_TOOL_SEARCH"
    );
    const result = await this.callTool(tool, "find page by title", { query: title });
    return findPageRefByTitle(result, title, this.debug);
  }

  async createPage(parentPageId: string, title: string): Promise<NotionPageRef> {
    const tool = requireTool(
      this.toolMapping,
      "createPages",
      "creating pages",
      this.tools,
      "NOTION_MCP_TOOL_CREATE_PAGES"
    );
    const result = await this.callTool(tool, "create SDRAgent page", {
      parent: { page_id: parentPageId },
      pages: [
        {
          properties: {
            title
          }
        }
      ]
    });
    const id = parseFirstIdFromResult(result);
    if (!id) {
      throw new Error("Notion page was created but no page id was returned by the MCP tool.");
    }

    return { id, title };
  }

  async findDatabaseByTitle(
    title: string,
    parentPageId: string | null
  ): Promise<NotionDatabaseRef | null> {
    this.assertSearchQuery(title, "find database by title");
    const tool = requireTool(
      this.toolMapping,
      "search",
      "searching databases",
      this.tools,
      "NOTION_MCP_TOOL_SEARCH"
    );
    const result = await this.callTool(tool, "find database by title", { query: title });
    const refs = findDatabaseRefsByTitle(result, title, parentPageId, this.debug);
    return refs[0] ?? null;
  }

  async fetchDatabaseDataSource(database: NotionDatabaseRef): Promise<NotionDatabaseRef> {
    if (database.dataSourceId && database.dataSourceUrl) {
      return database;
    }

    const tool = requireTool(
      this.toolMapping,
      "fetch",
      "fetching database data source metadata",
      this.tools,
      "NOTION_MCP_TOOL_FETCH"
    );
    const result = await this.callTool(tool, "fetch database data source metadata", {
      id: database.id
    });
    const dataSourceUrl = parseFirstDataSourceUrl(result);
    const dataSourceId = parseDataSourceIdFromUrl(dataSourceUrl);
    if (!dataSourceId || !dataSourceUrl) {
      throw new Error(
        "Notion database was fetched, but no data source ID was returned. Configure NOTION_PROSPECTS_DATA_SOURCE_ID."
      );
    }

    return {
      ...database,
      dataSourceId,
      dataSourceUrl
    };
  }

  async createProspectsDatabase(
    parentPageId: string,
    title: string
  ): Promise<NotionDatabaseRef> {
    const tool = requireTool(
      this.toolMapping,
      "createDatabase",
      "creating databases",
      this.tools,
      "NOTION_MCP_TOOL_CREATE_DATABASE"
    );
    const result = await this.callTool(tool, "create prospects database", {
      parent: { page_id: parentPageId },
      title,
      schema:
        'CREATE TABLE ("Name" TITLE, "Company" RICH_TEXT, "Email" EMAIL, "Outreach Status" SELECT(\'new\':blue, \'qualified\':green, \'possible\':yellow, \'needs_review\':orange), "Notes" RICH_TEXT, "Source Subject" RICH_TEXT, "Gmail Thread ID" RICH_TEXT, "Last Seen" DATE)'
    });
    const id = parseFirstIdFromResult(result);
    const dataSourceUrl = parseFirstDataSourceUrl(result);
    const dataSourceId = parseDataSourceIdFromUrl(dataSourceUrl);
    if (!id) {
      throw new Error("Notion database was created but no database id was returned by the MCP tool.");
    }
    if (!dataSourceId || !dataSourceUrl) {
      throw new Error(
        "Notion database was created, but no data source ID was returned. Fetch the database or configure NOTION_PROSPECTS_DATA_SOURCE_ID."
      );
    }

    return { id, title, kind: "database", dataSourceId, dataSourceUrl };
  }

  async findExistingProspectRow(
    database: NotionDatabaseRef,
    row: ProspectNotionRow
  ): Promise<string | null> {
    if (!database.dataSourceUrl) {
      throw new Error("A Notion data source URL is required to query existing prospect rows.");
    }

    const tool = requireTool(
      this.toolMapping,
      "queryDataSources",
      "querying data sources before creating prospect rows",
      this.tools,
      "NOTION_MCP_TOOL_QUERY_DATA_SOURCES"
    );
    const filters = [`"Email" = '${escapeSql(row.email)}'`];
    if (row.gmailThreadId) {
      filters.push(`"Gmail Thread ID" = '${escapeSql(row.gmailThreadId)}'`);
    }

    try {
      const result = await this.callTool(tool, "find existing prospect row", {
        data_source_url: database.dataSourceUrl,
        query: `SELECT * WHERE ${filters.join(" OR ")} LIMIT 1`
      });

      const text = resultToText(result).toLowerCase();
      if (!text.includes(row.email.toLowerCase()) && !text.includes((row.gmailThreadId ?? "").toLowerCase())) {
        return null;
      }

      return parseFirstIdFromResult(result);
    } catch (error) {
      logger.warn(
        `Could not query existing Notion rows; continuing create-only after approval: ${(error as Error).message}`
      );
      return null;
    }
  }

  async createProspectRow(
    database: NotionDatabaseRef,
    row: ProspectNotionRow
  ): Promise<NotionProspectWriteResult> {
    if (!database.dataSourceId) {
      throw new Error("A Notion data source ID is required to create prospect rows.");
    }

    const tool = requireTool(
      this.toolMapping,
      "createPages",
      "creating database rows",
      this.tools,
      "NOTION_MCP_TOOL_CREATE_PAGES"
    );
    const result = await this.callTool(tool, "create prospect database row", {
      parent: { data_source_id: database.dataSourceId },
      pages: [
        {
          properties: {
            Name: row.name ?? row.email,
            Company: row.company ?? "",
            Email: row.email,
            "Outreach Status": row.outreachStatus,
            Notes: row.notes,
            "Source Subject": row.sourceSubject,
            "Gmail Thread ID": row.gmailThreadId ?? "",
            "date:Last Seen:start": row.lastSeen,
            "date:Last Seen:is_datetime": 1
          }
        }
      ]
    });

    return {
      row,
      notionId: parseFirstIdFromResult(result),
      status: "created"
    };
  }
}
