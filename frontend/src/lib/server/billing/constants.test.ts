import { describe, it, expect } from 'vitest';
import { isSchoolPlan, planConfig, planPeriodMs, PLANS } from './constants';

describe('billing plan config', () => {
  it('exposes the three known plans with their expected price/limit/period', () => {
    expect(PLANS.ESSENTIEL).toEqual({ priceGNF: 2_000_000, studentLimit: 700, periodDays: 365 });
    expect(PLANS.CROISSANCE).toEqual({ priceGNF: 3_000_000, studentLimit: null, periodDays: 365 });
    expect(PLANS.FLEXIBLE).toEqual({ priceGNF: 1_000_000, studentLimit: null, periodDays: 91 });
  });

  it('isSchoolPlan recognizes all three plans and rejects unknown values', () => {
    expect(isSchoolPlan('ESSENTIEL')).toBe(true);
    expect(isSchoolPlan('CROISSANCE')).toBe(true);
    expect(isSchoolPlan('FLEXIBLE')).toBe(true);
    expect(isSchoolPlan('BOGUS')).toBe(false);
    expect(isSchoolPlan(undefined)).toBe(false);
  });

  it('planConfig falls back to CROISSANCE for an unrecognized stored value', () => {
    expect(planConfig('BOGUS')).toEqual(PLANS.CROISSANCE);
  });

  it('planPeriodMs returns a 91-day period for FLEXIBLE and 365-day for the others', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(planPeriodMs('FLEXIBLE')).toBe(91 * day);
    expect(planPeriodMs('ESSENTIEL')).toBe(365 * day);
    expect(planPeriodMs('CROISSANCE')).toBe(365 * day);
    // Unrecognized value falls back to CROISSANCE's period, same as planConfig.
    expect(planPeriodMs('BOGUS')).toBe(365 * day);
  });
});
