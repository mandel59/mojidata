#!/usr/bin/env python3
import hashlib
import os
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
workspace_root = root.parent
h = hashlib.sha256()


def add_line(s: str):
    h.update(s.encode("utf-8"))
    h.update(b"\n")


def add_file(path: pathlib.Path):
    rel = path.relative_to(workspace_root)
    add_line(f"FILE\t{rel.as_posix()}")
    h.update(path.read_bytes())
    h.update(b"\n")


for rel in [
    pathlib.Path("idsdb/package.json"),
    pathlib.Path("idsdb/tsconfig.json"),
    pathlib.Path("idsdb/prepare.ts"),
]:
    add_file(workspace_root / rel)

idsdb_utils_root = workspace_root / "idsdb-utils"
for rel in [
    pathlib.Path("package.json"),
    pathlib.Path("tsconfig.json"),
    pathlib.Path("index.ts"),
    pathlib.Path("index.js"),
    pathlib.Path("index.d.ts"),
    pathlib.Path("node.ts"),
    pathlib.Path("node.js"),
    pathlib.Path("node.d.ts"),
]:
    add_file(idsdb_utils_root / rel)

for p in sorted((idsdb_utils_root / "lib").glob("*")):
    if p.is_file():
        add_file(p)

add_file(workspace_root / "mojidata" / "dist" / "moji.db")
add_line(f"ENV\tMOJIDATA_IDSDB_FTS_VERSION={os.getenv('MOJIDATA_IDSDB_FTS_VERSION', '4')}")

print(h.hexdigest())
