/**
 * Safety gates for write and destructive tools.
 * - READ_ONLY blocks every mutation up front.
 * - Destructive tools additionally require an explicit `confirm: true`.
 */

import type { Config } from './config.js';

export class GuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuardError';
  }
}

/** Block any mutation when the server runs in read-only mode. */
export function assertWritable(config: Config, action: string): void {
  if (config.readOnly) {
    throw new GuardError(
      `Blocked: BITBUCKET_READ_ONLY is enabled, "${action}" is a write operation.`
    );
  }
}

/** Destructive actions need an explicit opt-in so they are never implicit. */
export function assertConfirmed(confirm: boolean | undefined, action: string): void {
  if (confirm !== true) {
    throw new GuardError(
      `"${action}" is destructive. Re-run with confirm:true to proceed.`
    );
  }
}

/**
 * Hard block on directly mutating a protected branch (push/force/rebase/delete/
 * create-with-protected-name). Not overridable by confirm: merge a PR instead.
 */
export function assertNotProtected(config: Config, branch: string, action: string): void {
  if (config.protectedBranches.has(branch.trim().toLowerCase())) {
    throw new GuardError(
      `Blocked: "${branch}" is a protected branch. "${action}" cannot target it directly. ` +
        `Protected branches: ${[...config.protectedBranches].join(', ')}. ` +
        `Use a pull request to land changes there.`
    );
  }
}
