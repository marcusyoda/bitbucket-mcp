/**
 * Token health-check + DIAGNOSTICO de esquema de auth para o bitbucket-mcp.
 * Lê um .env (default '.env'; override BITBUCKET_ENV_FILE=/caminho) e testa 3 esquemas
 * de autenticacao contra a API, pra descobrir o tipo de token. NUNCA imprime o token.
 *
 *   BITBUCKET_ENV_FILE=/caminho/para/o/projeto/.env pnpm validate
 */
import { loadConfig } from './src/config.js';

const envFile = process.env.BITBUCKET_ENV_FILE || '.env';
try {
  process.loadEnvFile(envFile);
} catch {
  // sem arquivo: confia no ambiente
}

const config = loadConfig();
const base = config.baseUrl;
const b64 = (s: string) => Buffer.from(s).toString('base64');

const schemes: Array<{ name: string; header: string }> = [
  { name: 'Basic email:token      (Atlassian API token)', header: `Basic ${b64(`${config.email}:${config.apiToken}`)}` },
  { name: 'Basic x-token-auth:token (Access Token)', header: `Basic ${b64(`x-token-auth:${config.apiToken}`)}` },
  { name: 'Bearer token            (Access Token)', header: `Bearer ${config.apiToken}` },
];

const endpoints = [
  { label: 'read:repository', path: `/repositories/${config.workspace}?pagelen=1` },
  { label: 'read:account   ', path: '/user' },
];

async function probe(header: string, path: string): Promise<string> {
  try {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: header, Accept: 'application/json' } });
    if (res.status === 200) return '200 OK';
    if (res.status === 401) return '401 (credencial rejeitada)';
    if (res.status === 403) return '403 (autenticou, FALTA SCOPE)';
    return `${res.status} ${res.statusText}`;
  } catch (err) {
    return `erro ${err instanceof Error ? err.message : String(err)}`;
  }
}

function tokenShape(): string {
  const t = config.apiToken;
  const raw = process.env.BITBUCKET_API_TOKEN ?? '';
  const lead = raw.length !== raw.trimStart().length;
  const trail = raw.length !== raw.trimEnd().length;
  const inner = /\s/.test(t);
  const heur =
    t.startsWith('ATATT') || t.length > 150
      ? 'parece API token COM scopes (ATATT..., recomendado)'
      : t.length < 40
        ? 'curto: parece API token LEGADO sem scopes (ou truncado)'
        : 'comprimento intermediario (confira o tipo)';
  return `len=${t.length}  espaco_inicio=${lead}  espaco_fim=${trail}  espaco_interno=${inner}  -> ${heur}`;
}

async function main(): Promise<void> {
  console.log(`env=${envFile}  workspace=${config.workspace}  email=${config.email}`);
  console.log(`token shape (sem expor valor): ${tokenShape()}\n`);
  console.log('Testando esquemas de auth (sem expor o token):\n');
  let anyAuthed = false;
  for (const s of schemes) {
    const results: string[] = [];
    for (const ep of endpoints) {
      const r = await probe(s.header, ep.path);
      if (r.startsWith('200') || r.startsWith('403')) anyAuthed = true;
      results.push(`${ep.label}: ${r}`);
    }
    console.log(`[${s.name}]`);
    for (const r of results) console.log(`    ${r}`);
  }
  console.log('');
  if (!anyAuthed) {
    console.log('DIAGNOSTICO: nenhum esquema autenticou (todos 401). Causas provaveis:');
    console.log('  - valor do token errado/truncado, ou');
    console.log('  - o email nao e o da conta Atlassian dona do token, ou');
    console.log('  - a conta nao tem acesso ao workspace "' + config.workspace + '".');
  } else {
    console.log('DIAGNOSTICO: ha esquema que autentica (200 ou 403). Se foi o x-token-auth/Bearer,');
    console.log('o token e um Access Token e o client.ts precisa do patch de auth (entra na 0.2.0).');
    console.log('403 = autenticou mas falta scope; 200 = scope ok.');
  }
}

main().catch((err: unknown) => {
  console.error('DIAGNOSTICO FALHOU:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
