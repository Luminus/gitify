/**
 * Lightweight HTTP error used by non-Octokit forge clients (Gitea, GitLab).
 * Carries the HTTP status code so `determineFailureType` can classify it
 * without string-parsing the message.
 *
 * `Object.setPrototypeOf` is required because TypeScript's `extends Error`
 * breaks `instanceof` checks when compiling to ES5.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, statusText: string) {
    super(`HTTP ${status} ${statusText}`);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}
