import { PrismaClient } from '@prisma/client';

// ───────────────────────────────────────────────────────────────────────
// Multi-tenant scoping.
//
// IMPORTANT — why this is closure-based, not AsyncLocalStorage-based:
// an earlier version of this file resolved the current school via an
// AsyncLocalStorage set by requireStaff/requirePageAuth (`enterWith`).
// That was proven unreliable in this stack: ANY Prisma call anywhere
// earlier in a request's causal chain (even one that already resolved
// before `enterWith` was called) silently breaks AsyncLocalStorage
// propagation once the enclosing async function returns to its caller —
// verified with a minimal repro against this exact Next.js/Prisma/
// Turbopack combination. Ambient/implicit scoping is not safe here.
//
// Instead, `requireStaff`/`requirePageAuth` build a fresh scoped client
// via `scopedPrisma(schoolId)` (cheap — `$extends()` just wraps, no new
// connection) and return it as `auth.prisma` / `staff.prisma`. Every
// route/page adds ONE line right after the auth check:
//
//   const prisma = auth.prisma; // shadows the top-level import
//
// ...after which every existing `prisma.student.findMany()`-style call in
// that file is transparently scoped — no further changes needed. The
// default `prisma` export below (used for that one shadowing line's RHS
// context, and directly by requireStaff/requirePageAuth themselves to
// look up the user/school rows before any schoolId is known) has NO school
// bound — any operation on a tenant-scoped model through it throws
// immediately instead of silently running unscoped. Forgetting the
// shadowing line is a loud crash in dev, not a cross-tenant data leak.
//
// Tenant-scoped models: every model whose data belongs to exactly one
// school. Deliberately NOT in this list: `User` (login must look a user up
// by email BEFORE any schoolId is known — that lookup is what reveals it),
// and `School`/`SchoolSubscriptionPayment` (the tables that describe a
// tenant itself, resolved by their own id or read explicitly — e.g. from
// the Moneroo webhook, which has no schoolId to scope by at all). Every
// other model (Order, WebhookLog, VerificationCode, …) is generic platform
// infra scoped by userId, not by school.
//
// Known limitation: this only intercepts TOP-LEVEL operations on these
// models. A nested write reachable through a relation (e.g.
// `prisma.student.create({ data: { grades: { create: [...] } } })`) does
// NOT get schoolId auto-injected on the nested side — none of today's
// routes do this (grades/absences/etc. are always written as their own
// top-level call), but keep it in mind if that pattern is ever introduced.
// ───────────────────────────────────────────────────────────────────────
const TENANT_SCOPED_MODELS = new Set([
  'SchoolClass',
  'Cycle',
  'AcademicYear',
  'Student',
  'Absence',
  'SchoolMessage',
  'BulletinRemark',
  'Teacher',
  'TeacherPayment',
  'TeacherAbsence',
  'Staff',
  'StaffPayment',
  'SalaryAdvance',
  'TuitionPlan',
  'Subject',
  'TeacherAssignment',
  'Grade',
  'GradeSubmission',
  'ScheduleEntry',
  'RevenuePayment',
  'Expense',
  'SchoolSettings',
  'ParentStudent',
]);

// Operations whose `where` accepts arbitrary (non-unique-only) filters —
// safe to merge `schoolId` directly into `where`.
const WHERE_INJECTABLE_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

// findUnique(OrThrow) only accepts `where` clauses matching a declared
// unique key (usually just `id`) — Prisma rejects an extra `schoolId` field
// there outright, so these are scoped by checking the fetched row instead.
const UNIQUE_READ_OPS = new Set(['findUnique', 'findUniqueOrThrow']);

// update/delete also take a unique-only `where` — scoped by verifying
// ownership with a cheap findUnique before letting the real operation run.
const SINGLE_MUTATE_OPS = new Set(['update', 'delete']);

function uncapitalize(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

interface OwnerLookupDelegate {
  findUnique(args: {
    where: unknown;
    select: { schoolId: true };
  }): Promise<{ schoolId: string } | null>;
}

/** Mimics Prisma's own "record not found" error shape (code `P2025`). */
function notFoundError(model: string, detail = ''): Error & { code: string } {
  const err = new Error(`No ${model} found${detail ? ` — ${detail}` : '.'}`) as Error & {
    code: string;
  };
  err.code = 'P2025';
  return err;
}

/**
 * @param schoolId The bound school, or `undefined` for the unscoped
 *   default client — any tenant-model operation through an unscoped client
 *   throws immediately (fail closed).
 */
function buildClient(base: PrismaClient, schoolId: string | undefined) {
  function requireSchoolId(model: string, operation: string): string {
    if (!schoolId) {
      throw new Error(
        `Tenant-scoped query ${model}.${operation} ran on the unscoped prisma client — ` +
          'use `const prisma = auth.prisma;` (from requireStaff/requirePageAuth) instead of the top-level import.',
      );
    }
    return schoolId;
  }

  return base.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }
          const sid = requireSchoolId(model, operation);

          if (WHERE_INJECTABLE_OPS.has(operation)) {
            const a = args as { where?: Record<string, unknown> };
            a.where = { ...(a.where ?? {}), schoolId: sid };
            return query(a as never);
          }

          if (operation === 'create') {
            const a = args as { data?: Record<string, unknown> };
            a.data = { ...(a.data ?? {}), schoolId: sid };
            return query(a as never);
          }

          if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const a = args as { data?: Record<string, unknown> | Record<string, unknown>[] };
            a.data = Array.isArray(a.data)
              ? a.data.map((d) => ({ ...d, schoolId: sid }))
              : { ...(a.data ?? {}), schoolId: sid };
            return query(a as never);
          }

          if (UNIQUE_READ_OPS.has(operation)) {
            const result = await query(args);
            const belongsToSchool =
              result !== null &&
              typeof result === 'object' &&
              (result as { schoolId?: string }).schoolId === sid;
            if (result === null) return result;
            if (!belongsToSchool) {
              if (operation === 'findUniqueOrThrow') {
                throw notFoundError(model);
              }
              return null;
            }
            return result;
          }

          if (SINGLE_MUTATE_OPS.has(operation) || operation === 'upsert') {
            const a = args as { where?: unknown; create?: Record<string, unknown> };
            const delegate = base[
              uncapitalize(model) as keyof PrismaClient
            ] as unknown as OwnerLookupDelegate;
            const owner = await delegate.findUnique({ where: a.where, select: { schoolId: true } });
            if (operation === 'upsert') {
              if (owner && owner.schoolId !== sid) {
                throw notFoundError(model, 'upsert refused (cross-tenant)');
              }
              a.create = { ...(a.create ?? {}), schoolId: sid };
              return query(a as never);
            }
            if (!owner || owner.schoolId !== sid) {
              // Mirrors Prisma's own P2025 ("record not found") so every
              // route's existing `err.code === 'P2025' → 404` catch block
              // (update/delete on an already-deleted or cross-tenant id)
              // keeps working instead of leaking a raw 500.
              throw notFoundError(model);
            }
            return query(args as never);
          }

          // Any other operation on a tenant-scoped model — fail closed
          // rather than silently run unscoped.
          throw new Error(
            `Unhandled tenant-scoped operation ${model}.${operation} — extend prisma.ts.`,
          );
        },
      },
    },
  });
}

declare global {
  // `var` is required for `declare global` to attach to globalThis.
  var __prismaBase: PrismaClient | undefined;
  var __prisma: PrismaClient | undefined;
}

// Prisma's own defaults (maxWait: 2000ms, timeout: 5000ms) are tight for a
// serverless Postgres (Neon) under real-world latency — a handful of
// sequential queries inside an interactive $transaction (e.g.
// syncSubjectTeacherAssignments, called from POST/PATCH /api/subjects) can
// exceed 5s under load and surface as a raw P2028 "Transaction not found"
// 500, discarding otherwise-valid work. Raised here once, at the client
// level, so every one of the ~26 `$transaction()` call sites across the
// codebase benefits without each needing its own override.
const base =
  global.__prismaBase ??
  new PrismaClient({
    transactionOptions: { maxWait: 5000, timeout: 15000 },
  });

// Cast back to the plain `PrismaClient` type: the runtime object is the
// $extends()-wrapped client, but its API surface is identical, and every
// existing call site already expects the plain `PrismaClient` type.
export const prisma: PrismaClient =
  global.__prisma ?? (buildClient(base, undefined) as unknown as PrismaClient);

/** Build a fresh Prisma client bound to `schoolId` — see file header. */
export function scopedPrisma(schoolId: string): PrismaClient {
  return buildClient(base, schoolId) as unknown as PrismaClient;
}

if (process.env.NODE_ENV !== 'production') {
  global.__prismaBase = base;
  global.__prisma = prisma;
}
