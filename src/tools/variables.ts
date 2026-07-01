import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { assertWorkspace, resolveTarget } from '../config.js';
import { assertConfirmed, assertWritable } from '../guard.js';
import { execute, jsonResult, textResult, type Ctx } from '../lib.js';
import { normalizeEnvironment, normalizeVariable } from '../normalize.js';
import { confirmShape, paginationShape, targetShape } from '../schemas.js';

const uuid = (u: string) => encodeURIComponent(u);

const variableInput = {
  key: z.string().describe('Variable name.'),
  value: z.string().describe('Variable value. For secured vars it is write-only.'),
  secured: z.boolean().optional().describe('Mark as secret. Creating one needs confirm:true.'),
  variable_uuid: z.string().optional().describe('Provide to update an existing variable.'),
};

export function registerVariableTools(server: McpServer, ctx: Ctx): void {
  const repoVars = (ws: string, repo: string) =>
    `/repositories/${ws}/${repo}/pipelines_config/variables`;
  const deployVars = (ws: string, repo: string, env: string) =>
    `/repositories/${ws}/${repo}/deployments_config/environments/${uuid(env)}/variables`;

  // --- Repo-level pipeline variables ---
  server.registerTool(
    'list_repo_pipeline_variables',
    {
      title: 'List repo pipeline variables',
      description: 'List repository-level pipeline variables. Secured values are not returned.',
      inputSchema: { ...targetShape, ...paginationShape },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const page = await ctx.client.paginate(`${repoVars(workspace, repo)}/`, {
          cap: args.limit,
        });
        return jsonResult(page.values.map(normalizeVariable));
      })
  );

  server.registerTool(
    'upsert_repo_pipeline_variable',
    {
      title: 'Create or update repo pipeline variable',
      description: 'Create (POST) or update (with variable_uuid) a repo pipeline variable.',
      inputSchema: { ...targetShape, ...variableInput, ...confirmShape },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'upsert_repo_pipeline_variable');
        if (args.secured) assertConfirmed(args.confirm, 'create a secured variable');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const body = { key: args.key, value: args.value, secured: args.secured ?? false };
        const res = args.variable_uuid
          ? await ctx.client.request(
              'PUT',
              `${repoVars(workspace, repo)}/${uuid(args.variable_uuid)}`,
              { body }
            )
          : await ctx.client.request('POST', `${repoVars(workspace, repo)}/`, { body });
        return jsonResult(normalizeVariable(res));
      })
  );

  server.registerTool(
    'delete_repo_pipeline_variable',
    {
      title: 'Delete repo pipeline variable',
      description: 'Delete a repo pipeline variable. Destructive: needs confirm:true.',
      inputSchema: { ...targetShape, variable_uuid: z.string(), ...confirmShape },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'delete_repo_pipeline_variable');
        assertConfirmed(args.confirm, 'delete_repo_pipeline_variable');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        await ctx.client.request(
          'DELETE',
          `${repoVars(workspace, repo)}/${uuid(args.variable_uuid)}`
        );
        return textResult(`Repo variable ${args.variable_uuid} deleted.`);
      })
  );

  // --- Workspace-level variables (read) ---
  server.registerTool(
    'list_workspace_variables',
    {
      title: 'List workspace variables',
      description: 'List workspace-level pipeline variables. Secured values are not returned.',
      inputSchema: { workspace: targetShape.workspace, ...paginationShape },
    },
    (args) =>
      execute(async () => {
        const ws = assertWorkspace(ctx.config, args.workspace);
        const page = await ctx.client.paginate(`/workspaces/${ws}/pipelines-config/variables/`, {
          cap: args.limit,
        });
        return jsonResult(page.values.map(normalizeVariable));
      })
  );

  // --- Deployment environments + variables ---
  server.registerTool(
    'list_deployment_environments',
    {
      title: 'List deployment environments',
      description: 'List deployment environments (get the uuid for variable management).',
      inputSchema: { ...targetShape },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const page = await ctx.client.paginate(
          `/repositories/${workspace}/${repo}/environments/`,
          { cap: 100 }
        );
        return jsonResult(page.values.map(normalizeEnvironment));
      })
  );

  server.registerTool(
    'list_deployment_variables',
    {
      title: 'List deployment variables',
      description: 'List variables of a deployment environment. Secured values are not returned.',
      inputSchema: { ...targetShape, environment_uuid: z.string(), ...paginationShape },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const page = await ctx.client.paginate(
          `${deployVars(workspace, repo, args.environment_uuid)}`,
          { cap: args.limit }
        );
        return jsonResult(page.values.map(normalizeVariable));
      })
  );

  server.registerTool(
    'upsert_deployment_variable',
    {
      title: 'Create or update deployment variable',
      description: 'Create (POST) or update (with variable_uuid) a deployment environment variable.',
      inputSchema: {
        ...targetShape,
        environment_uuid: z.string(),
        ...variableInput,
        ...confirmShape,
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'upsert_deployment_variable');
        if (args.secured) assertConfirmed(args.confirm, 'create a secured variable');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const path = deployVars(workspace, repo, args.environment_uuid);
        const body = { key: args.key, value: args.value, secured: args.secured ?? false };
        const res = args.variable_uuid
          ? await ctx.client.request('PUT', `${path}/${uuid(args.variable_uuid)}`, { body })
          : await ctx.client.request('POST', path, { body });
        return jsonResult(normalizeVariable(res));
      })
  );

  server.registerTool(
    'delete_deployment_variable',
    {
      title: 'Delete deployment variable',
      description: 'Delete a deployment environment variable. Destructive: needs confirm:true.',
      inputSchema: {
        ...targetShape,
        environment_uuid: z.string(),
        variable_uuid: z.string(),
        ...confirmShape,
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'delete_deployment_variable');
        assertConfirmed(args.confirm, 'delete_deployment_variable');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        await ctx.client.request(
          'DELETE',
          `${deployVars(workspace, repo, args.environment_uuid)}/${uuid(args.variable_uuid)}`
        );
        return textResult(`Deployment variable ${args.variable_uuid} deleted.`);
      })
  );
}
