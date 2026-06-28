// Password policy + strength scoring, shared by the sign-up and change-password
// forms. The server enforces the same minimums; this gives instant feedback.

export type StrengthLevel = "weak" | "moderate" | "strong";

export interface PasswordChecks {
  minLength: boolean; // ≥ 8 characters
  hasUpper: boolean; // an uppercase letter
  hasSymbol: boolean; // a non-alphanumeric symbol
}

export function checkPassword(pw: string): PasswordChecks {
  return {
    minLength: pw.length >= 8,
    hasUpper: /[A-Z]/.test(pw),
    hasSymbol: /[^A-Za-z0-9]/.test(pw),
  };
}

/** Required policy: ≥ 8 chars, an uppercase letter, and a symbol. */
export function passwordValid(pw: string): boolean {
  const c = checkPassword(pw);
  return c.minLength && c.hasUpper && c.hasSymbol;
}

/** A 0–6 score mapped to weak / moderate / strong (never "strong" unless valid). */
export function passwordStrength(pw: string): StrengthLevel {
  if (!pw) return "weak";
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  let level: StrengthLevel = score <= 2 ? "weak" : score <= 4 ? "moderate" : "strong";
  // Don't reassure with "strong" until the required rules are actually met.
  if (level === "strong" && !passwordValid(pw)) level = "moderate";
  return level;
}
