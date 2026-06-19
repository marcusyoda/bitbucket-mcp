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
  /** Branches that must never be directly mutated (push/force/rebase/delete). */
  protectedBranches: Set<string>;
  authHeader: string;
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

  const protectedRaw = process.env.BITBUCKET_PROTECTED_BRANCHES?.trim() || 'main,dev';
  const protectedBranches = new Set(
    protectedRaw
      .split(',')
      .map((b) => b.trim().toLowerCase())
      .filter((b) => b.length > 0)
  );

  const authHeader = `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`;

  cached = {
    email,
    apiToken,
    workspace,
    defaultRepo,
    readOnly,
    protectedBranches,
    authHeader,
    baseUrl: 'https://api.bitbucket.org/2.0',
  };
  return cached;
}

/** Resolve workspace/repo from per-call overrides, falling back to config defaults. */
export function resolveTarget(
  config: Config,
  override?: { workspace?: string; repo?: string }
): { workspace: string; repo: string } {
  const workspace = override?.workspace?.trim() || config.workspace;
  const repo = override?.repo?.trim() || config.defaultRepo;
  if (!repo) {
    throw new Error(
      'No repo specified and BITBUCKET_DEFAULT_REPO is not set. Pass `repo` in the tool input.'
    );
  }
  return { workspace, repo };
}
