import { mockGitLabAccount } from '../../../__mocks__/account-mocks';

import type { Hostname, SettingsState } from '../../../types';

import * as comms from '../../system/comms';
import {
  fetchGitLabAuthenticatedUser,
  getGitLabApiBaseUrl,
  gitlabGetJson,
  listGitLabTodos,
  markGitLabTodoAsDone,
} from './client';

describe('renderer/utils/forges/gitlab/client.ts', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.spyOn(comms, 'decryptValue').mockResolvedValue({ token: 'decrypted' });
  });

  function jsonResponse<T>(body: T, init: ResponseInit = { status: 200 }) {
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      ...init,
    });
  }

  describe('getGitLabApiBaseUrl', () => {
    it('builds https api v4 base', () => {
      const url = getGitLabApiBaseUrl('gitlab.com' as Hostname);
      expect(url.toString()).toBe('https://gitlab.com/api/v4/');
    });
  });

  describe('listGitLabTodos', () => {
    it('fetches a single page when fetchAllNotifications is false', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse([{ id: 1 }]));

      const result = await listGitLabTodos(mockGitLabAccount, {
        fetchAllNotifications: false,
        fetchReadNotifications: false,
      } as SettingsState);

      expect(result).toEqual([{ id: 1 }]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).toContain('https://gitlab.com/api/v4/');
      expect(calledUrl).toContain('state=pending');
      expect(calledUrl).toContain('page=1');
    });

    it('omits state filter when fetchReadNotifications is true', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse([]));

      await listGitLabTodos(mockGitLabAccount, {
        fetchAllNotifications: false,
        fetchReadNotifications: true,
      } as SettingsState);

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('state=pending');
    });

    it('paginates until an empty page is returned', async () => {
      fetchSpy
        .mockResolvedValueOnce(jsonResponse(Array.from({ length: 100 }, (_, i) => ({ id: i }))))
        .mockResolvedValueOnce(jsonResponse([{ id: 100 }]))
        .mockResolvedValueOnce(jsonResponse([]));

      const result = await listGitLabTodos(mockGitLabAccount, {
        fetchAllNotifications: true,
        fetchReadNotifications: false,
      } as SettingsState);

      expect(result).toHaveLength(101);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('throws on a non-ok status without echoing the response body', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('Authorization: token leaked-pat', {
          status: 401,
          statusText: 'Unauthorized',
        }),
      );

      await expect(
        listGitLabTodos(mockGitLabAccount, {
          fetchAllNotifications: false,
          fetchReadNotifications: false,
        } as SettingsState),
      ).rejects.toThrow(/^HTTP 401 Unauthorized$/);
    });
  });

  describe('fetchGitLabAuthenticatedUser', () => {
    it('returns the user payload', async () => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ id: 7, username: 'octocat', name: 'Octo Cat' }),
      );

      const result = await fetchGitLabAuthenticatedUser(mockGitLabAccount);

      expect(result).toEqual({ id: 7, username: 'octocat', name: 'Octo Cat' });
      expect(fetchSpy.mock.calls[0][0]).toContain('/api/v4/user');
    });
  });

  describe('markGitLabTodoAsDone', () => {
    it('sends a POST to the correct todos endpoint and resolves on 204', async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));

      await markGitLabTodoAsDone(mockGitLabAccount, '42');

      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toContain('/todos/42/mark_as_done');
      expect((init as RequestInit).method).toBe('POST');
    });
  });

  describe('gitlabGetJson', () => {
    it('GETs the supplied URL with auth headers and parses JSON', async () => {
      fetchSpy.mockResolvedValueOnce(jsonResponse({ web_url: 'x' }));

      const result = await gitlabGetJson<{ web_url: string }>(
        mockGitLabAccount,
        'https://gitlab.com/api/v4/projects/1',
      );

      expect(result).toEqual({ web_url: 'x' });
      const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers['PRIVATE-TOKEN']).toBe('decrypted');
    });

    it('throws on a non-ok response without echoing the body', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response('echoed PRIVATE-TOKEN: leaked-pat', {
          status: 500,
          statusText: 'Server Error',
        }),
      );

      await expect(gitlabGetJson(mockGitLabAccount, 'https://gitlab.com/api/v4/x')).rejects.toThrow(
        /^HTTP 500 Server Error$/,
      );
    });

    it('refuses cross-origin URLs without sending a request', async () => {
      await expect(
        gitlabGetJson(mockGitLabAccount, 'https://attacker.com/api/v4/x'),
      ).rejects.toThrow(/cross-origin GitLab URL/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refuses non-https URLs without sending a request', async () => {
      await expect(gitlabGetJson(mockGitLabAccount, 'http://gitlab.com/x')).rejects.toThrow(
        /cross-origin GitLab URL/,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('refuses malformed URLs without sending a request', async () => {
      await expect(gitlabGetJson(mockGitLabAccount, 'not-a-url')).rejects.toThrow(
        /malformed GitLab URL/,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
