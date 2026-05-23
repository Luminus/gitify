import type { Account, Hostname, SettingsState } from '../../../types';
import type { GitLabTodo, GitLabUser } from './types';

import { isValidHostname } from '../../auth/utils';
import { HttpError } from '../../core/httpError';
import { decryptValue } from '../../system/comms';

const PAGE_SIZE = 100;

export function getGitLabApiBaseUrl(hostname: Hostname): URL {
  if (!isValidHostname(hostname)) {
    throw new Error('Refusing to build a GitLab API URL for invalid hostname.');
  }
  return new URL(`https://${hostname}/api/v4/`);
}

async function authHeaders(account: Account): Promise<HeadersInit> {
  const { token } = await decryptValue(account.token);
  return {
    Accept: 'application/json',
    'PRIVATE-TOKEN': token,
  };
}

function apiError(status: number, statusText: string): HttpError {
  return new HttpError(status, statusText);
}

async function gitlabRequest<T>(
  account: Account,
  pathname: string,
  init?: RequestInit,
): Promise<T> {
  const base = getGitLabApiBaseUrl(account.hostname);
  const url = new URL(pathname.replace(/^\//, ''), base);

  const response = await fetch(url.toString(), {
    ...init,
    headers: {
      ...(await authHeaders(account)),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw apiError(response.status, response.statusText);
  }

  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function buildTodoQuery(settings: SettingsState): URLSearchParams {
  const params = new URLSearchParams();
  params.set('per_page', String(PAGE_SIZE));
  if (!settings.fetchReadNotifications) {
    params.set('state', 'pending');
  }
  return params;
}

export async function listGitLabTodos(
  account: Account,
  settings: SettingsState,
): Promise<GitLabTodo[]> {
  const params = buildTodoQuery(settings);

  if (!settings.fetchAllNotifications) {
    params.set('page', '1');
    return gitlabRequest<GitLabTodo[]>(account, `todos?${params.toString()}`);
  }

  const all: GitLabTodo[] = [];
  let page = 1;

  while (true) {
    params.set('page', String(page));
    const batch = await gitlabRequest<GitLabTodo[]>(account, `todos?${params.toString()}`);
    if (!batch.length) {
      break;
    }
    all.push(...batch);
    if (batch.length < PAGE_SIZE) {
      break;
    }
    page += 1;
  }

  return all;
}

export function fetchGitLabAuthenticatedUser(account: Account): Promise<GitLabUser> {
  return gitlabRequest<GitLabUser>(account, 'user');
}

export async function markGitLabTodoAsDone(account: Account, todoId: string): Promise<void> {
  await gitlabRequest<void>(account, `todos/${todoId}/mark_as_done`, { method: 'POST' });
}

/**
 * GET an arbitrary GitLab API URL. The URL must point at the same origin as
 * the authenticated account — we never send the PAT to a different host.
 */
export async function gitlabGetJson<T>(account: Account, url: string): Promise<T> {
  const expected = getGitLabApiBaseUrl(account.hostname);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Refusing to follow malformed GitLab URL.');
  }
  if (parsed.protocol !== 'https:' || parsed.host !== expected.host) {
    throw new Error(
      `Refusing to follow cross-origin GitLab URL for account on ${account.hostname}.`,
    );
  }

  const response = await fetch(parsed.toString(), {
    headers: await authHeaders(account),
  });
  if (!response.ok) {
    throw apiError(response.status, response.statusText);
  }
  return response.json() as Promise<T>;
}
