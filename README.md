# AI SDR Agent

Local TypeScript lab for an AI SDR workflow that reads Gmail, extracts prospect information with a local LLM, enriches related prospect records, deduplicates by Gmail thread, previews the result, and writes approved rows into Notion through MCP.

The current milestone is focused on the Notion Prospect Logger. The repository also contains earlier Gmail draft, Product FAQ, and meeting invitation workflows, but Notion writes are the main production-style pipeline for this milestone.

## Overview

The agent reads email from Gmail using a configurable search query, normalizes message data, asks an LLM to extract prospect records, validates structured output with Zod, enriches missing company details from related emails in the same batch, deduplicates by Gmail thread ID, and writes approved prospect rows to a Notion CRM page/database using an MCP Notion server.

By default, external writes are disabled. The Notion workflow previews rows in the terminal before writing, and Notion writes require explicit enablement plus approval when configured.

## Features

- Gmail OAuth and Gmail API integration.
- Configurable Gmail search query and max email count.
- LLM prospect extraction with structured JSON output.
- Zod validation and safe fallback behavior for model output.
- Prospect enrichment across related emails in the same batch.
- Thread-based prospect deduplication.
- Terminal preview before Notion writes.
- Notion MCP integration.
- Automatic `SDRAgent` page creation when configured.
- Automatic `Prospects` database creation when configured.
- Create-or-skip upsert support for existing prospect rows.
- Human approval before writing to Notion.
- Safe defaults for Gmail draft creation, email sending, Calendar events, and Notion writes.

## Tech Stack

- TypeScript
- Node.js
- Gmail API via `googleapis`
- Ollama via `@langchain/ollama`
- LangChain prompt/model orchestration
- Zod schema validation
- MCP via `@modelcontextprotocol/sdk`
- Notion through an MCP server
- `tsx` for local TypeScript execution

## Architecture

```text
Gmail
    ↓
Read Emails
    ↓
LLM Extraction
    ↓
Validation
    ↓
Enrichment
    ↓
Deduplication
    ↓
Preview
    ↓
Notion MCP
    ↓
Notion CRM
```

The LLM is used for extraction and drafting. Code owns validation, deduplication, enrichment rules, approval gates, and all Gmail/Notion/Calendar side effects.

## Setup

Install dependencies:

```bash
npm install
```

Copy the example environment file and fill in local values:

```bash
cp .env.example .env
```

Do not commit `.env`, `credentials.json`, `token.json`, `.agent-state/`, or `.codex/`.

### Gmail OAuth

1. Enable the Gmail API in Google Cloud.
2. Create OAuth credentials for a desktop app.
3. Download the file as `credentials.json` into the project root.
4. Run:

```bash
npm run auth:gmail
```

This opens the local OAuth flow and creates `token.json` locally.

### Ollama

Install and run Ollama, then pull the default model:

```bash
ollama pull llama3.2:3b
ollama serve
```

### Notion MCP

Configure a Notion MCP server command in `.env`:

```env
NOTION_MCP_SERVER_COMMAND=
NOTION_MCP_SERVER_ARGS=
```

For first-time setup, provide a Notion parent page ID so the logger can create the `SDRAgent` page if needed:

```env
NOTION_PARENT_PAGE_ID=
```

After a successful setup, you can make future runs safer and faster by configuring explicit IDs:

```env
NOTION_SDR_PAGE_ID=
NOTION_PROSPECTS_DATABASE_ID=
NOTION_PROSPECTS_DATA_SOURCE_ID=
```

## Running

Install dependencies:

```bash
npm install
```

Run the main Gmail agent workflow:

```bash
npm run dev
```

This reads Gmail and runs the configured workflow mode. Depending on `.env`, it can run the meeting workflow, Product FAQ workflow, SDR draft workflow, or all of them. Safe defaults avoid creating drafts, sending emails, or creating Calendar events unless enabled.

Run the Notion Prospect Logger:

```bash
npm run notion:prospects
```

This reads Gmail using `NOTION_PROSPECT_GMAIL_QUERY`, extracts prospect rows, enriches and deduplicates them, previews the rows, and writes to Notion only when `NOTION_WRITE_ENABLED=true` and approval passes.

Alias:

```bash
npm run prospects:notion
```

Typecheck:

```bash
npm run typecheck
```

Clear local processed-email state:

```bash
npm run state:clear
```

## Environment Variables

Use `.env.example` as the source of truth. Do not commit real `.env` values.

| Variable | Purpose | Safe default |
| --- | --- | --- |
| `OLLAMA_MODEL` | Ollama model used for LLM calls. | `llama3.2:3b` |
| `OLLAMA_BASE_URL` | Local Ollama server URL. | `http://localhost:11434` |
| `GMAIL_CREDENTIALS_PATH` | Path to local Google OAuth credentials. | `./credentials.json` |
| `GMAIL_TOKEN_PATH` | Path to local OAuth token. | `./token.json` |
| `GMAIL_QUERY` | Gmail query for the main agent workflow. | `in:inbox newer_than:7d` |
| `MAX_EMAILS` | Max emails read by the main workflow. | `10` |
| `WORKFLOW_MODE` | Main workflow mode: `all`, `meeting`, `product-faq`, or `sdr`. | `all` |
| `SKIP_PROCESSED_EMAILS` | Skips Gmail message IDs already stored locally. | `true` |
| `PROCESSED_EMAIL_STORE_PATH` | Local JSON state file path. | `./.agent-state/processed-emails.json` |
| `DRY_RUN` | Prevents Gmail writes/sends in the main workflow. | `true` |
| `CREATE_DRAFTS` | Enables Gmail draft creation when not dry-run. | `false` |
| `REQUIRE_DRAFT_APPROVAL` | Requires approval before creating Gmail drafts. | `true` |
| `SEND_APPROVED_DRAFTS` | Allows sending already-created Gmail drafts. | `false` |
| `REQUIRE_SEND_APPROVAL` | Requires second approval before sending. | `true` |
| `ENABLE_MEETING_WORKFLOW` | Enables meeting invitation workflow. | `false` |
| `CREATE_CALENDAR_EVENTS` | Enables Google Calendar event creation. | `false` |
| `REQUIRE_CALENDAR_EVENT_APPROVAL` | Requires approval before creating Calendar events. | `true` |
| `DEFAULT_TIMEZONE` | Timezone used for meeting extraction. | `America/Sao_Paulo` |
| `DEBUG_LLM_OUTPUT` | Prints raw/parsed LLM output for debugging. May expose email content. | `false` |
| `DEBUG_MCP_OUTPUT` | Prints MCP tool mapping and safe call metadata. | `false` |
| `NOTION_MCP_SERVER_COMMAND` | Command used to start the Notion MCP server. | blank |
| `NOTION_MCP_SERVER_ARGS` | Comma-separated args for the MCP server command. | blank |
| `NOTION_PARENT_PAGE_ID` | Parent Notion page for creating `SDRAgent`. | blank |
| `NOTION_SDR_PAGE_ID` | Explicit existing `SDRAgent` page ID. | blank |
| `NOTION_SDR_PAGE_TITLE` | Page title used when finding/creating the SDR page. | `SDRAgent` |
| `NOTION_PROSPECTS_DATABASE_TITLE` | Database title used for prospects. | `Prospects` |
| `NOTION_PROSPECTS_DATABASE_ID` | Explicit existing Prospects database ID. | blank |
| `NOTION_PROSPECTS_DATA_SOURCE_ID` | Explicit Notion data source ID for row creation. | blank |
| `NOTION_WRITE_ENABLED` | Enables Notion writes. | `false` |
| `REQUIRE_NOTION_WRITE_APPROVAL` | Requires terminal approval before Notion writes. | `true` |
| `NOTION_PROSPECT_GMAIL_QUERY` | Gmail query for the Notion Prospect Logger. | configurable test query |
| `NOTION_PROSPECT_MAX_EMAILS` | Max emails inspected by the Notion Prospect Logger. | `10` |
| `NOTION_MCP_TOOL_SEARCH` | Optional explicit MCP search tool name. | blank |
| `NOTION_MCP_TOOL_FETCH` | Optional explicit MCP fetch tool name. | blank |
| `NOTION_MCP_TOOL_CREATE_PAGES` | Optional explicit MCP create-pages tool name. | blank |
| `NOTION_MCP_TOOL_UPDATE_PAGE` | Optional explicit MCP update-page tool name. | blank |
| `NOTION_MCP_TOOL_CREATE_DATABASE` | Optional explicit MCP create-database tool name. | blank |
| `NOTION_MCP_TOOL_QUERY_DATA_SOURCES` | Optional explicit MCP query-data-sources tool name. | blank |

## Safety Notes

- `.env`, `credentials.json`, `token.json`, `.agent-state/`, and `.codex/` are local-only.
- `NOTION_WRITE_ENABLED=false` keeps the Notion Prospect Logger in preview mode.
- Use `DEBUG_LLM_OUTPUT=false` with real inbox data unless actively debugging; LLM logs may expose email content.
- Use narrow Gmail queries while testing.
- If rows were written before enrichment improvements, reruns may create duplicates unless existing-row lookup succeeds. Run with `NOTION_WRITE_ENABLED=false` first to verify the preview.
- Gmail sending is disabled by default and requires explicit configuration plus approval.
- Calendar event creation is disabled by default and requires explicit configuration plus approval.

## Future Improvements

- Stronger identity resolution across threads and senders.
- Better company inference with stricter provenance tracking.
- Lead scoring and prioritization.
- CRM integrations beyond Notion.
- Meeting scheduling flows.
- Multi-agent workflow organization.
