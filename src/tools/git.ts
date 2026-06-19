import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { resolveTarget } from '../config.js';
import { assertConfirmed, assertNotProtected, assertWritable } from '../guard.js';
import { execute, textResult, type Ctx } from '../lib.js';
import { targetShape } from '../schemas.js';

const execFileAsync = promisify(execFile);

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

/** Run git, surfacing stderr on failure so conflicts/auth errors are visible. */
async function runGit(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return (stdout + stderr).trim();
  } catch (err) {
    const e = err as ExecError;
    throw new Error([e.message, e.stdout, e.stderr].filter(Boolean).join('\n').trim());
  }
}

async function currentBranch(dir: string): Promise<string> {
  return (await runGit(['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'])).trim();
}

export function registerGitTools(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'clone_repo',
    {
      title: 'Clone repository (SSH)',
      description:
        'Clone a repository to a local path over SSH using the existing SSH key. ' +
        'Reads from Bitbucket; ignores READ_ONLY (no remote mutation).',
      inputSchema: {
        ...targetShape,
        dest: z.string().describe('Local destination directory.'),
        branch: z.string().optional().describe('Single branch to clone.'),
        depth: z.number().int().positive().optional().describe('Shallow clone depth.'),
      },
    },
    (args) =>
      execute(async () => {
        const { workspace, repo } = resolveTarget(ctx.config, args);
        const url = `git@bitbucket.org:${workspace}/${repo}.git`;
        const cmdArgs = ['clone'];
        if (args.branch) cmdArgs.push('--branch', args.branch, '--single-branch');
        if (args.depth) cmdArgs.push('--depth', String(args.depth));
        cmdArgs.push(url, args.dest);
        const out = await runGit(cmdArgs);
        return textResult(`Cloned ${url} -> ${args.dest}\n${out || 'done.'}`);
      })
  );

  server.registerTool(
    'git_rebase',
    {
      title: 'Rebase local branch',
      description:
        'Rebase the checked-out branch onto a ref in a local clone. Blocked when the ' +
        'current branch is protected (main/dev). On conflict it aborts and reports.',
      inputSchema: {
        repo_dir: z.string().describe('Path to the local clone.'),
        onto: z.string().describe('Ref to rebase onto, e.g. origin/main.'),
      },
    },
    (args) =>
      execute(async () => {
        const branch = await currentBranch(args.repo_dir);
        assertNotProtected(ctx.config, branch, 'git_rebase (would rewrite this branch)');
        try {
          const out = await runGit(['-C', args.repo_dir, 'rebase', args.onto]);
          return textResult(`Rebased ${branch} onto ${args.onto}\n${out}`);
        } catch (err) {
          // Leave the working tree clean on conflict instead of mid-rebase.
          await runGit(['-C', args.repo_dir, 'rebase', '--abort']).catch(() => undefined);
          throw new Error(
            `Rebase of ${branch} onto ${args.onto} hit conflicts and was aborted.\n` +
              (err instanceof Error ? err.message : String(err))
          );
        }
      })
  );

  server.registerTool(
    'git_commit',
    {
      title: 'Stage and commit',
      description:
        'Stage changes and commit in a local clone. Always needs confirm:true. ' +
        'Blocked when the current branch is protected (main/dev). ' +
        'Commit messages must avoid em dashes.',
      inputSchema: {
        repo_dir: z.string().describe('Path to the local clone.'),
        message: z.string().describe('Commit message.'),
        add_all: z.boolean().optional().describe('Stage all changes first (default true).'),
        confirm: z.boolean().optional().describe('Required (true) to commit.'),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'git_commit');
        assertConfirmed(args.confirm, 'git_commit');
        const branch = await currentBranch(args.repo_dir);
        assertNotProtected(ctx.config, branch, 'git_commit');
        if (args.add_all !== false) await runGit(['-C', args.repo_dir, 'add', '-A']);
        const out = await runGit(['-C', args.repo_dir, 'commit', '-m', args.message]);
        return textResult(`Committed on ${branch}\n${out}`);
      })
  );

  server.registerTool(
    'git_push',
    {
      title: 'Push local branch',
      description:
        'Push a branch to origin over SSH. Always needs confirm:true. Hard-blocked ' +
        'for protected branches (main/dev). Force push needs confirm and is still ' +
        'blocked for protected.',
      inputSchema: {
        repo_dir: z.string().describe('Path to the local clone.'),
        branch: z.string().optional().describe('Branch to push. Defaults to current.'),
        force: z.boolean().optional().describe('Force push (--force-with-lease).'),
        confirm: z.boolean().optional().describe('Required (true) to push.'),
      },
    },
    (args) =>
      execute(async () => {
        assertWritable(ctx.config, 'git_push');
        assertConfirmed(args.confirm, 'git_push');
        const branch = args.branch?.trim() || (await currentBranch(args.repo_dir));
        assertNotProtected(ctx.config, branch, 'git_push');
        const cmdArgs = ['-C', args.repo_dir, 'push', 'origin', branch];
        if (args.force) cmdArgs.push('--force-with-lease');
        const out = await runGit(cmdArgs);
        return textResult(`Pushed ${branch} to origin${args.force ? ' (forced)' : ''}\n${out}`);
      })
  );
}
