import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";
import type { AppConfig } from "../config.js";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose"
];

type CredentialsFile = {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
};

async function readCredentials(credentialsPath: string): Promise<CredentialsFile> {
  const content = await fs.readFile(credentialsPath, "utf8");
  return JSON.parse(content) as CredentialsFile;
}

function createOAuthClient(credentials: CredentialsFile): OAuth2Client {
  const appCredentials = credentials.installed ?? credentials.web;

  if (!appCredentials) {
    throw new Error("credentials.json must contain either an installed or web OAuth client.");
  }

  const redirectUri = appCredentials.redirect_uris[0] ?? "http://localhost";
  return new google.auth.OAuth2(
    appCredentials.client_id,
    appCredentials.client_secret,
    redirectUri
  );
}

async function saveToken(tokenPath: string, client: OAuth2Client): Promise<void> {
  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(client.credentials, null, 2), "utf8");
}

export async function authorizeGmail(config: AppConfig): Promise<OAuth2Client> {
  const credentials = await readCredentials(config.gmailCredentialsPath);
  const client = createOAuthClient(credentials);

  try {
    const token = await fs.readFile(config.gmailTokenPath, "utf8");
    client.setCredentials(JSON.parse(token));
    return client;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: GMAIL_SCOPES,
    prompt: "consent"
  });

  console.log("Authorize this app by opening this URL:");
  console.log(authUrl);

  const rl = readline.createInterface({ input, output });
  const code = await rl.question("Paste the authorization code here: ");
  rl.close();

  const tokenResponse = await client.getToken(code.trim());
  client.setCredentials(tokenResponse.tokens);
  await saveToken(config.gmailTokenPath, client);

  return client;
}
