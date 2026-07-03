import { inspect } from "node:util";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { AppConfig } from "../config.js";
import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { LlmProvider } from "../llm/llmProvider.js";
import { logger } from "../utils/logger.js";
import {
  meetingInvitationDetectionSchema,
  type MeetingInvitationDetection
} from "./schemas.js";

const detectMeetingInvitationPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    [
      "You detect whether an email is a formal or casual meeting invitation.",
      "A meeting invitation proposes discussing something at a date/time, asks to meet, suggests a call, or invites the recipient to schedule a conversation.",
      "Return only one complete valid JSON object.",
      "Do not return markdown, comments, or explanations outside JSON.",
      "Every required field must be present."
    ].join(" ")
  ],
  [
    "human",
    [
      "Return exactly these JSON fields: isMeetingInvitation, invitationType, confidenceScore, reason.",
      "invitationType must be formal, casual, not_invitation, or unclear.",
      "confidenceScore must be between 0 and 1.",
      "",
      "From: {from}",
      "To: {to}",
      "Subject: {subject}",
      "Date: {date}",
      "Snippet: {snippet}",
      "Body:",
      "{body}"
    ].join("\n")
  ]
]);

const fallbackDetection: MeetingInvitationDetection = {
  isMeetingInvitation: false,
  invitationType: "unclear",
  confidenceScore: 0,
  reason: "The LLM response could not be parsed as valid meeting detection JSON."
};

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

export async function detectMeetingInvitation(
  provider: LlmProvider,
  email: NormalizedEmail,
  config: AppConfig
): Promise<MeetingInvitationDetection> {
  const chain = detectMeetingInvitationPrompt.pipe(provider.model);

  try {
    const response = await chain.invoke({
      from: email.from ?? "",
      to: email.to ?? "",
      subject: email.subject ?? "",
      date: email.date ?? "",
      snippet: email.snippet ?? "",
      body: email.body ?? ""
    });

    const content = Array.isArray(response.content)
      ? response.content.map((part) => (typeof part === "string" ? part : "")).join("")
      : String(response.content);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Raw meeting detection output:");
      logger.info(inspect(response.content, { depth: null, colors: false }));
    }

    const parsed = parseJsonObject(content);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Parsed meeting detection JSON:");
      logger.info(JSON.stringify(parsed, null, 2));
    }

    const validation = meetingInvitationDetectionSchema.safeParse(parsed);
    if (!validation.success) {
      if (config.debugLlmOutput) {
        logger.warn("[LLM DEBUG] Meeting detection validation error:");
        logger.warn(inspect(validation.error, { depth: null, colors: false }));
      }
      throw validation.error;
    }

    return validation.data;
  } catch (error) {
    logger.warn(`Meeting detection fallback for message ${email.id}: ${(error as Error).message}`);
    return fallbackDetection;
  }
}
