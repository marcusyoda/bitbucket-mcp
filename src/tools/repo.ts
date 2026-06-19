import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveTarget } from '../config.js';
import { execute, jsonResult, type Ctx } from '../lib.js';
import { normalizeRepo, normalizeUser } from '../normalize.js';
import { paginationShape, targetShape } from '../schemas.js';

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
        const ws = args.workspace?.trim() || ctx.config.workspace;
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
}
