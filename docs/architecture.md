# Architecture Notes

## Project Overview

This project is a local TypeScript Gmail + Ollama AI agent lab. It is not a SaaS product; it is a learning project for production-adjacent LLM workflows: OAuth, secrets, structured output, validation, human approval, side effects, and Gmail actions.

The implemented workflow is the Gmail SDR workflow:

```txt
Gmail read
-> normalize email
-> classify with Ollama
-> validate and normalize with Zod
-> generate outreach draft
-> ask approval
-> create Gmail draft
-> optionally ask second approval
-> optionally send the created draft
```

The meeting invitation / Google Calendar human-in-the-loop workflow is not implemented in the current codebase. There are no Calendar client files, meeting invitation schemas, conflict checkers, or calendar event creation functions yet.

Core roles:

- Ollama + LangChain: local LLM calls through `ChatOllama`, prompt templates, JSON-mode output.
- Zod: validates and normalizes LLM output before the app trusts it.
- Human approval: gates Gmail draft creation and optional Gmail draft sending.
- Gmail side effects: read messages, create drafts, optionally send created drafts.
- Calendar side effects: not implemented yet.

## File Tree Map

```txt
.
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
└── src/
    ├── auth.ts
    ├── config.ts
    ├── index.ts
    ├── agent/
    │   ├── classifyProspect.ts
    │   ├── generateOutreachDraft.ts
    │   ├── runSdrAgent.ts
    │   └── types.ts
    ├── gmail/
    │   ├── auth.ts
    │   ├── createDraft.ts
    │   ├── gmailClient.ts
    │   ├── gmailTypes.ts
    │   ├── readEmails.ts
    │   └── sendDraft.ts
    ├── llm/
    │   ├── llmProvider.ts
    │   ├── ollamaProvider.ts
    │   ├── prompts.ts
    │   └── schemas.ts
    └── utils/
        ├── logger.ts
        ├── terminalApproval.ts
        └── text.ts
```

Grouped by responsibility:

- Project configuration: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `.env.example`
- CLI entrypoints: `src/index.ts`, `src/auth.ts`
- Config/env: `src/config.ts`
- Gmail integration: `src/gmail/*`
- Calendar integration: not present
- LLM integration: `src/llm/*`
- SDR agent workflow: `src/agent/*`
- Meeting invitation workflow: not present
- Schemas/types: `src/llm/schemas.ts`, `src/gmail/gmailTypes.ts`, `src/agent/types.ts`
- Utilities: `src/utils/*`
- Documentation: `README.md`, `docs/*`

## File-by-file Explanation

### File: `package.json`

#### Responsibility

Defines the Node/TypeScript project, scripts, dependencies, and dev dependencies.

#### Main exports

None.

#### Inputs

None at runtime.

#### Outputs

Provides npm commands.

#### Used by

The shell through `npm install`, `npm run dev`, `npm run auth:gmail`, and `npm run typecheck`.

#### Important logic

Scripts:

```json
{
  "dev": "tsx src/index.ts",
  "auth:gmail": "tsx src/auth.ts",
  "typecheck": "tsc --noEmit"
}
```

#### LLM / AI concept connection

Defines dependencies for LangChain, Ollama, Gmail API, dotenv, and Zod.

#### Safety notes

No direct side effects, but scripts can trigger Gmail and LLM workflows.

### File: `tsconfig.json`

#### Responsibility

TypeScript compiler configuration.

#### Main exports

None.

#### Inputs

TypeScript source files.

#### Outputs

Typecheck results.

#### Used by

`npm run typecheck`.

#### Important logic

Uses strict TypeScript, ES modules, and `NodeNext` resolution.

#### LLM / AI concept connection

Keeps app contracts explicit around uncertain LLM output.

#### Safety notes

No runtime side effects.

### File: `.env.example`

#### Responsibility

Documents environment variables and safe defaults.

#### Main exports

None.

#### Inputs

None.

#### Outputs

Template for local `.env`.

#### Used by

Developers copy it to `.env`.

#### Important logic

Important defaults:

```env
DRY_RUN=true
CREATE_DRAFTS=false
SEND_APPROVED_DRAFTS=false
REQUIRE_DRAFT_APPROVAL=true
REQUIRE_SEND_APPROVAL=true
DEBUG_LLM_OUTPUT=false
```

#### LLM / AI concept connection

Controls model configuration, debug logging, and workflow gates.

#### Safety notes

Real `.env` files should never be committed.

### File: `.gitignore`

#### Responsibility

Prevents local secrets and generated files from being committed.

#### Main exports

None.

#### Inputs

Git paths.

#### Outputs

Ignored files.

#### Used by

Git.

#### Important logic

Ignores `.env`, `credentials.json`, `token.json`, `node_modules`, and build output.

#### LLM / AI concept connection

Protects credentials used by Gmail and local AI workflows.

#### Safety notes

Critical for keeping OAuth credentials and tokens out of source control.

### File: `src/index.ts`

#### Responsibility

Main CLI entrypoint for the SDR agent.

#### Main exports

None.

#### Inputs

CLI args from `process.argv`.

#### Outputs

Starts the agent workflow.

#### Used by

`npm run dev`.

#### Important logic

Loads config, applies CLI overrides, and calls `runSdrAgent(config)`.

#### LLM / AI concept connection

Starts the deterministic workflow that wraps probabilistic model calls.

#### Safety notes

Does not directly touch Gmail; delegates side effects to the orchestrator.

### File: `src/auth.ts`

#### Responsibility

CLI entrypoint for Gmail OAuth setup.

#### Main exports

None.

#### Inputs

Config paths for Gmail credentials and token.

#### Outputs

Creates or reuses the local Gmail OAuth token.

#### Used by

`npm run auth:gmail`.

#### Important logic

Loads config, calls `authorizeGmail`, and logs where the token is saved.

#### LLM / AI concept connection

Shows setup for explicit API access before any AI workflow can use Gmail data.

#### Safety notes

Touches OAuth credentials and token files. Does not read messages or create drafts.

### File: `src/config.ts`

#### Responsibility

Loads `.env`, applies defaults, parses booleans/numbers, and applies CLI overrides.

#### Main exports

- `AppConfig`
- `loadConfig`
- `applyCliOverrides`

#### Inputs

Environment variables and CLI args.

#### Outputs

Runtime config object.

#### Used by

`src/index.ts`, `src/auth.ts`, and workflow modules.

#### Important logic

Default behavior is safe:

- `dryRun`: true
- `createDrafts`: false
- `sendApprovedDrafts`: false
- `requireDraftApproval`: true
- `requireSendApproval`: true
- `debugLlmOutput`: false

CLI overrides support:

- `--max`
- `--query`
- `--dry-run`
- `--create-drafts`

#### LLM / AI concept connection

Configuration is the first safety layer around model-driven workflows.

#### Safety notes

The draft and send gates live in config and are consumed by `runSdrAgent`.

### File: `src/gmail/auth.ts`

#### Responsibility

Handles Gmail OAuth locally.

#### Main exports

- `GMAIL_SCOPES`
- `authorizeGmail`

#### Inputs

`AppConfig`, `credentials.json`, optional `token.json`.

#### Outputs

Authenticated OAuth client.

#### Used by

`src/gmail/gmailClient.ts` and `src/auth.ts`.

#### Important logic

Reads OAuth credentials, creates a Google OAuth2 client, reuses an existing token if present, or prints an auth URL and exchanges a pasted code for tokens.

#### LLM / AI concept connection

Explicit API auth boundary. The LLM does not control authentication.

#### Safety notes

Reads and writes sensitive OAuth material. Tokens and credentials should never be committed.

### File: `src/gmail/gmailClient.ts`

#### Responsibility

Creates an authenticated Gmail API client.

#### Main exports

- `createGmailClient`

#### Inputs

`AppConfig`.

#### Outputs

`gmail_v1.Gmail`.

#### Used by

`runSdrAgent`.

#### Important logic

Calls `authorizeGmail` and returns `google.gmail({ version: "v1", auth })`.

#### LLM / AI concept connection

Creates a deterministic API client the app can call explicitly.

#### Safety notes

No action by itself, but enables Gmail reads/writes.

### File: `src/gmail/gmailTypes.ts`

#### Responsibility

Defines the normalized Gmail message shape.

#### Main exports

- `NormalizedEmail`

#### Inputs

None.

#### Outputs

Shared TypeScript type.

#### Used by

Gmail reading, classification, draft generation, and agent types.

#### Important logic

Keeps only fields the app needs: ids, from/to, subject, date, snippet, body.

#### LLM / AI concept connection

Context management: reduces Gmail API complexity before sending data to the model.

#### Safety notes

Represents private email data.

### File: `src/gmail/readEmails.ts`

#### Responsibility

Reads recent Gmail messages and normalizes them.

#### Main exports

- `normalizeGmailMessage`
- `readRecentEmails`

#### Inputs

Authenticated Gmail client, Gmail query, max result count.

#### Outputs

Array of `NormalizedEmail`.

#### Used by

`runSdrAgent`.

#### Important logic

Lists Gmail message ids, fetches full message details, extracts common headers, decodes body content, prefers plain text, and falls back to stripped HTML.

#### LLM / AI concept connection

Turns messy external data into stable LLM context.

#### Safety notes

Reads private inbox data. It does not delete, archive, label, draft, or send.

### File: `src/gmail/createDraft.ts`

#### Responsibility

Creates a plain-text Gmail draft.

#### Main exports

- `createGmailDraft`

#### Inputs

Gmail client and validated `OutreachDraft`.

#### Outputs

Created Gmail draft id.

#### Used by

`runSdrAgent`.

#### Important logic

Normalizes line endings, builds a MIME message, base64url-encodes it, and calls `gmail.users.drafts.create`.

#### LLM / AI concept connection

Side-effect boundary: LLM generates content, deterministic code creates the draft.

#### Safety notes

Creates Gmail drafts. Gated by config and terminal approval in `runSdrAgent`.

### File: `src/gmail/sendDraft.ts`

#### Responsibility

Sends an existing Gmail draft.

#### Main exports

- `sendGmailDraft`

#### Inputs

Gmail client and draft id.

#### Outputs

Sent Gmail message id or `null`.

#### Used by

`runSdrAgent`.

#### Important logic

Calls `gmail.users.drafts.send` using the created draft id.

#### LLM / AI concept connection

Explicit side-effect boundary for the riskiest action.

#### Safety notes

Sends email. Gated by `SEND_APPROVED_DRAFTS` and send approval in `runSdrAgent`.

### File: `src/llm/llmProvider.ts`

#### Responsibility

Defines a small LLM provider interface.

#### Main exports

- `LlmProvider`

#### Inputs

None.

#### Outputs

Type wrapping a LangChain chat model.

#### Used by

`ollamaProvider`, `classifyProspect`, and `generateOutreachDraft`.

#### Important logic

Keeps downstream agent code dependent on a generic chat model shape.

#### LLM / AI concept connection

Provider abstraction and future extensibility.

#### Safety notes

No side effects.

### File: `src/llm/ollamaProvider.ts`

#### Responsibility

Creates the local Ollama-backed LangChain model.

#### Main exports

- `createOllamaProvider`

#### Inputs

`AppConfig`.

#### Outputs

`LlmProvider`.

#### Used by

`runSdrAgent`.

#### Important logic

Creates `ChatOllama` with low temperature, JSON output mode, and a larger output budget.

#### LLM / AI concept connection

Local model integration, structured output mode, and output budget tuning.

#### Safety notes

Email content is sent to the configured Ollama endpoint. Keep it local unless intentionally testing a remote endpoint.

### File: `src/llm/prompts.ts`

#### Responsibility

Stores LangChain prompt templates for classification and draft generation.

#### Main exports

- `classifyProspectPrompt`
- `generateOutreachDraftPrompt`

#### Inputs

Template variables from normalized email and classification data.

#### Outputs

Formatted chat prompts.

#### Used by

`classifyProspect` and `generateOutreachDraft`.

#### Important logic

Classification prompt defines ICP and JSON rules. Draft prompt defines plain-text email formatting, paragraph spacing, no markdown, no meeting links, and JSON object requirements.

#### LLM / AI concept connection

Prompt templates, classification, draft generation, structured output instructions.

#### Safety notes

Prompts reduce risk but do not guarantee behavior. Zod and approval gates still matter.

### File: `src/llm/schemas.ts`

#### Responsibility

Defines Zod schemas and TypeScript types for LLM outputs.

#### Main exports

- `prospectClassificationSchema`
- `ProspectClassification`
- `outreachDraftSchema`
- `OutreachDraft`

#### Inputs

Parsed LLM JSON.

#### Outputs

Validated and normalized app objects.

#### Used by

`classifyProspect`, `generateOutreachDraft`, Gmail draft creation, and agent types.

#### Important logic

Descriptive fields are tolerant and normalized. Business decision fields remain strict.

#### LLM / AI concept connection

Schema validation, structured output, and LLM safety fallback.

#### Safety notes

Prevents malformed LLM output from driving actions.

### File: `src/agent/classifyProspect.ts`

#### Responsibility

Classifies one normalized email.

#### Main exports

- `classifyProspect`

#### Inputs

LLM provider, normalized email, config.

#### Outputs

`ProspectClassification`.

#### Used by

`runSdrAgent`.

#### Important logic

Calls the classification prompt/model chain, parses JSON, optionally logs raw/parsed output, validates with Zod, and falls back to `unclear` on any failure.

#### LLM / AI concept connection

Classification, structured output, deterministic validation around probabilistic output.

#### Safety notes

Can log private LLM output if `DEBUG_LLM_OUTPUT=true`.

### File: `src/agent/generateOutreachDraft.ts`

#### Responsibility

Generates a draft only when classification passes the app decision rule.

#### Main exports

- `shouldGenerateDraft`
- `generateOutreachDraft`

#### Inputs

LLM provider, normalized email, classification, config.

#### Outputs

`OutreachDraft | null`.

#### Used by

`runSdrAgent`.

#### Important logic

Draft generation runs for `qualified_prospect` or high-confidence `possible_prospect`. Draft output is parsed, debug-logged if enabled, validated with Zod, and skipped if invalid.

#### LLM / AI concept connection

Draft generation and app-owned decision boundary.

#### Safety notes

Does not create or send email. Later workflow gates handle side effects.

### File: `src/agent/runSdrAgent.ts`

#### Responsibility

Main deterministic workflow orchestrator.

#### Main exports

- `runSdrAgent`

#### Inputs

`AppConfig`.

#### Outputs

`AgentReport`.

#### Used by

`src/index.ts`.

#### Important logic

Reads Gmail, classifies each email, generates drafts, asks for draft approval, creates Gmail drafts, optionally asks for send approval, sends approved drafts, and prints a final report.

#### LLM / AI concept connection

Combines probabilistic LLM steps with deterministic validation, approvals, and side-effect gates.

#### Safety notes

Primary safety file. Draft creation and sending are gated here.

### File: `src/agent/types.ts`

#### Responsibility

Defines workflow-level types.

#### Main exports

- `ProcessedEmail`
- `AgentReport`

#### Inputs

Shared Gmail and LLM types.

#### Outputs

Agent reporting contracts.

#### Used by

`runSdrAgent`.

#### Important logic

Tracks counts for read emails, classifications, generated drafts, created drafts, and sent emails.

#### LLM / AI concept connection

Workflow observability.

#### Safety notes

No side effects.

### File: `src/utils/logger.ts`

#### Responsibility

Small console logger wrapper.

#### Main exports

- `logger`

#### Inputs

Strings.

#### Outputs

Terminal logs.

#### Used by

Workflow and auth files.

#### Important logic

Wraps info/warn/error console methods.

#### LLM / AI concept connection

Debugging and observability.

#### Safety notes

Can expose private data depending on what callers log.

### File: `src/utils/terminalApproval.ts`

#### Responsibility

Prompts the user for approval in the terminal.

#### Main exports

- `askForApproval`

#### Inputs

Prompt text.

#### Outputs

Boolean approval.

#### Used by

`runSdrAgent`.

#### Important logic

Only `y` or `yes` approves. Everything else rejects.

#### LLM / AI concept connection

Human-in-the-loop safety gate.

#### Safety notes

Critical protection before Gmail writes/sends.

### File: `src/utils/text.ts`

#### Responsibility

Small text helpers.

#### Main exports

- `truncate`
- `extractEmailAddress`

#### Inputs

Strings or nullish values.

#### Outputs

Truncated text or extracted email address.

#### Used by

`runSdrAgent` and `generateOutreachDraft`.

#### Important logic

Keeps logs concise and infers email addresses from headers.

#### LLM / AI concept connection

Context cleanup and output hygiene.

#### Safety notes

No side effects.

## Runtime Flow

### Gmail SDR Flow

```txt
npm run dev
-> src/index.ts
-> loadConfig()
-> applyCliOverrides()
-> runSdrAgent()
-> createGmailClient()
-> authorizeGmail()
-> readRecentEmails()
-> normalizeGmailMessage()
-> createOllamaProvider()
-> classifyProspect()
-> Zod validation / normalization
-> generateOutreachDraft()
-> Zod draft validation
-> approval
-> createGmailDraft()
-> optional send approval
-> sendGmailDraft()
-> final report
```

Invalid classification output falls back to `unclear`, which prevents draft generation. Invalid draft output returns `null`, which prevents Gmail draft creation.

### Meeting Invitation HITL Flow

Not implemented in the current codebase.

## Data Contracts

### Normalized Gmail Email

Represents a simplified Gmail message with ids, headers, snippet, and body. It exists to keep Gmail API complexity away from the LLM workflow.

Strict fields: none are schema-validated.

Flexible fields: most values can be `string | null`.

Validation failure: not currently Zod-validated; created by deterministic code.

### Prospect Classification Schema

Represents the model's classification result.

Strict fields:

- `classification`: must be `qualified_prospect`, `possible_prospect`, `not_a_prospect`, or `unclear`.
- `confidenceScore`: must be a number between `0` and `1`.

Normalized/flexible fields:

- `prospectName`
- `prospectEmail`
- `companyName`
- `role`
- `companySize`
- `painPoints`
- `toolsMentioned`
- `qualificationReason`

Validation failure: `classifyProspect` returns the safe fallback `unclear`.

### Outreach Draft Schema

Represents generated draft email content.

Strict fields:

- `to`
- `subject`
- `body`
- `reason`

All must be non-empty strings.

Validation failure: `generateOutreachDraft` returns `null`, so no Gmail draft is created.

### Meeting / Calendar Schemas

Not implemented yet.

## Environment Variables

Based only on `.env.example`.

| Variable | Controls | Safe value | Risky value | Commit? |
| --- | --- | --- | --- | --- |
| `OLLAMA_MODEL` | Local Ollama model name | Known local model | Unreliable model | No |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` | Remote endpoint with private email data | No |
| `GMAIL_CREDENTIALS_PATH` | OAuth client path | Local ignored path | Shared or wrong app credentials | No |
| `GMAIL_TOKEN_PATH` | OAuth token path | Local ignored path | Wrong account token | No |
| `GMAIL_QUERY` | Gmail search scope | Narrow test query | Broad inbox query | No |
| `MAX_EMAILS` | Number of messages processed | Small number | Large inbox scan | No |
| `DRY_RUN` | Blocks draft creation/sending | `true` | `false` | No |
| `CREATE_DRAFTS` | Allows Gmail draft creation | `false` | `true` | No |
| `REQUIRE_DRAFT_APPROVAL` | Requires draft approval | `true` | `false` | No |
| `SEND_APPROVED_DRAFTS` | Allows sending created drafts | `false` | `true` | No |
| `REQUIRE_SEND_APPROVAL` | Requires send approval | `true` | `false` | No |
| `DEBUG_LLM_OUTPUT` | Logs raw/parsed model output | `false` | `true` with real inbox data | No |

## Human-in-the-loop Design

### Gmail draft creation approval

- Action: create a Gmail draft.
- Why approval exists: writing to Gmail is a side effect.
- Approved: calls `createGmailDraft`.
- Rejected: logs rejection and moves on.
- Config: `REQUIRE_DRAFT_APPROVAL`, also gated by `DRY_RUN=false` and `CREATE_DRAFTS=true`.

### Gmail draft sending approval

- Action: send an already-created Gmail draft.
- Why approval exists: sending email is high risk.
- Approved: calls `sendGmailDraft`.
- Rejected: draft remains available and unsent.
- Config: `REQUIRE_SEND_APPROVAL`, also gated by `SEND_APPROVED_DRAFTS=true`.

### Google Calendar event creation approval

Not implemented yet.

## Side Effects Map

| Side effect | File/function | Config gate | Human approval | Default safe? |
| ----------- | ------------- | ----------- | -------------- | ------------- |
| Gmail read | `readRecentEmails` | `GMAIL_QUERY`, `MAX_EMAILS` | No | Mostly yes; read-only but private data is accessed |
| Gmail draft creation | `createGmailDraft` | `DRY_RUN=false`, `CREATE_DRAFTS=true` | `REQUIRE_DRAFT_APPROVAL=true` | Yes |
| Gmail draft sending | `sendGmailDraft` | `SEND_APPROVED_DRAFTS=true`, `DRY_RUN=false`, `CREATE_DRAFTS=true` | `REQUIRE_SEND_APPROVAL=true` | Yes |
| Google Calendar event reading | Not implemented | Not implemented | Not implemented | Yes, absent |
| Google Calendar event creation | Not implemented | Not implemented | Not implemented | Yes, absent |
