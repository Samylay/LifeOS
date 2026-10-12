"""Synthetic separate-stage storage admission, no actual native seal/build."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import native_seal_destination as module


class SealDestinationTests(unittest.TestCase):
    def test_fixed_owned700_fresh_destination_only(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests') as directory:
            root = Path(directory)
            with patch.object(module, 'INTEGRATION_STATE', root):
                value,store = module.destination_store(root/'sealed-native'/('a'*32))
                self.assertEqual(store.root,root)
                self.assertFalse(value.exists())
                for bad in (root/'other'/('a'*32), root/'sealed-native'/'bad', root/'sealed-native'/('a'*32)/'nested'):
                    with self.subTest(path=bad), self.assertRaises(ValueError): module.destination_store(bad)

    def test_existing_or_linked_destination_rejected(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests') as directory:
            root = Path(directory)
            with patch.object(module,'INTEGRATION_STATE',root):
                (root/'sealed-native').mkdir()
                existing=root/'sealed-native'/('a'*32);existing.mkdir()
                with self.assertRaises(ValueError): module.destination_store(existing)
                existing.rmdir();(root/'sealed-native').rmdir()
                (root/'sealed-native').symlink_to(root,target_is_directory=True)
                with self.assertRaises(ValueError): module.destination_store(existing)

    def test_integration_seal_does_not_add_expansion_to_historical_stage(self):
        store=Mock();store.budget.return_value={'regularBytes':1024**3,'allocatedBytes':1024**3,'freeDiskBytes':100*1024**3}
        with patch.object(module,'stage_bytes',return_value={'logicalBytes':7*1024**3,'allocatedBytes':7*1024**3}):
            value=module.seal_headroom(store,2*1024**3,0)
        self.assertEqual(value['retainedAcquisition']['logicalBytes'],7*1024**3)

    def test_each_stage_ceiling_and_postexpansion_free_space_fail_closed(self):
        for retained,existing,free in ((9*1024**3,0,100*1024**3),(0,7*1024**3,100*1024**3),(0,0,30*1024**3)):
            with self.subTest(retained=retained,existing=existing,free=free):
                store=Mock();store.budget.return_value={'regularBytes':existing,'allocatedBytes':existing,'freeDiskBytes':free}
                with patch.object(module,'stage_bytes',return_value={'logicalBytes':retained,'allocatedBytes':retained}),self.assertRaises(ValueError):
                    module.seal_headroom(store,2*1024**3,0)

    def test_historical_link_rejected_without_moving_inputs(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'tests') as directory:
            root=Path(directory);(root/'file').write_bytes(b'original')
            (root/'link').symlink_to(root/'file')
            with self.assertRaises(ValueError):module.stage_bytes(root)
            self.assertEqual((root/'file').read_bytes(),b'original')


if __name__ == '__main__':unittest.main()
