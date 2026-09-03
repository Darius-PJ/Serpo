import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { configuredOsintConnectors, researchAllTools } from "@/lib/osint";
import { findOrCreateContact, linkContactToApplication, listContactsForApplication } from "@/lib/contacts/contacts";
import { generateMessage } from "@/lib/ai/generateMessage";
import { AiAssistanceDisabledError } from "@/lib/ai/claudeClient";

// Auto-discovery attaches at most this many people per source — outreach wants
// the few most likely decision-makers, not the manual flow's 50-contact sweep.
const MAX_AUTO_CONTACTS_PER_SOURCE = 10;

/**
 * Schedule outreach preparation to run after the response is sent. Called by
 * every route that can move an application into Submitted; keeping the
 * `after()` call here (request scope) lets prepareOutreach stay a plain
 * testable function.
 */
export function queueOutreachPreparation(userId: string, applicationId: string): void {
  after(() => prepareOutreach(userId, applicationId));
}

/**
 * The apply-then-reach-out automation: discover likely contacts for the
 * company (Hunter, by user-entered company name — never a guessed domain),
 * link them to the application, and generate an IMMEDIATE outreach draft
 * addressed to the best one. The draft lands in the review queue; nothing is
 * ever sent automatically. Idempotent, and never throws — failures become an
 * outreach_failed audit event on the application's timeline.
 */
export async function prepareOutreach(userId: string, applicationId: string): Promise<void> {
  try {
    const application = await prisma.application.findUnique({ where: { id_userId: { id: applicationId, userId } } });
    if (!application) return;

    // An immediate draft already exists (auto or hand-made): nothing to do.
    const existingDraft = await prisma.message.findFirst({ where: { applicationId, type: "IMMEDIATE" } });
    if (existingDraft) return;

    const discoveryConfigured = configuredOsintConnectors().length > 0;
    const aiEnabled = process.env.ENABLE_AI_ASSISTANCE === "true";
    if (!discoveryConfigured && !aiEnabled) return;

    let contactsLinked = 0;
    const discoveryErrors: string[] = [];
    if (discoveryConfigured) {
      // Contacts already attached (curated or from an earlier search) are
      // trusted as-is — no API spend on re-discovery.
      const alreadyLinked = await listContactsForApplication(userId, applicationId);
      if (alreadyLinked.length === 0) {
        const runs = await researchAllTools({ company: application.company });
        for (const run of runs) {
          if (run.error) discoveryErrors.push(`${run.label}: ${run.error}`);
          for (const result of run.results.slice(0, MAX_AUTO_CONTACTS_PER_SOURCE)) {
            if (!result.email && !result.name) continue;
            const contact = await findOrCreateContact(userId, application.company, result);
            await linkContactToApplication(contact.id, applicationId, {
              sourceTool: result.sourceTool,
              confidence: result.confidence ?? null,
            });
            contactsLinked++;
          }
        }
      }
    }

    let draftId: string | null = null;
    if (aiEnabled) {
      try {
        draftId = (await generateMessage(applicationId, "IMMEDIATE")).id;
      } catch (err) {
        // The flag flipping between the check and the call is the only path
        // here; anything else is a real failure for the catch below.
        if (!(err instanceof AiAssistanceDisabledError)) throw err;
      }
    }

    await prisma.auditEvent.create({
      data: {
        userId,
        action: "application.outreach_prepared",
        entityType: "Application",
        entityId: applicationId,
        details: JSON.stringify({
          contactsLinked,
          draftId,
          ...(discoveryErrors.length > 0 ? { discoveryErrors } : {}),
        }),
      },
    });
  } catch (err) {
    // Background preparation must never break a status change; the failure
    // surfaces on the application's timeline instead.
    try {
      await prisma.auditEvent.create({
        data: {
          userId,
          action: "application.outreach_failed",
          entityType: "Application",
          entityId: applicationId,
          details: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
        },
      });
    } catch (auditErr) {
      console.error("outreach preparation failed and the failure could not be recorded", err, auditErr);
    }
  }
}
