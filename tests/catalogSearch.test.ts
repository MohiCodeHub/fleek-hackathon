import { describe, expect, it } from 'vitest';
import { mandateTokens } from '../src/catalogSearch.js';
import type { Mandate } from '../src/types.js';

function mandate(partial: Partial<Mandate> & Pick<Mandate, 'category' | 'style'>): Mandate {
  return {
    id: 'm1',
    buyerPhone: '+10000000000',
    quantity: 100,
    gradeFloor: 'B',
    priceCeiling: 10,
    rawText: 'test',
    status: 'open',
    ...partial,
  };
}

describe('mandateTokens', () => {
  it('extracts useful keywords and drops stopwords', () => {
    const tokens = mandateTokens(
      mandate({ category: 'tees', style: 'vintage Nike and adidas graphic tees' }),
    );
    expect(tokens).toContain('tees');
    expect(tokens).toContain('nike');
    expect(tokens).toContain('adidas');
    expect(tokens).toContain('graphic');
    expect(tokens).not.toContain('and');
    expect(tokens).not.toContain('vintage');
  });
});
