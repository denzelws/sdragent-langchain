import { z } from "zod";

const nullableStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return String(value).trim();
}, z.string().nullable());

const requiredStringSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return "No details provided.";
  }

  return String(value).trim();
}, z.string().min(1));

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

const nullableNumberSchema = z.preprocess((value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}, z.number().int().positive().nullable());

export const meetingInvitationDetectionSchema = z.object({
  isMeetingInvitation: z.boolean(),
  invitationType: z.enum(["formal", "casual", "not_invitation", "unclear"]),
  confidenceScore: z.number().min(0).max(1),
  reason: requiredStringSchema
});

export type MeetingInvitationDetection = z.infer<typeof meetingInvitationDetectionSchema>;

export const meetingDetailsSchema = z.object({
  title: nullableStringSchema,
  inviterName: nullableStringSchema,
  proposedDate: nullableStringSchema,
  startTime: nullableStringSchema,
  endTime: nullableStringSchema,
  durationMinutes: nullableNumberSchema,
  timezone: nullableStringSchema,
  attendees: stringArrayFromValueSchema,
  location: nullableStringSchema,
  videoCallInfo: nullableStringSchema,
  reason: requiredStringSchema,
  isAmbiguous: z.boolean(),
  ambiguityReason: nullableStringSchema
});

export type MeetingDetails = z.infer<typeof meetingDetailsSchema>;
