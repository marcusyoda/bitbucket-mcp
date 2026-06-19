# Permissões (scopes) do token Bitbucket

Este documento lista cada scope que o `bitbucket-mcp` usa, pra que serve, e o que
foi deliberadamente **deixado de fora** por risco. **Manter à risca.** Não adicionar
scope novo sem decisão humana explícita registrada aqui.

O token é um **Atlassian API token com scopes** (id.atlassian.com → Security → API
tokens), usado em Basic auth `email:token`. App passwords estão em EOL, não usar.

## Scopes concedidos (8)

| Scope | Pra que usamos | Tools que dependem |
|-------|----------------|--------------------|
| `read:account` | Validar autenticação e identidade da conta | `get_current_user` |
| `read:repository:bitbucket` | Ler código-fonte, listar branches, ler repo, ler `bitbucket-pipelines.yml`, comparar config | `get_repository`, `list_repositories`, `list_branches`, `get_branch`, `get_file_source`, `list_directory` |
| `write:repository:bitbucket` | Criar branch via API quando pedido | `create_branch` (e tecnicamente `delete_branch`, ver abaixo) |
| `read:pullrequest:bitbucket` | Ler PRs, diffs, comentários (inclui CodeRabbit e outros devs), activity | `list_pull_requests`, `get_pull_request`, `get_pull_request_diff`, `get_pull_request_activity`, `list_pr_comments` |
| `write:pullrequest:bitbucket` | Revisar: aprovar, desaprovar, request-changes, recusar, mesclar, comentar e responder | `approve_pull_request`, `unapprove_pull_request`, `request_changes_pull_request`, `decline_pull_request`, `merge_pull_request`, `add_pr_comment`, `reply_pr_comment`, `update_pr_comment`, `delete_pr_comment`, `resolve_comment` |
| `read:pipeline:bitbucket` | Ler pipelines, steps e logs | `list_pipelines`, `get_pipeline`, `get_pipeline_steps`, `get_pipeline_step_log` |
| `write:pipeline:bitbucket` | Disparar pipeline (default/branch e custom, com variáveis de run) e parar | `trigger_pipeline`, `stop_pipeline` |

Webhooks são opcionais: só conceder `read:webhook:bitbucket` + `write:webhook:bitbucket`
se for de fato gerenciar webhooks (`list/get/create/update/delete_webhook`).

## Scopes NÃO concedidos (proposital)

| Scope | Por que NÃO |
|-------|-------------|
| `admin:repository:bitbucket` | Grande demais. Liga deletar branch restrictions, apagar config e settings do repo. É o único scope que destravaria as tools de variável (ler/rotacionar variável, drift de deployment), mas o custo é dar poder de admin a um modelo estatístico. Decisão: não conceder por enquanto. |
| `admin:*` (qualquer) | Mesma razão. |
| `delete:*` (se o picker mostrar separado) | Deixar desmarcado é camada extra contra deleção de branch via API. |

Consequência: as tools de variável (`*_variable*`, `list_deployment_*`) retornam **403**
sem admin. É esperado, o resto funciona normal.

## Por que admin é perigoso aqui (e o que mitigaria)

O risco real não é o scope sozinho, é a **superfície de tools**. Este MCP não tem nenhuma
tool que mexe em branch restrictions, settings ou que apaga repo. O admin só destravaria
as tools de variável. Ainda assim foi recusado por: (1) risco de vazamento do token com
poder de admin, (2) escrita errada de variável de produção.

**Design parado, pronto pra revisitar** se um dia quisermos variáveis/drift com segurança:
- `BITBUCKET_ENABLED_GROUPS`: allowlist de grupos de tools (liga só `read,pr,pipeline,variables`).
- `confirm:true` obrigatório em toda escrita de variável (hoje só delete e secured pedem).
- `BITBUCKET_READ_ONLY=true` por padrão: drift e conferência = leitura pura, risco zero;
  escrita ligada só na sessão que rotaciona um token.
- Idealmente conta de serviço/bot dedicada, token com expiração curta.

## Proteção da main/dev (não depende de scope)

Quem barra deletar/forçar `main` e `dev`:
1. **Branch restrictions server-side** no Bitbucket (Repo settings → Branch restrictions). Trava real, ativar lá.
2. Guarda do MCP: `BITBUCKET_PROTECTED_BRANCHES=main,dev` bloqueia `git_push`, `git_rebase`, `delete_branch`, `create_branch` mirando essas branches. Seatbelt do cliente.

Nota: `write:repository:bitbucket` permite deletar branch **não-protegida** via API. O MCP
bloqueia as protegidas e exige `confirm:true` no `delete_branch`. Pra zero deleção, remover
a tool `delete_branch` do server.
