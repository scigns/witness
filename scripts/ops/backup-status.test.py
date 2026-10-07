"""Verify independent backup freshness and checksum failure signals."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

SCRIPT = Path(__file__).with_name('backup-status.sh')

class BackupStatus(unittest.TestCase):
    def check(self, stale=None, corrupt=False):
        with tempfile.TemporaryDirectory(prefix='witness-backup-status-') as directory:
            root = Path(directory)
            for prefix in ['witness', 'keycloak']:
                name = f'{prefix}-fixture.dump'
                dump = root / name
                dump.write_bytes(b'synthetic backup fixture')
                digest = hashlib.sha256(dump.read_bytes()).hexdigest()
                (root / f'{name}.sha256').write_text(f'{digest}  {name}\n')
                if prefix == stale:
                    stamp = time.time() - 48 * 3600
                    os.utime(dump, (stamp, stamp))
                if corrupt and prefix == 'witness':
                    dump.write_bytes(b'corrupt fixture')
            return subprocess.run(['bash', str(SCRIPT), directory, '25'], capture_output=True, text=True)

    def test_both_current(self):
        result = self.check()
        self.assertEqual(result.returncode, 0, result.stdout)

    def test_new_witness_cannot_hide_stale_identity_backup(self):
        result = self.check(stale='keycloak')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('keycloak backup set', result.stdout)

    def test_new_identity_cannot_hide_stale_witness_backup(self):
        result = self.check(stale='witness')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('witness backup set', result.stdout)

    def test_checksum_failure(self):
        self.assertNotEqual(self.check(corrupt=True).returncode, 0)

if __name__ == '__main__':
    unittest.main()
