import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { ApiError, getJson, postJson } from '@/api/client';
import { server } from '@/test/msw/server';

describe('api client', () => {
  it('returns the parsed JSON body on success', async () => {
    server.use(http.get('/api/v1/leases', () => HttpResponse.json([{ id: 1 }])));

    await expect(getJson('/api/v1/leases')).resolves.toEqual([{ id: 1 }]);
  });

  it('normalizes FastAPI detail errors', async () => {
    server.use(
      http.get('/api/v1/leases', () => HttpResponse.json({ detail: 'Boom' }, { status: 500 })),
    );

    await expect(getJson('/api/v1/leases')).rejects.toMatchObject({ status: 500, message: 'Boom' });
  });

  it('normalizes GitHub-style message errors', async () => {
    server.use(
      http.post('/api/v1/leases/4/decision', () =>
        HttpResponse.json(
          { message: 'Cannot remove the last administrator', documentation_url: 'https://docs' },
          { status: 403 },
        ),
      ),
    );

    const error: unknown = await postJson('/api/v1/leases/4/decision', { action: 'REVOKE' }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, message: 'Cannot remove the last administrator' });
  });

  it('falls back to a generic message when the body carries none', async () => {
    server.use(http.get('/api/v1/leases', () => new HttpResponse(null, { status: 502 })));

    await expect(getJson('/api/v1/leases')).rejects.toMatchObject({
      status: 502,
      message: 'Request failed with status 502',
    });
  });
});
