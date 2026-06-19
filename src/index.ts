import { fileURLToPath } from 'node:url';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Load .env from the package root if present. Lets the token live only in a
// gitignored .env instead of the Claude Code config. Explicit process env that
// is already set is left untouched.
try {
  const envPath = fileURLToPath(new URL('../.env', import.meta.url));
  process.loadEnvFile(envPath);
} catch {
  // No .env file: rely on the environment passed by the launcher.
}

import { BitbucketClient } from './client.js';
import { loadConfig } from './config.js';
import type { Ctx } from './lib.js';
import { registerBranchTools } from './tools/branches.js';
import { registerCommentTools } from './tools/comments.js';
import { registerGitTools } from './tools/git.js';
import { registerPipelineTools } from './tools/pipelines.js';
import { registerPullRequestTools } from './tools/pullRequests.js';
import { registerRepoTools } from './tools/repo.js';
import { registerSourceTools } from './tools/source.js';
import { registerVariableTools } from './tools/variables.js';
import { registerWebhookTools } from './tools/webhooks.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx: Ctx = { client: new BitbucketClient(config), config };

  const server = new McpServer({ name: 'bitbucket-mcp', version: '0.1.0' });

  registerRepoTools(server, ctx);
  registerPullRequestTools(server, ctx);
  registerCommentTools(server, ctx);
  registerBranchTools(server, ctx);
  registerSourceTools(server, ctx);
  registerGitTools(server, ctx);
  registerPipelineTools(server, ctx);
  registerVariableTools(server, ctx);
  registerWebhookTools(server, ctx);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Diagnostics go to stderr; stdout is reserved for the MCP protocol.
  console.error(
    `bitbucket-mcp ready (workspace=${config.workspace}, read_only=${config.readOnly}).`
  );
}

main().catch((err: unknown) => {
  console.error('bitbucket-mcp failed to start:', err instanceof Error ? err.message : err);
  process.exit(1);
});
