#!/usr/bin/env python3
"""Validate local data provenance and deterministic distributed notices; no network/DB writes."""
import argparse
import fnmatch
import hashlib
import json
import pathlib
import re
import sqlite3
import tarfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = pathlib.Path("packages/mojidata")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def text(value, label):
    require(isinstance(value, str) and value.strip(), f"{label}: nonempty text required")
    return value


def url(value, label):
    text(value, label)
    require(re.fullmatch(r"https?://[^\s]+", value), f"{label}: HTTP(S) URL required")


def local_path(base, name):
    text(name, "path")
    path = pathlib.PurePosixPath(name)
    require(not path.is_absolute() and "\\" not in name
            and not any(p in ("", ".", "..") for p in name.split("/")),
            f"Unsafe relative path: {name}")
    resolved = (base / path).resolve()
    require(resolved.is_relative_to(base.resolve()), f"Path escapes directory: {name}")
    return resolved


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def check_digest(value, label):
    require(isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value),
            f"{label}: SHA-256 required")


def download_rows(contents):
    rows = {}
    license_id = None
    for line in contents.splitlines():
        if line.startswith("## License:"):
            match = re.match(r"## License: (\S+)", line)
            require(match is not None, "Malformed download license comment")
            license_id = match[1]
        elif line.startswith("##") and "<http" in line:
            license_id = None
        elif line.strip() and not line.startswith("#"):
            columns = line.split()
            require(len(columns) == 3, f"Malformed download row: {line}")
            name, digest, source = columns
            require(name not in rows, f"Duplicate download input: {name}")
            check_digest(digest, name)
            url(source, name)
            require(license_id is not None, f"Missing download license comment: {name}")
            rows[name] = (digest, source, license_id)
    return rows


def input_key(item):
    return (item["kind"], item.get("name"), item["file"])


def load_registry(root=ROOT):
    base = root / SOURCE
    registry = json.loads((base / "data-licenses.json").read_text())
    require(isinstance(registry, dict), "Data license registry must be an object")
    require(registry.get("version") == 1, "Unsupported data license registry version")
    spdx = json.loads((root / "scripts/data/spdx-license-ids.json").read_text())
    standard_ids = set(spdx["licenseIds"])
    definitions = registry.get("hasExtractedLicensingInfos", [])
    require(isinstance(definitions, list), "hasExtractedLicensingInfos must be a list")
    custom_ids = {}
    for definition in definitions:
        require(isinstance(definition, dict), "LicenseRef definition must be an object")
        identifier = text(definition.get("licenseId"), "LicenseRef identifier")
        require(re.fullmatch(r"LicenseRef-[A-Za-z0-9.-]+", identifier),
                f"Invalid SPDX LicenseRef: {identifier}")
        require(identifier.lower() not in {i.lower() for i in custom_ids},
                f"Duplicate LicenseRef definition: {identifier}")
        text(definition.get("name"), f"{identifier}.name")
        text(definition.get("extractedText"), f"{identifier}.extractedText")
        links = definition.get("seeAlsos")
        require(isinstance(links, list) and links, f"{identifier}: source links required")
        for link in links:
            url(link, f"{identifier}.seeAlsos")
        custom_ids[identifier] = definition
    notices = registry.get("noticeFiles")
    require(isinstance(notices, dict) and notices, "noticeFiles must be nonempty")
    for name, record in notices.items():
        require(isinstance(record, dict), f"Notice record must be an object: {name}")
        require(name.startswith("licenses/"), f"Notice outside licenses/: {name}")
        check_digest(record.get("sha256"), name)
        path = local_path(base, name)
        require(path.is_file(), f"Missing notice: {name}")
        require(sha256(path.read_bytes()) == record["sha256"], f"Stale notice hash: {name}")

    rows = download_rows((base / "download.txt").read_text())
    manifest = json.loads((base / "package.json").read_text())
    lock = (root / "yarn.lock").read_text()
    resources = registry.get("resources")
    require(isinstance(resources, list) and resources, "resources must be nonempty")
    ids, seen, registered_downloads, npm_names, referenced_notices, used_custom_ids = set(), set(), set(), set(), set(), set()
    for resource in resources:
        require(isinstance(resource, dict), "Resource must be an object")
        label = text(resource.get("id"), "resource id")
        require(label not in ids, f"Duplicate resource: {label}")
        ids.add(label)
        for field in ("title", "copyright", "changes"):
            text(resource.get(field), f"{label}.{field}")
        url(resource.get("source"), f"{label}.source")
        license_id = text(resource.get("licenseId"), f"{label}.licenseId")
        require(license_id in standard_ids or license_id in custom_ids,
                f"Unknown SPDX license ID or undefined LicenseRef: {license_id}")
        require(resource.get("use") in ("distributed-data", "build-only"), f"{label}: invalid use")
        tables = resource.get("affectedTables")
        require(isinstance(tables, list) and tables, f"{label}: affectedTables required")
        for table in tables:
            text(table, f"{label}.affectedTables")
        files = resource.get("noticeFiles")
        require(isinstance(files, list) and files and len(files) == len(set(files)),
                f"{label}: unique noticeFiles required")
        require(resource.get("licenseFile") in files, f"{label}: licenseFile must be in noticeFiles")
        for name in files:
            require(name in notices, f"{label}: unregistered notice {name}")
            referenced_notices.add(name)
        if license_id in custom_ids:
            require(custom_ids[license_id]["extractedText"] == local_path(base, resource["licenseFile"]).read_text(),
                    f"Stale LicenseRef extractedText: {license_id}")
            used_custom_ids.add(license_id)
        inputs = resource.get("inputs")
        require(isinstance(inputs, list) and inputs, f"{label}: inputs required")
        file_names = set()
        for item in inputs:
            require(isinstance(item, dict), f"{label}: input must be an object")
            name = text(item.get("file"), f"{label}.input.file")
            local_path(base, name)
            require(name not in file_names, f"{label}: duplicate input file {name}")
            file_names.add(name)
            text(item.get("version"), f"{label}.{name}.version")
            url(item.get("source"), f"{label}.{name}.source")
            check_digest(item.get("sha256"), f"{label}.{name}")
            key = input_key(item)
            require(key not in seen, f"Duplicate registered input: {key}")
            seen.add(key)
            kind = item.get("kind")
            if kind == "download":
                require(name in rows, f"Unknown download input: {name}")
                require(rows[name] == (item["sha256"], item["source"], license_id),
                        f"Download hash/source/license mismatch: {name}")
                if "raw.githubusercontent.com/" in item["source"]:
                    require(re.fullmatch(r"(?:[0-9a-f]{40}|[0-9]{8})", item["version"])
                            and f'/{item["version"]}/' in item["source"],
                            f"Unpinned GitHub source version: {name}")
                registered_downloads.add(name)
            elif kind == "npm":
                package = text(item.get("name"), f"{label}.npm.name")
                require(package not in npm_names, f"Duplicate npm dataset: {package}")
                npm_names.add(package)
                require(manifest.get("devDependencies", {}).get(package) == item["version"],
                        f"npm data version mismatch: {package}")
                resolution = f'  resolution: "{package}@npm:{item["version"]}"'
                blocks = [block for block in lock.split("\n\n") if resolution in block.splitlines()]
                require(len(blocks) == 1, f"Missing/ambiguous npm lock resolution: {package}")
                require(f'  version: {item["version"]}' in blocks[0].splitlines()
                        and f'  checksum: {item.get("yarnChecksum")}' in blocks[0].splitlines(),
                        f"npm data lock checksum/version mismatch: {package}")
            elif kind == "repository":
                path = local_path(base, name)
                require(path.is_file() and sha256(path.read_bytes()) == item["sha256"],
                        f"Tracked input hash mismatch: {name}")
            else:
                raise ValueError(f"Unknown input kind: {kind}")
    require(set(rows) == registered_downloads,
            f"Unregistered download inputs: {sorted(set(rows) - registered_downloads)}")
    builder = (base / "scripts/create-db.ts").read_text()
    imports = {match[1] for match in re.findall(r"""\bfrom\s+(["'])(@mandel59/[^"'\s]+)\1""", builder)}
    require(imports == npm_names, f"npm dataset imports/registry mismatch: {sorted(imports ^ npm_names)}")
    require(set(notices) == referenced_notices, "Unreferenced noticeFiles in registry")
    require(set(custom_ids) == used_custom_ids, "Unreferenced LicenseRef definitions")
    actual_notices = {p.relative_to(base).as_posix() for p in (base / "licenses").rglob("*") if p.is_file()}
    require(actual_notices == set(notices), "Unregistered/missing files under licenses/")

    distributions = registry.get("distributions")
    require(isinstance(distributions, dict) and distributions, "distributions must be nonempty")
    resources_by_id = {r["id"]: r for r in resources}
    directories, distributed_inputs = set(), set()
    for package, distribution in distributions.items():
        require(isinstance(distribution, dict), f"{package}: distribution must be an object")
        directory = text(distribution.get("directory"), f"{package}.directory")
        require(re.fullmatch(r"packages/[a-z0-9-]+", directory), f"Unsafe distribution directory: {directory}")
        require(directory not in directories, f"Duplicate distribution directory: {directory}")
        directories.add(directory)
        directory = local_path(root, directory)
        package_manifest = json.loads((directory / "package.json").read_text())
        require(package_manifest["name"] == package, f"Distribution package name mismatch: {package}")
        # These package summaries deliberately use canonical standard IDs joined
        # by AND. Custom source terms are fully defined in the data manifests.
        summary = text(package_manifest.get("license"), f"{package}.license")
        require(all(i in standard_ids for i in summary.split(" AND ")),
                f"{package}: package license summary must use canonical SPDX IDs joined by AND")
        text(distribution.get("scope"), f"{package}.scope")
        selected = distribution.get("resources")
        require(isinstance(selected, dict) and selected, f"{package}: resources required")
        for resource_id, names in selected.items():
            require(resource_id in resources_by_id, f"{package}: unknown resource {resource_id}")
            resource = resources_by_id[resource_id]
            require(resource["use"] == "distributed-data", f"{package}: build-only input cannot be distributed")
            require(isinstance(names, list) and names and len(names) == len(set(names)),
                    f"{package}.{resource_id}: unique selected inputs required")
            lookup = {i["file"]: i for i in resource["inputs"]}
            for name in names:
                require(name in lookup, f"{package}: unknown selected input {name}")
                if package == manifest["name"]:
                    distributed_inputs.add(input_key(lookup[name]))
        expected_summary = {"MIT"} | {resources_by_id[r]["licenseId"] for r in selected
                                     if resources_by_id[r]["licenseId"] in standard_ids}
        require(set(summary.split(" AND ")) == expected_summary,
                f"{package}: package SPDX summary does not match distributed source licenses")
    expected_inputs = {input_key(i) for r in resources if r["use"] == "distributed-data" for i in r["inputs"]}
    require(distributed_inputs == expected_inputs, "Main distribution does not cover all distributed inputs")
    return registry


def generated_files(registry, root=ROOT):
    base = root / SOURCE
    resources = {r["id"]: r for r in registry["resources"]}
    result = {}
    for package, distribution in registry["distributions"].items():
        records, notices = [], set()
        for resource_id, names in distribution["resources"].items():
            resource = dict(resources[resource_id])
            resource["inputs"] = [i for i in resource["inputs"] if i["file"] in names]
            records.append(resource)
            notices.update(resource["noticeFiles"])
        output = {"version": 1, "package": package, "scope": distribution["scope"],
                  "resources": records, "noticeFiles": {n: registry["noticeFiles"][n] for n in sorted(notices)}}
        license_ids = {r["licenseId"] for r in records}
        output["hasExtractedLicensingInfos"] = [d for d in registry.get("hasExtractedLicensingInfos", [])
                                               if d["licenseId"] in license_ids]
        files = {"data-notices.json": (json.dumps(output, ensure_ascii=False, indent=2) + "\n").encode()}
        files.update({n: local_path(base, n).read_bytes() for n in sorted(notices)})
        result[package] = files
    return result


def check_generated(registry, root=ROOT, write=False):
    expected = generated_files(registry, root)
    for package, files in expected.items():
        directory = local_path(root, registry["distributions"][package]["directory"])
        for name, contents in files.items():
            path = local_path(directory, name)
            if write:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(contents)
            else:
                require(path.is_file() and path.read_bytes() == contents,
                        f"Stale/missing distributed notice: {package}/{name}; run --write")
        if directory != (root / SOURCE).resolve():
            present = {p.relative_to(directory).as_posix() for p in (directory / "licenses").rglob("*") if p.is_file()}
            require(present == set(files) - {"data-notices.json"}, f"{package}: unexpected copied notices")
    return expected


def verify_inputs(registry, root=ROOT):
    base = root / SOURCE
    for resource in registry["resources"]:
        for item in resource["inputs"]:
            if item["kind"] == "download":
                # Download cache entries are intentionally symlinks into .sha256sum.
                path = local_path(base, "cache/" + item["file"])
                require(path.is_file() and sha256(path.read_bytes()) == item["sha256"],
                        f"Cached download hash mismatch: {item['file']}")
            elif item["kind"] == "npm":
                name, version = item["name"], item["version"]
                matches = list((root / ".yarn/cache").glob(f"{name.replace('/', '-')}-npm-{version}-*.zip"))
                require(len(matches) == 1, f"Missing/ambiguous cached npm dataset: {name}")
                checksum = item["yarnChecksum"].split("/")[-1]
                require(hashlib.sha512(matches[0].read_bytes()).hexdigest() == checksum,
                        f"Cached npm archive checksum mismatch: {name}")
                with zipfile.ZipFile(matches[0]) as archive:
                    prefix = f"node_modules/{name}/"
                    manifest = json.loads(archive.read(prefix + "package.json"))
                    require(manifest["name"] == name and manifest["version"] == version
                            and manifest["main"] == item["file"], f"Cached npm manifest mismatch: {name}")
                    require(sha256(archive.read(prefix + item["file"])) == item["sha256"],
                            f"Cached npm data hash mismatch: {name}")


def check_database(registry, path):
    with sqlite3.connect(pathlib.Path(path).resolve().as_uri() + "?mode=ro", uri=True) as db:
        names = [row[0] for row in db.execute("SELECT name FROM sqlite_schema WHERE type IN ('table', 'view')")]
    for resource in registry["resources"]:
        for pattern in resource["affectedTables"]:
            require(any(fnmatch.fnmatchcase(name, pattern) for name in names),
                    f"No local DB table/view matches {resource['id']}: {pattern}")


def check_archive(registry, package, archive_path, root=ROOT):
    require(package in registry["distributions"], f"Unknown archive package: {package}")
    files = generated_files(registry, root)[package]
    directory = local_path(root, registry["distributions"][package]["directory"])
    files["LICENSE.md"] = (directory / "LICENSE.md").read_bytes()
    if package == json.loads((root / SOURCE / "package.json").read_text())["name"]:
        files["data-licenses.json"] = (root / SOURCE / "data-licenses.json").read_bytes()
        files["download.txt"] = (root / SOURCE / "download.txt").read_bytes()
    with tarfile.open(archive_path, "r:gz") as archive:
        members = {}
        for member in archive.getmembers():
            require(member.name not in members, f"Duplicate archive entry: {member.name}")
            members[member.name] = member
        for name, contents in files.items():
            member = members.get("package/" + name)
            require(member is not None and member.isfile(), f"Archive missing regular notice: {package}/{name}")
            require(member.size == len(contents) and archive.extractfile(member).read() == contents,
                    f"Archive notice mismatch: {package}/{name}")
        member = members.get("package/package.json")
        require(member is not None and member.isfile() and member.size < 1_000_000, "Invalid archived package.json")
        manifest = json.load(archive.extractfile(member))
        expected = json.loads((directory / "package.json").read_text())
        require(manifest.get("name") == package and manifest.get("license") == expected.get("license"),
                f"Archived package identity/license mismatch: {package}")
        if directory == (root / SOURCE).resolve():
            for resource in registry["resources"]:
                if resource["use"] == "build-only":
                    for item in resource["inputs"]:
                        require("package/" + item["file"] not in members,
                                f"Archive includes build-only input: {item['file']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Regenerate notice manifests and copied notices")
    parser.add_argument("--verify-inputs", action="store_true", help="Verify existing local download/npm caches")
    parser.add_argument("--database", help="Check affected table/view patterns in a local read-only SQLite DB")
    parser.add_argument("--archive", nargs=2, action="append", default=[], metavar=("PACKAGE", "TARBALL"))
    args = parser.parse_args()
    try:
        registry = load_registry()
        check_generated(registry, write=args.write)
        if args.verify_inputs:
            verify_inputs(registry)
        if args.database:
            check_database(registry, args.database)
        for package, archive in args.archive:
            check_archive(registry, package, archive)
        print(f"Data licenses verified: {len(registry['resources'])} resources, "
              f"{len(registry['distributions'])} distributions, {len(args.archive)} archives")
    except (ValueError, OSError, KeyError, TypeError, tarfile.TarError, zipfile.BadZipFile, sqlite3.Error) as error:
        parser.exit(1, f"Data license check failed: {error}\n")


if __name__ == "__main__":
    main()
