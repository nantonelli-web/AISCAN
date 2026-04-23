/**
 * Client + server-side password strength checks.
 * Signup goes through `supabase.auth.signUp()` directly from the browser,
 * so server-side enforcement also depends on Supabase dashboard settings
 * (Auth → Policies → Password requirements). Keep the two in sync.
 */

export const PASSWORD_MIN_LENGTH = 10;

export type PasswordIssue =
  | "too_short"
  | "missing_lowercase"
  | "missing_uppercase"
  | "missing_digit"
  | "common_password";

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "qwerty123",
  "letmein12", "welcome123", "admin1234", "changeme1", "iloveyou1",
]);

export function validatePassword(raw: string): {
  ok: boolean;
  issues: PasswordIssue[];
} {
  const issues: PasswordIssue[] = [];
  if (raw.length < PASSWORD_MIN_LENGTH) issues.push("too_short");
  if (!/[a-z]/.test(raw)) issues.push("missing_lowercase");
  if (!/[A-Z]/.test(raw)) issues.push("missing_uppercase");
  if (!/[0-9]/.test(raw)) issues.push("missing_digit");
  if (COMMON_PASSWORDS.has(raw.toLowerCase())) issues.push("common_password");
  return { ok: issues.length === 0, issues };
}

export function describeIssue(issue: PasswordIssue): string {
  switch (issue) {
    case "too_short":
      return `At least ${PASSWORD_MIN_LENGTH} characters`;
    case "missing_lowercase":
      return "Add a lowercase letter";
    case "missing_uppercase":
      return "Add an uppercase letter";
    case "missing_digit":
      return "Add a digit";
    case "common_password":
      return "Choose a less common password";
  }
}
