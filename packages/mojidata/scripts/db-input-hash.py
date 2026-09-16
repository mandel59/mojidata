#!/usr/bin/env python3
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root.parent.parent / "scripts"))
from db_build_inputs import BuildInputs

inputs = BuildInputs(root.parent.parent)
add_file = inputs.add_file
add_line = lambda value: inputs.add("cache", value)

for rel in [
    pathlib.Path("download.txt"),
    pathlib.Path("package.json"),
]:
    add_file(root / rel)

build_data = root / "build-data" / "unihan-tr38-properties.json"
if build_data.exists():
    add_file(build_data)

scripts_dir = root / "scripts"
for p in sorted([p for p in scripts_dir.rglob("*") if p.is_file()]):
    add_file(p)

for line in (root / "download.txt").read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    parts = line.split(maxsplit=2)
    if len(parts) < 3:
        continue
    name, digest, url = parts
    link = root / "cache" / name
    target = "MISSING"
    if link.exists() or link.is_symlink():
        try:
            target = str(link.readlink()) if link.is_symlink() else "PRESENT"
        except OSError:
            target = "PRESENT"
    add_line(f"CACHE\t{name}\t{digest}\t{url}\t{target}")

print(inputs.hexdigest())
