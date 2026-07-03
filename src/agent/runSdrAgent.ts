import type { AppConfig } from "../config.js";

import { createCalendarClient } from "../calendar/calendarClient.js";
import { createGmailDraft } from "../gmail/createDraft.js";
import { createGmailClient } from "../gmail/gmailClient.js";
import { readRecentEmails } from "../gmail/readEmails.js";
import { sendGmailDraft } from "../gmail/sendDraft.js";
import type { OutreachDraft } from "../llm/schemas.js";

import { createOllamaProvider } from "../llm/ollamaProvider.js";
import { runMeetingInvitationWorkflow } from "../meeting/runMeetingInvitationWorkflow.js";

import { logger } from "../utils/logger.js";
import { askForApproval } from "../utils/terminalApproval.js";
import { truncate } from "../utils/text.js";

import { classifyProspect } from "./classifyProspect.js";
import { generateOutreachDraft } from "./generateOutreachDraft.js";
import type { AgentReport } from "./types.js";

function printDraft(
  to: string,
  subject: string,
  body: string,
  reason: string,
): void {
  logger.info("\nGenerated draft");
  logger.info(`To: ${to}`);
  logger.info(`Subject: ${subject}`);
  logger.info(`Reason: ${reason}`);
  logger.info("Body:");
  logger.info(body);
}

export async function runSdrAgent(config: AppConfig): Promise<AgentReport> {
  logger.info(`Reading Gmail with query: ${config.gmailQuery}`);
  logger.info(`Max emails: ${config.maxEmails}`);

  const gmail = await createGmailClient(config);
  const calendar = config.enableMeetingWorkflow
    ? await createCalendarClient(config)
    : null;
  const provider = createOllamaProvider(config);
  const emails = await readRecentEmails(
    gmail,
    config.gmailQuery,
    config.maxEmails,
  );

  logger.info(`Found ${emails.length} email(s).`);

  const report: AgentReport = {
    readCount: emails.length,
    classifiedCount: 0,
    draftsGenerated: 0,
    draftsCreated: 0,
    emailsSent: 0,
    meetingInvitationsDetected: 0,
    calendarConflictsFound: 0,
    calendarEventsCreated: 0,
  };

  async function createAndMaybeSendDraft(draft: OutreachDraft): Promise<void> {
    if (!config.createDrafts || config.dryRun) {
      logger.info(
        "Draft creation skipped. Enable CREATE_DRAFTS=true or pass --create-drafts.",
      );
      return;
    }

    const approved = config.requireDraftApproval
      ? await askForApproval(`Create Gmail draft for ${draft.to}?`)
      : true;

    if (!approved) {
      logger.info("Draft rejected.");
      return;
    }

    const draftId = await createGmailDraft(gmail, draft);
    report.draftsCreated += 1;
    logger.info(`Gmail draft created: ${draftId}`);

    if (!config.sendApprovedDrafts) {
      logger.info("Send skipped. SEND_APPROVED_DRAFTS is false.");
      return;
    }

    const sendApproved = config.requireSendApproval
      ? await askForApproval("Send this Gmail draft now?")
      : true;

    if (!sendApproved) {
      logger.info("Send rejected. Gmail draft remains available.");
      return;
    }

    const sentMessageId = await sendGmailDraft(gmail, draftId);
    report.emailsSent += 1;
    logger.info(`Gmail draft sent: ${sentMessageId ?? "unknown message id"}`);
  }

  for (const email of emails) {
    logger.info(`\nEmail ${report.classifiedCount + 1}/${emails.length}`);
    logger.info(`From: ${truncate(email.from, 120)}`);
    logger.info(`Subject: ${truncate(email.subject, 120)}`);
    logger.info(`Snippet: ${truncate(email.snippet, 180)}`);

    if (calendar) {
      const meetingResult = await runMeetingInvitationWorkflow(
        calendar,
        provider,
        email,
        config
      );

      if (meetingResult.handled) {
        report.meetingInvitationsDetected += 1;
        if (meetingResult.conflictResult?.hasConflict) {
          report.calendarConflictsFound += 1;
        }
        if (meetingResult.calendarEventCreated) {
          report.calendarEventsCreated += 1;
        }

        if (meetingResult.draft) {
          report.draftsGenerated += 1;
          printDraft(
            meetingResult.draft.to,
            meetingResult.draft.subject,
            meetingResult.draft.body,
            meetingResult.draft.reason
          );
          await createAndMaybeSendDraft(meetingResult.draft);
        }

        continue;
      }
    }

    const classification = await classifyProspect(provider, email, config);
    report.classifiedCount += 1;

    logger.info(
      `Classification: ${classification.classification} (${classification.confidenceScore})`,
    );
    logger.info(`Reason: ${truncate(classification.qualificationReason, 220)}`);

    const draft = await generateOutreachDraft(provider, email, classification, config);
    if (!draft) {
      continue;
    }

    report.draftsGenerated += 1;
    printDraft(draft.to, draft.subject, draft.body, draft.reason);
    await createAndMaybeSendDraft(draft);
  }

  logger.info("\nFinal report");
  logger.info(`Emails read: ${report.readCount}`);
  logger.info(`Emails classified: ${report.classifiedCount}`);
  logger.info(`Drafts generated: ${report.draftsGenerated}`);
  logger.info(`Gmail drafts created: ${report.draftsCreated}`);
  logger.info(`Emails sent: ${report.emailsSent}`);
  logger.info(`Meeting invitations detected: ${report.meetingInvitationsDetected}`);
  logger.info(`Calendar conflicts found: ${report.calendarConflictsFound}`);
  logger.info(`Calendar events created: ${report.calendarEventsCreated}`);

  return report;
}
