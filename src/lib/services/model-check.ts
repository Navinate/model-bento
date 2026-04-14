import { eq, and } from 'drizzle-orm';
import { db as defaultDb } from '../db';
import { models } from '../schema';

type Db = typeof defaultDb;

type CheckResult =
  | { exists: false }
  | { exists: true; provider: string; name: string };

export async function checkModelExists(
  provider: string,
  name: string,
  options?: { db?: Db },
): Promise<CheckResult> {
  const db = options?.db ?? defaultDb;

  const result = await db
    .select({ provider: models.provider, name: models.name })
    .from(models)
    .where(and(eq(models.provider, provider), eq(models.name, name)))
    .limit(1);

  if (result.length === 0) {
    return { exists: false };
  }

  return { exists: true, provider: result[0].provider, name: result[0].name };
}
