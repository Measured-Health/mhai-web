import type { HospitalIn } from "../api/contract";

// The same rules as the sample API (and the backend), so a form that passes
// here is not refused there.
const NAME_MAX = 120;
const SHORT_CODE = /^[A-Z0-9]{2,8}$/;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type FormValues = {
  name: string;
  shortCode: string;
  country: string;
  timeZone: string;
  /** Pasted text: comma or new-line separated. */
  domains: string;
  adminName: string;
  adminEmail: string;
};
export type FieldName = keyof FormValues;
export type FormResult =
  | { ok: true; value: HospitalIn }
  | { ok: false; errors: Partial<Record<FieldName, string>> };

/** Split on commas and new lines; trimmed, lower-cased, de-duplicated. */
export function splitDomains(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,\n\r]+/)) {
    const d = part.trim().toLowerCase();
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

export function parseHospitalForm(v: FormValues): FormResult {
  const errors: Partial<Record<FieldName, string>> = {};
  const len = (s: string, max: number) => s.length >= 1 && s.length <= max;
  const name = v.name.trim();
  if (!len(name, NAME_MAX)) errors.name = "Use 1 to 120 characters.";
  const short_code = v.shortCode.trim().toUpperCase();
  if (!SHORT_CODE.test(short_code))
    errors.shortCode = "Use 2 to 8 letters or numbers.";
  const country = v.country.trim();
  if (!len(country, 60)) errors.country = "Enter a country.";
  const time_zone = v.timeZone.trim();
  if (!len(time_zone, 64)) errors.timeZone = "Pick a time zone.";
  const email_domains = splitDomains(v.domains);
  if (email_domains.some((d) => !DOMAIN.test(d)))
    errors.domains = "Use domains like hospital.org, separated by commas.";
  const adminName = v.adminName.trim();
  if (!len(adminName, NAME_MAX)) errors.adminName = "Use 1 to 120 characters.";
  const adminEmail = v.adminEmail.trim().toLowerCase();
  if (!EMAIL.test(adminEmail) || adminEmail.length > 254)
    errors.adminEmail = "Enter a valid email address.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      short_code,
      country,
      time_zone,
      email_domains,
      first_admin: { name: adminName, email: adminEmail },
    },
  };
}
