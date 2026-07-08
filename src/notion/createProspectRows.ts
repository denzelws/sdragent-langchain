import type { ProspectNotionRow } from "../prospects/types.js";
import { logger } from "../utils/logger.js";
import type { NotionMcpClient } from "./notionMcpClient.js";
import type { NotionDatabaseRef, NotionProspectWriteResult } from "./types.js";

export async function createProspectRows(
  notion: NotionMcpClient,
  database: NotionDatabaseRef,
  rows: ProspectNotionRow[]
): Promise<NotionProspectWriteResult[]> {
  const results: NotionProspectWriteResult[] = [];

  for (const row of rows) {
    const existingId = await notion.findExistingProspectRow(database.id, row);
    if (existingId) {
      logger.info(`Prospect already exists in Notion, skipping: ${row.email}`);
      results.push({
        row,
        notionId: existingId,
        status: "skipped_existing"
      });
      continue;
    }

    const result = await notion.createProspectRow(database.id, row);
    results.push(result);
    logger.info(`Created prospect row in Notion: ${row.email}`);
  }

  return results;
}
