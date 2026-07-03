import { inspect } from "node:util";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { AppConfig } from "../config.js";
import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { LlmProvider } from "../llm/llmProvider.js";
import { outreachDraftSchema, type OutreachDraft } from "../llm/schemas.js";
import { logger } from "../utils/logger.js";
import { extractEmailAddress } from "../utils/text.js";
import type { CalendarConflictResult, CalendarEventInput } from "../calendar/calendarTypes.js";
import type { MeetingDetails } from "./schemas.js";
import type { MeetingReplyType } from "./types.js";

const generateMeetingReplyDraftPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    [
      "You write concise plain-text email reply drafts for meeting invitations.",
      "Return only one complete valid JSON object.",
      "Do not return markdown, comments, or explanations outside JSON.",
      "Every required field must be present.",
      "The JSON body string must contain escaped newlines like \\n\\n between paragraphs.",
      "Do not use bullet points, headings, bold markers, markdown links, or meeting links.",
      "Do not claim a calendar event was created unless the context says it was created.",
      "The reply is written by the app user, not by the original sender.",
      "Do not copy the original email greeting as the reply greeting.",
      "If the original email starts with Hi Denzel or similar, that name is the recipient/current user, not the person to greet.",
      "Greet the inviter/sender instead.",
      "Prefer the inviter name from the email signature, such as Best, Laura.",
      "If no signature name is available, use the Gmail From display name.",
      "If no sender name is available, use a neutral greeting like Hi,.",
      "The signature must always use the configured sender name.",
      "Never sign the reply with the inviter's name.",
      "Keep the reply concise and human."
    ].join(" ")
  ],
  [
    "human",
    [
      "Generate a {replyType} reply draft.",
      "Return exactly these JSON fields: to, subject, body, reason.",
      "Configured current user sender name: {senderName}",
      "Inviter name to greet: {inviterName}",
      "If inviterName is empty, use a neutral greeting: Hi,",
      "The body must use this shape: greeting, blank line, one or two short paragraphs, blank line, Best, newline, configured sender name.",
      "Reply types:",
      "- acceptance: confirm the meeting time and thank them.",
      "- regrets: explain that the proposed time conflicts and ask for another option.",
      "- clarification: ask them to clarify the exact date/time/timezone.",
      "",
      "Original email:",
      "From: {from}",
      "Subject: {emailSubject}",
      "Body: {body}",
      "",
      "Meeting details JSON:",
      "{detailsJson}",
      "",
      "Proposed event JSON:",
      "{eventJson}",
      "",
      "Conflict result JSON:",
      "{conflictJson}",
      "",
      "Calendar event created: {calendarEventCreated}"
    ].join("\n")
  ]
]);

function extractDisplayName(from: string | null): string | null {
  if (!from) {
    return null;
  }

  const withoutEmail = from.replace(/<[^>]+>/g, "").replace(/"/g, "").trim();
  return withoutEmail || null;
}

function extractSignatureName(body: string | null): string | null {
  if (!body) {
    return null;
  }

  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 2; index >= 0; index -= 1) {
    if (/^(best|thanks|thank you|regards|sincerely),?$/i.test(lines[index])) {
      const candidate = lines[index + 1];
      if (candidate && /^[A-Z][A-Za-z .'-]{1,60}$/.test(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function getInviterName(email: NormalizedEmail, details: MeetingDetails): string | null {
  return (
    details.inviterName ??
    extractSignatureName(email.body) ??
    extractDisplayName(email.from)
  );
}

function enforceReplyNameDirection(
  body: string,
  inviterName: string | null,
  senderName: string
): string {
  const normalized = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const lines = normalized.split("\n");
  const greeting = inviterName ? `Hi ${inviterName},` : "Hi,";

  if (lines.length > 0 && /^hi\b.*,/i.test(lines[0].trim())) {
    lines[0] = greeting;
  } else {
    lines.unshift(greeting, "");
  }

  let bestIndex = -1;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^best,?$/i.test(lines[index]?.trim() ?? "")) {
      bestIndex = index;
      break;
    }
  }

  if (bestIndex >= 0) {
    lines[bestIndex] = "Best,";
    lines.splice(bestIndex + 1, lines.length - bestIndex - 1, senderName);
  } else {
    while (lines.length > 0 && !lines[lines.length - 1]?.trim()) {
      lines.pop();
    }
    lines.push("", "Best,", senderName);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(withoutFence.slice(start, end + 1));
    }
    throw new Error("No JSON object found in LLM response.");
  }
}

function normalizeMeetingReplyDraftJson(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const draft = { ...value } as Record<string, unknown>;
  if (draft.reason === null || draft.reason === undefined || draft.reason === "") {
    draft.reason = "Generated meeting reply draft for human review.";
  }

  return draft;
}

export async function generateMeetingReplyDraft(
  provider: LlmProvider,
  email: NormalizedEmail,
  replyType: MeetingReplyType,
  details: MeetingDetails,
  proposedEvent: CalendarEventInput | null,
  conflictResult: CalendarConflictResult | null,
  calendarEventCreated: boolean,
  config: AppConfig
): Promise<OutreachDraft | null> {
  const chain = generateMeetingReplyDraftPrompt.pipe(provider.model);
  const inviterName = getInviterName(email, details);

  try {
    const response = await chain.invoke({
      replyType,
      senderName: config.senderName,
      inviterName: inviterName ?? "",
      from: email.from ?? "",
      emailSubject: email.subject ?? "",
      body: email.body ?? email.snippet ?? "",
      detailsJson: JSON.stringify(details, null, 2),
      eventJson: JSON.stringify(proposedEvent, null, 2),
      conflictJson: JSON.stringify(conflictResult, null, 2),
      calendarEventCreated: String(calendarEventCreated)
    });

    const content = Array.isArray(response.content)
      ? response.content.map((part) => (typeof part === "string" ? part : "")).join("")
      : String(response.content);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Raw meeting reply draft output:");
      logger.info(inspect(response.content, { depth: null, colors: false }));
    }

    const parsedJson = normalizeMeetingReplyDraftJson(parseJsonObject(content));

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Parsed meeting reply draft JSON:");
      logger.info(JSON.stringify(parsedJson, null, 2));
    }

    const validation = outreachDraftSchema.safeParse(parsedJson);
    if (!validation.success) {
      if (config.debugLlmOutput) {
        logger.warn("[LLM DEBUG] Meeting reply draft validation error:");
        logger.warn(inspect(validation.error, { depth: null, colors: false }));
      }
      throw validation.error;
    }

    return {
      ...validation.data,
      to: validation.data.to || extractEmailAddress(email.from) || "",
      body: enforceReplyNameDirection(validation.data.body, inviterName, config.senderName)
    };
  } catch (error) {
    logger.warn(`Meeting reply draft skipped for message ${email.id}: ${(error as Error).message}`);
    return null;
  }
}
