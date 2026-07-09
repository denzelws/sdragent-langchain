import { z } from "zod";
import { prospectNotionRowSchema } from "../../prospects/schemas.js";

export const prospectEnrichmentResultSchema = z.object({
  rows: z.array(prospectNotionRowSchema),
  companiesCorrected: z.number().int().min(0),
  companiesEnriched: z.number().int().min(0)
});
