/**
 * Environment-derived configuration for the Bitbucket MCP server.
 * Auth uses HTTP Basic with `email:api_token` (scoped Atlassian API token).
 */

export interface Config {
  email: string;
  apiToken: string;
  workspace: string;
  defaultRepo: string | undefined;
  readOnly: boolean;
  /**
   * Opt-in single-workspace lock (BITBUCKET_LOCK_WORKSPACE). Off by default, so the server stays
   * multi-workspace. When on, any workspace other than `workspace` is rejected (per-client isolation).
   */
  lockWorkspace: boolean;
  /** Branches that must never be directly mutated (push/force/rebase/delete). */
  protectedBranches: Set<string>;
  /** REST API auth: Basic email:token. */
  authHeader: string;
  /**
   * Git-over-HTTPS auth: Basic username:token (Bitbucket git wants the account
   * USERNAME, not the email). Undefined when BITBUCKET_USERNAME is not set, in
   * which case the *_https git tools refuse to run with a clear message.
   */
  gitUsername: string | undefined;
  gitAuthHeader: string | undefined;
  baseUrl: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var ${name}. See .env.example.`);
  }
  return value.trim();
}

let cached: Config | undefined;

export function loadConfig(): Config {
  if (cached) return cached;

  const email = requireEnv('BITBUCKET_EMAIL');
  const apiToken = requireEnv('BITBUCKET_API_TOKEN');
  const workspace = requireEnv('BITBUCKET_WORKSPACE');
  const defaultRepo = process.env.BITBUCKET_DEFAULT_REPO?.trim() || undefined;
  const readOnly = process.env.BITBUCKET_READ_ONLY?.trim().toLowerCase() === 'true';
  const lockWorkspace = process.env.BITBUCKET_LOCK_WORKSPACE?.trim().toLowerCase() === 'true';

  const protectedRaw = process.env.BITBUCKET_PROTECTED_BRANCHES?.trim() || 'main,dev';
  const protectedBranches = new Set(
    protectedRaw
      .split(',')
      .map((b) => b.trim().toLowerCase())
      .filter((b) => b.length > 0)
  );

  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

  // Git over HTTPS authenticates with the Bitbucket account USERNAME (not the email).
  const gitUsername = process.env.BITBUCKET_USERNAME?.trim() || undefined;
  const gitAuthHeader = gitUsername
    ? `Basic ${Buffer.from(`${gitUsername}:${apiToken}`).toString('base64')}`
    : undefined;

  cached = {
    email,
    apiToken,
    workspace,
    defaultRepo,
    readOnly,
    lockWorkspace,
    protectedBranches,
    authHeader,
    gitUsername,
    gitAuthHeader,
    baseUrl: 'https://api.bitbucket.org/2.0',
  };
  return cached;
}

/**
 * Resolve the workspace for a call. Multi-workspace by DEFAULT: an explicit override is honored, so
 * the server works across workspaces as designed. Opt into a single-workspace lock with
 * BITBUCKET_LOCK_WORKSPACE=true (per-client isolation): then any workspace other than the configured
 * one is rejected. Returns the workspace to use.
 */
export function assertWorkspace(config: Config, requested?: string): string {
  const want = requested?.trim();
  if (!want) return config.workspace;
  if (config.lockWorkspace && want.toLowerCase() !== config.workspace.trim().toLowerCase()) {
    throw new Error(
      `Blocked: BITBUCKET_LOCK_WORKSPACE is on; this server operates ONLY in ` +
        `"${config.workspace}", so workspace "${want}" is off-limits.`
    );
  }
  return want;
}

/** Resolve workspace/repo from per-call overrides, falling back to config defaults. */
export function resolveTarget(
  config: Config,
  override?: { workspace?: string; repo?: string }
): { workspace: string; repo: string } {
  const workspace = assertWorkspace(config, override?.workspace);
  const repo = override?.repo?.trim() || config.defaultRepo;
  if (!repo) {
    throw new Error(
      'No repo specified and BITBUCKET_DEFAULT_REPO is not set. Pass `repo` in the tool input.'
    );
  }
  return { workspace, repo };
}
