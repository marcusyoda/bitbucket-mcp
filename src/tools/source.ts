import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { BitbucketClient } from '../client.js';
import { resolveTarget } from '../config.js';
import { execute, jsonResult, textResult, type Ctx } from '../lib.js';
import { paginationShape, targetShape } from '../schemas.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Encode a repo path for the src endpoint while preserving slashes. */
function encodePath(path: string): string {
  return path
    .split('/')
    .filter((seg) => seg.length > 0)
    .map(encodeURIComponent)
    .join('/');
}

/**
 * Encode a ref (branch/tag/commit) for the src endpoint. Slashes in branch names
 * (e.g. feat/foo) must stay literal: encoding them to %2F makes Bitbucket return
 * "Commit not found". Encode each segment but keep the separators.
 */
function encodeRef(ref: string): string {
  return ref.split('/').map(encodeURIComponent).join('/');
}

async function defaultBranch(
  client: BitbucketClient,
  ws: string,
  repo: string
): Promise<string> {
  const data = await client.request<{ mainbranch?: { name?: string } }>(
    'GET',
    `/repositories/${ws}/${repo}`
  );
  return data.mainbranch?.name ?? 'master';
}

/**
 * Resolve a ref to a commit hash. The src endpoint cannot disambiguate slashes
 * in a branch name (feat/foo), so a branch is first resolved to its commit hash
 * via refs/branches (which does accept literal slashes). A value that is not a
 * branch (an actual hash or a tag) is returned as-is.
 */
async function resolveRef(
  client: BitbucketClient,
  ws: string,
  repo: string,
  ref: string | undefined
): Promise<string> {
  const wanted = ref?.trim() || (await defaultBranch(client, ws, repo));
  try {
    const branch = await client.request<{ target?: { hash?: string } }>(
      'GET',
      `/repositories/${ws}/${repo}/refs/branches/${wanted}`
    );
    if (branch?.target?.hash) return branch.target.hash;
  } catch {
    // Not a branch: assume it is already a commit hash or a tag.
  }
  return wanted;
}

export function registerSourceTools(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'get_file_source',
    {
      title: 'Get file source',
      description: 'Read the contents of a file at a ref (branch, tag or commit).',
      inputSchema: {
        ...targetShape,
        path: z.string().describe('File path relative to repo root.'),
        ref: z.string().optional().describe('Branch, tag or commit. Defaults to main branch.'),
      },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const ref = await resolveRef(ctx.client, workspace, repo, args.ref);
        const content = await ctx.client.request<string>(
          'GET',
          `/repositories/${workspace}/${repo}/src/${encodeRef(ref)}/${encodePath(args.path)}`,
          { raw: true }
        );
        return textResult(content);
      })
  );

  server.registerTool(
    'list_directory',
    {
      title: 'List directory',
      description: 'List files and subdirectories at a path and ref.',
      inputSchema: {
        ...targetShape,
        path: z.string().optional().describe('Directory path. Defaults to repo root.'),
        ref: z.string().optional().describe('Branch, tag or commit. Defaults to main branch.'),
        ...paginationShape,
      },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const ref = await resolveRef(ctx.client, workspace, repo, args.ref);
        const dir = args.path ? `${encodePath(args.path)}/` : '';
        const page = await ctx.client.paginate<any>(
          `/repositories/${workspace}/${repo}/src/${encodeRef(ref)}/${dir}`,
          { cap: args.limit ?? 100 }
        );
        return jsonResult({
          ref,
          values: page.values.map((e) => ({
            path: e.path,
            type: e.type,
            size: e.size,
            commit: e.commit?.hash,
          })),
          next: page.next,
        });
      })
  );
}
