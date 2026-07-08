import dotenv from "dotenv";

dotenv.config();

export type WorkflowMode = "all" | "meeting" | "product-faq" | "sdr";

export type AppConfig = {
  ollamaModel: string;
  ollamaBaseUrl: string;
  senderName: string;
  gmailCredentialsPath: string;
  gmailTokenPath: string;
  gmailQuery: string;
  maxEmails: number;
  workflowMode: WorkflowMode;
  skipProcessedEmails: boolean;
  processedEmailStorePath: string;
  dryRun: boolean;
  createDrafts: boolean;
  requireDraftApproval: boolean;
  sendApprovedDrafts: boolean;
  requireSendApproval: boolean;
  enableMeetingWorkflow: boolean;
  createCalendarEvents: boolean;
  requireCalendarEventApproval: boolean;
  defaultTimezone: string;
  debugLlmOutput: boolean;
  debugMcpOutput: boolean;
  notionMcpServerCommand: string | null;
  notionMcpServerArgs: string[];
  notionParentPageId: string | null;
  notionSdrPageTitle: string;
  notionProspectsDatabaseTitle: string;
  notionProspectsDatabaseId: string | null;
  notionProspectsDataSourceId: string | null;
  notionWriteEnabled: boolean;
  requireNotionWriteApproval: boolean;
  notionProspectGmailQuery: string;
  notionProspectMaxEmails: number;
  notionMcpToolSearch: string | null;
  notionMcpToolFetch: string | null;
  notionMcpToolCreatePages: string | null;
  notionMcpToolUpdatePage: string | null;
  notionMcpToolCreateDatabase: string | null;
  notionMcpToolQueryDataSources: string | null;
};

const DEFAULT_GMAIL_QUERY = "in:inbox newer_than:7d";
const WORKFLOW_MODES = new Set(["all", "meeting", "product-faq", "sdr"]);

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseWorkflowMode(value: string | undefined): WorkflowMode {
  if (!value) {
    return "all";
  }

  const normalized = value.trim();
  if (WORKFLOW_MODES.has(normalized)) {
    return normalized as WorkflowMode;
  }

  console.warn(`Invalid WORKFLOW_MODE "${value}". Defaulting to "all".`);
  return "all";
}

function parseOptionalString(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseCommaSeparatedArgs(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(): AppConfig {
  return {
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2:3b",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    senderName: process.env.SENDER_NAME?.trim() || "Denzel",
    gmailCredentialsPath: process.env.GMAIL_CREDENTIALS_PATH ?? "./credentials.json",
    gmailTokenPath: process.env.GMAIL_TOKEN_PATH ?? "./token.json",
    gmailQuery: process.env.GMAIL_QUERY ?? DEFAULT_GMAIL_QUERY,
    maxEmails: parseNumber(process.env.MAX_EMAILS, 10),
    workflowMode: parseWorkflowMode(process.env.WORKFLOW_MODE),
    skipProcessedEmails: parseBoolean(process.env.SKIP_PROCESSED_EMAILS, true),
    processedEmailStorePath:
      process.env.PROCESSED_EMAIL_STORE_PATH ?? "./.agent-state/processed-emails.json",
    dryRun: parseBoolean(process.env.DRY_RUN, true),
    createDrafts: parseBoolean(process.env.CREATE_DRAFTS, false),
    requireDraftApproval: parseBoolean(process.env.REQUIRE_DRAFT_APPROVAL, true),
    sendApprovedDrafts: parseBoolean(process.env.SEND_APPROVED_DRAFTS, false),
    requireSendApproval: parseBoolean(process.env.REQUIRE_SEND_APPROVAL, true),
    enableMeetingWorkflow: parseBoolean(process.env.ENABLE_MEETING_WORKFLOW, false),
    createCalendarEvents: parseBoolean(process.env.CREATE_CALENDAR_EVENTS, false),
    requireCalendarEventApproval: parseBoolean(
      process.env.REQUIRE_CALENDAR_EVENT_APPROVAL,
      true
    ),
    defaultTimezone: process.env.DEFAULT_TIMEZONE ?? "America/Sao_Paulo",
    debugLlmOutput: parseBoolean(process.env.DEBUG_LLM_OUTPUT, false),
    debugMcpOutput: parseBoolean(process.env.DEBUG_MCP_OUTPUT, false),
    notionMcpServerCommand: parseOptionalString(process.env.NOTION_MCP_SERVER_COMMAND),
    notionMcpServerArgs: parseCommaSeparatedArgs(process.env.NOTION_MCP_SERVER_ARGS),
    notionParentPageId: parseOptionalString(process.env.NOTION_PARENT_PAGE_ID),
    notionSdrPageTitle: process.env.NOTION_SDR_PAGE_TITLE?.trim() || "SDRAgent",
    notionProspectsDatabaseTitle:
      process.env.NOTION_PROSPECTS_DATABASE_TITLE?.trim() || "Prospects",
    notionProspectsDatabaseId: parseOptionalString(process.env.NOTION_PROSPECTS_DATABASE_ID),
    notionProspectsDataSourceId: parseOptionalString(
      process.env.NOTION_PROSPECTS_DATA_SOURCE_ID
    ),
    notionWriteEnabled: parseBoolean(process.env.NOTION_WRITE_ENABLED, false),
    requireNotionWriteApproval: parseBoolean(
      process.env.REQUIRE_NOTION_WRITE_APPROVAL,
      true
    ),
    notionProspectGmailQuery:
      process.env.NOTION_PROSPECT_GMAIL_QUERY ?? "from:sanmutty@gmail.com newer_than:7d",
    notionProspectMaxEmails: parseNumber(process.env.NOTION_PROSPECT_MAX_EMAILS, 10),
    notionMcpToolSearch: parseOptionalString(process.env.NOTION_MCP_TOOL_SEARCH),
    notionMcpToolFetch: parseOptionalString(process.env.NOTION_MCP_TOOL_FETCH),
    notionMcpToolCreatePages:
      parseOptionalString(process.env.NOTION_MCP_TOOL_CREATE_PAGES) ??
      parseOptionalString(process.env.NOTION_MCP_TOOL_CREATE_PAGE),
    notionMcpToolUpdatePage: parseOptionalString(process.env.NOTION_MCP_TOOL_UPDATE_PAGE),
    notionMcpToolCreateDatabase: parseOptionalString(
      process.env.NOTION_MCP_TOOL_CREATE_DATABASE
    ),
    notionMcpToolQueryDataSources:
      parseOptionalString(process.env.NOTION_MCP_TOOL_QUERY_DATA_SOURCES) ??
      parseOptionalString(process.env.NOTION_MCP_TOOL_QUERY_DATABASE)
  };
}

export function applyCliOverrides(config: AppConfig, argv: string[]): AppConfig {
  const next = { ...config };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--max" && argv[index + 1]) {
      next.maxEmails = parseNumber(argv[index + 1], next.maxEmails);
      index += 1;
    } else if (arg === "--query" && argv[index + 1]) {
      next.gmailQuery = argv[index + 1];
      index += 1;
    } else if (arg === "--dry-run") {
      next.dryRun = true;
      next.createDrafts = false;
    } else if (arg === "--create-drafts") {
      next.createDrafts = true;
      next.dryRun = false;
    }
  }

  return next;
}
