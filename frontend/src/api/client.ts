/**
 * Klient HTTP — jedyne miejsce, w którym rozmawiamy z API.
 *
 * Ścieżki są relatywne (`/api/v1/...`); w dev przekierowuje je proxy Vite na `http://localhost:8000`,
 * a w testach przechwytuje MSW.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface GitHubErrorBody {
  message?: unknown;
}

interface FastApiErrorBody {
  detail?: unknown;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractMessage(body: unknown, status: number): string {
  if (typeof body === 'object' && body !== null) {
    const githubMessage = (body as GitHubErrorBody).message;
    if (typeof githubMessage === 'string' && githubMessage.length > 0) {
      return githubMessage;
    }

    const fastApiDetail = (body as FastApiErrorBody).detail;
    if (typeof fastApiDetail === 'string' && fastApiDetail.length > 0) {
      return fastApiDetail;
    }
  }

  return `Request failed with status ${status}`;
}

async function request<TResponse>(path: string, init: RequestInit = {}): Promise<TResponse> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, { ...init, headers });
  const body = await parseBody(response);

  if (!response.ok) {
    throw new ApiError(response.status, extractMessage(body, response.status));
  }

  return body as TResponse;
}

export function getJson<TResponse>(path: string): Promise<TResponse> {
  return request<TResponse>(path);
}

export function postJson<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
  return request<TResponse>(path, { method: 'POST', body: JSON.stringify(body) });
}
