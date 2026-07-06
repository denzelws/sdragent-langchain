import type { AppConfig } from "../config.js";
import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { LlmProvider } from "../llm/llmProvider.js";
import { loadSkill } from "../skills/loadSkill.js";
import { logger } from "../utils/logger.js";
import { detectProductQuestion } from "./detectProductQuestion.js";
import { generateProductFaqReplyDraft } from "./generateProductFaqReplyDraft.js";
import type { ProductFaqWorkflowResult } from "./types.js";

function emptyResult(email: NormalizedEmail): ProductFaqWorkflowResult {
  return {
    handled: false,
    email,
    detection: null,
    draft: null
  };
}

export async function runProductFaqWorkflow(
  provider: LlmProvider,
  email: NormalizedEmail,
  config: AppConfig
): Promise<ProductFaqWorkflowResult> {
  const detection = await detectProductQuestion(provider, email, config);

  if (!detection.isProductQuestion || detection.confidenceScore < 0.7) {
    if (config.debugLlmOutput) {
      logger.info(
        `Product FAQ not detected: ${detection.category} (${detection.confidenceScore}) — ${detection.reason}`
      );
    }

    return {
      ...emptyResult(email),
      detection
    };
  }

  logger.info(
    `Product question detected: ${detection.category} (${detection.confidenceScore})`
  );

  let skill;
  try {
    skill = await loadSkill("product-faq");
  } catch (error) {
    logger.warn(`Product FAQ skill failed to load: ${(error as Error).message}`);
    return {
      handled: true,
      email,
      detection,
      draft: null
    };
  }

  logger.info(`Product FAQ skill loaded: ${skill.path}`);

  const draft = await generateProductFaqReplyDraft(
    provider,
    email,
    detection,
    skill,
    config
  );

  if (draft) {
    logger.info("Generated product FAQ draft.");
  }

  return {
    handled: true,
    email,
    detection,
    draft
  };
}
