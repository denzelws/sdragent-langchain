import { inspect } from "node:util";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { AppConfig } from "../config.js";
import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { LlmProvider } from "../llm/llmProvider.js";
import { logger } from "../utils/logger.js";
import { meetingDetailsSchema, type MeetingDetails } from "./schemas.js";

const extractMeetingDetailsPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    [
      "You extract proposed meeting details from Gmail messages.",
      "Return only one complete valid JSON object.",
      "Do not return markdown, comments, or explanations outside JSON.",
      "Do not guess missing or ambiguous date/time information.",
      "If the date, start time, or duration/end time is missing or ambiguous, set isAmbiguous to true and explain why.",
      "Use YYYY-MM-DD for proposedDate when exact.",
      "Use 24-hour HH:mm for startTime and endTime when exact.",
      "Use an IANA timezone string when known, otherwise null.",
      "Extract inviterName from the sender's email signature when clear, for example Best, Laura means inviterName is Laura.",
      "If no signature name is clear, infer inviterName from the Gmail From display name.",
      "Never infer inviterName from the original greeting addressed to the current user, such as Hi Denzel."
    ].join(" ")
  ],
  [
    "human",
    [
      "Today is {today}. The default timezone is {defaultTimezone}.",
      "Return exactly these JSON fields: title, inviterName, proposedDate, startTime, endTime, durationMinutes, timezone, attendees, location, videoCallInfo, reason, isAmbiguous, ambiguityReason.",
      "Use null when unknown. attendees must be an array of email addresses or names.",
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

const fallbackDetails: MeetingDetails = {
  title: null,
  inviterName: null,
  proposedDate: null,
  startTime: null,
  endTime: null,
  durationMinutes: null,
  timezone: null,
  attendees: [],
  location: null,
  videoCallInfo: null,
  reason: "The LLM response could not be parsed as valid meeting details JSON.",
  isAmbiguous: true,
  ambiguityReason: "Meeting details extraction failed."
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

export async function extractMeetingDetails(
  provider: LlmProvider,
  email: NormalizedEmail,
  config: AppConfig
): Promise<MeetingDetails> {
  const chain = extractMeetingDetailsPrompt.pipe(provider.model);

  try {
    const response = await chain.invoke({
      today: new Date().toISOString().slice(0, 10),
      defaultTimezone: config.defaultTimezone,
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
      logger.info("[LLM DEBUG] Raw meeting details output:");
      logger.info(inspect(response.content, { depth: null, colors: false }));
    }

    const parsed = parseJsonObject(content);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Parsed meeting details JSON:");
      logger.info(JSON.stringify(parsed, null, 2));
    }

    const validation = meetingDetailsSchema.safeParse(parsed);
    if (!validation.success) {
      if (config.debugLlmOutput) {
        logger.warn("[LLM DEBUG] Meeting details validation error:");
        logger.warn(inspect(validation.error, { depth: null, colors: false }));
      }
      throw validation.error;
    }

    return validation.data;
  } catch (error) {
    logger.warn(`Meeting details fallback for message ${email.id}: ${(error as Error).message}`);
    return fallbackDetails;
  }
}
