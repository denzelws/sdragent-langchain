import { inspect } from "node:util";
import type { AppConfig } from "../config.js";
import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { LlmProvider } from "../llm/llmProvider.js";
import { generateOutreachDraftPrompt } from "../llm/prompts.js";
import {
  outreachDraftSchema,
  type OutreachDraft,
  type ProspectClassification
} from "../llm/schemas.js";
import { logger } from "../utils/logger.js";
import { extractEmailAddress } from "../utils/text.js";

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

export function shouldGenerateDraft(classification: ProspectClassification): boolean {
  return (
    classification.classification === "qualified_prospect" ||
    (classification.classification === "possible_prospect" &&
      classification.confidenceScore >= 0.75)
  );
}

export async function generateOutreachDraft(
  provider: LlmProvider,
  email: NormalizedEmail,
  classification: ProspectClassification,
  config: AppConfig
): Promise<OutreachDraft | null> {
  if (!shouldGenerateDraft(classification)) {
    return null;
  }

  const chain = generateOutreachDraftPrompt.pipe(provider.model);

  try {
    const response = await chain.invoke({
      from: email.from ?? "",
      emailSubject: email.subject ?? "",
      body: email.body ?? email.snippet ?? "",
      classificationJson: JSON.stringify(classification, null, 2)
    });

    const content = Array.isArray(response.content)
      ? response.content.map((part) => (typeof part === "string" ? part : "")).join("")
      : String(response.content);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Raw draft output:");
      logger.info(inspect(response.content, { depth: null, colors: false }));
    }

    const parsedJson = parseJsonObject(content);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Parsed draft JSON:");
      logger.info(JSON.stringify(parsedJson, null, 2));
    }

    const validation = outreachDraftSchema.safeParse(parsedJson);
    if (!validation.success) {
      if (config.debugLlmOutput) {
        logger.warn("[LLM DEBUG] Draft validation error:");
        logger.warn(inspect(validation.error, { depth: null, colors: false }));
      }

      throw validation.error;
    }

    const parsed = validation.data;
    const inferredTo = extractEmailAddress(email.from);

    return {
      ...parsed,
      to: parsed.to || classification.prospectEmail || inferredTo || ""
    };
  } catch (error) {
    logger.warn(`Draft generation skipped for message ${email.id}: ${(error as Error).message}`);
    return null;
  }
}
