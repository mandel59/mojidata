#!/usr/bin/env python3
import hashlib
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
h = hashlib.sha256()


def add_line(s: str):
    h.update(s.encode("utf-8"))
    h.update(b"\n")


def add_file(path: pathlib.Path):
    rel = path.relative_to(root)
    add_line(f"FILE\t{rel.as_posix()}")
    h.update(path.read_bytes())
    h.update(b"\n")


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

print(h.hexdigest())
