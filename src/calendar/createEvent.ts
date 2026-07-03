import type { calendar_v3 } from "googleapis";
import type { CalendarEventInput } from "./calendarTypes.js";

export async function createCalendarEvent(
  calendar: calendar_v3.Calendar,
  event: CalendarEventInput
): Promise<string | null> {
  const response = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.title,
      description: event.description ?? undefined,
      location: event.location ?? undefined,
      start: {
        dateTime: event.start.toISOString(),
        timeZone: event.timezone
      },
      end: {
        dateTime: event.end.toISOString(),
        timeZone: event.timezone
      },
      attendees: event.attendees.map((email) => ({ email }))
    }
  });

  return response.data.id ?? null;
}
