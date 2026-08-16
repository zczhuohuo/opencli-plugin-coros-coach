import { CliError } from '@jackwener/opencli/errors';
import type { IPage } from '@jackwener/opencli/registry';

const API_BASE_URL = 'https://teamcnapi.coros.com';
export const SCHEDULE_URL = 'https://t.coros.com/admin/views/schedule';

type CorosPage = Pick<IPage, 'fetchJson' | 'goto' | 'wait'>;

interface CorosEnvelope {
  result?: string;
  message?: string;
  data?: unknown;
  accessToken?: unknown;
}

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface CorosRequest {
  <Response>(endpoint: string, options?: RequestOptions): Promise<Response>;
}

function asEnvelope(response: unknown): CorosEnvelope {
  return response !== null && typeof response === 'object'
    ? response as CorosEnvelope
    : {};
}

function apiError(response: CorosEnvelope, endpoint: string): CliError {
  const authenticationFailed = response.result === 'ACCESS_TOKEN_IS_INVALID';
  return new CliError(
    authenticationFailed ? 'AUTH_REQUIRED' : 'COROS_API_ERROR',
    `COROS ${endpoint} failed: ${response.message ?? response.result ?? 'unknown error'}`,
    `Open ${SCHEDULE_URL}, sign in, and retry.`,
  );
}

/**
 * Open the authenticated COROS session and return its request adapter.
 * Tokens remain inside the browser-backed implementation and are never
 * exposed through the adapter's interface.
 */
export async function connectCoros(page: CorosPage): Promise<CorosRequest> {
  await page.goto(SCHEDULE_URL, { waitUntil: 'load', settleMs: 1_000 });
  await page.wait({ selector: '#schedule', timeout: 15 });

  const refreshed = asEnvelope(await page.fetchJson(`${API_BASE_URL}/account/refresh`, {
    method: 'POST',
  }));
  const refreshData = asEnvelope(refreshed.data);
  const accessToken = refreshData.accessToken ?? refreshed.accessToken;

  if (
    refreshed.result !== '0000'
    || typeof accessToken !== 'string'
    || accessToken.length === 0
  ) {
    throw new CliError(
      'AUTH_REQUIRED',
      'COROS login could not be refreshed.',
      `Open ${SCHEDULE_URL}, sign in, and retry.`,
    );
  }

  return async function request<Response>(
    endpoint: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    const response = asEnvelope(await page.fetchJson(`${API_BASE_URL}${endpoint}`, {
      method: options.method ?? 'GET',
      headers: {
        accessToken,
        YFHeader: JSON.stringify({ language: 'zh-CN' }),
        ...(options.headers ?? {}),
      },
      ...(options.body === undefined ? {} : { body: options.body }),
    }));

    if (response.result !== '0000') {
      throw apiError(response, endpoint);
    }

    return response.data as Response;
  };
}
