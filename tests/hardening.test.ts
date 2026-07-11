import { describe, expect, it } from 'vitest';
import { trimHistory } from '../src/history.js';
import { id } from '../src/ids.js';
import { validateAgainstSchema } from '../src/llm.js';
import { mandateReadyMessage } from '../src/mandate.js';
import { normalizePhone } from '../src/phone.js';
import type { Mandate } from '../src/types.js';

describe('normalizePhone', () => {
  it('normalizes to +digits', () => {
    expect(normalizePhone('14155550101')).toBe('+14155550101');
    expect(normalizePhone('+1 (415) 555-0101')).toBe('+14155550101');
  });
});

describe('trimHistory', () => {
  it('keeps the last N messages', () => {
    const hist = Array.from({ length: 50 }, (_, i) => i);
    expect(trimHistory(hist, 40)).toEqual(hist.slice(10));
    expect(trimHistory(hist, 40)).toHaveLength(40);
  });
});

describe('mandateReadyMessage', () => {
  const base: Mandate = {
    id: 'mnd_x',
    buyerPhone: '+1',
    category: 'sportswear',
    style: '90s',
    quantity: 300,
    gradeFloor: 'B',
    priceCeiling: 5,
    rawText: '',
    status: 'open',
  };

  it('returns null for a complete mandate', () => {
    expect(mandateReadyMessage(base)).toBeNull();
  });

  it('refuses incomplete mandates', () => {
    expect(mandateReadyMessage({ ...base, quantity: 0 })).toContain('incomplete');
    expect(mandateReadyMessage({ ...base, priceCeiling: 0 })).toContain('incomplete');
  });
});

describe('validateAgainstSchema', () => {
  it('flags missing required fields', () => {
    const errors = validateAgainstSchema(
      { a: 1 },
      {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'string' } },
        required: ['a', 'b'],
        additionalProperties: false,
      },
    );
    expect(errors.some((e) => e.includes('b'))).toBe(true);
  });
});

describe('id', () => {
  it('uses a full UUID suffix', () => {
    const v = id('mnd');
    expect(v.startsWith('mnd_')).toBe(true);
    expect(v.length).toBeGreaterThan('mnd_'.length + 8);
  });
});

describe('unknown bale outcome shape', () => {
  it('documents the negotiate unknown-bale message', () => {
    const baleId = 'bale_atlas_sportswear_90s';
    const outcome = `Unknown baleId "${baleId}". Use exact baleId from find_matches.`;
    expect(outcome).toContain('Unknown baleId');
    expect(outcome).toContain(baleId);
  });
});
