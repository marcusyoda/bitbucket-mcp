# Backlog · bitbucket-mcp

> Pré-backlog: anotações que ainda não merecem issue. Quando uma ideia amadurecer,
> promova para issue no padrão do repositório (ver CLAUDE.md) e **remova daqui no
> mesmo commit** que referencia a issue nova.

## Superfície MCP

- Expor PR e diff como *resources*, não só como tools. Hoje todo review recarrega o
  conteúdo a cada pergunta; um resource deixa o cliente referenciar o que já leu, que é
  economia real de contexto no fluxo descrito no CLAUDE.md.
- Avaliar *prompts* MCP para os fluxos fixos do CLAUDE.md, como revisar PR e corrigir
  apontamentos, em vez de o humano reconstruir a sequência toda vez.

## Tools

- Sem endpoint para descobrir quais variáveis um pipeline custom espera. Hoje isso sai
  do `bitbucket-pipelines.yml` lido via `get_file_source`. Avaliar um helper que já
  devolva o bloco `variables:` parseado.
