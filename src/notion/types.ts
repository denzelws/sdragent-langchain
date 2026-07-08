import type { ProspectNotionRow } from "../prospects/types.js";

export type NotionPageRef = {
  id: string;
  title: string;
};

export type NotionDatabaseRef = {
  id: string;
  title: string;
  kind: "database";
};

export type NotionProspectWriteResult = {
  row: ProspectNotionRow;
  notionId: string | null;
  status: "created" | "skipped_existing";
};

export type NotionToolMapping = {
  search: string | null;
  createPage: string | null;
  createDatabase: string | null;
  queryDatabase: string | null;
  updatePage: string | null;
};

export type NotionToolConfig = {
  search: string | null;
  createPage: string | null;
  createDatabase: string | null;
  queryDatabase: string | null;
  updatePage: string | null;
};
