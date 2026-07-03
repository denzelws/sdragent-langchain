import type { calendar_v3 } from "googleapis";
import type { AppConfig } from "../config.js";
import { createCalendarEvent } from "../calendar/createEvent.js";
import { readCalendarEvents } from "../calendar/readEvents.js";
import type { CalendarEventInput } from "../calendar/calendarTypes.js";
import type { NormalizedEmail } from "../gmail/gmailTypes.js";
import type { LlmProvider } from "../llm/llmProvider.js";
import { logger } from "../utils/logger.js";
import { askForApproval } from "../utils/terminalApproval.js";
import { extractEmailAddress } from "../utils/text.js";
import { checkCalendarConflicts } from "./checkCalendarConflicts.js";
import { detectMeetingInvitation } from "./detectMeetingInvitation.js";
import { extractMeetingDetails } from "./extractMeetingDetails.js";
import { generateMeetingReplyDraft } from "./generateMeetingReplyDraft.js";
import type { MeetingDetails } from "./schemas.js";
import type {
  MeetingInvitationWorkflowResult,
  MeetingReplyType
} from "./types.js";

function isValidDateText(value: string | null): value is string {
  return Boolean(value?.match(/^\d{4}-\d{2}-\d{2}$/));
}

function isValidTimeText(value: string | null): value is string {
  return Boolean(value?.match(/^\d{2}:\d{2}$/));
}

function getTimezoneOffsetMs(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(dateText: string, timeText: string, timezone: string): Date | null {
  const utcGuess = new Date(`${dateText}T${timeText}:00.000Z`);
  if (Number.isNaN(utcGuess.getTime())) {
    return null;
  }

  try {
    const offsetMs = getTimezoneOffsetMs(utcGuess, timezone);
    return new Date(utcGuess.getTime() - offsetMs);
  } catch {
    return null;
  }
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function buildProposedCalendarEvent(
  email: NormalizedEmail,
  details: MeetingDetails,
  config: AppConfig
): CalendarEventInput | null {
  if (
    details.isAmbiguous ||
    !isValidDateText(details.proposedDate) ||
    !isValidTimeText(details.startTime)
  ) {
    return null;
  }

  const timezone = details.timezone ?? config.defaultTimezone;
  const start = zonedDateTimeToUtc(details.proposedDate, details.startTime, timezone);
  if (!start) {
    return null;
  }

  let end: Date | null = null;
  if (isValidTimeText(details.endTime)) {
    end = zonedDateTimeToUtc(details.proposedDate, details.endTime, timezone);
  } else if (details.durationMinutes) {
    end = addMinutes(start, details.durationMinutes);
  }

  if (!end || end <= start) {
    return null;
  }

  const senderEmail = extractEmailAddress(email.from);
  const attendeeEmails = details.attendees.filter((attendee) =>
    Boolean(extractEmailAddress(attendee))
  );
  const attendees = Array.from(
    new Set([
      ...attendeeEmails.map((attendee) => extractEmailAddress(attendee)).filter(Boolean),
      senderEmail
    ])
  ) as string[];

  return {
    title: details.title ?? `Meeting: ${email.subject ?? "Gmail invitation"}`,
    start,
    end,
    timezone,
    attendees,
    location: details.location ?? details.videoCallInfo,
    description: details.reason
  };
}

function formatEventForApproval(event: CalendarEventInput): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: event.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  return [
    "Create Google Calendar event?",
    `Title: ${event.title}`,
    `Time: ${formatter.format(event.start)}-${formatter.format(event.end)} ${event.timezone}`,
    `Attendee: ${event.attendees.join(", ") || "none provided"}`,
    "",
    "Approve?"
  ].join("\n");
}

function emptyResult(email: NormalizedEmail): MeetingInvitationWorkflowResult {
  return {
    handled: false,
    email,
    detection: null,
    details: null,
    proposedEvent: null,
    conflictResult: null,
    replyType: null,
    draft: null,
    calendarEventCreated: false
  };
}

export async function runMeetingInvitationWorkflow(
  calendar: calendar_v3.Calendar,
  provider: LlmProvider,
  email: NormalizedEmail,
  config: AppConfig
): Promise<MeetingInvitationWorkflowResult> {
  const detection = await detectMeetingInvitation(provider, email, config);

  if (!detection.isMeetingInvitation || detection.confidenceScore < 0.65) {
    return {
      ...emptyResult(email),
      detection
    };
  }

  logger.info(
    `Meeting invitation detected: ${detection.invitationType} (${detection.confidenceScore})`
  );

  const details = await extractMeetingDetails(provider, email, config);
  const proposedEvent = buildProposedCalendarEvent(email, details, config);

  let replyType: MeetingReplyType = "clarification";
  let calendarEventCreated = false;
  let conflictResult = null;

  if (!proposedEvent) {
    logger.info("Meeting time is missing or ambiguous. Calendar event creation skipped.");
  } else {
    const existingEvents = await readCalendarEvents(
      calendar,
      proposedEvent.start,
      proposedEvent.end
    );
    conflictResult = checkCalendarConflicts(
      existingEvents,
      proposedEvent.start,
      proposedEvent.end
    );

    if (conflictResult.hasConflict) {
      replyType = "regrets";
      logger.info(
        `Calendar conflict found. Conflicting events: ${conflictResult.conflictingEvents.length}`
      );
    } else {
      replyType = "acceptance";
      logger.info("No calendar conflict found.");

      if (!config.createCalendarEvents || config.dryRun) {
        logger.info(
          "Calendar event creation skipped. Enable CREATE_CALENDAR_EVENTS=true and DRY_RUN=false."
        );
      } else {
        const approved = config.requireCalendarEventApproval
          ? await askForApproval(formatEventForApproval(proposedEvent))
          : true;

        if (approved) {
          const eventId = await createCalendarEvent(calendar, proposedEvent);
          calendarEventCreated = Boolean(eventId);
          logger.info(`Google Calendar event created: ${eventId ?? "unknown id"}`);
        } else {
          logger.info("Calendar event rejected.");
        }
      }
    }
  }

  const draft = await generateMeetingReplyDraft(
    provider,
    email,
    replyType,
    details,
    proposedEvent,
    conflictResult,
    calendarEventCreated,
    config
  );

  return {
    handled: true,
    email,
    detection,
    details,
    proposedEvent,
    conflictResult,
    replyType,
    draft,
    calendarEventCreated
  };
}
