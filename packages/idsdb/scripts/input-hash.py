#!/usr/bin/env python3
import os
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
workspace_root = root.parent
sys.path.insert(0, str(workspace_root.parent / "scripts"))
from db_build_inputs import BuildInputs

inputs = BuildInputs(workspace_root.parent)
add_file = inputs.add_file
add_line = lambda value: inputs.add("option", value)

# Builder wrappers and derivation tools also affect the output and reuse rules.
for package in ["idsdb", "idsdb-fts5", "idsdb-bvec"]:
    for file in sorted((workspace_root / package / "scripts").glob("*")):
        if file.is_file():
            add_file(file)
for file in sorted(root.glob("build-*-derived.ts")):
    add_file(file)

for rel in [
    pathlib.Path("idsdb/package.json"),
    pathlib.Path("idsdb/tsconfig.json"),
    pathlib.Path("idsdb/prepare.ts"),
]:
    add_file(workspace_root / rel)

for p in sorted((root / "lib").glob("*.ts")):
    add_file(p)

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
add_line(f"ENV\tMOJIDATA_IDSDB_INDEX_MODE={os.getenv('MOJIDATA_IDSDB_INDEX_MODE', '')}")
add_line(f"ENV\tMOJIDATA_IDSDB_BVEC_BLOCK_SIZE={os.getenv('MOJIDATA_IDSDB_BVEC_BLOCK_SIZE', '1024')}")
add_line(f"ENV\tMOJIDATA_IDSDB_PAGE_SIZE={os.getenv('MOJIDATA_IDSDB_PAGE_SIZE', '4096')}")
add_line(f"ENV\tMOJIDATA_IDSDB_SOURCE={os.getenv('MOJIDATA_IDSDB_SOURCE', '')}")
add_line(f"ENV\tMOJIDATA_IDSDB_DATA_SOURCES={os.getenv('MOJIDATA_IDSDB_DATA_SOURCES', 'babelstone,usource')}")
add_line(f"ENV\tMOJIDATA_IDSDB_EXPAND_Z_VARIANTS={os.getenv('MOJIDATA_IDSDB_EXPAND_Z_VARIANTS', '1')}")
add_line(f"ENV\tMOJIDATA_IDSDB_NORMALIZE_KDPV_RADICAL_VARIANTS={os.getenv('MOJIDATA_IDSDB_NORMALIZE_KDPV_RADICAL_VARIANTS', '1')}")

print(inputs.hexdigest())
