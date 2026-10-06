import copy
import hashlib
import importlib.util
import io
import json
import pathlib
import sqlite3
import tarfile
import tempfile
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location("data_licenses", pathlib.Path(__file__).with_name("check-data-licenses.py"))
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class DataLicenseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.base = self.root / CHECK.SOURCE
        (self.base / "licenses").mkdir(parents=True)
        (self.base / "scripts").mkdir()
        (self.base / "cache").mkdir()
        (self.root / "scripts/data").mkdir(parents=True)
        (self.root / ".yarn/cache").mkdir(parents=True)
        (self.root / "scripts/data/spdx-license-ids.json").write_text(json.dumps({"licenseIds": ["MIT"]}))
        self.notice = b"Fixture licensing notice\n"
        (self.base / "licenses/sample.txt").write_bytes(self.notice)
        (self.base / "LICENSE.md").write_text("Fixture code license\n")
        data = b"a\tb\n"
        (self.base / "cache/sample.txt").write_bytes(data)
        self.source = "https://raw.githubusercontent.com/example/data/" + "a" * 40 + "/sample.txt"
        (self.base / "download.txt").write_text(f"## License: MIT\nsample.txt {CHECK.sha256(data)} {self.source}\n")
        (self.base / "scripts/create-db.ts").write_text('import sample from "@mandel59/sample"\n')
        manifest = {"name": "@mandel59/mojidata", "license": "MIT", "devDependencies": {"@mandel59/sample": "1.0.0"}}
        (self.base / "package.json").write_text(json.dumps(manifest))
        npm = {"kind": "npm", "name": "@mandel59/sample", "file": "sample.json", "version": "1.0.0",
               "source": "https://example.com/sample", "sha256": CHECK.sha256(b"[]")}
        archive_path = self.root / ".yarn/cache/@mandel59-sample-npm-1.0.0-fixture.zip"
        with zipfile.ZipFile(archive_path, "w") as archive:
            archive.writestr("node_modules/@mandel59/sample/sample.json", b"[]")
            archive.writestr("node_modules/@mandel59/sample/package.json",
                             json.dumps({"name": npm["name"], "version": npm["version"], "main": npm["file"]}))
        npm["yarnChecksum"] = "10/" + hashlib.sha512(archive_path.read_bytes()).hexdigest()
        (self.root / "yarn.lock").write_text('"sample@npm:1.0.0":\n  version: 1.0.0\n'
            '  resolution: "@mandel59/sample@npm:1.0.0"\n  checksum: ' + npm["yarnChecksum"] + '\n')
        (self.base / "report.json").write_bytes(b"{}")
        common = {"title": "Fixture source", "copyright": "Fixture author", "source": "https://example.com/",
                  "changes": "Normalize test records", "licenseId": "MIT", "licenseFile": "licenses/sample.txt",
                  "noticeFiles": ["licenses/sample.txt"], "affectedTables": ["sample*"], "use": "distributed-data"}
        download = {"kind": "download", "file": "sample.txt", "version": "a" * 40,
                    "sha256": CHECK.sha256(data), "source": self.source}
        self.registry = {"version": 1,
            "noticeFiles": {"licenses/sample.txt": {"sha256": CHECK.sha256(self.notice)}},
            "resources": [dict(common, id="sample", inputs=[download]), dict(common, id="npm", inputs=[npm]),
                          dict(common, id="report", use="build-only", licenseId="LicenseRef-Fixture",
                               inputs=[{"kind": "repository", "file": "report.json", "version": "1",
                                        "source": "https://example.com/report", "sha256": CHECK.sha256(b"{}")}])],
            "hasExtractedLicensingInfos": [{"licenseId": "LicenseRef-Fixture", "name": "Fixture terms",
                                           "extractedText": self.notice.decode(), "seeAlsos": ["https://example.com/terms"]}],
            "distributions": {"@mandel59/mojidata": {"directory": "packages/mojidata", "scope": "Default fixture data",
                                                      "resources": {"sample": ["sample.txt"], "npm": ["sample.json"]}}}}
        self.save()

    def save(self):
        (self.base / "data-licenses.json").write_text(json.dumps(self.registry))

    def load(self):
        self.save()
        return CHECK.load_registry(self.root)

    def fails(self, message):
        with self.assertRaisesRegex(ValueError, message):
            self.load()

    def make_archive(self, omit=None, replace=None, duplicate=None):
        registry = self.load()
        files = CHECK.generated_files(registry, self.root)["@mandel59/mojidata"]
        files.update({name: (self.base / name).read_bytes() for name in ["LICENSE.md", "data-licenses.json", "download.txt", "package.json"]})
        if omit:
            del files[omit]
        if replace:
            files.update(replace)
        path = self.root / "package.tgz"
        with tarfile.open(path, "w:gz") as archive:
            for name, contents in files.items():
                member = tarfile.TarInfo("package/" + name)
                member.size = len(contents)
                archive.addfile(member, io.BytesIO(contents))
            if duplicate:
                member = tarfile.TarInfo("package/" + duplicate)
                contents = files[duplicate]
                member.size = len(contents)
                archive.addfile(member, io.BytesIO(contents))
        return registry, path

    def test_offline_validation_generation_cache_database_and_archive(self):
        registry = self.load()
        CHECK.verify_inputs(registry, self.root)
        CHECK.check_generated(registry, self.root, write=True)
        CHECK.check_generated(registry, self.root)
        exported = json.loads((self.base / "data-notices.json").read_text())
        self.assertEqual(exported["hasExtractedLicensingInfos"], [])
        db_path = self.root / "fixture.db"
        with sqlite3.connect(db_path) as db:
            db.execute("CREATE TABLE sample (value TEXT)")
        before = db_path.read_bytes()
        CHECK.check_database(registry, db_path)
        self.assertEqual(before, db_path.read_bytes())
        registry, path = self.make_archive()
        CHECK.check_archive(registry, "@mandel59/mojidata", path, self.root)

    def test_missing_notice(self):
        (self.base / "licenses/sample.txt").unlink()
        self.fails("Missing notice")

    def test_changed_notice(self):
        (self.base / "licenses/sample.txt").write_text("changed")
        self.fails("Stale notice hash")

    def test_unregistered_notice(self):
        (self.base / "licenses/unregistered.txt").write_text("unknown")
        self.fails("Unregistered/missing files")

    def test_undefined_and_non_spdx_license_ids(self):
        for identifier in ["PublicDomain", "LicenseRef-Missing", "LicenseRef-Bad_Name"]:
            with self.subTest(identifier=identifier):
                self.registry["resources"][0]["licenseId"] = identifier
                self.fails("Unknown SPDX")

    def test_invalid_license_ref_definition(self):
        self.registry["hasExtractedLicensingInfos"][0]["licenseId"] = "LicenseRef-Bad_Name"
        self.fails("Invalid SPDX LicenseRef")

    def test_stale_license_ref_definition(self):
        self.registry["hasExtractedLicensingInfos"][0]["extractedText"] = "stale terms"
        self.fails("Stale LicenseRef extractedText")

    def test_unregistered_download(self):
        with (self.base / "download.txt").open("a") as file:
            file.write(f"extra.txt {'b' * 64} https://example.com/extra.txt\n")
        self.fails("Unregistered download")

    def test_missing_download_license_comment(self):
        path = self.base / "download.txt"
        path.write_text(path.read_text().replace("## License: MIT\n", ""))
        self.fails("Missing download license comment")

    def test_distributed_license_ref_exports_its_definition(self):
        self.registry["resources"][0]["licenseId"] = "LicenseRef-Fixture"
        path = self.base / "download.txt"
        path.write_text(path.read_text().replace("License: MIT", "License: LicenseRef-Fixture"))
        files = CHECK.generated_files(self.load(), self.root)
        output = json.loads(files["@mandel59/mojidata"]["data-notices.json"])
        self.assertEqual(output["hasExtractedLicensingInfos"], self.registry["hasExtractedLicensingInfos"])

    def test_package_summary_license_mismatch(self):
        path = self.base / "package.json"
        manifest = json.loads(path.read_text())
        manifest["license"] = "LicenseRef-Unknown"
        path.write_text(json.dumps(manifest))
        self.fails("package license summary must use canonical SPDX")

    def test_duplicate_input(self):
        self.registry["resources"][0]["inputs"] *= 2
        self.fails("duplicate input file")

    def test_download_source_hash_and_license_mismatch(self):
        original = copy.deepcopy(self.registry["resources"][0])
        for key, value in [("source", "https://example.com/other"), ("sha256", "b" * 64)]:
            self.registry["resources"][0] = copy.deepcopy(original)
            self.registry["resources"][0]["inputs"][0][key] = value
            self.fails("Download hash/source/license mismatch")
        (self.base / "download.txt").write_text((self.base / "download.txt").read_text().replace("License: MIT", "License: BSD-3-Clause"))
        self.registry["resources"][0] = original
        self.fails("Download hash/source/license mismatch")

    def test_unpinned_source_version(self):
        self.registry["resources"][0]["inputs"][0]["version"] = "main"
        self.fails("Unpinned GitHub")

    def test_npm_version_lock_and_import_coverage(self):
        self.registry["resources"][1]["inputs"][0]["version"] = "2.0.0"
        self.fails("npm data version mismatch")
        self.registry["resources"][1]["inputs"][0]["version"] = "1.0.0"
        self.registry["resources"][1]["inputs"][0]["yarnChecksum"] = "stale"
        self.fails("lock checksum/version mismatch")
        self.restore_lock_checksum()
        (self.base / "scripts/create-db.ts").write_text('import unknown from "@mandel59/other"')
        self.fails("npm dataset imports/registry mismatch")

    def restore_lock_checksum(self):
        archive = next((self.root / ".yarn/cache").glob("*.zip"))
        self.registry["resources"][1]["inputs"][0]["yarnChecksum"] = "10/" + hashlib.sha512(archive.read_bytes()).hexdigest()

    def test_tracked_input_hash(self):
        (self.base / "report.json").write_text("changed")
        self.fails("Tracked input hash mismatch")

    def test_path_traversal(self):
        self.registry["resources"][0]["inputs"][0]["file"] = "../escape"
        self.fails("Unsafe relative path")

    def test_missing_distribution_source(self):
        del self.registry["distributions"]["@mandel59/mojidata"]["resources"]["npm"]
        self.fails("does not cover all distributed inputs")

    def test_build_only_source_not_distributed(self):
        self.registry["distributions"]["@mandel59/mojidata"]["resources"]["report"] = ["report.json"]
        self.fails("build-only input cannot be distributed")

    def test_cache_tampering(self):
        registry = self.load()
        (self.base / "cache/sample.txt").write_text("changed")
        with self.assertRaisesRegex(ValueError, "Cached download hash mismatch"):
            CHECK.verify_inputs(registry, self.root)

    def test_generated_notice_drift(self):
        registry = self.load()
        CHECK.check_generated(registry, self.root, write=True)
        (self.base / "data-notices.json").write_text("stale")
        with self.assertRaisesRegex(ValueError, "Stale/missing distributed notice"):
            CHECK.check_generated(registry, self.root)

    def test_archive_missing_altered_duplicate_notice_and_internal_input(self):
        for kwargs, error in [({"omit": "licenses/sample.txt"}, "Archive missing"),
                              ({"replace": {"licenses/sample.txt": b"altered"}}, "Archive notice mismatch"),
                              ({"duplicate": "licenses/sample.txt"}, "Duplicate archive entry"),
                              ({"replace": {"report.json": b"{}"}}, "Archive includes build-only input")]:
            with self.subTest(kwargs=kwargs):
                registry, archive = self.make_archive(**kwargs)
                with self.assertRaisesRegex(ValueError, error):
                    CHECK.check_archive(registry, "@mandel59/mojidata", archive, self.root)


if __name__ == "__main__":
    unittest.main()
