/**
 * Returns the confirmation signal that makes an employer receipt observable.
 * A matched signal is evidence, not a replacement for user review.
 */
export function hasSubmissionConfirmation(text: string): string | null {
  const signals = [
    /thank you[^.]{0,80}(application|applying|submission)/i,
    /application[^.]{0,80}(received|submitted|has been submitted)/i,
    /we(?:'ve| have) received your application/i,
    /your application is on its way/i,
  ];
  return signals.find((signal) => signal.test(text))?.source ?? null;
}
