# LLM Concepts Notes

## Concepts Covered

### Prompt templates

Prompts live in `src/llm/prompts.ts`. The app uses LangChain `ChatPromptTemplate` objects for prospect classification and outreach draft generation.

The prompts define:

- what the model should do
- what JSON fields it must return
- what business criteria to use
- how the draft body should be formatted

### Structured output

The app asks Ollama to return one complete JSON object. `ChatOllama` is configured with `format: "json"` and a larger output budget via `numPredict`.

This improves reliability, but it does not remove the need for validation.

### Zod schema validation

Schemas live in `src/llm/schemas.ts`.

Zod validates:

- prospect classifications
- generated outreach drafts

It also normalizes harmless descriptive-field mistakes, such as a number for `companySize` or a comma-separated string for `painPoints`.

### LLM output as untrusted input

The app never trusts model output directly. It parses JSON, validates with Zod, and falls back safely when validation fails.

Invalid classification output becomes `unclear`, which prevents draft generation.

Invalid draft output becomes `null`, which prevents Gmail draft creation.

### Local model limitations

Local models can return:

- incomplete JSON
- wrong field types
- markdown around JSON
- weak classifications
- awkward email formatting

The project handles this with JSON mode, stricter prompts, debug logging, output validation, and fallback behavior.

### Human-in-the-loop

Human approval is required before Gmail draft creation by default. A second approval is required before optional draft sending by default.

This keeps irreversible or externally visible actions under human control.

### Side effect gating

The LLM can classify and draft, but deterministic code owns side effects.

Important gates:

- `DRY_RUN`
- `CREATE_DRAFTS`
- `REQUIRE_DRAFT_APPROVAL`
- `SEND_APPROVED_DRAFTS`
- `REQUIRE_SEND_APPROVAL`

### Tool/function boundaries

Gmail operations are explicit TypeScript functions:

- `readRecentEmails`
- `createGmailDraft`
- `sendGmailDraft`

The LLM does not call Gmail directly.

### Gmail/Calendar as explicit integrations

Gmail integration is implemented. Calendar integration is not implemented yet.

The intended architecture for Calendar should follow the same pattern:

```txt
LLM extracts intent/details
-> Zod validates
-> deterministic code checks conflicts
-> human approval gates calendar writes
```

### Debug logging

`DEBUG_LLM_OUTPUT=true` logs raw and parsed model output around classification and draft generation.

This is useful for debugging local model behavior, but it may expose private email content.

### Dry-run safety

`DRY_RUN=true` prevents Gmail draft creation and sending. It is the safest mode for learning and testing.

### Progressive disclosure / skills readiness

As the project grows, it could split into workflow-specific modules or skills:

- Gmail SDR workflow
- Meeting invitation workflow
- Calendar conflict workflow
- Draft review workflow

The current project is still small enough to keep the flow explicit.

## Practical Lessons

- Prompts are instructions, not guarantees.
- Code should validate model output every time.
- Local models may return wrong JSON types or incomplete JSON.
- Side effects should be controlled by code and human approval.
- LLMs should extract, classify, and draft; code should validate, decide, and execute.
- Debug logs help inspect model behavior, but can expose private data.
- Skills or workflow-specific modules may become useful later as the project grows.

## Critical Analysis

### What is good

- Local model by default; no paid API dependency.
- Explicit Gmail functions.
- Zod validation and normalization.
- Safe fallback to `unclear`.
- Human approvals before Gmail writes/sends.
- `DRY_RUN` protects testing.
- Second approval for sending.
- Clear separation between model output and side effects.

Calendar-specific good architecture is planned but not implemented yet. When it is added, conflict detection should be done in code rather than delegated to the LLM.

### What is fragile

- Date/time extraction is not implemented and will be naturally fragile.
- Timezone ambiguity is not handled yet.
- Small local model JSON reliability can still fail.
- Email quality and formatting depend on prompt compliance.
- OAuth scope changes may require deleting and recreating `token.json`.
- Debug logs can expose private Gmail and LLM content.
- Gmail body parsing is simple and may not handle all MIME/thread formats.
- Prompt dependence remains high.

### Improvements for later

- Tests for Zod schema normalization.
- Tests for Gmail body parsing fixtures.
- Tests for draft/send gating logic.
- Tests for future Calendar conflict detection.
- Better CLI commands per workflow.
- Skill-based or workflow-based architecture once the project grows.
- Persisted audit log of approvals and side effects.
- Better observability/tracing.
- Prompt versioning.
- Fake email/calendar fixtures for repeatable tests.

## Mental Model

The most important design rule:

```txt
LLM suggests.
Zod validates.
Code decides.
Human approves.
API performs the side effect.
```

That pattern is what makes this project useful as a learning lab for real-world AI integrations.
