import fs from "node:fs/promises";
import path from "node:path";
import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type {
  ProcessedEmailRecord,
  ProcessedEmailStoreData,
  ProcessedEmailWorkflow
} from "./types.js";

function emptyStore(): ProcessedEmailStoreData {
  return {
    version: 1,
    messages: {}
  };
}

export async function loadProcessedEmailStore(
  storePath: string
): Promise<ProcessedEmailStoreData> {
  try {
    const content = await fs.readFile(storePath, "utf8");
    const parsed = JSON.parse(content) as ProcessedEmailStoreData;

    if (parsed.version !== 1 || !parsed.messages || typeof parsed.messages !== "object") {
      console.warn(`Processed email store at ${storePath} is invalid. Starting empty.`);
      return emptyStore();
    }

    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return emptyStore();
    }

    if (error instanceof SyntaxError) {
      console.warn(`Processed email store at ${storePath} has invalid JSON. Starting empty.`);
      return emptyStore();
    }

    throw error;
  }
}

export async function saveProcessedEmailStore(
  storePath: string,
  data: ProcessedEmailStoreData
): Promise<void> {
  await fs.mkdir(path.dirname(storePath), { recursive: true });

  const tempPath = `${storePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tempPath, storePath);
}

export function isEmailProcessed(
  data: ProcessedEmailStoreData,
  emailId: string
): boolean {
  return Boolean(data.messages[emailId]);
}

export function markEmailProcessed(
  data: ProcessedEmailStoreData,
  email: NormalizedEmail,
  workflow: ProcessedEmailWorkflow,
  status: ProcessedEmailRecord["status"],
  reason?: string | null
): ProcessedEmailStoreData {
  if (!email.id) {
    return data;
  }

  data.messages[email.id] = {
    emailId: email.id,
    threadId: email.threadId,
    from: email.from,
    subject: email.subject,
    workflow,
    status,
    reason,
    processedAt: new Date().toISOString()
  };

  return data;
}
