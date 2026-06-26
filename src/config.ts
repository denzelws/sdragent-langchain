import dotenv from "dotenv";

dotenv.config();

export type AppConfig = {
  ollamaModel: string;
  ollamaBaseUrl: string;
  gmailCredentialsPath: string;
  gmailTokenPath: string;
  gmailQuery: string;
  maxEmails: number;
  dryRun: boolean;
  createDrafts: boolean;
  requireDraftApproval: boolean;
  sendApprovedDrafts: boolean;
  requireSendApproval: boolean;
  debugLlmOutput: boolean;
};

const DEFAULT_GMAIL_QUERY = "in:inbox newer_than:7d";

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

export function loadConfig(): AppConfig {
  return {
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2:3b",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    gmailCredentialsPath: process.env.GMAIL_CREDENTIALS_PATH ?? "./credentials.json",
    gmailTokenPath: process.env.GMAIL_TOKEN_PATH ?? "./token.json",
    gmailQuery: process.env.GMAIL_QUERY ?? DEFAULT_GMAIL_QUERY,
    maxEmails: parseNumber(process.env.MAX_EMAILS, 10),
    dryRun: parseBoolean(process.env.DRY_RUN, true),
    createDrafts: parseBoolean(process.env.CREATE_DRAFTS, false),
    requireDraftApproval: parseBoolean(process.env.REQUIRE_DRAFT_APPROVAL, true),
    sendApprovedDrafts: parseBoolean(process.env.SEND_APPROVED_DRAFTS, false),
    requireSendApproval: parseBoolean(process.env.REQUIRE_SEND_APPROVAL, true),
    debugLlmOutput: parseBoolean(process.env.DEBUG_LLM_OUTPUT, false)
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
