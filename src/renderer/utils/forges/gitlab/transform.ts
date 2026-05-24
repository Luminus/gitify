import {
  type Account,
  type GitifyRepository,
  type GitifySubject,
  type RawGitifyNotification,
  type Reason,
  type SubjectType,
  toLink,
  toLinkOrNull,
} from '../../../types';
import type {
  GitLabIssue,
  GitLabProject,
  GitLabTodo,
  GitLabTodoActionName,
  GitLabTodoTargetType,
} from './types';

import { getReasonDetails } from '../../notifications/reason';

const FALLBACK_REASON: Reason = 'subscribed';

export function transformGitLabTodos(raw: GitLabTodo[], account: Account): RawGitifyNotification[] {
  return raw.map((todo) => transformGitLabTodo(todo, account));
}

function transformGitLabTodo(raw: GitLabTodo, account: Account): RawGitifyNotification {
  const reasonCode = mapActionToReason(raw.action_name);
  const reasonDetails = getReasonDetails(reasonCode);

  return {
    id: String(raw.id),
    unread: raw.state === 'pending',
    updatedAt: raw.updated_at,
    reason: {
      code: reasonCode,
      title: reasonDetails.title,
      description: reasonDetails.description ?? '',
    },
    subject: transformSubject(raw),
    repository: transformRepository(raw, account),
    account,
    order: 0,
  };
}

function transformSubject(raw: GitLabTodo): GitifySubject {
  return {
    title: raw.target?.title ?? raw.body,
    type: mapTargetType(raw.target_type),
    // GitLab todos provide the web URL directly — store it in htmlUrl so
    // generateNotificationWebUrl uses it without a follow-up API call.
    url: null,
    latestCommentUrl: null,
    htmlUrl: toLinkOrNull(raw.target_url) ?? undefined,
  };
}

function transformRepository(raw: GitLabTodo, account: Account): GitifyRepository {
  if (!raw.project) {
    return {
      name: 'unknown',
      fullName: 'unknown',
      htmlUrl: toLink(`https://${account.hostname}`),
      owner: {
        login: 'unknown',
        avatarUrl: toLink(''),
        type: 'User',
      },
    };
  }

  const ownerLogin = raw.project.path_with_namespace.split('/')[0] ?? 'unknown';
  const ownerAvatarUrl = raw.project.namespace?.avatar_url ?? '';
  const ownerType = raw.project.namespace?.kind === 'group' ? 'Organization' : 'User';

  return {
    name: raw.project.name,
    fullName: raw.project.path_with_namespace,
    htmlUrl: toLink(raw.project.web_url ?? `https://${account.hostname}`),
    owner: {
      login: ownerLogin,
      avatarUrl: toLink(ownerAvatarUrl),
      type: ownerType,
    },
  };
}

export function transformGitLabIssues(
  issues: GitLabIssue[],
  projectMap: Map<number, GitLabProject>,
  account: Account,
): RawGitifyNotification[] {
  return issues.map((issue) => transformGitLabIssue(issue, projectMap, account));
}

function transformGitLabIssue(
  issue: GitLabIssue,
  projectMap: Map<number, GitLabProject>,
  account: Account,
): RawGitifyNotification {
  const reasonDetails = getReasonDetails('subscribed');
  const project = projectMap.get(issue.project_id);

  return {
    id: `issue-${issue.id}`,
    unread: true,
    updatedAt: issue.updated_at,
    reason: {
      code: 'subscribed',
      title: reasonDetails.title,
      description: reasonDetails.description ?? '',
    },
    subject: {
      title: issue.title,
      type: 'Issue',
      url: null,
      latestCommentUrl: null,
      htmlUrl: toLinkOrNull(issue.web_url) ?? undefined,
      number: issue.iid,
    },
    repository: transformIssueRepository(issue, project, account),
    account,
    order: 0,
  };
}

function transformIssueRepository(
  _issue: GitLabIssue,
  project: GitLabProject | undefined,
  account: Account,
): GitifyRepository {
  if (!project) {
    return {
      name: 'unknown',
      fullName: 'unknown',
      htmlUrl: toLink(`https://${account.hostname}`),
      owner: { login: 'unknown', avatarUrl: toLink(''), type: 'User' },
    };
  }

  const ownerLogin = project.path_with_namespace.split('/')[0] ?? 'unknown';
  const ownerType = project.namespace?.kind === 'group' ? 'Organization' : 'User';

  return {
    name: project.name,
    fullName: project.path_with_namespace,
    htmlUrl: toLink(project.web_url ?? `https://${account.hostname}`),
    owner: {
      login: ownerLogin,
      avatarUrl: toLink(project.namespace?.avatar_url ?? ''),
      type: ownerType,
    },
  };
}

function mapActionToReason(action: GitLabTodoActionName): Reason {
  switch (action) {
    case 'assigned':
      return 'assign';
    case 'mentioned':
    case 'directly_addressed':
      return 'mention';
    case 'build_failed':
      return 'ci_activity';
    case 'marked':
      return 'manual';
    case 'approval_required':
      return 'approval_requested';
    case 'unmergeable':
    case 'merge_train_removed':
      return 'state_change';
    case 'review_requested':
      return 'review_requested';
    case 'member_access_requested':
      return 'member_feature_requested';
    case 'review_submitted':
      return 'comment';
    case 'new_epic_added':
      return 'subscribed';
    default:
      return FALLBACK_REASON;
  }
}

function mapTargetType(type: GitLabTodoTargetType): SubjectType {
  switch (type) {
    case 'Issue':
      return 'Issue';
    case 'MergeRequest':
      return 'PullRequest';
    case 'Commit':
      return 'Commit';
    default:
      return 'Issue';
  }
}
