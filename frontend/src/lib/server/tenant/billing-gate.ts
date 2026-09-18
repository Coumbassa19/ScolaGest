// Subscription access gate — shared by requireStaff (API routes) and
// requirePageAuth (pages). A school is blocked once its trial or paid
// period has lapsed: TRIALING past `trialEndsAt`, or ACTIVE past
// `currentPeriodEnd`. PAST_DUE is always blocked (set once a period lapses
// — see the webhook/billing routes in Phase 3). Computed at request time
// rather than flipped by a cron, so it can never drift out of date.
import 'server-only';

export interface SchoolBillingState {
  status: string; // TRIALING | ACTIVE | PAST_DUE
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
}

export function isSchoolAccessBlocked(school: SchoolBillingState, now: Date = new Date()): boolean {
  if (school.status === 'PAST_DUE') return true;
  if (school.status === 'TRIALING') return now > school.trialEndsAt;
  if (school.status === 'ACTIVE') return school.currentPeriodEnd === null || now > school.currentPeriodEnd;
  return false;
}
