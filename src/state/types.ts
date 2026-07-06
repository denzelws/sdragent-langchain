export type ProcessedEmailWorkflow =
  | "meeting"
  | "product_faq"
  | "sdr"
  | "unhandled"
  | "skipped";

export type ProcessedEmailRecord = {
  emailId: string;
  threadId?: string | null;
  from?: string | null;
  subject?: string | null;
  workflow: ProcessedEmailWorkflow;
  status:
    | "handled"
    | "draft_generated"
    | "draft_created"
    | "sent"
    | "ignored"
    | "skipped"
    | "error";
  reason?: string | null;
  processedAt: string;
};

export type ProcessedEmailStoreData = {
  version: 1;
  messages: Record<string, ProcessedEmailRecord>;
};
