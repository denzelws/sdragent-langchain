import type { gmail_v1 } from "googleapis";
import type { NormalizedEmail } from "./gmailTypes.js";

function decodeBase64Url(data: string | null | undefined): string {
  if (!data) {
    return "";
  }

  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function getHeader(message: gmail_v1.Schema$Message, name: string): string | null {
  const headers = message.payload?.headers ?? [];
  const header = headers.find((item) => item.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? null;
}

function findBodyPart(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string
): string | null {
  if (!part) {
    return null;
  }

  if (part.mimeType === mimeType && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  for (const child of part.parts ?? []) {
    const found = findBodyPart(child, mimeType);
    if (found) {
      return found;
    }
  }

  return null;
}

function extractBody(message: gmail_v1.Schema$Message): string | null {
  const plainText = findBodyPart(message.payload ?? undefined, "text/plain");
  if (plainText?.trim()) {
    return plainText.trim();
  }

  const html = findBodyPart(message.payload ?? undefined, "text/html");
  if (html?.trim()) {
    return stripHtml(html);
  }

  const directBody = decodeBase64Url(message.payload?.body?.data);
  return directBody.trim() || null;
}

export function normalizeGmailMessage(message: gmail_v1.Schema$Message): NormalizedEmail {
  return {
    id: message.id ?? "",
    threadId: message.threadId ?? "",
    from: getHeader(message, "From"),
    to: getHeader(message, "To"),
    subject: getHeader(message, "Subject"),
    date: getHeader(message, "Date"),
    snippet: message.snippet ?? null,
    body: extractBody(message)
  };
}

export async function readRecentEmails(
  gmail: gmail_v1.Gmail,
  query: string,
  maxResults: number
): Promise<NormalizedEmail[]> {
  const listResponse = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults
  });

  const messages = listResponse.data.messages ?? [];
  const normalized: NormalizedEmail[] = [];

  for (const message of messages) {
    if (!message.id) {
      continue;
    }

    const detail = await gmail.users.messages.get({
      userId: "me",
      id: message.id,
      format: "full"
    });

    normalized.push(normalizeGmailMessage(detail.data));
  }

  return normalized;
}
