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

export function formatTools(tools: McpToolInfo[]): string {
  return tools
    .map((tool) => `- ${tool.name}${tool.description ? `: ${tool.description}` : ""}`)
    .join("\n");
}

function getToolText(tool: McpToolInfo): string {
  return `${tool.name} ${tool.description ?? ""}`.toLowerCase();
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
      configuredTools.search ??
      findTool(
        tools,
        (text) => text.includes("search") && (text.includes("notion") || text.includes("page"))
      ),
    createPage:
      configuredTools.createPage ??
      findTool(
        tools,
        (text) =>
          text.includes("create") &&
          text.includes("page") &&
          !text.includes("database schema")
      ),
    createDatabase:
      configuredTools.createDatabase ??
      findTool(tools, (text) => text.includes("create") && text.includes("database")),
    queryDatabase:
      configuredTools.queryDatabase ??
      findTool(
        tools,
        (text) =>
          (text.includes("query") || text.includes("search")) &&
          text.includes("database") &&
          (text.includes("row") || text.includes("page") || text.includes("item"))
      ),
    updatePage:
      configuredTools.updatePage ??
      findTool(tools, (text) => text.includes("update") && text.includes("page"))
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
    return id && objectTitle?.trim().toLowerCase() === normalizedTitle && getObjectKind(object) === "page";
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
    return id && objectTitle?.trim().toLowerCase() === normalizedTitle && getObjectKind(object) === null;
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
      object,
      id: object.id as string,
      title: readTitle(object) ?? title,
      kind: getObjectKind(object),
      parentPageId: getParentPageId(object)
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
        kind: "database"
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
      kind: "database"
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
    kind: "database"
  }));
}

function firstIdFromResult(result: unknown): string | null {
  const objects = collectObjects(normalizeMcpResult(result));
  return objects.find((object) => typeof object.id === "string")?.id as string | null;
}

function richText(content: string): Array<{ type: "text"; text: { content: string } }> {
  return [{ type: "text", text: { content } }];
}

function containsValue(result: unknown, value: string | null): boolean {
  if (!value) {
    return false;
  }

  return JSON.stringify(normalizeMcpResult(result)).toLowerCase().includes(value.toLowerCase());
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
  }

  getAvailableTools(): McpToolInfo[] {
    return this.tools;
  }

  getFormattedTools(): string {
    return formatTools(this.tools);
  }

  async findPageByTitle(title: string): Promise<NotionPageRef | null> {
    const tool = requireTool(
      this.toolMapping,
      "search",
      "searching pages",
      this.tools,
      "NOTION_MCP_TOOL_SEARCH"
    );
    const result = await this.mcp.callTool(tool, { query: title });
    return findPageRefByTitle(result, title, this.debug);
  }

  async createPage(parentPageId: string, title: string): Promise<NotionPageRef> {
    const tool = requireTool(
      this.toolMapping,
      "createPage",
      "creating pages",
      this.tools,
      "NOTION_MCP_TOOL_CREATE_PAGE"
    );
    const result = await this.mcp.callTool(tool, {
      parent: { page_id: parentPageId },
      parentPageId,
      title,
      properties: {
        title: { title: richText(title) },
        Name: { title: richText(title) }
      }
    });
    const id = firstIdFromResult(result);
    if (!id) {
      throw new Error("Notion page was created but no page id was returned by the MCP tool.");
    }

    return { id, title };
  }

  async findDatabaseByTitle(
    title: string,
    parentPageId: string | null
  ): Promise<NotionDatabaseRef | null> {
    const tool = requireTool(
      this.toolMapping,
      "search",
      "searching databases",
      this.tools,
      "NOTION_MCP_TOOL_SEARCH"
    );
    const result = await this.mcp.callTool(tool, { query: title });
    const refs = findDatabaseRefsByTitle(result, title, parentPageId, this.debug);
    return refs[0] ?? null;
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
    const result = await this.mcp.callTool(tool, {
      parent: { page_id: parentPageId },
      parentPageId,
      title: richText(title),
      properties: {
        Name: { title: {} },
        Company: { rich_text: {} },
        Email: { email: {} },
        "Outreach Status": {
          select: {
            options: [
              { name: "new", color: "blue" },
              { name: "qualified", color: "green" },
              { name: "possible", color: "yellow" },
              { name: "needs_review", color: "orange" }
            ]
          }
        },
        Notes: { rich_text: {} },
        "Source Subject": { rich_text: {} },
        "Gmail Thread ID": { rich_text: {} },
        "Last Seen": { date: {} }
      }
    });
    const id = firstIdFromResult(result);
    if (!id) {
      throw new Error("Notion database was created but no database id was returned by the MCP tool.");
    }

    return { id, title, kind: "database" };
  }

  async findExistingProspectRow(
    databaseId: string,
    row: ProspectNotionRow
  ): Promise<string | null> {
    const tool = requireTool(
      this.toolMapping,
      "queryDatabase",
      "querying database rows before creating prospect rows",
      this.tools,
      "NOTION_MCP_TOOL_QUERY_DATABASE"
    );
    const result = await this.mcp.callTool(tool, {
      database_id: databaseId,
      databaseId,
      filter: {
        or: [
          { property: "Email", email: { equals: row.email } },
          ...(row.gmailThreadId
            ? [
                {
                  property: "Gmail Thread ID",
                  rich_text: { equals: row.gmailThreadId }
                }
              ]
            : [])
        ]
      }
    });

    if (!containsValue(result, row.email) && !containsValue(result, row.gmailThreadId)) {
      return null;
    }

    return firstIdFromResult(result);
  }

  async createProspectRow(
    databaseId: string,
    row: ProspectNotionRow
  ): Promise<NotionProspectWriteResult> {
    const tool = requireTool(
      this.toolMapping,
      "createPage",
      "creating database rows",
      this.tools,
      "NOTION_MCP_TOOL_CREATE_PAGE"
    );
    const result = await this.mcp.callTool(tool, {
      parent: { database_id: databaseId },
      databaseId,
      properties: {
        Name: { title: richText(row.name ?? row.email) },
        Company: { rich_text: richText(row.company ?? "") },
        Email: { email: row.email },
        "Outreach Status": { select: { name: row.outreachStatus } },
        Notes: { rich_text: richText(row.notes) },
        "Source Subject": { rich_text: richText(row.sourceSubject) },
        "Gmail Thread ID": { rich_text: richText(row.gmailThreadId ?? "") },
        "Last Seen": { date: { start: row.lastSeen } }
      }
    });

    return {
      row,
      notionId: firstIdFromResult(result),
      status: "created"
    };
  }
}
