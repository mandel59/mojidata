"""Stable DB build inputs shared by local stamps and Actions cache keys."""
import hashlib
import json
import pathlib
import re
import subprocess
import sys


def normalized_manifest(data, workspace_names):
    data = dict(data)
    for key in ("version", "description", "homepage", "repository", "author", "contributors",
                "license", "keywords", "bugs", "funding", "files", "publishConfig", "private"):
        data.pop(key, None)
    for field in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        if field in data:
            data[field] = {name: "workspace" if name in workspace_names else value
                           for name, value in data[field].items()}
    return json.dumps(data, sort_keys=True, separators=(",", ":")).encode()


class BuildInputs:
    def __init__(self, root):
        self.root = pathlib.Path(root)
        self.hash = hashlib.sha256()
        lock = (self.root / "yarn.lock").read_text()
        # Yarn emits each mapping at column zero. Keep every external resolution,
        # checksum and peer dependency; workspace ranges are captured by manifests
        # after replacing local version ranges with their workspace identity.
        blocks = re.split(r"\n(?=\S)", lock)
        self.workspace_names = set(re.findall(r'^  resolution: "(.+)@workspace:[^"]+"$', lock, re.M))
        self.add("lock", "\n".join(block for block in blocks if not re.search(r'^  resolution: ".+@workspace:', block, re.M)))
        self.add("node", subprocess.check_output(["node", "--version"]).decode().strip())
        self.add("python", f"{sys.version_info.major}.{sys.version_info.minor}")
        self.add_file(self.root / "scripts/db_build_inputs.py")
        self.add_file(self.root / "package.json")
        for file in [".yarnrc.yml", ".node-version"]:
            if (self.root / file).exists():
                self.add_file(self.root / file)
        for file in sorted((self.root / ".yarn/patches").glob("*")):
            if file.is_file():
                self.add_file(file)

    def add(self, label, value):
        self.hash.update(label.encode() + b"\0")
        self.hash.update(value.encode() if isinstance(value, str) else value)
        self.hash.update(b"\0")

    def add_file(self, file):
        file = pathlib.Path(file)
        content = file.read_bytes()
        if file.name == "package.json":
            content = normalized_manifest(json.loads(content), self.workspace_names)
        self.add(file.relative_to(self.root).as_posix(), content)

    def hexdigest(self):
        return self.hash.hexdigest()
