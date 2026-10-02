#!/usr/bin/env python3
"""Validate research structure and local references, not product quality or compliance."""
import argparse
import importlib.util
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parent
LINK = re.compile(r'\[[^\]]*\]\(([^)]+)\)')


def validate():
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    errors = []
    pages = []
    external = set()
    if [p['id'] for p in manifest['pillars']] != list(range(1, 17)):
        errors.append('Manifest must identify the sixteen ordered pillars.')
    paths = [p['path'] for p in manifest['pillars']] + manifest['integration']
    if len(paths) != len(set(paths)):
        errors.append('Manifest contains duplicate page paths.')
    for relative in paths:
        page = ROOT / relative
        if not page.is_file() or not page.resolve().is_relative_to(ROOT):
            errors.append('Missing or unsafe page: ' + relative)
            continue
        content = page.read_text()
        links = LINK.findall(content)
        urls = {t for t in links if t.startswith('https://')}
        external.update(urls)
        if relative.startswith('pillars/'):
            if len(urls) < manifest['min_primary_source_urls_per_pillar']:
                errors.append('Insufficient source URLs: ' + relative)
            if '2026-09-29' not in content:
                errors.append('Missing research snapshot date: ' + relative)
            if len(content.split()) < 600:
                errors.append('Pillar lacks substantive workflow depth: ' + relative)
            if 'acceptance' not in content.lower():
                errors.append('Missing acceptance discussion: ' + relative)
        if '\u2014' in content:
            errors.append('Em dash conflicts with house prose rules: ' + relative)
        fences = sum(line.lstrip().startswith('```') for line in content.splitlines())
        if fences % 2:
            errors.append('Unbalanced Markdown fences: ' + relative)
        for line in content.splitlines():
            if line.rstrip() != line:
                errors.append('Trailing whitespace: ' + relative)
                break
        for target in links:
            target = target.strip('<>')
            parsed = urlsplit(target)
            if parsed.scheme:
                if parsed.scheme not in ('https', 'http'):
                    errors.append('Unexpected reference scheme: ' + relative)
                continue
            if not parsed.path:
                continue
            destination = page.parent / unquote(parsed.path)
            if not destination.exists():
                errors.append('Missing local reference: ' + relative + ' -> ' + target)
        pages.append({'path': relative, 'words': len(content.split()),
                      'external_urls': len(urls)})

    sources = json.loads((ROOT / manifest['provenance']).read_text())
    repositories = sources['repositories']
    if len({r['repo'] for r in repositories}) != len(repositories):
        errors.append('Duplicate source repository in provenance ledger.')
    for record in repositories:
        if not re.fullmatch(r'[a-f0-9]{40}', record.get('sha', '')):
            errors.append('Unpinned source: ' + record['repo'])
        if record.get('sha', '') not in record.get('source_url', ''):
            errors.append('Source URL does not identify its pinned revision: ' + record['repo'])
        for key in ('checked_on', 'license_review', 'committed_at'):
            if not record.get(key):
                errors.append('Missing source metadata ' + key + ': ' + record['repo'])

    bank = json.loads((ROOT / manifest['proposed_cases']).read_text())
    if bank.get('status') != 'proposed-unrun':
        errors.append('The proposed corpus must not imply completed model trials.')
    cases = bank['cases']
    if len({c['id'] for c in cases}) != len(cases):
        errors.append('Duplicate case IDs.')
    for case in cases:
        for key in ('id', 'category', 'task', 'predicate', 'evidence'):
            if not isinstance(case.get(key), str) or not case[key].strip():
                errors.append('Incomplete case: ' + str(case.get('id')))
    categories = {c['category'] for c in cases}
    required = {'requirements', 'routing', 'correctness', 'gate-integrity',
                'source-trust', 'preservation', 'ux', 'security', 'backend',
                'data', 'performance', 'orchestration', 'delivery',
                'operations', 'product-ai', 'evaluation', 'grounding'}
    if not required.issubset(categories):
        errors.append('Missing case categories: ' + ', '.join(sorted(required - categories)))

    module_spec = importlib.util.spec_from_file_location('micro_schema_check', ROOT.parent / 'micro.py')
    module = importlib.util.module_from_spec(module_spec)
    module_spec.loader.exec_module(module)
    try:
        module.validate_brief(json.loads((ROOT / 'templates/example-brief.json').read_text()))
    except (ValueError, KeyError) as exc:
        errors.append('Example brief fails actual initializer schema: ' + str(exc))
    return {'status': 'failed' if errors else 'passed', 'errors': errors,
            'pillars': len(manifest['pillars']), 'pages': pages,
            'words': sum(p['words'] for p in pages),
            'distinct_external_urls': len(external),
            'pinned_repositories': len(repositories), 'proposed_cases': len(cases),
            'limits': 'Mechanical document validation only. Primary-source support requires content review. No live-service, model-performance, compliance or product-acceptance claim.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--json', action='store_true', help='Print the complete document report.')
    args = parser.parse_args()
    report = validate()
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(report['status'] + ': ' + str(report['pillars']) + ' pillars, '
              + str(report['words']) + ' words, ' + str(report['distinct_external_urls'])
              + ' cited URLs, ' + str(report['pinned_repositories'])
              + ' pinned repositories, ' + str(report['proposed_cases']) + ' proposed cases.')
        for error in report['errors']:
            print(error, file=sys.stderr)
        print(report['limits'])
    sys.exit(1 if report['errors'] else 0)
