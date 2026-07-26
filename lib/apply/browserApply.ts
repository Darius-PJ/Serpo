import "server-only";
import { chromium, type Locator } from "playwright";
import { prisma } from "@/lib/db/prisma";
import { matchFieldKey } from "./fieldSynonyms";

export interface ApplyResult {
  status: "submitted" | "needs_input" | "failed";
  missingFieldKey?: string;
  missingFieldLabel?: string;
  formAnswersSnapshot?: Record<string, string>;
  error?: string;
}

function slugify(text: string) {
  return (
    "custom_" +
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60)
  );
}

async function getLabelText(control: Locator): Promise<string> {
  return control.evaluate((el) => {
    const input = el as HTMLElement;
    const ariaLabel = input.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel;

    const labelledBy = input.getAttribute("aria-labelledby");
    if (labelledBy) {
      const target = document.getElementById(labelledBy);
      if (target?.textContent) return target.textContent.trim();
    }

    const id = input.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent) return label.textContent.trim();
    }

    const wrappingLabel = input.closest("label");
    if (wrappingLabel?.textContent) return wrappingLabel.textContent.trim();

    return input.getAttribute("placeholder") ?? "";
  });
}

/**
 * Fills and submits a job application form. Deliberately does NOT touch
 * checkbox/radio controls (consent/EEO/legal-attestation checkboxes are too
 * consequential to guess at with no per-application review) — a required
 * one left unchecked may cause the site to reject submission, which surfaces
 * as a "failed" run for the user to finish by hand rather than a silent
 * blind auto-check of an unknown legal attestation.
 */
export async function runApplyAutomation(
  applicationId: string,
  resumeDocxPath: string,
  userId: string
): Promise<ApplyResult> {
  const application = await prisma.application.findUniqueOrThrow({
    where: { id_userId: { id: applicationId, userId } },
  });
  if (!application.url) {
    return { status: "failed", error: "This application has no URL to apply through." };
  }

  // Scoped to this account — otherwise this would autofill User B's real
  // application with User A's saved address/phone/salary/etc. answers.
  const profileFields = await prisma.profileField.findMany({ where: { userId } });
  const profileMap = new Map(profileFields.map((f) => [f.key, f.value]));
  const answers: Record<string, string> = {};

  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage();
    await page.goto(application.url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    const controls = await page
      .locator("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]), textarea, select")
      .all();

    for (const control of controls) {
      const type = (await control.getAttribute("type")) ?? "";
      if (type === "file") {
        await control.setInputFiles(resumeDocxPath);
        continue;
      }

      const labelText = await getLabelText(control);
      if (!labelText) continue;

      const synonymMatch = matchFieldKey(labelText);
      const key = synonymMatch?.key ?? slugify(labelText);
      const label = synonymMatch?.label ?? labelText;

      const value = profileMap.get(key);
      if (value === undefined) {
        await browser.close();
        return { status: "needs_input", missingFieldKey: key, missingFieldLabel: label };
      }

      const tagName = await control.evaluate((el) => el.tagName.toLowerCase());
      if (tagName === "select") {
        await control.selectOption({ label: value }).catch(() => control.selectOption(value));
      } else {
        await control.fill(value);
      }
      answers[key] = value;
    }

    const blockedCount = await page.getByText(/captcha|verify you.?re human|are you a robot/i).count();
    if (blockedCount > 0) {
      await browser.close();
      return {
        status: "failed",
        error: "CAPTCHA or bot-check detected — stopping without attempting to bypass it.",
        formAnswersSnapshot: answers,
      };
    }

    const submitButton = page.getByRole("button", { name: /submit|apply now|send application/i }).first();
    if ((await submitButton.count()) === 0) {
      await browser.close();
      return { status: "failed", error: "Could not find a submit button.", formAnswersSnapshot: answers };
    }

    // Real human-in-the-loop review gate: opens the Playwright Inspector and
    // genuinely halts here until the user clicks Resume (or closes the
    // browser to abort, which throws below and surfaces as a "failed" run).
    // Replaces a fixed 3s waitForTimeout that was a review window in name
    // only — this is after locating the submit button so the user sees
    // exactly what's about to be clicked, and can edit any filled field.
    await page.pause();

    // The Inspector doesn't lock the page from interaction — the user could
    // have clicked the site's real submit button themselves while paused.
    // Guard against clicking it a second time.
    if (await submitButton.isVisible().catch(() => false)) {
      await submitButton.click();
      await page.waitForTimeout(2000);
    }

    return { status: "submitted", formAnswersSnapshot: answers };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err), formAnswersSnapshot: answers };
  } finally {
    await browser.close().catch(() => {});
  }
}
