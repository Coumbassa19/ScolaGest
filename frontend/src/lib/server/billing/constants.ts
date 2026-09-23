// Shared between the public pricing page, POST /api/schools/signup (stores
// School.plan), POST /api/billing/subscribe (charges PLANS[plan].priceGNF),
// the subscription-reminder emails, the Moneroo webhook (extends
// currentPeriodEnd by PLANS[plan].periodDays), and student-count enforcement
// (plan-limits.ts) — kept in one place so price/limit/duration changes never
// drift between what's advertised and what's actually charged/enforced.
export const PLAN_ESSENTIEL = 'ESSENTIEL';
export const PLAN_CROISSANCE = 'CROISSANCE';
export const PLAN_FLEXIBLE = 'FLEXIBLE';

export type SchoolPlan = typeof PLAN_ESSENTIEL | typeof PLAN_CROISSANCE | typeof PLAN_FLEXIBLE;

export interface PlanConfig {
  priceGNF: number;
  /** Max enrolled students; null = unlimited. */
  studentLimit: number | null;
  /** Subscription period this plan renews on, in days. */
  periodDays: number;
}

export const PLANS: Record<SchoolPlan, PlanConfig> = {
  [PLAN_ESSENTIEL]: { priceGNF: 2_000_000, studentLimit: 700, periodDays: 365 },
  [PLAN_CROISSANCE]: { priceGNF: 3_000_000, studentLimit: null, periodDays: 365 },
  // Quarterly entry plan — unlimited students, shorter commitment, billed at
  // a premium over CROISSANCE's monthly-equivalent rate (standard practice
  // for shorter billing cycles; nudges schools that stay on it toward the
  // better annual rate once they're ready to commit).
  [PLAN_FLEXIBLE]: { priceGNF: 1_000_000, studentLimit: null, periodDays: 91 },
};

export function isSchoolPlan(value: unknown): value is SchoolPlan {
  return value === PLAN_ESSENTIEL || value === PLAN_CROISSANCE || value === PLAN_FLEXIBLE;
}

/** Falls back to CROISSANCE (unlimited) for any unrecognized stored value — never silently under-charge by guessing ESSENTIEL. */
export function planConfig(plan: string): PlanConfig {
  return isSchoolPlan(plan) ? PLANS[plan] : PLANS[PLAN_CROISSANCE];
}

/** How long a subscription period lasts for this plan, in milliseconds. */
export function planPeriodMs(plan: string): number {
  return planConfig(plan).periodDays * 24 * 60 * 60 * 1000;
}
