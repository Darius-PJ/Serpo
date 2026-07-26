interface FieldSynonym {
  key: string;
  label: string;
  patterns: RegExp[];
}

// Order matters — more specific patterns first so e.g. "last name" doesn't
// get caught by a looser "name" pattern meant for a single full-name field.
export const FIELD_SYNONYMS: FieldSynonym[] = [
  { key: "firstName", label: "First name", patterns: [/first\s*name/i, /given\s*name/i] },
  { key: "lastName", label: "Last name", patterns: [/last\s*name/i, /surname/i, /family\s*name/i] },
  { key: "fullName", label: "Full name", patterns: [/^\s*name\s*$/i, /full\s*name/i, /your\s*name/i] },
  { key: "email", label: "Email", patterns: [/e-?mail/i] },
  { key: "phone", label: "Phone", patterns: [/phone/i, /mobile/i, /telephone/i] },
  { key: "addressLine1", label: "Street address", patterns: [/street\s*address/i, /address\s*line\s*1/i, /^\s*address\s*$/i] },
  { key: "city", label: "City", patterns: [/\bcity\b/i] },
  { key: "state", label: "State/Province", patterns: [/\bstate\b/i, /province/i] },
  { key: "zip", label: "ZIP/Postal code", patterns: [/zip/i, /postal\s*code/i] },
  { key: "linkedin", label: "LinkedIn URL", patterns: [/linkedin/i] },
  { key: "portfolio", label: "Portfolio/website URL", patterns: [/portfolio/i, /website/i, /personal\s*site/i] },
  {
    key: "workAuthorization",
    label: "Legally authorized to work",
    patterns: [/legally\s*authorized/i, /work\s*authorization/i, /eligible\s*to\s*work/i],
  },
  {
    key: "sponsorshipNeeded",
    label: "Requires visa sponsorship",
    patterns: [/sponsorship/i, /require.*visa/i],
  },
  { key: "veteranStatus", label: "Veteran status", patterns: [/veteran/i] },
  { key: "disabilityStatus", label: "Disability status", patterns: [/disability/i] },
  { key: "gender", label: "Gender", patterns: [/\bgender\b/i, /\bsex\b/i] },
  { key: "raceEthnicity", label: "Race/ethnicity", patterns: [/race/i, /ethnicity/i] },
  { key: "desiredSalary", label: "Desired salary", patterns: [/desired\s*salary/i, /salary\s*expectation/i, /compensation\s*expectation/i] },
  { key: "availableStartDate", label: "Available start date", patterns: [/start\s*date/i, /availability/i] },
  { key: "yearsOfExperience", label: "Years of experience", patterns: [/years?\s*of\s*experience/i] },
  { key: "howHeard", label: "How did you hear about us", patterns: [/how\s*did\s*you\s*hear/i, /referral\s*source/i] },
  { key: "coverLetter", label: "Cover letter", patterns: [/cover\s*letter/i] },
];

export function matchFieldKey(labelText: string): { key: string; label: string } | null {
  const normalized = labelText.trim();
  if (!normalized) return null;
  for (const entry of FIELD_SYNONYMS) {
    if (entry.patterns.some((re) => re.test(normalized))) {
      return { key: entry.key, label: entry.label };
    }
  }
  return null;
}
