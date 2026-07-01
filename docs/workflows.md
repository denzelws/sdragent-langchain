# Workflow Notes

## Gmail SDR Workflow

```txt
[Trigger: npm run dev]
↓
[Load config from .env + CLI args]
↓
[Create Gmail client]
↓
[Gmail: read messages by query]
↓
[Normalize email]
↓
[LLM: classify prospect]
↓
[Zod: validate and normalize classification]
↓
[Decision: qualified or high-confidence possible prospect?]
├── No
│   └── [Skip draft]
└── Yes
    ↓
    [LLM: generate outreach draft]
    ↓
    [Zod: validate draft]
    ↓
    [Show draft in terminal]
    ↓
    [Decision: DRY_RUN=false and CREATE_DRAFTS=true?]
    ├── No
    │   └── [Skip Gmail draft creation]
    └── Yes
        ↓
        [Approval: create Gmail draft?]
        ├── No
        │   └── [Reject draft]
        └── Yes
            ↓
            [Gmail: create draft]
            ↓
            [Decision: SEND_APPROVED_DRAFTS=true?]
            ├── No
            │   └── [Keep draft unsent]
            └── Yes
                ↓
                [Optional approval: send Gmail draft?]
                ├── No
                │   └── [Keep draft unsent]
                └── Yes
                    ↓
                    [Gmail: send created draft]
                    ↓
                    [Final report]
```

Shorter Miro version:

```txt
[Trigger: Gmail email found]
↓
[Normalize email]
↓
[LLM: classify prospect]
↓
[Zod: validate classification]
↓
[Decision: qualified prospect?]
├── No
│   └── [Skip draft]
└── Yes
    ↓
    [LLM: generate outreach draft]
    ↓
    [Zod: validate draft]
    ↓
    [Approval: create Gmail draft?]
    ↓
    [Create Gmail draft]
    ↓
    [Optional approval: send Gmail draft?]
    ↓
    [Final report]
```

## Meeting Invitation HITL Workflow

Not implemented in the current codebase.

Future intended workflow:

```txt
[Trigger: Gmail email found]
↓
[Normalize email]
↓
[LLM: detect meeting invitation]
↓
[Decision: meeting invitation?]
├── No
│   └── [End / continue other workflow]
└── Yes
    ↓
    [LLM: extract meeting details]
    ↓
    [Zod: validate meeting details]
    ↓
    [Decision: date/time valid?]
    ├── No
    │   ↓
    │   [Generate clarification draft]
    │   ↓
    │   [Approval: create Gmail draft?]
    │   ↓
    │   [Create Gmail draft]
    │
    └── Yes
        ↓
        [Google Calendar: search events]
        ↓
        [Code: conflict detection]
        ↓
        [Decision: conflict?]
        ├── Yes
        │   ↓
        │   [Generate regrets draft]
        │   ↓
        │   [Approval: create Gmail draft?]
        │   ↓
        │   [Create Gmail draft]
        │
        └── No
            ↓
            [Approval: create calendar event?]
            ↓
            [Create Google Calendar event]
            ↓
            [Generate acceptance draft]
            ↓
            [Approval: create Gmail draft?]
            ↓
            [Create Gmail draft]
            ↓
            [Optional approval: send Gmail draft?]
```

## Miro Notes

Use this mapping when copying the workflow into Miro:

- Rectangles for deterministic actions:
  - Normalize email
  - Read Gmail
  - Validate with Zod
  - Create Gmail draft
  - Send Gmail draft
- Diamonds for decisions:
  - Qualified prospect?
  - Dry run?
  - Create drafts enabled?
  - Send approved drafts enabled?
  - Meeting invitation?
  - Date/time valid?
  - Calendar conflict?
- Warning icons for side effects:
  - Gmail draft creation
  - Gmail draft sending
  - Future Calendar event creation
- Approval nodes before every write/send action.
- Separate branches for conflict/no conflict in the future meeting workflow.
- One final report node at the end of each branch.

## Current Implemented Branches

Implemented:

- Gmail read
- Email normalization
- Prospect classification
- Outreach draft generation
- Gmail draft creation approval
- Gmail draft creation
- Optional Gmail draft sending approval
- Optional Gmail draft sending

Not implemented:

- Meeting invitation detection
- Meeting detail extraction
- Google Calendar event lookup
- Conflict detection
- Calendar event creation
- Meeting acceptance/regrets/clarification reply generation
