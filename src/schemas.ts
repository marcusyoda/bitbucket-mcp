/**
 * Reusable zod shape fragments shared across tool input schemas.
 * These are raw shapes (objects of zod types) so they can be spread into
 * each tool's `inputSchema`.
 */

import { z } from 'zod';

export const targetShape = {
  workspace: z
    .string()
    .optional()
    .describe('Workspace slug. Defaults to BITBUCKET_WORKSPACE.'),
  repo: z.string().optional().describe('Repo slug. Defaults to BITBUCKET_DEFAULT_REPO.'),
};

export const paginationShape = {
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .describe('Max items to return (default 50, hard cap 100).'),
};

export const confirmShape = {
  confirm: z
    .boolean()
    .optional()
    .describe('Must be true to run this destructive action.'),
};
