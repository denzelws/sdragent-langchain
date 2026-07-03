import type {
  CalendarConflictResult,
  CalendarEventTimeRange
} from "../calendar/calendarTypes.js";

export function checkCalendarConflicts(
  existingEvents: CalendarEventTimeRange[],
  proposedStart: Date,
  proposedEnd: Date
): CalendarConflictResult {
  const conflictingEvents = existingEvents.filter(
    (event) => event.start < proposedEnd && event.end > proposedStart
  );

  return {
    hasConflict: conflictingEvents.length > 0,
    conflictingEvents
  };
}
