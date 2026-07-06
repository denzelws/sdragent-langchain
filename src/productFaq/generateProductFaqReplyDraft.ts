import { ChatPromptTemplate } from "@langchain/core/prompts";
import { inspect } from "node:util";
import type { AppConfig } from "../config.js";
import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { LlmProvider } from "../llm/llmProvider.js";
import { outreachDraftSchema, type OutreachDraft } from "../llm/schemas.js";
import type { LoadedSkill } from "../skills/skillTypes.js";
import { logger } from "../utils/logger.js";
import { extractEmailAddress } from "../utils/text.js";
import type { ProductQuestionDetection } from "./schemas.js";

const generateProductFaqReplyPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    [
      "You write concise plain-text replies to product FAQ questions.",
      "Use the provided Product FAQ Skill markdown as internal source material only.",
      "Do not paste raw Skill markdown into the reply.",
      "Do not include headings from the skill, such as Pricing tiers, Policies, Important Enterprise policies, or Reply behavior.",
      "Do not include internal instruction phrases like If a prospect asks or Use this skill.",
      "Do not copy the sender's original questions into the reply body.",
      "Answer the questions directly in a natural email.",
      "Write as the app user replying to the sender.",
      "Keep the reply concise and professional.",
      "Use normal paragraphs, not markdown bullet lists, unless the user explicitly asks for a list.",
      "The body must contain only the final email body that should be sent to the sender.",
      "Do not invent pricing, policies, discounts, legal terms, implementation timelines, refund exceptions, or unavailable integrations.",
      "Mention only relevant plan details unless the user asks for a comparison.",
      "If the question is about pricing or plan comparison, always include the relevant plan prices from the Product FAQ Skill.",
      "Answer every product or policy question the sender asked.",
      "If the sender asks about Enterprise, mention only known Enterprise facts from the skill: custom pricing, SSO, dedicated support, SLA, custom integrations.",
      "If the sender asks whether Enterprise is monthly or annual, state that Enterprise uses annual contracts only.",
      "If the sender asks about refunds, state that there are no refunds after 30 days.",
      "Do not return only a greeting and signature.",
      "The reply body must contain at least one substantive answer paragraph before the signature.",
      "Do not include literal escaped newline text like \\n in the body.",
      "Always offer to book a quick 15-minute call if they want to learn more.",
      "The signature must use the configured sender name.",
      "The reply is written by the app user, not by the original sender.",
      "Do not copy the original email greeting as the reply greeting.",
      "Do not mention Enterprise unless the sender asks about Enterprise, custom pricing, SSO, SLA, dedicated support, or custom integrations.",
      "If the original email starts with Hi Denzel or similar, that name is the recipient/current user, not the person to greet.",
      "Greet the sender/prospect instead.",
      "Prefer the sender/prospect name from the email signature or Gmail From header.",
      "The signature must always use the configured sender name.",
      "Never sign the reply with the prospect's name.",
      "Return only one complete valid JSON object.",
      "Do not return markdown, comments, or explanations outside JSON.",
      "Every required field must be present.",
      "The JSON body string must contain escaped newlines like \\n\\n between paragraphs.",
    ].join(" "),
  ],
  [
    "human",
    [
      "Return exactly these JSON fields: to, subject, body, reason.",
      "Configured sender name: {senderName}",
      "Sender/prospect name to greet: {prospectName}",
      "If sender/prospect name is empty, use a neutral greeting: Hi,",
      "You must satisfy every item in the required answer checklist.",
      "Do not skip required facts.",
      "Do not return only a greeting and signature.",
      "The reply must contain at least one substantive answer paragraph before the signature.",
      "",
      "Required answer checklist:",
      "{requiredFactsChecklist}",
      "",
      "{retryInstruction}",
      "",
      "Product question detection JSON:",
      "{detectionJson}",
      "",
      "Product FAQ Skill markdown:",
      "{skillMarkdown}",
      "",
      "Original email:",
      "From: {from}",
      "To: {toHeader}",
      "Subject: {emailSubject}",
      "Body:",
      "{body}",
    ].join("\n"),
  ],
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

function extractDisplayName(from: string | null): string | null {
  if (!from) {
    return null;
  }

  const withoutEmail = from
    .replace(/<[^>]+>/g, "")
    .replace(/"/g, "")
    .trim();
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

function getProspectName(email: NormalizedEmail): string | null {
  return extractSignatureName(email.body) ?? extractDisplayName(email.from);
}

function normalizeDraftJson(value: unknown, email: NormalizedEmail): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const draft = { ...value } as Record<string, unknown>;
  const fallbackTo = extractEmailAddress(email.from) ?? "";
  const fallbackSubject = email.subject
    ? `Re: ${email.subject}`
    : "Re: Product question";

  draft.to =
    typeof draft.to === "string" && draft.to.trim() ? draft.to : fallbackTo;
  draft.subject = fallbackSubject;
  draft.reason =
    typeof draft.reason === "string" && draft.reason.trim()
      ? draft.reason
      : "Generated Product FAQ reply draft for human review.";

  return draft;
}

function normalizeDraftBody(body: string): string {
  return body
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function ensureSenderSignature(body: string, senderName: string): string {
  const normalized = normalizeDraftBody(body);
  const lines = normalized.split("\n");
  const bestIndexes: number[] = [];

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/^best,?$/i.test(lines[index]?.trim() ?? "")) {
      bestIndexes.push(index);
    }
  }

  if (bestIndexes.length > 0) {
    const firstSignatureIndex = Math.min(...bestIndexes);
    lines[firstSignatureIndex] = "Best,";
    lines.splice(firstSignatureIndex + 1, lines.length - firstSignatureIndex - 1, senderName);
  } else {
    while (lines.length > 0 && !lines[lines.length - 1]?.trim()) {
      lines.pop();
    }
    lines.push("", "Best,", senderName);
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function enforceGreetingAndSignature(
  body: string,
  prospectName: string | null,
  senderName: string,
): string {
  const normalized = normalizeDraftBody(body);
  const lines = normalized.split("\n");
  const greeting = prospectName ? `Hi ${prospectName},` : "Hi,";

  if (lines.length > 0 && /^hi\b.*,/i.test(lines[0].trim())) {
    lines[0] = greeting;
  } else {
    lines.unshift(greeting, "");
  }

  return ensureSenderSignature(lines.join("\n"), senderName);
}

function getQuestionText(email: NormalizedEmail): string {
  return [email.subject, email.snippet, email.body].filter(Boolean).join("\n");
}

function buildRequiredFactsChecklist(params: {
  detectionCategory: ProductQuestionDetection["category"];
  originalQuestion: string;
}): string {
  const question = params.originalQuestion.toLowerCase();
  const facts = new Set<string>();

  if (params.detectionCategory === "enterprise" || question.includes("enterprise")) {
    facts.add("Enterprise uses custom pricing.");
    facts.add(
      "If the sender asks about SSO, mention that SSO is available on Enterprise."
    );
    facts.add(
      "If the sender asks about dedicated support, mention that dedicated support is available on Enterprise."
    );
    facts.add("If the sender asks about SLA, mention that SLA is available on Enterprise.");
    facts.add(
      "If the sender asks about custom integrations, mention that custom integrations are available on Enterprise."
    );
    facts.add(
      "If the sender asks whether Enterprise is monthly or annual, mention that Enterprise contracts are annual only."
    );
    facts.add(
      "If the sender asks about refunds, mention that there are no refunds after 30 days."
    );
    facts.add("Offer a quick 15-minute call.");
  }

  if (
    params.detectionCategory === "pricing" ||
    params.detectionCategory === "plans" ||
    hasAny(question, [/starter/, /growth/, /free trial/, /\btrial\b/])
  ) {
    facts.add("If Starter is relevant, mention Starter is $299/month.");
    facts.add("If Growth is relevant, mention Growth is $799/month.");
    facts.add(
      "If the sender asks about free trial, mention Starter and Growth include a 14-day free trial."
    );
    facts.add("Offer a quick 15-minute call.");
  }

  if (params.detectionCategory === "refunds" || hasAny(question, [/refund/, /refunds/])) {
    facts.add("Mention that there are no refunds after 30 days.");
    facts.add("Offer a quick 15-minute call.");
  }

  if (
    params.detectionCategory === "free_trial" ||
    hasAny(question, [/free trial/, /\btrial\b/])
  ) {
    facts.add("Mention that Starter and Growth include a 14-day free trial.");
    facts.add("Offer a quick 15-minute call.");
  }

  if (facts.size === 0) {
    facts.add("Answer the sender's product question using only the Product FAQ Skill.");
    facts.add("Offer a quick 15-minute call.");
  }

  return ["Required facts to include:", ...Array.from(facts).map((fact) => `- ${fact}`)].join(
    "\n"
  );
}

function hasAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function getMeaningfulNonSignatureLines(body: string): string[] {
  const lines = normalizeDraftBody(body)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const bestIndex = lines.findIndex((line) => /^best,?$/i.test(line));
  const contentLines = bestIndex >= 0 ? lines.slice(0, bestIndex) : lines;

  return contentLines
    .filter((line) => !/^hi\b.*,/i.test(line))
    .filter(Boolean);
}

function getOriginalEmailMeaningfulLines(originalQuestion: string): string[] {
  return originalQuestion
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 12)
    .filter((line) => !/^subject:/i.test(line))
    .filter((line) => !/^hi\b.*,/i.test(line))
    .filter((line) => !/^best,?$/i.test(line))
    .filter((line) => !/^[A-Z][A-Za-z .'-]{1,60}$/.test(line));
}

function validateProductFaqDraftQuality(params: {
  body: string;
  detectionCategory: ProductQuestionDetection["category"];
  originalQuestion: string;
}): { valid: boolean; reason?: string } {
  if (params.body.includes("\\n")) {
    return { valid: false, reason: "Draft body contains literal escaped newlines." };
  }

  const body = normalizeDraftBody(params.body);
  const bodyLower = body.toLowerCase();
  const questionLower = params.originalQuestion.toLowerCase();
  const meaningfulLines = getMeaningfulNonSignatureLines(body);
  const leakedSkillPhrases = [
    "Product FAQ Skill",
    "Pricing tiers",
    "Important Enterprise policies",
    "Reply behavior",
    "Use this skill",
    "If a prospect asks",
    "When answering a pricing",
    "Includes:"
  ];

  if (meaningfulLines.length < 2) {
    return {
      valid: false,
      reason: "Draft body does not contain enough substantive answer lines."
    };
  }

  if (leakedSkillPhrases.some((phrase) => body.includes(phrase))) {
    return { valid: false, reason: "Draft leaks raw skill instructions." };
  }

  if (body.includes("##")) {
    return { valid: false, reason: "Draft contains markdown heading markers." };
  }

  const copiedQuestionLines = getOriginalEmailMeaningfulLines(params.originalQuestion).filter(
    (line) => body.includes(line)
  );
  if (copiedQuestionLines.length >= 2) {
    return {
      valid: false,
      reason: "Draft copies the sender's original questions instead of answering them."
    };
  }

  if (!bodyLower.includes("15-minute") && !bodyLower.includes("15 minute")) {
    return { valid: false, reason: "Draft does not offer a 15-minute call." };
  }

  const isPricingOrPlans =
    params.detectionCategory === "pricing" || params.detectionCategory === "plans";
  if (isPricingOrPlans || hasAny(questionLower, [/starter/, /growth/, /trial/, /free trial/])) {
    if (questionLower.includes("starter") && !hasAny(bodyLower, [/\$299/, /\b299\b/])) {
      return { valid: false, reason: "Draft does not answer Starter pricing." };
    }

    if (questionLower.includes("growth") && !hasAny(bodyLower, [/\$799/, /\b799\b/])) {
      return { valid: false, reason: "Draft does not answer Growth pricing." };
    }

    if (
      hasAny(questionLower, [/trial/, /free trial/]) &&
      !hasAny(bodyLower, [/14-day/, /14 day/])
    ) {
      return { valid: false, reason: "Draft does not answer free trial policy." };
    }
  }

  if (params.detectionCategory === "enterprise" || questionLower.includes("enterprise")) {
    if (!bodyLower.includes("custom")) {
      return { valid: false, reason: "Enterprise answer does not mention custom pricing." };
    }

    if (questionLower.includes("sso") && !bodyLower.includes("sso")) {
      return { valid: false, reason: "Enterprise answer does not mention SSO." };
    }

    if (
      questionLower.includes("dedicated support") &&
      !bodyLower.includes("dedicated support")
    ) {
      return {
        valid: false,
        reason: "Enterprise answer does not mention dedicated support."
      };
    }

    if (
      hasAny(questionLower, [/monthly/, /annual/, /contract/]) &&
      !bodyLower.includes("annual")
    ) {
      return { valid: false, reason: "Enterprise answer does not mention annual contracts." };
    }

    if (
      hasAny(questionLower, [/refund/, /refunds/]) &&
      !hasAny(bodyLower, [/30 days/, /30-day/])
    ) {
      return { valid: false, reason: "Enterprise answer does not mention refund policy." };
    }
  }

  if (
    params.detectionCategory === "refunds" &&
    !hasAny(bodyLower, [/30 days/, /30-day/])
  ) {
    return { valid: false, reason: "Refund answer does not mention 30 days." };
  }

  if (
    params.detectionCategory === "free_trial" &&
    !hasAny(bodyLower, [/14-day/, /14 day/])
  ) {
    return { valid: false, reason: "Free trial answer does not mention 14 days." };
  }

  return { valid: true };
}

export async function generateProductFaqReplyDraft(
  provider: LlmProvider,
  email: NormalizedEmail,
  detection: ProductQuestionDetection,
  skill: LoadedSkill,
  config: AppConfig,
): Promise<OutreachDraft | null> {
  const chain = generateProductFaqReplyPrompt.pipe(provider.model);
  const prospectName = getProspectName(email);
  const originalQuestion = getQuestionText(email);
  const replyTo = extractEmailAddress(email.from) || "";
  const requiredFactsChecklist = buildRequiredFactsChecklist({
    detectionCategory: detection.category,
    originalQuestion,
  });

  async function attemptGenerate(retryInstruction: string): Promise<OutreachDraft | null> {
    const response = await chain.invoke({
      senderName: config.senderName,
      prospectName: prospectName ?? "",
      requiredFactsChecklist,
      retryInstruction,
      detectionJson: JSON.stringify(detection, null, 2),
      skillMarkdown: skill.content,
      from: email.from ?? "",
      toHeader: email.to ?? "",
      emailSubject: email.subject ?? "",
      body: email.body ?? email.snippet ?? "",
    });

    const content = Array.isArray(response.content)
      ? response.content
          .map((part) => (typeof part === "string" ? part : ""))
          .join("")
      : String(response.content);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Raw product FAQ draft output:");
      logger.info(inspect(response.content, { depth: null, colors: false }));
    }

    const parsedJson = normalizeDraftJson(parseJsonObject(content), email);

    if (config.debugLlmOutput) {
      logger.info("[LLM DEBUG] Parsed product FAQ draft JSON:");
      logger.info(JSON.stringify(parsedJson, null, 2));
    }

    const validation = outreachDraftSchema.safeParse(parsedJson);
    if (!validation.success) {
      if (config.debugLlmOutput) {
        logger.warn("[LLM DEBUG] Product FAQ draft validation error:");
        logger.warn(inspect(validation.error, { depth: null, colors: false }));
      }

      throw validation.error;
    }

    const finalBody = enforceGreetingAndSignature(
      validation.data.body,
      prospectName,
      config.senderName,
    );
    const quality = validateProductFaqDraftQuality({
      body: finalBody,
      detectionCategory: detection.category,
      originalQuestion,
    });

    if (!quality.valid) {
      logger.warn(`Product FAQ draft quality check failed: ${quality.reason}`);
      throw new Error(quality.reason ?? "Product FAQ draft failed quality validation.");
    }

    return {
      ...validation.data,
      to: replyTo,
      body: finalBody,
    };
  }

  try {
    try {
      return await attemptGenerate("");
    } catch (error) {
      const failureReason = (error as Error).message;
      logger.warn(`Retrying Product FAQ draft after quality failure: ${failureReason}`);
      const retryDraft = await attemptGenerate(
        [
          `The previous draft failed quality validation because: ${failureReason}`,
          "Rewrite the reply and satisfy the required answer checklist exactly."
        ].join("\n")
      );
      return retryDraft;
    }
  } catch (error) {
    logger.warn(
      `Product FAQ draft skipped for message ${email.id}: ${(error as Error).message}`,
    );
    return null;
  }
}
