import { inspect } from "node:util";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { AppConfig } from "../config.js";
import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { LlmProvider } from "../llm/llmProvider.js";
import { logger } from "../utils/logger.js";
import {
  productQuestionDetectionSchema,
  type ProductQuestionDetection
} from "./schemas.js";

const detectProductQuestionPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    [
      "You detect whether an email asks a product, pricing, plan, integration, free trial, refund, Enterprise contract, policy, product limit, support, security, SLA, or contract question.",
      "Explicitly classify these as Product FAQ questions: pricing questions, plan comparison questions, free trial questions, refund policy questions, Enterprise contract questions, Enterprise monthly vs annual questions, SSO questions, dedicated support questions, SLA questions, custom integration questions, product integration questions, and product limits questions.",
      "Return only one complete valid JSON object.",
      "Do not return markdown, comments, or explanations outside JSON.",
      "Every required field must be present."
    ].join(" ")
  ],
  [
    "human",
    [
      "Return exactly these JSON fields: isProductQuestion, category, confidenceScore, reason.",
      "category must be pricing, plans, free_trial, refunds, enterprise, integrations, product, or unknown.",
      "confidenceScore must be between 0 and 1.",
      "",
      "Detection hints:",
      "{productQuestionHints}",
      "",
      "Examples:",
      "Email asks: \"Do you offer refunds after purchase?\" -> isProductQuestion true, category refunds.",
      "Email asks: \"Is Enterprise monthly or annual?\" -> isProductQuestion true, category enterprise.",
      "Email asks: \"Do you support SSO and dedicated support?\" -> isProductQuestion true, category enterprise.",
      "Email asks: \"Does Enterprise include an SLA?\" -> isProductQuestion true, category enterprise.",
      "Email asks: \"Does Starter include HubSpot and Stripe?\" -> isProductQuestion true, category integrations.",
      "Email asks: \"Can you explain Starter vs Growth pricing?\" -> isProductQuestion true, category pricing or plans.",
      "Email asks: \"Just checking if you saw my last message.\" -> isProductQuestion false, category unknown.",
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

const fallbackDetection: ProductQuestionDetection = {
  isProductQuestion: false,
  category: "unknown",
  confidenceScore: 0,
  reason: "The LLM response could not be parsed as valid product question detection JSON."
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

function buildProductQuestionHints(email: NormalizedEmail): string {
  const source = [email.subject, email.snippet, email.body]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  const keywordMap: Array<[string, RegExp]> = [
    ["pricing", /\bpricing\b/],
    ["price", /\bprice\b/],
    ["cost", /\bcost\b/],
    ["starter", /\bstarter\b/],
    ["growth", /\bgrowth\b/],
    ["enterprise", /\benterprise\b/],
    ["free trial", /\bfree trial\b/],
    ["trial", /\btrial\b/],
    ["refund", /\brefund\b/],
    ["refunds", /\brefunds\b/],
    ["contract", /\bcontract\b/],
    ["annual", /\bannual\b/],
    ["monthly", /\bmonthly\b/],
    ["SSO", /\bsso\b/],
    ["dedicated support", /\bdedicated support\b/],
    ["SLA", /\bsla\b/],
    ["integration", /\bintegration\b/],
    ["integrations", /\bintegrations\b/],
    ["HubSpot", /\bhubspot\b/],
    ["Stripe", /\bstripe\b/],
    ["workflow limits", /\bworkflow limits\b/],
    ["users", /\busers\b/],
    ["policy", /\bpolicy\b/],
    ["policies", /\bpolicies\b/]
  ];
  const signals = keywordMap
    .filter(([, pattern]) => pattern.test(source))
    .map(([label]) => label);
  const uniqueSignals = Array.from(new Set(signals));

  if (uniqueSignals.length === 0) {
    return "No deterministic Product FAQ keyword signals found.";
  }

  return `Deterministic Product FAQ signals found: ${uniqueSignals.join(", ")}.`;
}

export async function detectProductQuestion(
  provider: LlmProvider,
  email: NormalizedEmail,
  config: AppConfig
): Promise<ProductQuestionDetection> {
  const chain = detectProductQuestionPrompt.pipe(provider.model);

  try {
    const productQuestionHints = buildProductQuestionHints(email);
    const response = await chain.invoke({
      productQuestionHints,
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
      logger.info("[LLM DEBUG] Raw product question detection output:");
      logger.info(inspect(response.content, { depth: null, colors: false }));
    }

    const parsed = parseJsonObject(content);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Parsed product question detection JSON:");
      logger.info(JSON.stringify(parsed, null, 2));
    }

    const validation = productQuestionDetectionSchema.safeParse(parsed);
    if (!validation.success) {
      if (config.debugLlmOutput) {
        logger.warn("[LLM DEBUG] Product question detection validation error:");
        logger.warn(inspect(validation.error, { depth: null, colors: false }));
      }

      throw validation.error;
    }

    return validation.data;
  } catch (error) {
    logger.warn(`Product question detection fallback for message ${email.id}: ${(error as Error).message}`);
    return fallbackDetection;
  }
}
