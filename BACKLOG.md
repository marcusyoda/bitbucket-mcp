# Backlog · bitbucket-mcp

> Pré-backlog: anotações que ainda não merecem issue. Quando uma ideia amadurecer,
> promova para issue no padrão do repositório (ver CLAUDE.md) e **remova daqui no
> mesmo commit** que referencia a issue nova.

## Publicação

- Publicar a `0.2.0` no npm: o registry ainda serve a `0.1.0`, sem as tools de git sobre
  HTTPS. Enquanto isso, quem instala pelo npm não recebe o que o README descreve.
- Alinhar a licença: o `package.json` declara `UNLICENSED` e o repositório tem um
  `LICENSE` MIT. Decidir qual vale e deixar os dois iguais.

## Qualidade

- Não existe suíte de testes. Começar pelas guardas (`src/guard.ts`): branch protegida,
  read-only e trava de workspace são exatamente o que não pode regredir em silêncio.
- Não existe CI. Um workflow com `typecheck` e `build` na `main` já pega quebra de
  resolução de módulo, que é o modo de falha típico do bundle ESM.

## Tools

- `react_pr_comment` é experimental: reação emoji em comentário parece existir só no
  Data Center. Verificar contra o Cloud e remover a tool se não for suportada.
- `resolve_comment` depende de resolução de thread estar habilitada no repositório.
- Sem endpoint para descobrir quais variáveis um pipeline custom espera. Hoje isso sai
  do `bitbucket-pipelines.yml` lido via `get_file_source`. Avaliar um helper que já
  devolva o bloco `variables:` parseado.
