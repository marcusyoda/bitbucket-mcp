import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveTarget } from '../config.js';
import { assertConfirmed, assertWritable } from '../guard.js';
import { execute, jsonResult, textResult, type Ctx } from '../lib.js';
import { normalizeComment } from '../normalize.js';
import { confirmShape, paginationShape, targetShape } from '../schemas.js';

export function registerCommentTools(server: McpServer, ctx: Ctx): void {
  const commentsBase = (ws: string, repo: string, prId: number) =>
    `/repositories/${ws}/${repo}/pullrequests/${prId}/comments`;

  server.registerTool(
    'list_pr_comments',
    {
      title: 'List PR comments',
      description: 'List comments on a pull request.',
      inputSchema: { ...targetShape, id: z.number().int(), ...paginationShape },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const page = await ctx.client.paginate(commentsBase(workspace, repo, args.id), {
          cap: args.limit,
        });
        return jsonResult({
          values: page.values.map(normalizeComment),
          next: page.next,
          size: page.size,
        });
      })
  );

  server.registerTool(
    'add_pr_comment',
    {
      title: 'Add PR comment',
      description:
        'Add a top-level or inline comment to a pull request. Inline comments ' +
        '(inline_path set) require confirm:true. Write the body in Portuguese and ' +
        'follow Conventional Comments: start with an English label then the body, ' +
        'e.g. "**suggestion (non-blocking):** extrair isto para um helper". ' +
        'Labels: praise, nitpick, suggestion, issue, todo, question, thought, chore, note.',
      inputSchema: {
        ...targetShape,
        id: z.number().int(),
        content: z.string().describe('Comment body, Portuguese, Conventional Comments format.'),
        inline_path: z.string().optional().describe('File path for an inline comment.'),
        inline_to: z.number().int().optional().describe('Line number in the new file.'),
        inline_from: z.number().int().optional().describe('Line number in the old file.'),
        ...confirmShape,
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'add_pr_comment');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const body: Record<string, unknown> = { content: { raw: args.content } };
        if (args.inline_path) {
          assertConfirmed(args.confirm, 'add_pr_comment (inline)');
          body.inline = { path: args.inline_path, to: args.inline_to, from: args.inline_from };
        }
        const res = await ctx.client.request('POST', commentsBase(workspace, repo, args.id), {
          body,
        });
        return jsonResult(normalizeComment(res));
      })
  );

  server.registerTool(
    'reply_pr_comment',
    {
      title: 'Reply to PR comment',
      description: 'Reply to an existing pull request comment.',
      inputSchema: {
        ...targetShape,
        id: z.number().int(),
        parent_id: z.number().int().describe('Id of the comment being replied to.'),
        content: z.string().describe('Reply body (Markdown).'),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'reply_pr_comment');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const res = await ctx.client.request('POST', commentsBase(workspace, repo, args.id), {
          body: { content: { raw: args.content }, parent: { id: args.parent_id } },
        });
        return jsonResult(normalizeComment(res));
      })
  );

  server.registerTool(
    'update_pr_comment',
    {
      title: 'Update PR comment',
      description: 'Edit the body of one of your pull request comments.',
      inputSchema: {
        ...targetShape,
        id: z.number().int(),
        comment_id: z.number().int(),
        content: z.string(),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'update_pr_comment');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const res = await ctx.client.request(
          'PUT',
          `${commentsBase(workspace, repo, args.id)}/${args.comment_id}`,
          { body: { content: { raw: args.content } } }
        );
        return jsonResult(normalizeComment(res));
      })
  );

  server.registerTool(
    'delete_pr_comment',
    {
      title: 'Delete PR comment',
      description: 'Delete a pull request comment. Destructive: needs confirm:true.',
      inputSchema: {
        ...targetShape,
        id: z.number().int(),
        comment_id: z.number().int(),
        ...confirmShape,
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'delete_pr_comment');
        assertConfirmed(args.confirm, 'delete_pr_comment');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        await ctx.client.request(
          'DELETE',
          `${commentsBase(workspace, repo, args.id)}/${args.comment_id}`
        );
        return textResult(`Comment ${args.comment_id} deleted from PR #${args.id}.`);
      })
  );

  server.registerTool(
    'resolve_comment',
    {
      title: 'Resolve or reopen a comment thread',
      description: 'Mark a PR comment thread resolved, or reopen it with unresolve:true.',
      inputSchema: {
        ...targetShape,
        id: z.number().int(),
        comment_id: z.number().int(),
        unresolve: z.boolean().optional(),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'resolve_comment');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const path = `${commentsBase(workspace, repo, args.id)}/${args.comment_id}/resolve`;
        if (args.unresolve) {
          await ctx.client.request('DELETE', path);
          return textResult(`Comment ${args.comment_id} reopened.`);
        }
        const res = await ctx.client.request('POST', path);
        return jsonResult(res);
      })
  );

  server.registerTool(
    'react_pr_comment',
    {
      title: 'React to a PR comment (experimental)',
      description:
        'Add an emoji reaction to a PR comment. Experimental: emoji reactions are not ' +
        'documented for Bitbucket Cloud and may return an error if unsupported.',
      inputSchema: {
        ...targetShape,
        id: z.number().int(),
        comment_id: z.number().int(),
        emoji: z.string().describe('Emoji name, e.g. "heart", "thumbsup".'),
        remove: z.boolean().optional().describe('Remove the reaction instead of adding.'),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'react_pr_comment');
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const path = `${commentsBase(workspace, repo, args.id)}/${args.comment_id}/reactions/${args.emoji}`;
        if (args.remove) {
          await ctx.client.request('DELETE', path);
          return textResult(`Reaction ${args.emoji} removed.`);
        }
        const res = await ctx.client.request('PUT', path);
        return jsonResult(res);
      })
  );
}
