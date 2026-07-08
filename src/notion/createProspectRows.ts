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
  let existingRowLookupDisabled = false;

  for (const row of rows) {
    if (!existingRowLookupDisabled) {
      try {
        const existingId = await notion.findExistingProspectRow(database, row);
        if (existingId) {
          const identity = row.gmailThreadId ?? row.email;
          logger.info(`Skipped existing prospect row: ${identity}`);
          results.push({
            row,
            notionId: existingId,
            status: "skipped_existing"
          });
          continue;
        }
      } catch (error) {
        existingRowLookupDisabled = true;
        logger.warn("Could not query existing Notion rows. Continuing create-only after approval.");
        logger.warn(`Reason: ${(error as Error).message}`);
      }
    }

    const result = await notion.createProspectRow(database, row);
    results.push(result);
    logger.info(`Created prospect row in Notion: ${row.email}`);
  }

  return results;
}
