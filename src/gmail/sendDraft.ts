import type { gmail_v1 } from "googleapis";

export async function sendGmailDraft(
  gmail: gmail_v1.Gmail,
  draftId: string
): Promise<string | null> {
  const response = await gmail.users.drafts.send({
    userId: "me",
    requestBody: {
      id: draftId
    }
  });

  return response.data.id ?? null;
}
