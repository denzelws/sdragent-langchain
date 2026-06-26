import { ChatPromptTemplate } from "@langchain/core/prompts";

export const classifyProspectPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    [
      "You classify inbound Gmail messages for a B2B SaaS outbound SDR workflow.",
      "The seller offers no-code workflow automation for RevOps teams that removes manual data entry between HubSpot, Stripe, Salesforce, and Jira.",
      "Target buyers are mid-market SaaS companies around 50-500 employees and roles like Head of Operations, RevOps Manager, Revenue Operations Manager, Director of Revenue Operations, or closely related operations roles.",
      "If an email includes most or all of these signals: SaaS company, 50-500 employees, RevOps or Head of Operations role, manual data entry or workflow handoff pain, tools like HubSpot, Stripe, Salesforce, or Jira, and interest in automation, classify it as qualified_prospect with confidenceScore >= 0.85.",
      "Use possible_prospect only when important information is missing or ambiguous.",
      "companySize must be a string or null. Never return companySize as a number. Use examples like \"240 employees\", \"around 150 employees\", or null.",
      "Return only one complete valid JSON object.",
      "Do not return markdown, comments, or explanations outside JSON.",
      "Always close the JSON object.",
      "Every required field must be present."
    ].join(" ")
  ],
  [
    "human",
    [
      "Classify this email as qualified_prospect, possible_prospect, not_a_prospect, or unclear.",
      "Return exactly these JSON fields: classification, prospectName, prospectEmail, companyName, role, companySize, painPoints, toolsMentioned, qualificationReason, confidenceScore.",
      "Use null when unknown. confidenceScore must be between 0 and 1.",
      "companySize must be a string or null. Never return a bare number for companySize.",
      "Return only one complete valid JSON object with every required field present.",
      "Do not include markdown, comments, or explanatory text outside the JSON object.",
      "Always include the final closing brace.",
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

export const generateOutreachDraftPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    [
      "You write concise plain-text outbound SDR draft emails.",
      "The seller offers a no-code workflow automation tool for RevOps teams that removes manual data entry between tools like HubSpot, Stripe, Salesforce, and Jira.",
      "Be professional, direct, credible, and personalized. Do not invent facts. Do not include a meeting link. Do not schedule anything.",
      "Return only one complete valid JSON object.",
      "Do not return markdown, comments, or explanations outside JSON.",
      "Always close the JSON object.",
      "Every required field must be present."
    ].join(" ")
  ],
  [
    "human",
    [
      "Generate one outreach draft for this qualified prospect.",
      "Return exactly these JSON fields: to, subject, body, reason.",
      "Return only one complete valid JSON object with every required field present.",
      "Do not include markdown, comments, or explanatory text outside the JSON object.",
      "Always include the final closing brace.",
      "",
      "Original email:",
      "From: {from}",
      "Subject: {emailSubject}",
      "Body: {body}",
      "",
      "Classification JSON:",
      "{classificationJson}"
    ].join("\n")
  ]
]);
