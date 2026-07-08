import type { AppConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { askForApproval } from "../utils/terminalApproval.js";
import type { NotionMcpClient } from "./notionMcpClient.js";
import type { NotionDatabaseRef, NotionPageRef } from "./types.js";

export async function findOrCreateProspectsDatabase(
  notion: NotionMcpClient,
  sdrPage: NotionPageRef,
  config: AppConfig
): Promise<NotionDatabaseRef> {
  if (config.notionProspectsDataSourceId) {
    const dataSourceUrl = `collection://${config.notionProspectsDataSourceId}`;
    logger.info(
      `Using configured Prospects data source ID: ${config.notionProspectsDataSourceId}`
    );
    return {
      id: config.notionProspectsDatabaseId ?? config.notionProspectsDataSourceId,
      title: config.notionProspectsDatabaseTitle,
      kind: "database",
      dataSourceId: config.notionProspectsDataSourceId,
      dataSourceUrl
    };
  }

  if (config.notionProspectsDatabaseId) {
    logger.info(
      `Using configured Prospects database ID: ${config.notionProspectsDatabaseId}`
    );
    return notion.fetchDatabaseDataSource({
      id: config.notionProspectsDatabaseId,
      title: config.notionProspectsDatabaseTitle,
      kind: "database",
      dataSourceId: null,
      dataSourceUrl: null
    });
  }

  const existing = await notion.findDatabaseByTitle(
    config.notionProspectsDatabaseTitle,
    sdrPage.id
  );
  if (existing) {
    logger.info(`Found Notion database: ${existing.title} (${existing.id})`);
    return notion.fetchDatabaseDataSource(existing);
  }

  if (!config.notionWriteEnabled) {
    throw new Error(
      `Notion database "${config.notionProspectsDatabaseTitle}" was not found and NOTION_WRITE_ENABLED=false prevents creating it.`
    );
  }

  const approved = config.requireNotionWriteApproval
    ? await askForApproval(
        `Create Notion database "${config.notionProspectsDatabaseTitle}" in ${sdrPage.title}?`
      )
    : true;

  if (!approved) {
    throw new Error("Notion database creation rejected by user.");
  }

  const created = await notion.createProspectsDatabase(
    sdrPage.id,
    config.notionProspectsDatabaseTitle
  );
  logger.info(`Created Notion database: ${created.title} (${created.id})`);
  return created;
}
