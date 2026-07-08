import type { ProspectNotionRow } from "./types.js";

type ProspectProfile = {
  name: string;
  company: string;
  email: string;
};

export type ProspectEnrichmentResult = {
  rows: ProspectNotionRow[];
  companiesCorrected: number;
  companiesEnriched: number;
};

const KNOWN_TOOL_NAMES = [
  "hubspot",
  "jira",
  "salesforce",
  "stripe",
  "slack",
  "notion",
  "zendesk",
  "intercom",
  "pipedrive",
  "linear",
  "github"
];

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompany(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSuspiciousToolCompany(company: string | null): boolean {
  if (!company) {
    return false;
  }

  return KNOWN_TOOL_NAMES.includes(normalizeCompany(company));
}

function firstToken(value: string): string | null {
  return normalizeName(value).split(" ").filter(Boolean)[0] ?? null;
}

function hasFullTokenSequence(haystack: string, needle: string): boolean {
  const normalizedHaystack = ` ${normalizeName(haystack)} `;
  const normalizedNeedle = ` ${normalizeName(needle)} `;
  return normalizedHaystack.includes(normalizedNeedle);
}

function areNamesCompatible(params: {
  leftName: string | null;
  rightName: string | null;
  sameSenderEmail: boolean;
}): boolean {
  if (!params.leftName || !params.rightName) {
    return false;
  }

  const left = normalizeName(params.leftName);
  const right = normalizeName(params.rightName);
  if (!left || !right) {
    return false;
  }

  if (left === right) {
    return true;
  }

  if (hasFullTokenSequence(left, right) || hasFullTokenSequence(right, left)) {
    return true;
  }

  return (
    params.sameSenderEmail &&
    firstToken(left) !== null &&
    firstToken(left) === firstToken(right)
  );
}

function appendNote(notes: string, addition: string): string {
  if (notes.includes(addition)) {
    return notes;
  }

  return `${notes} ${addition}`.trim();
}

export function enrichProspectRows(rows: ProspectNotionRow[]): ProspectEnrichmentResult {
  let companiesCorrected = 0;
  let companiesEnriched = 0;
  const cleanedRows = rows.map((row) => {
    if (!isSuspiciousToolCompany(row.company)) {
      return row;
    }

    companiesCorrected += 1;
    return {
      ...row,
      company: null,
      notes: appendNote(row.notes, "Company corrected from tool mention before enrichment.")
    };
  });
  const profiles: ProspectProfile[] = cleanedRows
    .filter((row) => row.name && row.company)
    .map((row) => ({
      name: row.name as string,
      company: row.company as string,
      email: row.email.toLowerCase()
    }));

  const enrichedRows = cleanedRows.map((row) => {
    if (row.company || !row.name) {
      return row;
    }

    const compatibleProfiles = profiles.filter((profile) =>
      areNamesCompatible({
        leftName: row.name,
        rightName: profile.name,
        sameSenderEmail: row.email.toLowerCase() === profile.email
      })
    );
    const companies = Array.from(new Set(compatibleProfiles.map((profile) => profile.company)));

    if (companies.length === 1) {
      companiesEnriched += 1;
      return {
        ...row,
        company: companies[0],
        notes: appendNote(
          row.notes,
          `Company inferred from related ${row.name} email: ${companies[0]}.`
        )
      };
    }

    if (companies.length > 1) {
      return {
        ...row,
        notes: appendNote(
          row.notes,
          "Company not inferred due to conflicting related company evidence."
        )
      };
    }

    return row;
  });

  return {
    rows: enrichedRows,
    companiesCorrected,
    companiesEnriched
  };
}
