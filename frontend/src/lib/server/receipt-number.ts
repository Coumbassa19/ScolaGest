// Assigns the sequential "REC-YYYY-00001" receipt number a payment keeps
// forever once printed — the number a family actually reads on their
// paper/PDF receipt, as opposed to the internal cuid. Numbered sequentially
// per calendar year (the convention used in physical receipt books here),
// counting only rows that already carry a number so a payment recorded
// without ever being viewed as a receipt doesn't consume a slot.
//
// Numbering is "max existing suffix + 1" rather than a plain row count:
// counting rows would silently collide the moment there's a gap in the
// sequence (e.g. a test/void receipt deleted after being issued) — the
// count drops by one but the next real number issued is still the old
// highest+1, which is already taken. Taking the max of the suffixes
// actually on record is immune to gaps.
//
// Compute-then-write is still not race-proof on its own: two payments
// numbered in the same instant could compute the same candidate. Postgres
// aborts an entire transaction on the first failed statement (any later
// statement on that same connection fails with 25P02, "current transaction
// is aborted"), so a retry can't just recompute-and-retry *inside* the same
// transaction — it has to restart a brand-new `$transaction` from scratch,
// redoing every statement in it. That's what `createWithNumeroRecu` does;
// it's the same retry-on-P2002 idea already used for matricule generation
// in src/app/api/students/route.ts, just wrapping a whole transaction
// instead of a single create().
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

const MAX_ATTEMPTS = 5;

async function nextCandidate(tx: TxClient, date: Date): Promise<string> {
  const year = date.getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const prefix = `REC-${year}-`;
  const rows = await tx.revenuePayment.findMany({
    where: { numeroRecu: { not: null }, date: { gte: yearStart, lt: yearEnd } },
    select: { numeroRecu: true },
  });
  let max = 0;
  for (const row of rows) {
    const numeroRecu = row.numeroRecu;
    if (!numeroRecu?.startsWith(prefix)) continue;
    const n = Number(numeroRecu.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(5, '0')}`;
}

function isNumeroRecuClash(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err) || err.code !== 'P2002') {
    return false;
  }
  const meta = (err as { meta?: unknown }).meta;
  const target = (meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) && target.includes('numeroRecu');
}

/**
 * Runs `run(tx, candidateNumber)` in a fresh transaction, computing a new
 * candidate receipt number each attempt and retrying the *whole*
 * transaction (every statement `run` performs, not just the number pick)
 * if the attempt fails on a numeroRecu unique clash.
 */
export async function createWithNumeroRecu<T>(
  prisma: PrismaClient,
  date: Date,
  run: (tx: TxClient, numeroRecu: string) => Promise<T>,
  txOptions?: { maxWait?: number; timeout?: number },
): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const candidate = await nextCandidate(tx, date);
        return run(tx, candidate);
      }, txOptions);
    } catch (err) {
      if (!isNumeroRecuClash(err) || attempt === MAX_ATTEMPTS - 1) throw err;
    }
  }
  // Unreachable — the loop above always returns or throws — but keeps
  // TypeScript satisfied that every path returns a value.
  throw new Error('createWithNumeroRecu: exhausted retries without a definitive result');
}
