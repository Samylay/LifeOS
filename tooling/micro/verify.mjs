// Trusted entry point mounted separately from the candidate's source.
import { cpSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
mkdirSync('/tmp/app');
cpSync('/source', '/tmp/app', { recursive: true });
const pkg = JSON.parse(readFileSync('/tmp/app/package.json', 'utf8'));
for (const name of ['lint', 'typecheck', 'test', 'test:e2e']) {
  if (!pkg.scripts?.[name] || pkg.scripts[name].includes('unconfigured.mjs')) throw new Error(`Configure a real ${name} gate before verification.`);
}
if (!existsSync('/tmp/app/package-lock.json')) throw new Error('Commit package-lock.json. Other package managers require an explicitly reviewed verifier adapter.');
for (const args of [['ci', '--ignore-scripts', '--offline', '--cache=/tmp/npm-cache'], ...['lint','typecheck','test','test:e2e'].map(name => ['run',name])]) {
  const result = spawnSync('npm', args, { cwd:'/tmp/app', stdio:'inherit', env: { ...process.env, HOME:'/tmp', npm_config_cache:'/tmp/npm-cache' }, timeout:120000 });
  if (result.error || result.status !== 0) process.exit(1);
}
