import { google, type gmail_v1 } from "googleapis";
import type { AppConfig } from "../config.js";
import { authorizeGmail } from "./auth.js";

export async function createGmailClient(config: AppConfig): Promise<gmail_v1.Gmail> {
  const auth = await authorizeGmail(config);
  return google.gmail({ version: "v1", auth });
}
