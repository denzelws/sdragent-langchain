import { z } from "zod";

const nullableStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value).trim();
}, z.string().nullable());

const requiredStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return "No reason provided.";
  }

  return String(value).trim();
}, z.string().min(1));

const companySizeSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return `${value} employees`;
  }

  return String(value).trim();
}, z.string().nullable());

const stringArrayFromValueSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return value;
}, z.array(z.string()));

export const prospectClassificationSchema = z.object({
  classification: z.enum([
    "qualified_prospect",
    "possible_prospect",
    "not_a_prospect",
    "unclear"
  ]),
  prospectName: nullableStringSchema,
  prospectEmail: nullableStringSchema,
  companyName: nullableStringSchema,
  role: nullableStringSchema,
  companySize: companySizeSchema,
  painPoints: stringArrayFromValueSchema,
  toolsMentioned: stringArrayFromValueSchema,
  qualificationReason: requiredStringSchema,
  confidenceScore: z.number().min(0).max(1)
});

export type ProspectClassification = z.infer<typeof prospectClassificationSchema>;

export const outreachDraftSchema = z.object({
  to: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  reason: z.string().min(1)
});

export type OutreachDraft = z.infer<typeof outreachDraftSchema>;
