export type ProspectOutreachStatus = "new" | "qualified" | "possible" | "needs_review";

export type ProspectNotionRow = {
  name: string | null;
  company: string | null;
  email: string;
  outreachStatus: ProspectOutreachStatus;
  notes: string;
  sourceSubject: string;
  gmailThreadId: string | null;
  lastSeen: string;
};

export type ProspectExtractionResult = {
  isProspect: boolean;
  name: string | null;
  company: string | null;
  outreachStatus: ProspectOutreachStatus;
  notes: string;
  reason: string;
};
