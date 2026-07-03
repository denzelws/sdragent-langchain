import { google, type calendar_v3 } from "googleapis";
import type { AppConfig } from "../config.js";
import { authorizeGmail } from "../gmail/auth.js";

export async function createCalendarClient(config: AppConfig): Promise<calendar_v3.Calendar> {
  const auth = await authorizeGmail(config);
  return google.calendar({ version: "v3", auth });
}
