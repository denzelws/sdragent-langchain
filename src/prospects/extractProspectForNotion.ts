import { inspect } from "node:util";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { AppConfig } from "../config.js";
import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { LlmProvider } from "../llm/llmProvider.js";
import { logger } from "../utils/logger.js";
import { extractEmailAddress } from "../utils/text.js";
import { prospectExtractionSchema, prospectNotionRowSchema } from "./schemas.js";
import type { ProspectNotionRow } from "./types.js";

const prospectExtractionPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    [
      "You identify prospect or customer lead emails for a B2B SaaS RevOps automation product.",
      "The product is a no-code workflow automation tool for RevOps teams that connects tools like HubSpot, Stripe, Salesforce, and Jira and reduces manual data entry.",
      "A prospect email may ask about product details, pricing, integrations, demos, calls, automation needs, workflow pain, handoffs, data sync, or tool limits.",
      "Do not mark newsletters, spam, personal emails, unrelated follow-ups, or meeting test emails as prospects unless they include clear product, workflow, integration, pricing, or automation context.",
      "Return only one complete valid JSON object. Do not return markdown, comments, or explanations outside JSON. Every required field must be present."
    ].join(" ")
  ],
  [
    "human",
    [
      "Return exactly these JSON fields: isProspect, name, company, outreachStatus, notes, reason.",
      "outreachStatus must be one of: new, qualified, possible, needs_review.",
      "Extract the person's name from introductions or signatures when present.",
      "Examples:",
      "- \"My name is Laura Bennett\" -> name: \"Laura Bennett\"",
      "- \"I'm Marcus from BrightOps\" -> name: \"Marcus\", company: \"BrightOps\"",
      "- \"I'm Rachel from Northstar Ops\" -> name: \"Rachel\", company: \"Northstar Ops\"",
      "- \"I'm Daniel, RevOps Manager at Flowbase\" -> name: \"Daniel\", company: \"Flowbase\"",
      "Do not extract a company from software tools or integrations mentioned in the workflow.",
      "Examples:",
      "- \"HubSpot to Jira workflow\" -> company: null",
      "- \"We use HubSpot and Stripe\" -> company: null",
      "- \"I'm Laura Bennett from ScaleHub\" -> company: \"ScaleHub\"",
      "- \"I'm Daniel, RevOps Manager at Flowbase\" -> company: \"Flowbase\"",
      "Use null for name or company when unknown. Do not invent missing company names.",
      "Keep notes short and useful for a Notion CRM row.",
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

function parseLastSeen(value: string | null): string {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function getContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }

        return "";
      })
      .join("");
  }

  return String(content ?? "");
}

export async function extractProspectForNotion(
  provider: LlmProvider,
  email: NormalizedEmail,
  config: AppConfig
): Promise<ProspectNotionRow | null> {
  const senderEmail = extractEmailAddress(email.from);
  if (!senderEmail) {
    logger.warn(`Skipping message ${email.id}: no sender email address found.`);
    return null;
  }

  const chain = prospectExtractionPrompt.pipe(provider.model);

  try {
    const response = await chain.invoke({
      from: email.from ?? "",
      to: email.to ?? "",
      subject: email.subject ?? "",
      date: email.date ?? "",
      snippet: email.snippet ?? "",
      body: email.body ?? ""
    });
    const content = getContentText(response.content);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Raw Notion prospect extraction output:");
      logger.info(inspect(response.content, { depth: null, colors: false }));
    }

    const parsed = parseJsonObject(content);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Parsed Notion prospect extraction JSON:");
      logger.info(JSON.stringify(parsed, null, 2));
    }

    const validation = prospectExtractionSchema.safeParse(parsed);
    if (!validation.success) {
      if (config.debugLlmOutput) {
        logger.warn("[LLM DEBUG] Notion prospect extraction validation error:");
        logger.warn(inspect(validation.error, { depth: null, colors: false }));
      }

      throw validation.error;
    }

    const extraction = validation.data;
    if (!extraction.isProspect) {
      return null;
    }

    const row = {
      name: extraction.name,
      company: extraction.company,
      email: senderEmail,
      outreachStatus: extraction.outreachStatus,
      notes: extraction.notes,
      sourceSubject: email.subject ?? "(no subject)",
      gmailThreadId: email.threadId || null,
      lastSeen: parseLastSeen(email.date)
    };
    const rowValidation = prospectNotionRowSchema.safeParse(row);
    if (!rowValidation.success) {
      logger.warn(`Skipping message ${email.id}: extracted prospect row failed validation.`);
      if (config.debugLlmOutput) {
        logger.warn(inspect(rowValidation.error, { depth: null, colors: false }));
      }
      return null;
    }

    return rowValidation.data;
  } catch (error) {
    logger.warn(
      `Prospect extraction fallback for message ${email.id}: ${(error as Error).message}`
    );
    return null;
  }
}
