/** Normalize phone numbers to a stable E.164-ish form (+digits). */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;
  // Preserve leading + when original had one or looks like international.
  if (trimmed.startsWith('+') || digits.length > 10) return `+${digits}`;
  return `+${digits}`;
}
