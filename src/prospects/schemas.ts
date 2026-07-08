import { z } from "zod";

const nullableStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value).trim() || null;
}, z.string().nullable());

const requiredStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return "No useful notes extracted.";
  }

  return String(value).trim();
}, z.string().min(1));

const booleanLikeSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return value;
}, z.boolean());

export const prospectOutreachStatusSchema = z.enum([
  "new",
  "qualified",
  "possible",
  "needs_review"
]);

export const prospectExtractionSchema = z.object({
  isProspect: booleanLikeSchema,
  name: nullableStringSchema,
  company: nullableStringSchema,
  outreachStatus: prospectOutreachStatusSchema,
  notes: requiredStringSchema,
  reason: requiredStringSchema
});

export const prospectNotionRowSchema = z.object({
  name: nullableStringSchema,
  company: nullableStringSchema,
  email: z.string().email(),
  outreachStatus: prospectOutreachStatusSchema,
  notes: requiredStringSchema,
  sourceSubject: requiredStringSchema,
  gmailThreadId: nullableStringSchema,
  lastSeen: z.string().min(1)
});
