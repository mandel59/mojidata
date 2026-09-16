import json
import pathlib
import shutil
import subprocess
import tempfile
import unittest

from db_build_inputs import BuildInputs

REPO = pathlib.Path(__file__).resolve().parent.parent
LOCK = '''__metadata:
  version: 8

"@test/local@npm:^1.0.0, @test/local@workspace:packages/local":
  version: 0.0.0-use.local
  resolution: "@test/local@workspace:packages/local"
  dependencies:
    external: "npm:^2.0.0"

"external@npm:^2.0.0":
  version: 2.1.0
  resolution: "external@npm:2.1.0"
  checksum: fixed-content
'''


class BuildInputsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        (self.root / "scripts").mkdir()
        shutil.copy(REPO / "scripts/db_build_inputs.py", self.root / "scripts")
        (self.root / "yarn.lock").write_text(LOCK)
        self.manifest = {"name": "@test/local", "version": "1.0.0", "description": "old", "scripts": {"prepare": "build"}, "dependencies": {"@test/local": "^1.0.0", "external": "^2.0.0"}}
        self.save()

    def tearDown(self):
        self.temp.cleanup()

    def save(self):
        (self.root / "package.json").write_text(json.dumps(self.manifest))

    def fingerprint(self):
        return BuildInputs(self.root).hexdigest()

    def test_release_metadata_and_local_ranges_do_not_invalidate(self):
        before = self.fingerprint()
        self.manifest.update(version="1.1.0", description="new")
        self.manifest["dependencies"]["@test/local"] = "^1.1.0"
        self.save()
        (self.root / "yarn.lock").write_text(LOCK.replace("@test/local@npm:^1.0.0", "@test/local@npm:^1.1.0"))
        self.assertEqual(before, self.fingerprint())

    def test_external_resolution_changes_invalidate_without_manifest_changes(self):
        before = self.fingerprint()
        (self.root / "yarn.lock").write_text(LOCK.replace("2.1.0", "2.2.0"))
        self.assertNotEqual(before, self.fingerprint())

    def test_dependency_and_build_command_changes_invalidate(self):
        before = self.fingerprint()
        self.manifest["dependencies"]["external"] = "^3.0.0"
        self.save()
        after = self.fingerprint()
        self.assertNotEqual(before, after)
        self.manifest["scripts"]["prepare"] = "new-build"
        self.save()
        self.assertNotEqual(after, self.fingerprint())

    def test_workspace_becoming_external_invalidates(self):
        before = self.fingerprint()
        (self.root / "yarn.lock").write_text(LOCK.replace('resolution: "@test/local@workspace:packages/local"', 'resolution: "@test/local@npm:1.0.0"'))
        self.assertNotEqual(before, self.fingerprint())

    def test_builder_changes_invalidate(self):
        before = self.fingerprint()
        with (self.root / "scripts/db_build_inputs.py").open("a") as file:
            file.write("\n# changed\n")
        self.assertNotEqual(before, self.fingerprint())


if __name__ == "__main__":
    unittest.main()
