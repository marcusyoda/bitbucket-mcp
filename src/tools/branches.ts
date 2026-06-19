import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveTarget } from '../config.js';
import { assertConfirmed, assertNotProtected, assertWritable } from '../guard.js';
import { execute, jsonResult, textResult, type Ctx } from '../lib.js';
import { normalizeBranch } from '../normalize.js';
import { confirmShape, paginationShape, targetShape } from '../schemas.js';

export function registerBranchTools(server: McpServer, ctx: Ctx): void {
  const refs = (ws: string, repo: string) => `/repositories/${ws}/${repo}/refs/branches`;

  server.registerTool(
    'list_branches',
    {
      title: 'List branches',
      description: 'List branches in a repository.',
      inputSchema: {
        ...targetShape,
        query: z.string().optional().describe('BBQL filter, e.g. name ~ "feature".'),
        ...paginationShape,
      },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const page = await ctx.client.paginate(refs(workspace, repo), {
          query: { q: args.query, sort: '-target.date' },
          cap: args.limit,
        });
        return jsonResult({
          values: page.values.map(normalizeBranch),
          next: page.next,
          size: page.size,
        });
      })
  );

  server.registerTool(
    'get_branch',
    {
      title: 'Get branch',
      description: 'Return details of a single branch.',
      inputSchema: { ...targetShape, name: z.string() },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const data = await ctx.client.request(
          'GET',
          `${refs(workspace, repo)}/${encodeURIComponent(args.name)}`
        );
        return jsonResult(normalizeBranch(data));
      })
  );

  server.registerTool(
    'create_branch',
    {
      title: 'Create branch',
      description: 'Create a branch pointing at a commit hash or existing branch name.',
      inputSchema: {
        ...targetShape,
        name: z.string().describe('New branch name.'),
        target: z.string().describe('Commit hash or branch name to branch from.'),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'create_branch');
        assertNotProtected(ctx.config, args.name, 'create_branch');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const data = await ctx.client.request('POST', refs(workspace, repo), {
          body: { name: args.name, target: { hash: args.target } },
        });
        return jsonResult(normalizeBranch(data));
      })
  );

  server.registerTool(
    'delete_branch',
    {
      title: 'Delete branch',
      description: 'Delete a branch. Destructive: needs confirm:true.',
      inputSchema: { ...targetShape, name: z.string(), ...confirmShape },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'delete_branch');
        assertNotProtected(ctx.config, args.name, 'delete_branch');
        assertConfirmed(args.confirm, 'delete_branch');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        await ctx.client.request(
          'DELETE',
          `${refs(workspace, repo)}/${encodeURIComponent(args.name)}`
        );
        return textResult(`Branch "${args.name}" deleted.`);
      })
  );
}
