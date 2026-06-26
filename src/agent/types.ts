import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { OutreachDraft, ProspectClassification } from "../llm/schemas.js";

export type ProcessedEmail = {
  email: NormalizedEmail;
  classification: ProspectClassification;
  draft: OutreachDraft | null;
  draftCreated: boolean;
};

export type AgentReport = {
  readCount: number;
  classifiedCount: number;
  draftsGenerated: number;
  draftsCreated: number;
  emailsSent: number;
};
