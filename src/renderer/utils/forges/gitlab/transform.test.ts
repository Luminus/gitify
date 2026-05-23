import { mockGitLabAccount } from '../../../__mocks__/account-mocks';

import type { GitLabTodo, GitLabTodoActionName } from './types';

import { transformGitLabTodos } from './transform';

const baseTodo: GitLabTodo = {
  id: 1,
  author: { id: 99, username: 'author', name: 'Author User' },
  action_name: 'assigned',
  target_type: 'Issue',
  target: {
    id: 10,
    iid: 5,
    title: 'Fix the bug',
    web_url: 'https://gitlab.com/owner/repo/-/issues/5',
  },
  target_url: 'https://gitlab.com/owner/repo/-/issues/5',
  body: 'Fix the bug',
  state: 'pending',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-15T12:00:00Z',
  project: {
    id: 1,
    name: 'repo',
    name_with_namespace: 'Owner / Repo',
    path: 'repo',
    path_with_namespace: 'owner/repo',
    web_url: 'https://gitlab.com/owner/repo',
    namespace: {
      id: 2,
      name: 'Owner',
      path: 'owner',
      kind: 'user',
    },
  },
};

describe('renderer/utils/forges/gitlab/transform.ts', () => {
  it('maps an Issue todo to GitifyNotification', () => {
    const [n] = transformGitLabTodos([baseTodo], mockGitLabAccount);

    expect(n.id).toBe('1');
    expect(n.unread).toBe(true);
    expect(n.subject.type).toBe('Issue');
    expect(n.subject.title).toBe('Fix the bug');
    expect(n.subject.htmlUrl).toBe('https://gitlab.com/owner/repo/-/issues/5');
    expect(n.subject.url).toBeNull();
    expect(n.repository.name).toBe('repo');
    expect(n.repository.fullName).toBe('owner/repo');
    expect(n.repository.htmlUrl).toBe('https://gitlab.com/owner/repo');
    expect(n.repository.owner.login).toBe('owner');
    expect(n.repository.owner.type).toBe('User');
  });

  it('maps a MergeRequest todo to PullRequest type', () => {
    const [n] = transformGitLabTodos(
      [{ ...baseTodo, target_type: 'MergeRequest' }],
      mockGitLabAccount,
    );
    expect(n.subject.type).toBe('PullRequest');
  });

  it('maps a Commit todo to Commit type', () => {
    const [n] = transformGitLabTodos([{ ...baseTodo, target_type: 'Commit' }], mockGitLabAccount);
    expect(n.subject.type).toBe('Commit');
  });

  it('defaults unknown target types to Issue', () => {
    const [n] = transformGitLabTodos(
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime fallback
      [{ ...baseTodo, target_type: 'Epic' as any }],
      mockGitLabAccount,
    );
    expect(n.subject.type).toBe('Issue');
  });

  it('marks done todos as unread=false', () => {
    const [n] = transformGitLabTodos([{ ...baseTodo, state: 'done' }], mockGitLabAccount);
    expect(n.unread).toBe(false);
  });

  it.each<[GitLabTodoActionName, string]>([
    ['assigned', 'assign'],
    ['mentioned', 'mention'],
    ['directly_addressed', 'mention'],
    ['build_failed', 'ci_activity'],
    ['marked', 'manual'],
    ['approval_required', 'approval_requested'],
    ['unmergeable', 'state_change'],
    ['merge_train_removed', 'state_change'],
    ['review_requested', 'review_requested'],
    ['member_access_requested', 'member_feature_requested'],
    ['review_submitted', 'comment'],
    ['new_epic_added', 'subscribed'],
  ])('maps action_name "%s" to reason code "%s"', (action, expectedReason) => {
    const [n] = transformGitLabTodos([{ ...baseTodo, action_name: action }], mockGitLabAccount);
    expect(n.reason.code).toBe(expectedReason);
  });

  it('uses hostname fallback when project is absent', () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing runtime fallback
    const [n] = transformGitLabTodos(
      [{ ...baseTodo, project: undefined as any }],
      mockGitLabAccount,
    );
    expect(n.repository.fullName).toBe('unknown');
    expect(n.repository.htmlUrl).toBe('https://gitlab.com');
  });

  it('uses hostname fallback when project.web_url is null', () => {
    const [n] = transformGitLabTodos(
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime null guard
      [{ ...baseTodo, project: { ...baseTodo.project!, web_url: null as any } }],
      mockGitLabAccount,
    );
    expect(n.repository.htmlUrl).toBe('https://gitlab.com');
  });

  it('sets htmlUrl to undefined when target_url is null', () => {
    const [n] = transformGitLabTodos(
      // biome-ignore lint/suspicious/noExplicitAny: testing runtime null guard
      [{ ...baseTodo, target_url: null as any }],
      mockGitLabAccount,
    );
    expect(n.subject.htmlUrl).toBeUndefined();
  });

  it('marks group namespace as Organization owner type', () => {
    const [n] = transformGitLabTodos(
      [
        {
          ...baseTodo,
          project: {
            ...baseTodo.project!,
            namespace: { id: 3, name: 'MyGroup', path: 'mygroup', kind: 'group' },
          },
        },
      ],
      mockGitLabAccount,
    );
    expect(n.repository.owner.type).toBe('Organization');
  });
});
