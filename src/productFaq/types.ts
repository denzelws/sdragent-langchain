import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { OutreachDraft } from "../llm/schemas.js";
import type { ProductQuestionDetection } from "./schemas.js";

export type ProductFaqWorkflowResult = {
  handled: boolean;
  email: NormalizedEmail;
  detection: ProductQuestionDetection | null;
  draft: OutreachDraft | null;
};
