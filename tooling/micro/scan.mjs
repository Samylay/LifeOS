import { spawnSync } from 'node:child_process';
const checks = [
  ['gitleaks', ['dir','/source','--no-banner','--redact=100','--report-format=json','--report-path=/evidence/secrets.json']],
  ['syft', ['dir:/source','-o','cyclonedx-json=/evidence/sbom.cdx.json']],
  ['grype', ['sbom:/evidence/sbom.cdx.json','--fail-on','high','-o','json','--file','/evidence/vulnerabilities.json']],
];
for (const [binary, args] of checks) {
  const result = spawnSync(binary, args, {stdio:'inherit', timeout:120000});
  if (result.error || result.status !== 0) process.exit(1);
}
