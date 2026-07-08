import { loadConfig } from "../config.js";
import { createGmailClient } from "../gmail/gmailClient.js";
import { readRecentEmails } from "../gmail/readEmails.js";
import { connectMcpServer } from "../mcp/mcpClient.js";
import { createProspectRows } from "../notion/createProspectRows.js";
import { findOrCreateProspectsDatabase } from "../notion/findOrCreateProspectsDatabase.js";
import { findOrCreateSdrPage } from "../notion/findOrCreateSdrPage.js";
import { NotionMcpClient } from "../notion/notionMcpClient.js";
import { createOllamaProvider } from "../llm/ollamaProvider.js";
import { logger } from "../utils/logger.js";
import { askForApproval } from "../utils/terminalApproval.js";
import { extractProspectForNotion } from "./extractProspectForNotion.js";
import type { NotionDatabaseRef } from "../notion/types.js";
import type { ProspectNotionRow } from "./types.js";

type ProspectLoggerReport = {
  emailsRead: number;
  prospectsExtracted: number;
  prospectsAfterDedupe: number;
  rowsCreated: number;
  rowsSkippedExisting: number;
};

function isNewer(candidate: ProspectNotionRow, current: ProspectNotionRow): boolean {
  return new Date(candidate.lastSeen).getTime() > new Date(current.lastSeen).getTime();
}

function mergeRows(current: ProspectNotionRow, candidate: ProspectNotionRow): ProspectNotionRow {
  const preferred = isNewer(candidate, current) ? candidate : current;
  const notes = Array.from(new Set([current.notes, candidate.notes].filter(Boolean))).join(" ");

  return {
    ...preferred,
    name: preferred.name ?? current.name ?? candidate.name,
    company: preferred.company ?? current.company ?? candidate.company,
    notes
  };
}

function getDedupeKey(row: ProspectNotionRow): string {
  // Gmail thread ID is the primary identity. In local tests, many fake prospects can
  // come from the same sender email, so email-only dedupe would merge unrelated leads.
  return row.gmailThreadId ? `thread:${row.gmailThreadId}` : `email:${row.email.toLowerCase()}`;
}

function deduplicateProspects(rows: ProspectNotionRow[], debug: boolean): ProspectNotionRow[] {
  const byKey = new Map<string, ProspectNotionRow>();

  for (const row of rows) {
    const key = getDedupeKey(row);

    if (debug) {
      logger.info(`Dedupe key: ${key}`);
    }

    const current = byKey.get(key);
    byKey.set(key, current ? mergeRows(current, row) : row);
  }

  return [...byKey.values()].sort(
    (left, right) => new Date(right.lastSeen).getTime() - new Date(left.lastSeen).getTime()
  );
}

function printProspectPreview(rows: ProspectNotionRow[]): void {
  logger.info("\nProspects ready for Notion:");
  rows.forEach((row, index) => {
    logger.info(`\n${index + 1}. ${row.name ?? "(unknown name)"}`);
    logger.info(`   Company: ${row.company ?? "(unknown company)"}`);
    logger.info(`   Email: ${row.email}`);
    logger.info(`   Status: ${row.outreachStatus}`);
    logger.info(`   Notes: ${row.notes}`);
    logger.info(`   Source: ${row.sourceSubject}`);
    logger.info(`   Gmail Thread ID: ${row.gmailThreadId ?? "(none)"}`);
    logger.info(`   Last Seen: ${row.lastSeen}`);
  });
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.notionMcpServerCommand) {
    throw new Error("NOTION_MCP_SERVER_COMMAND is required for npm run notion:prospects.");
  }

  const provider = createOllamaProvider(config);
  const gmail = await createGmailClient(config);
  logger.info("Connected to Gmail.");

  const mcp = await connectMcpServer({
    command: config.notionMcpServerCommand,
    args: config.notionMcpServerArgs
  });

  try {
    logger.info("Connected to Notion MCP server.");
    const tools = await mcp.listTools();
    const notion = new NotionMcpClient(
      mcp,
      tools,
      {
        search: config.notionMcpToolSearch,
        fetch: config.notionMcpToolFetch,
        createPages: config.notionMcpToolCreatePages,
        updatePage: config.notionMcpToolUpdatePage,
        createDatabase: config.notionMcpToolCreateDatabase,
        queryDataSources: config.notionMcpToolQueryDataSources
      },
      config.debugMcpOutput
    );

    if (config.debugMcpOutput) {
      logger.info("Available Notion MCP tools:");
      logger.info(notion.getFormattedTools());
      logger.info("Resolved Notion MCP tool mapping:");
      logger.info(notion.getFormattedToolMapping());
    }

    const existingSdrPage = config.notionSdrPageId
      ? {
          id: config.notionSdrPageId,
          title: config.notionSdrPageTitle
        }
      : await notion.findPageByTitle(config.notionSdrPageTitle);
    if (config.notionSdrPageId) {
      logger.info(`Using configured SDRAgent page ID: ${config.notionSdrPageId}`);
    }

    let existingDatabase: NotionDatabaseRef | null = null;
    if (existingSdrPage) {
      logger.info(`Found SDRAgent page: ${existingSdrPage.id}`);
      existingDatabase = config.notionProspectsDataSourceId
        ? {
            id: config.notionProspectsDatabaseId ?? config.notionProspectsDataSourceId,
            title: config.notionProspectsDatabaseTitle,
            kind: "database" as const,
            dataSourceId: config.notionProspectsDataSourceId,
            dataSourceUrl: `collection://${config.notionProspectsDataSourceId}`
          }
        : config.notionProspectsDatabaseId
        ? {
            id: config.notionProspectsDatabaseId,
            title: config.notionProspectsDatabaseTitle,
            kind: "database" as const,
            dataSourceId: null,
            dataSourceUrl: null
          }
        : await notion.findDatabaseByTitle(
            config.notionProspectsDatabaseTitle,
            existingSdrPage.id
          );
      if (config.notionProspectsDataSourceId) {
        logger.info(
          `Using configured Prospects data source ID: ${config.notionProspectsDataSourceId}`
        );
      } else if (config.notionProspectsDatabaseId) {
        logger.info(
          `Using configured Prospects database ID: ${config.notionProspectsDatabaseId}`
        );
      }

      if (existingDatabase) {
        logger.info(`Found Prospects database/table: ${existingDatabase.id}`);
      } else {
        logger.info("Prospects database/table was not found.");
      }
    } else {
      logger.info("SDRAgent page was not found.");
    }

    logger.info(`Reading Gmail with query: ${config.notionProspectGmailQuery}`);
    logger.info(`Max emails: ${config.notionProspectMaxEmails}`);
    const emails = await readRecentEmails(
      gmail,
      config.notionProspectGmailQuery,
      config.notionProspectMaxEmails
    );
    logger.info(`Read ${emails.length} Gmail email(s).`);

    const candidates: ProspectNotionRow[] = [];
    for (const email of emails) {
      const row = await extractProspectForNotion(provider, email, config);
      if (row) {
        candidates.push(row);
      }
    }

    const dedupedRows = deduplicateProspects(candidates, config.debugLlmOutput);
    const report: ProspectLoggerReport = {
      emailsRead: emails.length,
      prospectsExtracted: candidates.length,
      prospectsAfterDedupe: dedupedRows.length,
      rowsCreated: 0,
      rowsSkippedExisting: 0
    };

    logger.info(`Extracted ${candidates.length} prospect row(s).`);
    logger.info(`Deduplicated by Gmail Thread ID to ${dedupedRows.length} prospect row(s).`);

    if (dedupedRows.length > 0) {
      printProspectPreview(dedupedRows);
    }

    if (!config.notionWriteEnabled) {
      logger.info("Notion write skipped. Set NOTION_WRITE_ENABLED=true to write prospects.");
    } else if (dedupedRows.length === 0) {
      logger.info("No prospect rows to write.");
    } else {
      notion.validateWriteCapabilities({
        needsCreatePage: !existingSdrPage,
        needsCreateDatabase: !existingDatabase && !config.notionProspectsDatabaseId,
        needsCreateRows: true,
        parentPageId: config.notionParentPageId,
        hasDataSource:
          Boolean(config.notionProspectsDataSourceId) ||
          Boolean(existingDatabase?.dataSourceId)
      });

      const approved = config.requireNotionWriteApproval
        ? await askForApproval(
            "Create/find the Notion page/database and write these prospects to Notion?"
          )
        : true;

      if (!approved) {
        logger.info("Notion write rejected by user.");
      } else {
        const writeConfig = { ...config, requireNotionWriteApproval: false };
        const sdrPage = await findOrCreateSdrPage(notion, writeConfig);
        const database = await findOrCreateProspectsDatabase(notion, sdrPage, writeConfig);
        const results = await createProspectRows(notion, database, dedupedRows);
        report.rowsCreated = results.filter((result) => result.status === "created").length;
        report.rowsSkippedExisting = results.filter(
          (result) => result.status === "skipped_existing"
        ).length;
      }
    }

    logger.info("\nNotion prospect logger report");
    logger.info(`Emails read: ${report.emailsRead}`);
    logger.info(`Prospects extracted: ${report.prospectsExtracted}`);
    logger.info(`Prospects after thread dedupe: ${report.prospectsAfterDedupe}`);
    logger.info(`Rows created: ${report.rowsCreated}`);
    logger.info(`Rows skipped existing: ${report.rowsSkippedExisting}`);
    logger.info(`Rows written total: ${report.rowsCreated}`);
    logger.info(`Notion writes enabled: ${config.notionWriteEnabled}`);
  } finally {
    await mcp.close();
  }
}

main().catch((error) => {
  logger.error((error as Error).message);
  process.exitCode = 1;
});
