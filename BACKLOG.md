# Backlog · bitbucket-mcp

> Pré-backlog: anotações que ainda não merecem issue. Quando uma ideia amadurecer,
> promova para issue no padrão do repositório (ver CLAUDE.md) e **remova daqui no
> mesmo commit** que referencia a issue nova.

## Qualidade

- Não existe suíte de testes. Começar pelas guardas (`src/guard.ts`): branch protegida,
  read-only e trava de workspace são exatamente o que não pode regredir em silêncio.

## Tools

- `react_pr_comment` é experimental: reação emoji em comentário parece existir só no
  Data Center. Verificar contra o Cloud e remover a tool se não for suportada.
- `resolve_comment` depende de resolução de thread estar habilitada no repositório.
- Sem endpoint para descobrir quais variáveis um pipeline custom espera. Hoje isso sai
  do `bitbucket-pipelines.yml` lido via `get_file_source`. Avaliar um helper que já
  devolva o bloco `variables:` parseado.
