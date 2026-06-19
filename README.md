# bitbucket-mcp

MCP server for **Bitbucket Cloud**. Fills the gap left by the official Atlassian
MCP (Jira + Confluence only): pull requests, comments, branches, source, pipelines,
webhooks and pipeline/deployment variables.

Responses are normalized and trimmed to the fields you actually need, so the
context cost is far lower than raw REST calls.

## Requirements

- Node >= 20
- pnpm
- An SSH key registered on Bitbucket (used by `clone_repo`)
- A scoped Atlassian API token

## Install & build

```bash
pnpm install
pnpm build
```

## Auth

Auth is HTTP Basic with `email:api_token`. Create a scoped API token at
**id.atlassian.com → Manage account → Security → API tokens**.

Token scopes (granular picker; create only what you use):

| Capability | Scopes |
|------------|--------|
| Verify auth / identity | `read:account` |
| Read source, branches, repo | `read:repository:bitbucket` |
| Create branches (API) | `write:repository:bitbucket` |
| Review/approve/decline/merge PRs + comments | `read:pullrequest:bitbucket`, `write:pullrequest:bitbucket` |
| Pipelines (read, trigger, stop) | `read:pipeline:bitbucket`, `write:pipeline:bitbucket` |
| Webhooks | `read:webhook:bitbucket`, `write:webhook:bitbucket` |
| (optional) Read pipeline/deployment variables | `admin:repository:bitbucket` |

The variable tools (`*_variable*`, `list_deployment_*`) need `admin:repository:bitbucket`.
Skipping that scope is fine: those tools simply return a 403 and everything else works.
`git_commit`/`git_rebase`/`git_push`/`clone_repo` use your **SSH key**, not the token.

Copy `.env.example` to `.env` for local runs (never commit it).

| Env var | Purpose |
|---------|---------|
| `BITBUCKET_EMAIL` | Atlassian account email |
| `BITBUCKET_API_TOKEN` | Scoped API token |
| `BITBUCKET_WORKSPACE` | Workspace slug (required) |
| `BITBUCKET_DEFAULT_REPO` | Optional. Unset = `repo` required on every call |
| `BITBUCKET_READ_ONLY` | `true` blocks every write/destructive tool |
| `BITBUCKET_PROTECTED_BRANCHES` | Comma-separated, default `main,dev` |

## Register in Claude Code

`.mcp.json` in a project (or user settings):

```json
{
  "mcpServers": {
    "bitbucket": {
      "command": "node",
      "args": ["/abs/path/to/bitbucket-mcp/dist/index.js"],
      "env": {
        "BITBUCKET_EMAIL": "you@example.com",
        "BITBUCKET_API_TOKEN": "your-token",
        "BITBUCKET_WORKSPACE": "your-workspace",
        "BITBUCKET_DEFAULT_REPO": "your-repo-optional"
      }
    }
  }
}
```

Or via CLI:

```bash
claude mcp add bitbucket \
  --env BITBUCKET_EMAIL=you@example.com \
  --env BITBUCKET_API_TOKEN=your-token \
  --env BITBUCKET_WORKSPACE=your-workspace \
  -- node /abs/path/to/bitbucket-mcp/dist/index.js
```

## Safety model

- `BITBUCKET_READ_ONLY=true` blocks every write/destructive tool before it hits the API.
- Destructive tools (`merge`, `decline`, `delete_*`, `stop_pipeline`) require `confirm: true`.
- Creating a `secured` variable also requires `confirm: true`.
- Secured variable values are write-only in the API and are never returned or logged.
- **Protected branches** (`BITBUCKET_PROTECTED_BRANCHES`, default `main,dev`) are hard-blocked
  from direct mutation: `git_push`, `git_rebase` (when checked out), `delete_branch` and
  `create_branch` refuse to target them, even with `confirm`. Land changes there via a PR
  (`merge_pull_request` into a protected branch is allowed with `confirm: true`).

## Tools

Every tool accepts optional `workspace` and `repo` to override the env defaults.

**Repo / meta:** `get_current_user`, `list_repositories`, `get_repository`

**Pull requests:** `list_pull_requests`, `get_pull_request`, `get_pull_request_diff`,
`get_pull_request_activity`, `create_pull_request`, `update_pull_request`,
`approve_pull_request`, `unapprove_pull_request`, `request_changes_pull_request`,
`decline_pull_request` *(confirm)*, `merge_pull_request` *(confirm)*, `list_pr_commits`,
`get_diff`

**Comments:** `list_pr_comments`, `add_pr_comment` *(inline needs confirm; Portuguese +
Conventional Comments)*, `reply_pr_comment`, `update_pr_comment`,
`delete_pr_comment` *(confirm)*, `resolve_comment`, `react_pr_comment` *(experimental)*

**Branches / source / git:** `list_branches`, `get_branch`, `create_branch`,
`delete_branch` *(confirm)*, `get_file_source`, `list_directory`, `clone_repo`,
`git_commit` *(confirm)*, `git_rebase`, `git_push` *(confirm; all refuse protected branches)*

**Pipelines:** `list_pipelines`, `get_pipeline`, `get_pipeline_steps`,
`get_pipeline_step_log`, `trigger_pipeline`, `stop_pipeline` *(confirm)*

**Variables:** `list_repo_pipeline_variables`, `upsert_repo_pipeline_variable`,
`delete_repo_pipeline_variable` *(confirm)*, `list_workspace_variables`,
`list_deployment_environments`, `list_deployment_variables`,
`upsert_deployment_variable`, `delete_deployment_variable` *(confirm)*

**Webhooks:** `list_webhooks`, `get_webhook`, `create_webhook`, `update_webhook`,
`delete_webhook` *(confirm)*

## Known limitations

- **`react_pr_comment` is experimental.** Emoji reactions on PR comments are
  documented for Bitbucket Data Center, not Cloud. The tool targets a best-effort
  endpoint and may return an error if your workspace does not support it.
- **`resolve_comment`** depends on comment-thread resolution being available for
  the repo.

## Develop

```bash
pnpm dev         # tsx watch
pnpm typecheck
pnpm inspect     # build + MCP Inspector
```
