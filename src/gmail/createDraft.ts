import type { gmail_v1 } from "googleapis";
import type { OutreachDraft } from "../llm/schemas.js";

function encodeMessage(rawMessage: string): string {
  return Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function createGmailDraft(
  gmail: gmail_v1.Gmail,
  draft: OutreachDraft
): Promise<string> {
  const rawMessage = [
    `To: ${draft.to}`,
    `Subject: ${draft.subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    draft.body
  ].join("\r\n");

  const response = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        raw: encodeMessage(rawMessage)
      }
    }
  });

  if (!response.data.id) {
    throw new Error("Gmail draft was created but no draft id was returned.");
  }

  return response.data.id;
}
