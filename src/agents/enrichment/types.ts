import type { ProspectNotionRow } from "../../prospects/types.js";

type ProspectEnrichmentAction = "company_corrected" | "company_enriched" | "company_conflict";

export type ProspectEnrichmentDecision = {
  action: ProspectEnrichmentAction;
  reason: string;
};

export type EnrichedProspect = ProspectNotionRow;

export type ProspectEnrichmentResult = {
  rows: EnrichedProspect[];
  companiesCorrected: number;
  companiesEnriched: number;
};

export type ProspectProfile = {
  name: string;
  company: string;
  email: string;
};
