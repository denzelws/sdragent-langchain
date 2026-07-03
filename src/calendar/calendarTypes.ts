export type CalendarEventTimeRange = {
  id: string | null;
  title: string | null;
  start: Date;
  end: Date;
};

export type CalendarEventInput = {
  title: string;
  start: Date;
  end: Date;
  timezone: string;
  attendees: string[];
  location: string | null;
  description: string | null;
};

export type CalendarConflictResult = {
  hasConflict: boolean;
  conflictingEvents: CalendarEventTimeRange[];
};
