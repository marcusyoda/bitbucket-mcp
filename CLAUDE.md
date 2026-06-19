# CLAUDE.md, bitbucket-mcp

Regras deste projeto. **Seguir à risca.** Ao trabalhar neste repo ou ao operar o MCP
em qualquer projeto, respeitar tudo abaixo.

## O que é

MCP server (TypeScript, ESM, stdio) pro **Bitbucket Cloud**. Existe porque o MCP oficial
da Atlassian cobre só Jira + Confluence, não o Bitbucket.
Dá superfície de tools controlada e payloads enxutos pra PRs, código, branches, pipelines,
webhooks e variáveis, em vez de chamada solta na REST API.

Auth: Atlassian API token scoped, Basic `email:token`. Workspace e repo vêm das env
(`BITBUCKET_WORKSPACE`, `BITBUCKET_DEFAULT_REPO`), sem default embutido.

## Regras de segurança (à risca)

1. **Scopes do token: exatamente os 8 de [PERMISSIONS.md](./PERMISSIONS.md).** Nunca pedir
   nem assumir `admin:*` ou `delete:*` sem decisão humana explícita registrada em PERMISSIONS.md.
   Tools de variável dão 403 sem admin: isso é esperado, não é bug, não tentar contornar.
2. **Branches protegidas (`BITBUCKET_PROTECTED_BRANCHES`, default `main,dev`) nunca são
   mutadas direto.** `git_push`, `git_rebase`, `delete_branch`, `create_branch` recusam mirar
   elas, e confirm NÃO fura isso. Mudança pra main/dev só via PR.
3. **`merge_pull_request` para main/dev é permitido, mas só com `confirm:true`.** É o caminho sancionado.
4. **Ações destrutivas exigem `confirm:true`:** `merge`, `decline`, `delete_*`, `stop_pipeline`,
   `git_commit`, `git_push`, comentário inline (`add_pr_comment` com `inline_path`), criar
   variável `secured`.
5. **`BITBUCKET_READ_ONLY=true` bloqueia todo write/destrutivo** antes de tocar a API. Usar
   em sessões de só leitura (review, drift, conferência).
6. **Valores de variável secured nunca são retornados nem logados** (write-only na API).
7. **`git_*`/`clone` usam a chave SSH**, não o token. Push pra protegida é bloqueado em 3
   camadas: guarda do MCP + branch restrictions server-side + sem rebase de branch protegida.

## Convenções

- **Sem travessão/em dash (`—`)** em nenhum texto: código, commits, comentários de PR, docs.
  Usar vírgula, dois pontos, parênteses ou quebra de linha.
- **Comentário de PR: texto em português + Conventional Comments.** Label em inglês, corpo em
  PT. Ex: `**suggestion (non-blocking):** extrair isto pra um helper`. Labels: praise, nitpick,
  suggestion, issue, todo, question, thought, chore, note.
- Estilo de código: pnpm, ESM, strict TS, single quotes,
  semicolons, width 100, build tsup ESM.
- Mensagem de commit: conventional, assunto curto, sem em dash.

## Fluxos de uso

- **Revisar PR:** ler `get_pull_request` + `get_pull_request_diff` + `list_pr_comments` (inclui
  CodeRabbit, filtrar por autor `coderabbitai`, e reviews de outros devs) + `get_pull_request_activity`,
  e gerar um markdown local `review-pr-<n>.md` pro humano avaliar. Não comentar no PR sem ser pedido.
- **Corrigir apontamentos:** clonar/checkout da branch do PR, editar, `git_commit` (confirm) +
  `git_push` (confirm). Nunca tocar main/dev.
- **Rodar pipeline (como a UI):** ler `bitbucket-pipelines.yml` via `get_file_source` pra saber
  as variáveis que o custom pede (bloco `variables:` com `default:`), confirmar valores com o
  humano, disparar com `trigger_pipeline` (branch + custom_pipeline + variables). Acompanhar com
  `list_pipelines` → `get_pipeline_steps` → `get_pipeline_step_log`.

## Limitações conhecidas

- `react_pr_comment` e `resolve_comment` são experimentais: reação emoji em comentário não é
  documentada no Bitbucket Cloud (parece só Data Center). Podem dar erro; verificar e remover se não suportado.
- Variáveis de pipeline/deployment: sem endpoint pra "quais variáveis um custom pede"; isso vem
  do `bitbucket-pipelines.yml`. Valores armazenados exigem admin (não concedido).

## Dev

`pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm dev` (tsx watch), `pnpm inspect` (MCP Inspector).
Detalhe de scopes e racional de segurança: [PERMISSIONS.md](./PERMISSIONS.md). Setup e lista de
tools: [README.md](./README.md).
