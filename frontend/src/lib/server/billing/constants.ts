// Shared between the public pricing page, POST /api/schools/signup (stores
// School.plan), POST /api/billing/subscribe (charges PLANS[plan].priceGNF),
// the subscription-reminder emails, and student-count enforcement
// (plan-limits.ts) — kept in one place so price/limit changes never drift
// between what's advertised and what's actually charged/enforced.
export const PLAN_ESSENTIEL = 'ESSENTIEL';
export const PLAN_CROISSANCE = 'CROISSANCE';

export type SchoolPlan = typeof PLAN_ESSENTIEL | typeof PLAN_CROISSANCE;

export interface PlanConfig {
  priceGNF: number;
  /** Max enrolled students; null = unlimited. */
  studentLimit: number | null;
}

export const PLANS: Record<SchoolPlan, PlanConfig> = {
  [PLAN_ESSENTIEL]: { priceGNF: 2_000_000, studentLimit: 700 },
  [PLAN_CROISSANCE]: { priceGNF: 3_000_000, studentLimit: null },
};

export function isSchoolPlan(value: unknown): value is SchoolPlan {
  return value === PLAN_ESSENTIEL || value === PLAN_CROISSANCE;
}

/** Falls back to CROISSANCE (unlimited) for any unrecognized stored value — never silently under-charge by guessing ESSENTIEL. */
export function planConfig(plan: string): PlanConfig {
  return isSchoolPlan(plan) ? PLANS[plan] : PLANS[PLAN_CROISSANCE];
}

export const SUBSCRIPTION_PERIOD_MS = 365 * 24 * 60 * 60 * 1000;
