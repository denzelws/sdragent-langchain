import type { calendar_v3 } from "googleapis";
import type { CalendarEventTimeRange } from "./calendarTypes.js";

function parseEventDateTime(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function readCalendarEvents(
  calendar: calendar_v3.Calendar,
  timeMin: Date,
  timeMax: Date
): Promise<CalendarEventTimeRange[]> {
  const response = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime"
  });

  return (response.data.items ?? []).flatMap((event) => {
    const start = parseEventDateTime(event.start?.dateTime ?? event.start?.date);
    const end = parseEventDateTime(event.end?.dateTime ?? event.end?.date);

    if (!start || !end) {
      return [];
    }

    return [
      {
        id: event.id ?? null,
        title: event.summary ?? null,
        start,
        end
      }
    ];
  });
}
