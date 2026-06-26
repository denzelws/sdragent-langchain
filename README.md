# Gmail Ollama SDR Agent

A local TypeScript SDR drafting agent inspired by a LangSmith Fleet-style Gmail workflow. It reads recent Gmail messages, uses Ollama locally to classify likely B2B SaaS RevOps prospects, generates personalized outreach draft text, and can create Gmail drafts only after terminal approval.

The default setup has no paid API dependency and does not send email.

## What It Does

- Reads recent Gmail messages with the Gmail API.
- Normalizes sender, recipient, subject, date, snippet, thread id, message id, and body.
- Uses `@langchain/ollama` with a local Ollama model to classify prospects.
- Generates concise outreach draft text for qualified prospects.
- Prints generated drafts in the terminal.
- Optionally creates Gmail drafts after human approval.

## What It Does Not Do

- It does not send emails.
- It does not delete, archive, label, or modify existing emails.
- It does not generate leads.
- It does not schedule meetings or create calendar events.
- It does not browse the web or enrich leads.
- It does not connect to a CRM.
- It does not include a frontend or database.
- It does not use OpenAI, Anthropic, or paid APIs by default.

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Default `.env` values:

```env
OLLAMA_MODEL=llama3.2:3b
OLLAMA_BASE_URL=http://localhost:11434

GMAIL_CREDENTIALS_PATH=./credentials.json
GMAIL_TOKEN_PATH=./token.json
GMAIL_QUERY=in:inbox newer_than:7d

MAX_EMAILS=10
DRY_RUN=true
CREATE_DRAFTS=false
REQUIRE_DRAFT_APPROVAL=true
```

## Gmail OAuth Setup

1. Create or open a Google Cloud project.
2. Enable the Gmail API.
3. Configure the OAuth consent screen for local testing.
4. Create OAuth client credentials. A desktop app credential is simplest.
5. Download the OAuth file.
6. Save it in this project root as `credentials.json`.
7. Run:

```bash
npm run auth:gmail
```

The command opens an authorization URL in the terminal. Paste the returned code when prompted. The app writes `token.json` locally.

The app requests only:

- Gmail read-only scope for reading messages.
- Gmail compose scope for creating drafts.

It never requests a send scope.

Do not commit these files:

- `.env`
- `credentials.json`
- `token.json`

They are already listed in `.gitignore`.

## Ollama Setup

Install Ollama, then pull the default local model:

```bash
ollama pull llama3.2:3b
ollama serve
```

You can change the model with:

```env
OLLAMA_MODEL=llama3.2:3b
OLLAMA_BASE_URL=http://localhost:11434
```

## Run

Read recent inbox emails, classify them, and print generated draft text without creating Gmail drafts:

```bash
npm run dev
```

Override the number of emails:

```bash
npm run dev -- --max 10
```

Override the Gmail search query:

```bash
npm run dev -- --query "in:inbox newer_than:7d"
```

Force dry-run mode:

```bash
npm run dev -- --dry-run
```

Enable Gmail draft creation:

```bash
npm run dev -- --create-drafts
```

Even when draft creation is enabled, the app asks before each Gmail draft if `REQUIRE_DRAFT_APPROVAL=true`.

## Classification

The app classifies each normalized email as:

- `qualified_prospect`
- `possible_prospect`
- `not_a_prospect`
- `unclear`

A qualified prospect should match most of these:

- Mid-market SaaS company, roughly 50-500 employees.
- Head of Operations, RevOps Manager, Revenue Operations Manager, Director of Revenue Operations, or a closely related operations role.
- Interest in automation, integrations, workflow improvements, data sync, or reducing manual data entry.
- Mentions tools or pain points like HubSpot, Stripe, Salesforce, Jira, reporting, lifecycle ops, pipeline hygiene, handoffs, or manual admin work.

Invalid LLM JSON falls back to `unclear`, and no draft is created.

## Draft Creation Safety

By default:

```env
DRY_RUN=true
CREATE_DRAFTS=false
REQUIRE_DRAFT_APPROVAL=true
```

To create drafts, either set:

```env
CREATE_DRAFTS=true
DRY_RUN=false
```

or run:

```bash
npm run dev -- --create-drafts
```

Before creating each draft, the terminal shows the generated message and asks:

```txt
Create Gmail draft for laura@example.com? (y/N)
```

Only `y` or `yes` approves. Pressing enter rejects by default.

## Test With A Second Gmail Account

Use a second Gmail account to send a fake prospect email into the inbox connected to this app. Then restrict the query:

```env
GMAIL_QUERY=from:second.test.account@gmail.com newer_than:7d
```

or:

```bash
npm run dev -- --query "from:second.test.account@gmail.com newer_than:7d"
```

Do not hardcode the test address in the app.

Recommended test email:

Subject:

```txt
Question about HubSpot and Jira workflow
```

Body:

```txt
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
- Company: `ScaleHub`
- Role: `Head of Revenue Operations`
- Tools: `HubSpot`, `Stripe`, `Jira`
- Pain: manual data entry and handoffs
- Action: generate a draft and request approval before creating a Gmail draft

## Development

Typecheck:

```bash
npm run typecheck
```

Authenticate Gmail:

```bash
npm run auth:gmail
```

Run the CLI agent:

```bash
npm run dev
```

## Troubleshooting

If Gmail auth fails:

- Confirm the Gmail API is enabled in Google Cloud.
- Confirm `credentials.json` is in the project root or update `GMAIL_CREDENTIALS_PATH`.
- Delete `token.json` and rerun `npm run auth:gmail` if scopes changed.
- Make sure the Google account is allowed by the OAuth consent screen test users.

If Ollama calls fail:

- Run `ollama serve`.
- Run `ollama pull llama3.2:3b`.
- Confirm `OLLAMA_BASE_URL=http://localhost:11434`.
- Try a smaller `MAX_EMAILS` value while testing.

If no emails are found:

- Check `GMAIL_QUERY`.
- Try `in:inbox newer_than:30d`.
- Use the second-account test query to isolate a known message.

If no drafts are generated:

- Check the printed classification and confidence score.
- Drafts are generated only for `qualified_prospect` or high-confidence `possible_prospect`.
- Invalid LLM JSON safely falls back to `unclear`.

## Safety Notes

This app is deliberately narrow. Gmail access is implemented as explicit TypeScript functions, not autonomous tools. The workflow is deterministic:

```txt
Read Gmail emails
→ normalize email data
→ classify each email with Ollama
→ generate draft text only for qualified prospects
→ show draft in terminal
→ ask for approval
→ create Gmail draft only if approved
→ print final report
```

The app never sends email.
