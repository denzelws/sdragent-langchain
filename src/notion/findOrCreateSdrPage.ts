import type { AppConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { askForApproval } from "../utils/terminalApproval.js";
import type { NotionMcpClient } from "./notionMcpClient.js";
import type { NotionPageRef } from "./types.js";

export async function findOrCreateSdrPage(
  notion: NotionMcpClient,
  config: AppConfig
): Promise<NotionPageRef> {
  if (config.notionSdrPageId) {
    logger.info(`Using configured SDRAgent page ID: ${config.notionSdrPageId}`);
    return {
      id: config.notionSdrPageId,
      title: config.notionSdrPageTitle
    };
  }

  const existing = await notion.findPageByTitle(config.notionSdrPageTitle);
  if (existing) {
    logger.info(`Found Notion page: ${existing.title} (${existing.id})`);
    return existing;
  }

  if (!config.notionParentPageId) {
    throw new Error("NOTION_PARENT_PAGE_ID is required to create the SDRAgent page.");
  }

  if (!config.notionWriteEnabled) {
    throw new Error(
      `Notion page "${config.notionSdrPageTitle}" was not found and NOTION_WRITE_ENABLED=false prevents creating it.`
    );
  }

  const approved = config.requireNotionWriteApproval
    ? await askForApproval(`Create Notion page "${config.notionSdrPageTitle}"?`)
    : true;

  if (!approved) {
    throw new Error("Notion page creation rejected by user.");
  }

  const created = await notion.createPage(
    config.notionParentPageId,
    config.notionSdrPageTitle
  );
  logger.info(`Created Notion page: ${created.title} (${created.id})`);
  return created;
}
