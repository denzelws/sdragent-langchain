import type { AppConfig } from "../config.js";

import { createCalendarClient } from "../calendar/calendarClient.js";
import { createGmailDraft } from "../gmail/createDraft.js";
import { createGmailClient } from "../gmail/gmailClient.js";
import { readRecentEmails } from "../gmail/readEmails.js";
import { sendGmailDraft } from "../gmail/sendDraft.js";
import type { OutreachDraft } from "../llm/schemas.js";

import { createOllamaProvider } from "../llm/ollamaProvider.js";
import { runMeetingInvitationWorkflow } from "../meeting/runMeetingInvitationWorkflow.js";
import { runProductFaqWorkflow } from "../productFaq/runProductFaqWorkflow.js";
import {
  isEmailProcessed,
  loadProcessedEmailStore,
  markEmailProcessed,
  saveProcessedEmailStore
} from "../state/processedEmailStore.js";
import type { ProcessedEmailRecord, ProcessedEmailWorkflow } from "../state/types.js";

import { logger } from "../utils/logger.js";
import { askForApproval } from "../utils/terminalApproval.js";
import { truncate } from "../utils/text.js";

import { classifyProspect } from "./classifyProspect.js";
import { generateOutreachDraft } from "./generateOutreachDraft.js";
import type { AgentReport } from "./types.js";

type DraftActionResult = {
  status: ProcessedEmailRecord["status"];
  reason: string;
};

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
  logger.info(`Workflow mode: ${config.workflowMode}`);

  const gmail = await createGmailClient(config);
  const shouldRunMeeting =
    config.workflowMode === "meeting" ||
    (config.workflowMode === "all" && config.enableMeetingWorkflow);
  const shouldRunProductFaq =
    config.workflowMode === "all" || config.workflowMode === "product-faq";
  const shouldRunSdr = config.workflowMode === "all" || config.workflowMode === "sdr";
  const calendar = shouldRunMeeting
    ? await createCalendarClient(config)
    : null;
  const provider = createOllamaProvider(config);
  const emails = await readRecentEmails(
    gmail,
    config.gmailQuery,
    config.maxEmails,
  );

  logger.info(`Found ${emails.length} email(s).`);

  const processedEmailStore = config.skipProcessedEmails
    ? await loadProcessedEmailStore(config.processedEmailStorePath)
    : null;
  const processableEmails = processedEmailStore
    ? emails.filter((email) => !isEmailProcessed(processedEmailStore, email.id))
    : emails;
  const alreadyProcessedSkipped = emails.length - processableEmails.length;

  if (config.skipProcessedEmails) {
    logger.info(`Skipping ${alreadyProcessedSkipped} already processed email(s).`);
    logger.info(`Processing ${processableEmails.length} new email(s).`);
  }

  const report: AgentReport = {
    readCount: emails.length,
    alreadyProcessedSkipped,
    classifiedCount: 0,
    draftsGenerated: 0,
    draftsCreated: 0,
    emailsSent: 0,
    meetingInvitationsDetected: 0,
    calendarConflictsFound: 0,
    calendarEventsCreated: 0,
    productQuestionsDetected: 0,
    productFaqDraftsGenerated: 0,
  };

  async function markAndSave(
    email: Parameters<typeof markEmailProcessed>[1],
    workflow: ProcessedEmailWorkflow,
    status: ProcessedEmailRecord["status"],
    reason?: string | null
  ): Promise<void> {
    if (!processedEmailStore) {
      return;
    }

    markEmailProcessed(processedEmailStore, email, workflow, status, reason);
    await saveProcessedEmailStore(config.processedEmailStorePath, processedEmailStore);
  }

  async function createAndMaybeSendDraft(draft: OutreachDraft): Promise<DraftActionResult> {
    if (!config.createDrafts || config.dryRun) {
      logger.info(
        "Draft creation skipped. Set DRY_RUN=false and CREATE_DRAFTS=true to create Gmail drafts.",
      );
      return {
        status: "draft_generated",
        reason: "Draft generated; Gmail draft creation disabled by DRY_RUN or CREATE_DRAFTS."
      };
    }

    const approved = config.requireDraftApproval
      ? await askForApproval(`Create Gmail draft for ${draft.to}?`)
      : true;

    if (!approved) {
      logger.info("Draft rejected.");
      return {
        status: "ignored",
        reason: "Gmail draft creation rejected by user."
      };
    }

    const draftId = await createGmailDraft(gmail, draft);
    report.draftsCreated += 1;
    logger.info(`Gmail draft created: ${draftId}`);

    if (!config.sendApprovedDrafts) {
      logger.info("Send skipped. SEND_APPROVED_DRAFTS is false.");
      return {
        status: "draft_created",
        reason: "Gmail draft created; sending disabled."
      };
    }

    const sendApproved = config.requireSendApproval
      ? await askForApproval("Send this Gmail draft now?")
      : true;

    if (!sendApproved) {
      logger.info("Send rejected. Gmail draft remains available.");
      return {
        status: "draft_created",
        reason: "Gmail draft created; send rejected by user."
      };
    }

    const sentMessageId = await sendGmailDraft(gmail, draftId);
    report.emailsSent += 1;
    logger.info(`Gmail draft sent: ${sentMessageId ?? "unknown message id"}`);
    return {
      status: "sent",
      reason: "Gmail draft sent after approval."
    };
  }

  for (const [index, email] of processableEmails.entries()) {
    logger.info(`\nEmail ${index + 1}/${processableEmails.length}`);
    logger.info(`From: ${truncate(email.from, 120)}`);
    logger.info(`Subject: ${truncate(email.subject, 120)}`);
    logger.info(`Snippet: ${truncate(email.snippet, 180)}`);

    try {
      if (calendar) {
        const meetingResult = await runMeetingInvitationWorkflow(
          calendar,
          provider,
          email,
          config,
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
              meetingResult.draft.reason,
            );
            const draftResult = await createAndMaybeSendDraft(meetingResult.draft);
            await markAndSave(email, "meeting", draftResult.status, draftResult.reason);
          } else {
            await markAndSave(
              email,
              "meeting",
              "handled",
              "Meeting workflow handled this email without a Gmail draft."
            );
          }

          continue;
        }

        if (config.workflowMode === "meeting") {
          await markAndSave(
            email,
            "meeting",
            "ignored",
            "Email did not match Meeting workflow."
          );
          continue;
        }
      }

      if (shouldRunProductFaq) {
        const productFaqResult = await runProductFaqWorkflow(
          provider,
          email,
          config,
        );
        if (productFaqResult.handled) {
          report.productQuestionsDetected += 1;

          if (productFaqResult.draft) {
            report.draftsGenerated += 1;
            report.productFaqDraftsGenerated += 1;
            printDraft(
              productFaqResult.draft.to,
              productFaqResult.draft.subject,
              productFaqResult.draft.body,
              productFaqResult.draft.reason,
            );
            const draftResult = await createAndMaybeSendDraft(productFaqResult.draft);
            await markAndSave(
              email,
              "product_faq",
              draftResult.status,
              draftResult.reason
            );
          } else {
            await markAndSave(
              email,
              "product_faq",
              "handled",
              "Product FAQ workflow handled this email without a Gmail draft."
            );
          }

          continue;
        }

        if (config.workflowMode === "product-faq") {
          await markAndSave(
            email,
            "product_faq",
            "ignored",
            "Email did not match Product FAQ workflow."
          );
          continue;
        }
      }

      if (shouldRunSdr) {
        const classification = await classifyProspect(provider, email, config);
        report.classifiedCount += 1;

        logger.info(
          `Classification: ${classification.classification} (${classification.confidenceScore})`,
        );
        logger.info(`Reason: ${truncate(classification.qualificationReason, 220)}`);

        const draft = await generateOutreachDraft(
          provider,
          email,
          classification,
          config,
        );
        if (!draft) {
          await markAndSave(
            email,
            "sdr",
            "ignored",
            `SDR workflow did not generate a draft: ${classification.classification}.`
          );
          continue;
        }

        report.draftsGenerated += 1;
        printDraft(draft.to, draft.subject, draft.body, draft.reason);
        const draftResult = await createAndMaybeSendDraft(draft);
        await markAndSave(email, "sdr", draftResult.status, draftResult.reason);
        continue;
      }

      await markAndSave(
        email,
        "unhandled",
        "ignored",
        "No enabled workflow handled this email."
      );
    } catch (error) {
      const message = (error as Error).message;
      logger.error(`Email processing error for message ${email.id}: ${message}`);
      await markAndSave(email, "unhandled", "error", message);
    }
  }

  logger.info("\nFinal report");
  logger.info(`Emails read: ${report.readCount}`);
  logger.info(`Already processed skipped: ${report.alreadyProcessedSkipped}`);
  logger.info(`Emails classified: ${report.classifiedCount}`);
  logger.info(`Drafts generated: ${report.draftsGenerated}`);
  logger.info(`Gmail drafts created: ${report.draftsCreated}`);
  logger.info(`Emails sent: ${report.emailsSent}`);
  logger.info(
    `Meeting invitations detected: ${report.meetingInvitationsDetected}`,
  );
  logger.info(`Calendar conflicts found: ${report.calendarConflictsFound}`);
  logger.info(`Calendar events created: ${report.calendarEventsCreated}`);
  logger.info(`Product questions detected: ${report.productQuestionsDetected}`);
  logger.info(
    `Product FAQ drafts generated: ${report.productFaqDraftsGenerated}`,
  );

  return report;
}
