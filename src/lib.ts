/**
 * Shared context and result helpers for tool handlers.
 */

import type { BitbucketClient } from './client.js';
import { BitbucketError } from './client.js';
import type { Config } from './config.js';
import { GuardError } from './guard.js';

export interface Ctx {
  client: BitbucketClient;
  config: Config;
}

export interface ToolResult {
  // Index signature required to satisfy the SDK's CallToolResult shape.
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export function jsonResult(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function errorResult(message: string, detail?: string): ToolResult {
  return {
    content: [{ type: 'text', text: detail ? `${message}\n${detail}` : message }],
    isError: true,
  };
}

/** Run a handler body, mapping known errors to a clean tool error result. */
export async function execute(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof BitbucketError) {
      return errorResult(`Bitbucket API error: ${err.message}`, err.detail);
    }
    if (err instanceof GuardError) {
      return errorResult(err.message);
    }
    return errorResult(err instanceof Error ? err.message : String(err));
  }
}
