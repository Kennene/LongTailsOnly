import type { AuditLogRead } from '@/types/api';

import { getJson } from './client';
import { shouldUseFixtures } from './config';
import { auditFixture } from './fixtures/audit';

/**
 * Dziennik audytu — jedyne miejsce styku z transportem.
 *
 * `AuditLogResponse` to **oczekiwany kontrakt kroku 4.5**: generowany `src/types/api.ts` zna już
 * encję `AuditLogRead`, ale nie zna jeszcze koperty listy (spec §5). Trzymamy ją tutaj, a nie
 * w pliku kontraktu, bo ten jest generowany z Pydantic i nie edytujemy go ręcznie — gdy 4.5
 * dostarczy DTO, podmieniamy wyłącznie ten typ.
 */
export interface AuditLogResponse {
  entries: AuditLogRead[];
}

/** Zdarzenia dziennika; kolejność (najnowsze pierwsze) należy do backendu, frontend jej nie zmienia. */
export async function fetchAuditLog(): Promise<AuditLogResponse> {
  if (shouldUseFixtures()) {
    return { entries: auditFixture };
  }

  return getJson<AuditLogResponse>('/api/v1/audit');
}
