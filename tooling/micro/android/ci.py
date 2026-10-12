#!/usr/bin/env python3
"""Local CI calls the same graph. No hosted CI or production claim is made.

An administrator wires Registry and real supervisor hooks through run_local_ci.
The CLI has no connected jobs or admitted registry by default and returns 2.
It accepts only canonical project/adapter identifiers, never paths or commands.
"""
from __future__ import annotations

import argparse
import json
from typing import Mapping

try:
    from .admission import PROJECT, Rejected
    from .pipeline import DEFAULT_STATE, Hook, Pipeline, Registry, Stage, load_registry
except ImportError:
    from admission import PROJECT, Rejected
    from pipeline import DEFAULT_STATE, Hook, Pipeline, Registry, Stage, load_registry


def run_local_ci(project_id: str, adapter_id: str, registry: Registry,
                 hooks: Mapping[Stage, Hook] | None = None) -> tuple[dict, int]:
    if not PROJECT.fullmatch(project_id) or adapter_id != 'expo-android':
        raise Rejected('Canonical Micro project ID and fixed Android adapter required')
    summary, reference = Pipeline(registry, hooks).run(project_id, adapter_id)
    result = {'schema': 'micro.android.local-ci/1', 'scope': 'local-benchmark',
              'status': summary['status'], 'operations': reference.json(),
              'runId': summary['runId'], 'hostedCiObserved': False,
              'publishAuthorized': False, 'productionApproved': False}
    code = 0 if result['status'] == 'passed' else 2 if result['status'] == 'pending' else 1
    return result, code


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('project_id')
    parser.add_argument('--adapter', choices=['expo-android'], default='expo-android')
    args = parser.parse_args()
    if not PROJECT.fullmatch(args.project_id): parser.error('Use a canonical lowercase Micro project ID')
    # This path is controller-owned and independent of the candidate checkout.
    DEFAULT_STATE.mkdir(parents=True, mode=0o700, exist_ok=True)
    try:
        registry = load_registry()
        result, code = run_local_ci(args.project_id, args.adapter, registry)
    except (Rejected, OSError, ValueError) as error:
        print(json.dumps({'schema': 'micro.android.local-ci/1', 'status': 'environment-invalid',
                          'scope': 'local-benchmark', 'reason': str(error)[:1200],
                          'publishAuthorized': False, 'productionApproved': False, 'hostedCiObserved': False}))
        return 1
    print(json.dumps(result, sort_keys=True))
    return code


if __name__ == '__main__': raise SystemExit(main())
