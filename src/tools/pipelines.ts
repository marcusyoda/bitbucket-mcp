import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveTarget } from '../config.js';
import { assertConfirmed, assertWritable } from '../guard.js';
import { execute, jsonResult, textResult, type Ctx } from '../lib.js';
import { normalizePipeline, normalizePipelineStep } from '../normalize.js';
import { confirmShape, paginationShape, targetShape } from '../schemas.js';

export function registerPipelineTools(server: McpServer, ctx: Ctx): void {
  const base = (ws: string, repo: string) => `/repositories/${ws}/${repo}/pipelines`;
  const uuid = (u: string) => encodeURIComponent(u);

  server.registerTool(
    'list_pipelines',
    {
      title: 'List pipelines',
      description: 'List recent pipeline runs, newest first.',
      inputSchema: { ...targetShape, ...paginationShape },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const page = await ctx.client.paginate(`${base(workspace, repo)}/`, {
          query: { sort: '-created_on' },
          cap: args.limit,
        });
        return jsonResult({
          values: page.values.map(normalizePipeline),
          next: page.next,
          size: page.size,
        });
      })
  );

  server.registerTool(
    'get_pipeline',
    {
      title: 'Get pipeline',
      description: 'Return details of a single pipeline run by uuid.',
      inputSchema: { ...targetShape, pipeline_uuid: z.string() },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const data = await ctx.client.request(
          'GET',
          `${base(workspace, repo)}/${uuid(args.pipeline_uuid)}`
        );
        return jsonResult(normalizePipeline(data));
      })
  );

  server.registerTool(
    'get_pipeline_steps',
    {
      title: 'Get pipeline steps',
      description: 'List the steps of a pipeline run.',
      inputSchema: { ...targetShape, pipeline_uuid: z.string() },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const page = await ctx.client.paginate(
          `${base(workspace, repo)}/${uuid(args.pipeline_uuid)}/steps/`,
          { cap: 100 }
        );
        return jsonResult(page.values.map(normalizePipelineStep));
      })
  );

  server.registerTool(
    'get_pipeline_step_log',
    {
      title: 'Get pipeline step log',
      description: 'Return the raw log of a pipeline step.',
      inputSchema: { ...targetShape, pipeline_uuid: z.string(), step_uuid: z.string() },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const log = await ctx.client.request<string>(
          'GET',
          `${base(workspace, repo)}/${uuid(args.pipeline_uuid)}/steps/${uuid(args.step_uuid)}/log`,
          { raw: true }
        );
        return textResult(log || '(empty log)');
      })
  );

  server.registerTool(
    'trigger_pipeline',
    {
      title: 'Trigger pipeline',
      description:
        'Run a pipeline for a branch (or tag), like the UI. Omit custom_pipeline to run ' +
        'the default/branch pipeline; set it to run a custom one. For custom pipelines, ' +
        'pass the variables it declares (read them from bitbucket-pipelines.yml first).',
      inputSchema: {
        ...targetShape,
        ref_name: z.string().describe('Branch (or tag) name to run against.'),
        ref_type: z.enum(['branch', 'tag']).optional().describe('Defaults to branch.'),
        custom_pipeline: z
          .string()
          .optional()
          .describe('Name of a custom pipeline defined in bitbucket-pipelines.yml.'),
        variables: z
          .array(
            z.object({
              key: z.string(),
              value: z.string(),
              secured: z.boolean().optional(),
            })
          )
          .optional()
          .describe('Variables passed to this run (mainly for custom pipelines).'),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'trigger_pipeline');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const target: Record<string, unknown> = {
          type: 'pipeline_ref_target',
          ref_type: args.ref_type ?? 'branch',
          ref_name: args.ref_name,
        };
        if (args.custom_pipeline) {
          target.selector = { type: 'custom', pattern: args.custom_pipeline };
        }
        const body: Record<string, unknown> = { target };
        if (args.variables?.length) body.variables = args.variables;
        const data = await ctx.client.request('POST', `${base(workspace, repo)}/`, { body });
        return jsonResult(normalizePipeline(data));
      })
  );

  server.registerTool(
    'stop_pipeline',
    {
      title: 'Stop pipeline',
      description: 'Stop a running pipeline. Destructive: needs confirm:true.',
      inputSchema: { ...targetShape, pipeline_uuid: z.string(), ...confirmShape },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'stop_pipeline');
        assertConfirmed(args.confirm, 'stop_pipeline');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        await ctx.client.request(
          'POST',
          `${base(workspace, repo)}/${uuid(args.pipeline_uuid)}/stopPipeline`
        );
        return textResult(`Pipeline ${args.pipeline_uuid} stop requested.`);
      })
  );
}
