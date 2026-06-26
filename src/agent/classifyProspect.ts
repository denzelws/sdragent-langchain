import { inspect } from "node:util";
import type { AppConfig } from "../config.js";
import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { LlmProvider } from "../llm/llmProvider.js";
import { classifyProspectPrompt } from "../llm/prompts.js";
import {
  prospectClassificationSchema,
  type ProspectClassification
} from "../llm/schemas.js";
import { logger } from "../utils/logger.js";

const fallbackClassification: ProspectClassification = {
  classification: "unclear",
  prospectName: null,
  prospectEmail: null,
  companyName: null,
  role: null,
  companySize: null,
  painPoints: [],
  toolsMentioned: [],
  qualificationReason: "The LLM response could not be parsed as valid classification JSON.",
  confidenceScore: 0
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

export async function classifyProspect(
  provider: LlmProvider,
  email: NormalizedEmail,
  config: AppConfig
): Promise<ProspectClassification> {
  const chain = classifyProspectPrompt.pipe(provider.model);

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
      logger.info("[LLM DEBUG] Raw classification output:");
      logger.info(inspect(response.content, { depth: null, colors: false }));
    }

    const parsed = parseJsonObject(content);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Parsed classification JSON:");
      logger.info(JSON.stringify(parsed, null, 2));
    }

    const validation = prospectClassificationSchema.safeParse(parsed);
    if (!validation.success) {
      if (config.debugLlmOutput) {
        logger.warn("[LLM DEBUG] Classification validation error:");
        logger.warn(inspect(validation.error, { depth: null, colors: false }));
      }

      throw validation.error;
    }

    return validation.data;
  } catch (error) {
    logger.warn(`Classification fallback for message ${email.id}: ${(error as Error).message}`);
    return fallbackClassification;
  }
}
