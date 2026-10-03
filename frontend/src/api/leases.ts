import type { DecisionRequest, LeaseOverview } from '@/types/api';

import { getJson, postJson } from './client';
import { shouldUseFixtures } from './config';
import { leasesFixture } from './fixtures/leases';

export async function fetchLeases(): Promise<LeaseOverview[]> {
  if (shouldUseFixtures()) {
    return leasesFixture;
  }

  return getJson<LeaseOverview[]>('/api/v1/leases');
}

export async function postLeaseDecision(
  lease_id: number,
  request: DecisionRequest,
): Promise<LeaseOverview> {
  return postJson<LeaseOverview, DecisionRequest>(`/api/v1/leases/${lease_id}/decision`, request);
}
