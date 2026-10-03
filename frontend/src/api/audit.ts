import type { AuditEntry } from '@/types/api';

import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { auditFixture } from './fixtures/audit';

/**
 * Dziennik audytu — jedyne miejsce styku z transportem.
 *
 * `GET /api/v1/audit` oddaje **gołą tablicę** `AuditEntry[]`: bez koperty `{ entries }` (żaden
 * endpoint nie paginuje — ADR 0011 §6), z `actor_login` rozwiązanym po stronie backendu
 * (LEFT JOIN z `users`), więc widok nie łączy się z listą użytkowników sam.
 *
 * Kolejność (najnowsze pierwsze) należy do backendu, frontend jej nie zmienia.
 */
export async function fetchAuditLog(): Promise<AuditEntry[]> {
  if (shouldUseFixtures()) {
    return auditFixture;
  }

  return getJson<AuditEntry[]>('/api/v1/audit');
}
