import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhoneE164(
  raw: string,
  defaultCountry: string | undefined = 'ZA',
): { e164: string; isValid: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { e164: '', isValid: false };
  }
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry as any);
  if (!parsed || !parsed.isValid()) {
    return { e164: trimmed, isValid: false };
  }
  return { e164: parsed.number, isValid: true };
}
