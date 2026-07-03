import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { OutreachDraft } from "../llm/schemas.js";
import type {
  CalendarConflictResult,
  CalendarEventInput
} from "../calendar/calendarTypes.js";
import type {
  MeetingDetails,
  MeetingInvitationDetection
} from "./schemas.js";

export type MeetingReplyType = "acceptance" | "regrets" | "clarification";

export type MeetingInvitationWorkflowResult = {
  handled: boolean;
  email: NormalizedEmail;
  detection: MeetingInvitationDetection | null;
  details: MeetingDetails | null;
  proposedEvent: CalendarEventInput | null;
  conflictResult: CalendarConflictResult | null;
  replyType: MeetingReplyType | null;
  draft: OutreachDraft | null;
  calendarEventCreated: boolean;
};
