import type { HttpHandler } from 'msw';
import { http, HttpResponse } from 'msw';

import type { DecisionRequest } from '@/types/api';

import { applyDecision, getLeases, recordDecision } from '../state';

export const leasesHandlers: HttpHandler[] = [
  http.get('/api/v1/leases', () => HttpResponse.json(getLeases())),

  http.post('/api/v1/leases/:leaseId/decision', async ({ params, request }) => {
    const leaseId = Number(params.leaseId);
    const body = (await request.json()) as DecisionRequest;
    const lease = getLeases().find((candidate) => candidate.id === leaseId);

    if (lease === undefined) {
      return HttpResponse.json({ detail: 'Lease not found' }, { status: 404 });
    }

    if (lease.current_role === 'admin' && body.action === 'REVOKE') {
      return HttpResponse.json(
        {
          message: 'Cannot remove the last administrator of the repository/organization',
          documentation_url: 'https://docs.github.com/rest',
        },
        { status: 403 },
      );
    }

    recordDecision(leaseId, body);
    const updated = applyDecision(leaseId, body);
    if (updated === null) {
      return HttpResponse.json({ detail: 'Lease not found' }, { status: 404 });
    }

    return HttpResponse.json(updated);
  }),
];
