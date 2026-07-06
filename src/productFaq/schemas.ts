import { z } from "zod";

const requiredStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return "No reason provided.";
  }

  return String(value).trim();
}, z.string().min(1));

const confidenceScoreSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }

  return value;
}, z.number().min(0).max(1));

export const productQuestionDetectionSchema = z.object({
  isProductQuestion: z.boolean(),
  category: z.enum([
    "pricing",
    "plans",
    "free_trial",
    "refunds",
    "enterprise",
    "integrations",
    "product",
    "unknown"
  ]),
  confidenceScore: confidenceScoreSchema,
  reason: requiredStringSchema
});

export type ProductQuestionDetection = z.infer<typeof productQuestionDetectionSchema>;
