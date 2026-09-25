import { describe, expect, it } from 'vitest';
import { computeMoyenneMatiere, computeMoyenneGenerale, buildMoyenneMatiereMap } from './moyenne';

describe('computeMoyenneMatiere', () => {
  it('returns the composition value unchanged when it is the only assessment (pre-migration data)', () => {
    // Every Grade row that existed before this feature became
    // type="COMPOSITION" — this must reproduce its old raw value exactly,
    // regardless of the school's coefficients.
    expect(computeMoyenneMatiere([{ type: 'COMPOSITION', valeur: 14.5 }], 1, 2)).toBe(14.5);
    expect(computeMoyenneMatiere([{ type: 'COMPOSITION', valeur: 14.5 }], 3, 7)).toBe(14.5);
  });

  it('returns the arithmetic mean of devoirs when there is no composition yet', () => {
    expect(
      computeMoyenneMatiere(
        [
          { type: 'DEVOIR', valeur: 10 },
          { type: 'DEVOIR', valeur: 14 },
        ],
        1,
        2,
      ),
    ).toBe(12);
  });

  it('blends devoirs and composition using the school coefficients', () => {
    // moyenneDevoirs = (10+14)/2 = 12, composition = 16, coef 1/2
    // -> (12*1 + 16*2) / 3 = 44/3
    expect(
      computeMoyenneMatiere(
        [
          { type: 'DEVOIR', valeur: 10 },
          { type: 'DEVOIR', valeur: 14 },
          { type: 'COMPOSITION', valeur: 16 },
        ],
        1,
        2,
      ),
    ).toBeCloseTo(44 / 3, 10);
  });

  it('honors non-default coefficients', () => {
    // moyenneDevoirs = 12, composition = 16, coef 1/1 -> plain average
    expect(
      computeMoyenneMatiere(
        [
          { type: 'DEVOIR', valeur: 10 },
          { type: 'DEVOIR', valeur: 14 },
          { type: 'COMPOSITION', valeur: 16 },
        ],
        1,
        1,
      ),
    ).toBe(14);
  });

  it('returns null when there are no assessments at all', () => {
    expect(computeMoyenneMatiere([], 1, 2)).toBeNull();
  });
});

describe('computeMoyenneGenerale', () => {
  it('computes the coefficient-weighted average across subjects', () => {
    expect(
      computeMoyenneGenerale([
        { moyenne: 10, coefficient: 2 },
        { moyenne: 16, coefficient: 1 },
      ]),
    ).toBeCloseTo((10 * 2 + 16 * 1) / 3, 10);
  });

  it('skips subjects with no moyenne (null) without treating them as zero', () => {
    expect(
      computeMoyenneGenerale([
        { moyenne: 10, coefficient: 2 },
        { moyenne: null, coefficient: 5 },
      ]),
    ).toBe(10);
  });

  it('returns null when nothing has a moyenne', () => {
    expect(computeMoyenneGenerale([{ moyenne: null, coefficient: 3 }])).toBeNull();
  });
});

describe('buildMoyenneMatiereMap', () => {
  it('groups by studentId:subjectId and reduces each group independently', () => {
    const map = buildMoyenneMatiereMap(
      [
        { studentId: 's1', subjectId: 'math', type: 'COMPOSITION', valeur: 14 },
        { studentId: 's1', subjectId: 'fr', type: 'DEVOIR', valeur: 8 },
        { studentId: 's1', subjectId: 'fr', type: 'COMPOSITION', valeur: 12 },
        { studentId: 's2', subjectId: 'math', type: 'COMPOSITION', valeur: 18 },
      ],
      1,
      2,
    );
    expect(map.get('s1:math')).toBe(14);
    expect(map.get('s1:fr')).toBeCloseTo((8 * 1 + 12 * 2) / 3, 10);
    expect(map.get('s2:math')).toBe(18);
    expect(map.size).toBe(3);
  });
});
