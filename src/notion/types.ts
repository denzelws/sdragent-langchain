import type { ProspectNotionRow } from "../prospects/types.js";

export type NotionPageRef = {
  id: string;
  title: string;
};

export type NotionDatabaseRef = {
  id: string;
  title: string;
  kind: "database";
  dataSourceId: string | null;
  dataSourceUrl: string | null;
};

export type NotionProspectWriteResult = {
  row: ProspectNotionRow;
  notionId: string | null;
  status: "created" | "skipped_existing";
};

export type NotionToolMapping = {
  search: string | null;
  fetch: string | null;
  createPages: string | null;
  updatePage: string | null;
  createDatabase: string | null;
  queryDataSources: string | null;
};

export type NotionToolConfig = {
  search: string | null;
  fetch: string | null;
  createPages: string | null;
  updatePage: string | null;
  createDatabase: string | null;
  queryDataSources: string | null;
};
