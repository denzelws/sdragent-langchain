# Gmail Ollama SDR Agent

## Overview

Local TypeScript CLI assistant for a narrow Gmail + Ollama SDR workflow. It reads Gmail messages, uses a local Ollama model to classify likely B2B SaaS RevOps prospects, generates outreach draft text, and can optionally create Gmail drafts.

By default, the safe mode is read/classify/generate only: it does not create Gmail drafts by default and does not send emails by default. Sending is optional and requires explicit enablement plus a second send approval prompt.

## Features

- Reads Gmail messages with a configurable Gmail search query.
- Classifies prospects with local Ollama through LangChain.
- Generates concise outreach draft text for qualified prospects.
- Validates LLM output with Zod; invalid output falls back safely.
- Optionally creates Gmail drafts after terminal approval.
- Optionally sends created Gmail drafts after a second explicit approval.
- No frontend, database, CRM, web enrichment, lead generation, or scheduling.

## Safety Defaults

Use these defaults for local development:

```env
DRY_RUN=true
CREATE_DRAFTS=false
SEND_APPROVED_DRAFTS=false
REQUIRE_DRAFT_APPROVAL=true
REQUIRE_SEND_APPROVAL=true
DEBUG_LLM_OUTPUT=false
```

| Setting | Safe behavior |
| --- | --- |
| `DRY_RUN=true` | Prints results but does not create drafts or send. |
| `CREATE_DRAFTS=false` | Gmail drafts are not created. |
| `SEND_APPROVED_DRAFTS=false` | Created drafts are not sent. |
| `REQUIRE_DRAFT_APPROVAL=true` | User must approve draft creation. |
| `REQUIRE_SEND_APPROVAL=true` | User must approve sending after draft creation. |
| `DEBUG_LLM_OUTPUT=false` | Raw LLM output is not logged. |

Sending requires all of the following:

```env
DRY_RUN=false
CREATE_DRAFTS=true
SEND_APPROVED_DRAFTS=true
```

If `REQUIRE_SEND_APPROVAL=true`, the app also asks:

```txt
Send this Gmail draft now? (y/N)
```

Only `y` or `yes` approves. Pressing enter rejects.

## Setup

Install dependencies:

```bash
npm install
```

Create a local env file:

```bash
cp .env.example .env
```

Review `.env` before running against a real inbox. For safest testing, keep `DRY_RUN=true`, `CREATE_DRAFTS=false`, and `SEND_APPROVED_DRAFTS=false`.

Install and start Ollama:

```bash
ollama pull llama3.2:3b
ollama serve
```

Typecheck:

```bash
npm run typecheck
```

## Gmail OAuth

1. Create or open a Google Cloud project.
2. Enable the Gmail API.
3. Configure the OAuth consent screen for local testing.
4. Create OAuth client credentials. A desktop app credential is simplest.
5. Download the OAuth JSON file.
6. Save it in the project root as `credentials.json`.
7. Run:

```bash
npm run auth:gmail
```

The command prints an authorization URL. Open it, approve access, paste the returned code, and the app creates `token.json` locally.

If you enabled this project before Calendar support was added, delete `token.json` and rerun `npm run auth:gmail` so Google can grant the Calendar event scope.

Never commit:

- `.env`
- `credentials.json`
- `token.json`

These are listed in `.gitignore`.

## Usage

Safe run: read Gmail, classify messages, and print draft text without creating Gmail drafts.

```bash
npm run dev
```

Use a narrow Gmail query:

```bash
npm run dev -- --query "in:inbox newer_than:7d"
```

Limit message count:

```bash
npm run dev -- --max 5
```

Create Gmail drafts after approval:

```bash
npm run dev -- --create-drafts
```

`--create-drafts` enables Gmail draft creation only. It does not send emails unless `SEND_APPROVED_DRAFTS=true`.

To send approved drafts, set:

```env
DRY_RUN=false
CREATE_DRAFTS=true
SEND_APPROVED_DRAFTS=true
REQUIRE_DRAFT_APPROVAL=true
REQUIRE_SEND_APPROVAL=true
```

Then run:

```bash
npm run dev -- --query "from:test.sender@example.com newer_than:7d"
```

Flow when sending is enabled:

```txt
Generate draft
→ ask to create Gmail draft
→ create draft if approved
→ ask to send Gmail draft
→ send only if approved
```

## Processed Email State

The agent can remember processed Gmail message IDs across runs so the same recent emails are not handled repeatedly.

Default state file:

```txt
.agent-state/processed-emails.json
```

The state file stores safe metadata only: message id, thread id, sender, subject, workflow, status, reason, and timestamp. It does not store full email bodies, Gmail tokens, or credentials.

Clear local state:

```bash
npm run state:clear
```

Relevant settings:

```env
SKIP_PROCESSED_EMAILS=true
PROCESSED_EMAIL_STORE_PATH=./.agent-state/processed-emails.json
```

## Workflow Mode

Use `WORKFLOW_MODE` to run only one workflow during development.

Available modes:

```txt
all
meeting
product-faq
sdr
```

Example Product FAQ testing config:

```env
GMAIL_QUERY=from:sanmutty@gmail.com newer_than:7d
MAX_EMAILS=10
WORKFLOW_MODE=product-faq
SKIP_PROCESSED_EMAILS=true
DRY_RUN=false
CREATE_DRAFTS=true
SEND_APPROVED_DRAFTS=false
DEBUG_LLM_OUTPUT=true
```

In `product-faq` mode, Meeting and SDR workflows do not run. Emails that do not match Product FAQ are still marked processed so they do not reappear on every development run.

## Notion Prospect Logger via MCP

This separate workflow reads Gmail, extracts prospect information, and writes structured prospect rows to a Notion page using a Notion MCP server. It does not send Gmail emails and does not run the normal reply workflow.

Command:

```bash
npm run notion:prospects
```

Alias:

```bash
npm run prospects:notion
```

Required config:

```env
NOTION_MCP_SERVER_COMMAND=
NOTION_MCP_SERVER_ARGS=
NOTION_PARENT_PAGE_ID=
NOTION_SDR_PAGE_TITLE=SDRAgent
NOTION_PROSPECTS_DATABASE_TITLE=Prospects
NOTION_PROSPECTS_DATABASE_ID=
NOTION_WRITE_ENABLED=false
REQUIRE_NOTION_WRITE_APPROVAL=true
NOTION_PROSPECT_GMAIL_QUERY=from:sanmutty@gmail.com newer_than:7d subject:"MEETING_TEST"
NOTION_PROSPECT_MAX_EMAILS=10
NOTION_MCP_TOOL_SEARCH=
NOTION_MCP_TOOL_CREATE_PAGE=
NOTION_MCP_TOOL_CREATE_DATABASE=
NOTION_MCP_TOOL_QUERY_DATABASE=
NOTION_MCP_TOOL_UPDATE_PAGE=
```

Safety:

- Notion writes are disabled by default.
- Prospect rows are previewed before writing.
- Human approval is required before writing when `REQUIRE_NOTION_WRITE_APPROVAL=true`.
- The workflow stores only structured prospect fields in Notion, not full Gmail bodies.
- If MCP tool names cannot be resolved, the command prints available tools and stops.
- Repeated runs create new rows only when no existing row is found by email or Gmail thread id.

For local smoke tests, the Gmail query is only the retrieval scope. The workflow still decides whether each returned email is a prospect based on the email content.

## Testing With A Second Gmail

Use a second Gmail account to send one fake prospect email into the inbox connected to this app. Then run the agent with a narrow sender query so it does not scan your whole inbox:

```bash
npm run dev -- --query "from:your.second.account@gmail.com newer_than:7d" --max 5
```

Example test email:

```txt
Subject: Question about HubSpot and Jira workflow

Hi,

I’m Laura Bennett, Head of Revenue Operations at ScaleHub.

We’re a B2B SaaS company with around 240 employees. Right now, when an enterprise deal closes in HubSpot, our RevOps team manually creates Jira tickets for onboarding and implementation.

The process creates delays and mistakes because customer data gets copied between HubSpot, Stripe, and Jira by hand.

We’re looking for a no-code way to reduce manual data entry without asking engineering to build custom internal scripts.

Best,
Laura
```

Expected result:

- Classification: `qualified_prospect`
- Draft text printed in the terminal
- No Gmail draft if `DRY_RUN=true` or `CREATE_DRAFTS=false`
- Gmail draft created only after draft approval
- Email sent only when `SEND_APPROVED_DRAFTS=true` and send approval passes

## Troubleshooting

Gmail auth fails:

- Confirm the Gmail API is enabled.
- Confirm `credentials.json` is in the project root or update `GMAIL_CREDENTIALS_PATH`.
- Delete `token.json` and rerun `npm run auth:gmail` if scopes or accounts changed.
- Confirm your Google account is allowed by the OAuth consent screen.

Ollama fails:

- Run `ollama serve`.
- Run `ollama pull llama3.2:3b`.
- Confirm `OLLAMA_BASE_URL=http://localhost:11434`.
- Try a smaller `MAX_EMAILS` while testing.

No emails found:

- Check `GMAIL_QUERY`.
- Try `in:inbox newer_than:30d`.
- Use a known sender query from a second Gmail account.

Draft generated but Gmail draft not created:

- Confirm `DRY_RUN=false`.
- Confirm `CREATE_DRAFTS=true` or use `--create-drafts`.
- Confirm you approved the `Create Gmail draft...?` prompt.

Draft created but email not sent:

- Confirm `SEND_APPROVED_DRAFTS=true`.
- Confirm `DRY_RUN=false`.
- Confirm you approved the `Send this Gmail draft now?` prompt.

## Security Notes

- Do not commit `.env`, `credentials.json`, or `token.json`.
- Keep `DEBUG_LLM_OUTPUT=false` for real inbox data; debug logs may expose private email content and raw model output.
- Use narrow Gmail queries while testing.
- This project is for local development and controlled testing, not spam or bulk outreach.
- LLM output is treated as untrusted: it is parsed, normalized for harmless descriptive-field issues, validated with Zod, and falls back safely when invalid.
