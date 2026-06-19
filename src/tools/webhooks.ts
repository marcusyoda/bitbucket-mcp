import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveTarget } from '../config.js';
import { assertConfirmed, assertWritable } from '../guard.js';
import { execute, jsonResult, textResult, type Ctx } from '../lib.js';
import { normalizeWebhook } from '../normalize.js';
import { confirmShape, paginationShape, targetShape } from '../schemas.js';

export function registerWebhookTools(server: McpServer, ctx: Ctx): void {
  const hooks = (ws: string, repo: string) => `/repositories/${ws}/${repo}/hooks`;
  const uid = (u: string) => encodeURIComponent(u);

  server.registerTool(
    'list_webhooks',
    {
      title: 'List webhooks',
      description: 'List repository webhooks.',
      inputSchema: { ...targetShape, ...paginationShape },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const page = await ctx.client.paginate(hooks(workspace, repo), { cap: args.limit });
        return jsonResult(page.values.map(normalizeWebhook));
      })
  );

  server.registerTool(
    'get_webhook',
    {
      title: 'Get webhook',
      description: 'Return details of a single webhook.',
      inputSchema: { ...targetShape, webhook_uid: z.string() },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const data = await ctx.client.request(
          'GET',
          `${hooks(workspace, repo)}/${uid(args.webhook_uid)}`
        );
        return jsonResult(normalizeWebhook(data));
      })
  );

  server.registerTool(
    'create_webhook',
    {
      title: 'Create webhook',
      description: 'Create a repository webhook.',
      inputSchema: {
        ...targetShape,
        url: z.string().url().describe('Endpoint URL to receive events.'),
        events: z
          .array(z.string())
          .describe('Event keys, e.g. ["repo:push","pullrequest:created"].'),
        description: z.string().optional(),
        active: z.boolean().optional().describe('Defaults to true.'),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'create_webhook');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const data = await ctx.client.request('POST', hooks(workspace, repo), {
          body: {
            url: args.url,
            events: args.events,
            description: args.description ?? 'Created via bitbucket-mcp',
            active: args.active ?? true,
          },
        });
        return jsonResult(normalizeWebhook(data));
      })
  );

  server.registerTool(
    'update_webhook',
    {
      title: 'Update webhook',
      description: 'Update a repository webhook.',
      inputSchema: {
        ...targetShape,
        webhook_uid: z.string(),
        url: z.string().url().optional(),
        events: z.array(z.string()).optional(),
        description: z.string().optional(),
        active: z.boolean().optional(),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'update_webhook');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const body: Record<string, unknown> = {};
        if (args.url !== undefined) body.url = args.url;
        if (args.events !== undefined) body.events = args.events;
        if (args.description !== undefined) body.description = args.description;
        if (args.active !== undefined) body.active = args.active;
        const data = await ctx.client.request(
          'PUT',
          `${hooks(workspace, repo)}/${uid(args.webhook_uid)}`,
          { body }
        );
        return jsonResult(normalizeWebhook(data));
      })
  );

  server.registerTool(
    'delete_webhook',
    {
      title: 'Delete webhook',
      description: 'Delete a repository webhook. Destructive: needs confirm:true.',
      inputSchema: { ...targetShape, webhook_uid: z.string(), ...confirmShape },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'delete_webhook');
        assertConfirmed(args.confirm, 'delete_webhook');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        await ctx.client.request('DELETE', `${hooks(workspace, repo)}/${uid(args.webhook_uid)}`);
        return textResult(`Webhook ${args.webhook_uid} deleted.`);
      })
  );
}
