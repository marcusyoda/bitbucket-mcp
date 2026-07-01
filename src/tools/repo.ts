import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { assertWorkspace, resolveTarget } from '../config.js';
import { assertConfirmed, assertWritable } from '../guard.js';
import { execute, jsonResult, type Ctx } from '../lib.js';
import { normalizeRepo, normalizeUser } from '../normalize.js';
import { confirmShape, paginationShape, targetShape } from '../schemas.js';

export function registerRepoTools(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'get_current_user',
    {
      title: 'Get current user',
      description: 'Return the authenticated Bitbucket account. Use to verify auth.',
      inputSchema: {},
    },
    () =>
      execute(async () => {
        const user = await ctx.client.request('GET', '/user');
        return jsonResult(normalizeUser(user));
      })
  );

  server.registerTool(
    'list_repositories',
    {
      title: 'List repositories',
      description: 'List repositories in a workspace.',
      inputSchema: {
        workspace: targetShape.workspace,
        query: z
          .string()
          .optional()
          .describe('BBQL filter, e.g. name ~ "super" (passed as q).'),
        ...paginationShape,
      },
    },
    (args) =>
      execute(async () => {
        const ws = assertWorkspace(ctx.config, args.workspace);
        const page = await ctx.client.paginate(`/repositories/${ws}`, {
          query: { q: args.query, sort: '-updated_on' },
          cap: args.limit,
        });
        return jsonResult({
          values: page.values.map(normalizeRepo),
          next: page.next,
          size: page.size,
        });
      })
  );

  server.registerTool(
    'get_repository',
    {
      title: 'Get repository',
      description: 'Return details for a single repository.',
      inputSchema: { ...targetShape },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const data = await ctx.client.request('GET', `/repositories/${workspace}/${repo}`);
        return jsonResult(normalizeRepo(data));
      })
  );

  server.registerTool(
    'create_repository',
    {
      title: 'Create repository',
      description:
        'Create a new Git repository in a workspace. Private by default. Creates external ' +
        'state, so it ALWAYS needs confirm:true and respects BITBUCKET_READ_ONLY. Requires ' +
        'the write:repository scope on the token.',
      inputSchema: {
        repo: z.string().describe('Repository slug to create (lowercase, hyphens).'),
        workspace: targetShape.workspace,
        project_key: z
          .string()
          .optional()
          .describe('Bitbucket project key to place the repo under (e.g. PROJ).'),
        is_private: z.boolean().optional().describe('Private repository (default true).'),
        description: z.string().optional().describe('Repository description.'),
        fork_policy: z
          .enum(['allow_forks', 'no_public_forks', 'no_forks'])
          .optional()
          .describe('Fork policy (default no_forks).'),
        ...confirmShape,
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'create_repository');
        assertConfirmed(args.confirm, 'create_repository');
        const workspace = assertWorkspace(ctx.config, args.workspace);
        const repo = args.repo.trim();
        const body: Record<string, unknown> = {
          scm: 'git',
          is_private: args.is_private !== false,
          fork_policy: args.fork_policy ?? 'no_forks',
        };
        if (args.project_key) body.project = { key: args.project_key };
        if (args.description) body.description = args.description;
        const data = await ctx.client.request(
          'POST',
          `/repositories/${workspace}/${encodeURIComponent(repo)}`,
          { body },
        );
        return jsonResult(normalizeRepo(data));
      })
  );
}
