import { describe, expect, it } from "vitest";
import { hasSubmissionConfirmation } from "@/lib/apply/submissionSignals";

describe("submission confirmation signals", () => {
  it.each([
    "Thank you for your application.",
    "Your application has been submitted.",
    "We've received your application and will be in touch.",
    "Your application is on its way.",
  ])("recognizes an employer confirmation: %s", (text) => {
    expect(hasSubmissionConfirmation(text)).toBeTruthy();
  });

  it("does not treat a filled form or submit button as confirmation", () => {
    expect(hasSubmissionConfirmation("Review your application before pressing Submit.")).toBeNull();
  });
});
