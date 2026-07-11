import { config } from '../config.js';

/**
 * Build a wa.me deep link to the Abhi sandbox thread, optionally pre-filling
 * the buyer's first message.
 */
export function whatsAppHref(prefill?: string): string {
  const base = `https://wa.me/${config.whatsappNumber}`;
  return prefill ? `${base}?text=${encodeURIComponent(prefill)}` : base;
}

/** The one CTA label, used verbatim everywhere on the web surface. */
export const CTA_LABEL = 'Message Abhi on WhatsApp';
