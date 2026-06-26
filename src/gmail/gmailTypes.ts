export type NormalizedEmail = {
  id: string;
  threadId: string;
  from: string | null;
  to: string | null;
  subject: string | null;
  date: string | null;
  snippet: string | null;
  body: string | null;
};
