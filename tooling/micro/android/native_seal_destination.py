#!/usr/bin/env python3
"""Fixed owned integration destination and separate retained-stage budgets."""
from pathlib import Path
import re

from admission import Store, STORE_BYTES
from native_acquire import DEFAULT_STATE

INTEGRATION_STATE = DEFAULT_STATE.parent / 'native-integration'


def destination_store(destination):
    store = Store(INTEGRATION_STATE)
    if store.root.stat().st_mode & 0o077:
        raise ValueError('Native seal requires dedicated owned700 integration Store')
    destination = Path(destination)
    if (not destination.is_absolute() or destination.parent != store.root/'sealed-native'
            or not re.fullmatch(r'[0-9a-f]{32}', destination.name)):
        raise ValueError('Seal destination must be fixed sealed-native/generated32hexowner')
    store.path('sealed-native/' + destination.name)
    if destination.exists(): raise ValueError('Fresh native seal destination required')
    return destination, store


def stage_bytes(root):
    logical = allocated = 0
    for path in Path(root).rglob('*'):
        info = path.lstat()
        if path.is_symlink() or not (path.is_dir() or path.is_file()):
            raise ValueError('Unsupported input in retained acquisition stage')
        if path.is_file():
            if info.st_nlink != 1: raise ValueError('Retained acquisition input hardlink forbidden')
            logical += info.st_size
            allocated += info.st_blocks * 512
    return {'logicalBytes': logical, 'allocatedBytes': allocated}


def seal_headroom(store, expanded_bytes, copied_bytes):
    if type(expanded_bytes) is not int or type(copied_bytes) is not int or min(expanded_bytes, copied_bytes) < 0:
        raise ValueError('Exact nonnegative seal sizes required')
    acquisition = stage_bytes(DEFAULT_STATE)
    integration = store.budget()
    if max(acquisition.values()) > 8 * 1024**3:
        raise ValueError('Retained acquisition stage exceeds unchanged8GiB')
    # Include independent source/receipt copies and conservative directory blocks.
    increment = expanded_bytes + copied_bytes + 64 * 1024**2
    if max(integration['regularBytes'], integration['allocatedBytes']) + increment > STORE_BYTES:
        raise ValueError('Integration seal would exceed unchanged8GiB')
    if integration['freeDiskBytes'] < 30 * 1024**3 + increment:
        raise ValueError('Seal must preserve30GiB free after expansion')
    return {'retainedAcquisition': acquisition, 'integrationBefore': integration,
            'expandedBytes': expanded_bytes, 'copiedBytes': copied_bytes,
            'reservedOverheadBytes': 64 * 1024**2, 'maximumEachStageBytes': STORE_BYTES}
