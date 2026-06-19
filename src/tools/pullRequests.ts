import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveTarget } from '../config.js';
import { assertConfirmed, assertWritable } from '../guard.js';
import { execute, jsonResult, textResult, type Ctx } from '../lib.js';
import { normalizeComment, normalizePr, normalizeUser } from '../normalize.js';
import { confirmShape, paginationShape, targetShape } from '../schemas.js';

const PR_STATE = z.enum(['OPEN', 'MERGED', 'DECLINED', 'SUPERSEDED']);

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeActivity(a: any) {
  if (a.approval) {
    return { type: 'approval', user: normalizeUser(a.approval.user), date: a.approval.date };
  }
  if (a.changes_requested) {
    return {
      type: 'changes_requested',
      user: normalizeUser(a.changes_requested.user),
      date: a.changes_requested.date,
    };
  }
  if (a.update) {
    return {
      type: 'update',
      author: normalizeUser(a.update.author),
      state: a.update.state,
      title: a.update.title,
      date: a.update.date,
    };
  }
  if (a.comment) {
    return { type: 'comment', ...normalizeComment(a.comment) };
  }
  return { type: 'unknown', keys: Object.keys(a) };
}

export function registerPullRequestTools(server: McpServer, ctx: Ctx): void {
  const base = (ws: string, repo: string) => `/repositories/${ws}/${repo}/pullrequests`;

  server.registerTool(
    'list_pull_requests',
    {
      title: 'List pull requests',
      description: 'List pull requests, optionally filtered by state or a query.',
      inputSchema: {
        ...targetShape,
        state: PR_STATE.optional().describe('Defaults to OPEN when omitted.'),
        query: z.string().optional().describe('BBQL filter, e.g. author.nickname="foo".'),
        ...paginationShape,
      },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const page = await ctx.client.paginate(base(workspace, repo), {
          query: { state: args.state ?? 'OPEN', q: args.query },
          cap: args.limit,
        });
        return jsonResult({
          values: page.values.map(normalizePr),
          next: page.next,
          size: page.size,
        });
      })
  );

  server.registerTool(
    'get_pull_request',
    {
      title: 'Get pull request',
      description: 'Return details of a single pull request.',
      inputSchema: { ...targetShape, id: z.number().int().describe('Pull request id.') },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const pr = await ctx.client.request('GET', `${base(workspace, repo)}/${args.id}`);
        return jsonResult(normalizePr(pr));
      })
  );

  server.registerTool(
    'get_pull_request_diff',
    {
      title: 'Get pull request diff',
      description: 'Return the raw unified diff, or a diffstat summary.',
      inputSchema: {
        ...targetShape,
        id: z.number().int(),
        diffstat: z.boolean().optional().describe('Return file-level stats instead of raw diff.'),
      },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        if (args.diffstat) {
          const page = await ctx.client.paginate(`${base(workspace, repo)}/${args.id}/diffstat`, {
            cap: 100,
          });
          return jsonResult(page.values);
        }
        const diff = await ctx.client.request<string>(
          'GET',
          `${base(workspace, repo)}/${args.id}/diff`,
          { raw: true }
        );
        return textResult(diff);
      })
  );

  server.registerTool(
    'get_pull_request_activity',
    {
      title: 'Get pull request activity',
      description: 'Return the activity log (approvals, updates, comments) of a PR.',
      inputSchema: { ...targetShape, id: z.number().int(), ...paginationShape },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const page = await ctx.client.paginate(`${base(workspace, repo)}/${args.id}/activity`, {
          cap: args.limit,
        });
        return jsonResult(page.values.map(normalizeActivity));
      })
  );

  server.registerTool(
    'create_pull_request',
    {
      title: 'Create pull request',
      description: 'Open a new pull request.',
      inputSchema: {
        ...targetShape,
        title: z.string(),
        source_branch: z.string().describe('Source branch name.'),
        destination_branch: z.string().optional().describe('Defaults to the repo main branch.'),
        description: z.string().optional(),
        reviewers: z
          .array(z.string())
          .optional()
          .describe('Reviewer account_ids.'),
        close_source_branch: z.boolean().optional(),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'create_pull_request');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const body: Record<string, unknown> = {
          title: args.title,
          source: { branch: { name: args.source_branch } },
          close_source_branch: args.close_source_branch,
        };
        if (args.destination_branch) {
          body.destination = { branch: { name: args.destination_branch } };
        }
        if (args.description) body.summary = { raw: args.description };
        if (args.reviewers?.length) {
          body.reviewers = args.reviewers.map((account_id) => ({ account_id }));
        }
        const pr = await ctx.client.request('POST', base(workspace, repo), { body });
        return jsonResult(normalizePr(pr));
      })
  );

  server.registerTool(
    'update_pull_request',
    {
      title: 'Update pull request',
      description: 'Edit title, description, destination branch or reviewers of a PR.',
      inputSchema: {
        ...targetShape,
        id: z.number().int(),
        title: z.string().optional(),
        description: z.string().optional(),
        destination_branch: z.string().optional(),
        reviewers: z.array(z.string()).optional().describe('Reviewer account_ids (replaces set).'),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'update_pull_request');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const body: Record<string, unknown> = {};
        if (args.title !== undefined) body.title = args.title;
        if (args.description !== undefined) body.summary = { raw: args.description };
        if (args.destination_branch) {
          body.destination = { branch: { name: args.destination_branch } };
        }
        if (args.reviewers) {
          body.reviewers = args.reviewers.map((account_id) => ({ account_id }));
        }
        const pr = await ctx.client.request('PUT', `${base(workspace, repo)}/${args.id}`, { body });
        return jsonResult(normalizePr(pr));
      })
  );

  server.registerTool(
    'approve_pull_request',
    {
      title: 'Approve pull request',
      description: 'Approve a pull request as the authenticated user.',
      inputSchema: { ...targetShape, id: z.number().int() },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'approve_pull_request');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const res = await ctx.client.request('POST', `${base(workspace, repo)}/${args.id}/approve`);
        return jsonResult(res);
      })
  );

  server.registerTool(
    'unapprove_pull_request',
    {
      title: 'Remove pull request approval',
      description: 'Withdraw your approval from a pull request.',
      inputSchema: { ...targetShape, id: z.number().int() },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'unapprove_pull_request');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        await ctx.client.request('DELETE', `${base(workspace, repo)}/${args.id}/approve`);
        return textResult(`Approval removed from PR #${args.id}.`);
      })
  );

  server.registerTool(
    'request_changes_pull_request',
    {
      title: 'Request changes on a pull request',
      description: 'Mark a PR as requesting changes, or remove that mark with remove:true.',
      inputSchema: {
        ...targetShape,
        id: z.number().int(),
        remove: z.boolean().optional().describe('Remove a previous request-changes.'),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'request_changes_pull_request');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const path = `${base(workspace, repo)}/${args.id}/request-changes`;
        if (args.remove) {
          await ctx.client.request('DELETE', path);
          return textResult(`Request-changes removed from PR #${args.id}.`);
        }
        const res = await ctx.client.request('POST', path);
        return jsonResult(res);
      })
  );

  server.registerTool(
    'decline_pull_request',
    {
      title: 'Decline pull request',
      description: 'Decline (reject) a pull request. Destructive: needs confirm:true.',
      inputSchema: {
        ...targetShape,
        id: z.number().int(),
        message: z.string().optional(),
        ...confirmShape,
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'decline_pull_request');
        assertConfirmed(args.confirm, 'decline_pull_request');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const res = await ctx.client.request('POST', `${base(workspace, repo)}/${args.id}/decline`, {
          body: args.message ? { message: args.message } : undefined,
        });
        return jsonResult(normalizePr(res));
      })
  );

  server.registerTool(
    'merge_pull_request',
    {
      title: 'Merge pull request',
      description: 'Merge a pull request. Destructive: needs confirm:true.',
      inputSchema: {
        ...targetShape,
        id: z.number().int(),
        merge_strategy: z
          .enum(['merge_commit', 'squash', 'fast_forward'])
          .optional()
          .describe('Defaults to the repo setting.'),
        message: z.string().optional(),
        close_source_branch: z.boolean().optional(),
        ...confirmShape,
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'merge_pull_request');
        assertConfirmed(args.confirm, 'merge_pull_request');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const body: Record<string, unknown> = {};
        if (args.merge_strategy) body.merge_strategy = args.merge_strategy;
        if (args.message) body.message = args.message;
        if (args.close_source_branch !== undefined) {
          body.close_source_branch = args.close_source_branch;
        }
        const res = await ctx.client.request('POST', `${base(workspace, repo)}/${args.id}/merge`, {
          body: Object.keys(body).length ? body : undefined,
        });
        return jsonResult(normalizePr(res));
      })
  );

  server.registerTool(
    'list_pr_commits',
    {
      title: 'List pull request commits',
      description:
        'List the commits of a PR, newest first. Use to find what landed since a ' +
        'given date (e.g. your last review comment) and to get hashes for get_diff.',
      inputSchema: { ...targetShape, id: z.number().int(), ...paginationShape },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const page = await ctx.client.paginate<{
          hash?: string;
          message?: string;
          date?: string;
          author?: { user?: unknown; raw?: string };
        }>(`${base(workspace, repo)}/${args.id}/commits`, { cap: args.limit });
        return jsonResult(
          page.values.map((c) => ({
            hash: c.hash,
            message: (c.message ?? '').split('\n')[0],
            date: c.date,
            author: c.author?.user ? normalizeUser(c.author.user) : c.author?.raw,
          }))
        );
      })
  );

  server.registerTool(
    'get_diff',
    {
      title: 'Get diff between two refs',
      description:
        'Raw unified diff for a Bitbucket diff spec, e.g. "<newHash>..<oldHash>". ' +
        'Prefer commit hashes (branch names with slashes are ambiguous in the spec). ' +
        'Use to see what changed between your last review and the current head.',
      inputSchema: {
        ...targetShape,
        spec: z.string().describe('Diff spec, e.g. 163ee0e..98d7ea7 (new..old).'),
      },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const diff = await ctx.client.request<string>(
          'GET',
          `/repositories/${workspace}/${repo}/diff/${encodeURIComponent(args.spec)}`,
          { raw: true }
        );
        return textResult(diff || '(no differences)');
      })
  );
}
