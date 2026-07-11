import { describe, expect, it } from 'vitest';
import { contractOf, escalationNote, insideContract, termsMatchSupplier } from '../src/contract.js';
import { reconcileMissing } from '../src/mandate.js';
import type { DealTerms, Mandate } from '../src/types.js';
import { gradeRank, isGrade } from '../src/types.js';

const mandate: Mandate = {
  id: 'mnd_test',
  buyerPhone: '+1',
  category: 'sportswear',
  style: '90s branded',
  quantity: 300,
  gradeFloor: 'B',
  priceCeiling: 5,
  rawText: '',
  status: 'open',
};
const c = contractOf(mandate);

describe('grade ordering', () => {
  it('ranks A > B > C > D', () => {
    expect(gradeRank('A')).toBe(3);
    expect(gradeRank('B')).toBe(2);
    expect(gradeRank('C')).toBe(1);
    expect(gradeRank('D')).toBe(0);
  });
  it('returns null for unknown grades (fail closed)', () => {
    expect(gradeRank('AA')).toBeNull();
    expect(gradeRank('a')).toBeNull();
    expect(isGrade('AA')).toBe(false);
  });
});

describe('insideContract', () => {
  const t = (o: Partial<DealTerms>): DealTerms => ({
    pricePerUnit: 4.5,
    grade: 'B',
    quantity: 320,
    ...o,
  });

  it('accepts terms within all three bounds', () => {
    expect(insideContract(t({}), c)).toBe(true);
  });
  it('accepts a better grade than the floor', () => {
    expect(insideContract(t({ grade: 'A' }), c)).toBe(true);
  });
  it('accepts price exactly at the ceiling', () => {
    expect(insideContract(t({ pricePerUnit: 5 }), c)).toBe(true);
  });
  it('accepts quantity exactly at the floor', () => {
    expect(insideContract(t({ quantity: 300 }), c)).toBe(true);
  });
  it('rejects price above the ceiling', () => {
    expect(insideContract(t({ pricePerUnit: 5.01 }), c)).toBe(false);
  });
  it('rejects grade below the floor', () => {
    expect(insideContract(t({ grade: 'C' }), c)).toBe(false);
  });
  it('rejects quantity below the floor', () => {
    expect(insideContract(t({ quantity: 299 }), c)).toBe(false);
  });
  it('rejects non-finite price', () => {
    expect(insideContract(t({ pricePerUnit: Number.POSITIVE_INFINITY }), c)).toBe(false);
  });
  it('rejects non-positive quantity', () => {
    expect(insideContract(t({ quantity: 0 }), c)).toBe(false);
  });
});

describe('termsMatchSupplier', () => {
  it('matches equal terms within price tolerance', () => {
    const a: DealTerms = { pricePerUnit: 4.5, grade: 'B', quantity: 300 };
    const b: DealTerms = { pricePerUnit: 4.51, grade: 'B', quantity: 300 };
    expect(termsMatchSupplier(a, b)).toBe(true);
  });
  it('rejects grade or qty mismatch', () => {
    const s: DealTerms = { pricePerUnit: 4.5, grade: 'B', quantity: 300 };
    expect(termsMatchSupplier({ ...s, grade: 'A' }, s)).toBe(false);
    expect(termsMatchSupplier({ ...s, quantity: 280 }, s)).toBe(false);
  });
});

describe('reconcileMissing', () => {
  it('flags zero quantity and ceiling even if model omitted them', () => {
    expect(
      reconcileMissing({ category: 'tees', quantity: 0, priceCeiling: 0, missing: [] }),
    ).toEqual(expect.arrayContaining(['quantity', 'priceCeiling']));
  });
  it('clears missing when values are present', () => {
    expect(
      reconcileMissing({
        category: 'tees',
        quantity: 100,
        priceCeiling: 5,
        missing: ['quantity', 'priceCeiling'],
      }),
    ).toEqual([]);
  });
});

describe('escalationNote', () => {
  it('names the price gap', () => {
    const note = escalationNote({ pricePerUnit: 6, grade: 'B', quantity: 320 }, c);
    expect(note).toContain('above the $5 ceiling');
  });
  it('names the grade gap', () => {
    const note = escalationNote({ pricePerUnit: 4, grade: 'C', quantity: 320 }, c);
    expect(note).toContain('below the B floor');
  });
  it('names the quantity gap', () => {
    const note = escalationNote({ pricePerUnit: 4, grade: 'B', quantity: 250 }, c);
    expect(note).toContain('250 units vs 300 needed');
  });
  it('names multiple gaps at once', () => {
    const note = escalationNote({ pricePerUnit: 6, grade: 'C', quantity: 250 }, c);
    expect(note).toContain('ceiling');
    expect(note).toContain('floor');
    expect(note).toContain('units');
  });
});
