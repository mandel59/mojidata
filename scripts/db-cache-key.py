#!/usr/bin/env python3
"""Compute Actions restore keys from source inputs, before restoring DB artifacts."""
import os
import pathlib
from db_build_inputs import BuildInputs

root = pathlib.Path(__file__).resolve().parent.parent


def cache_key(packages):
    inputs = BuildInputs(root)
    inputs.add_file(pathlib.Path(__file__).resolve())
    for package in packages:
        directory = root / "packages" / package
        for name in ["package.json", "tsconfig.json", "download.txt", "prepare.ts", "index.ts", "node.ts"]:
            if (directory / name).exists():
                inputs.add_file(directory / name)
        for pattern in ["scripts/**/*", "lib/**/*.ts", "recipes/**/*", "build-data/**/*", "build-*-derived.ts"]:
            for file in sorted(directory.glob(pattern)):
                if file.is_file() and "__pycache__" not in file.parts:
                    inputs.add_file(file)
    return inputs.hexdigest()


keys = {
    "mojidata": cache_key(["mojidata"]),
    "idsdb": cache_key(["mojidata", "idsdb-utils", "idsdb", "idsdb-fts5", "idsdb-bvec"]),
}
for name, value in keys.items():
    print(f"{name}={value}")
if os.environ.get("GITHUB_OUTPUT"):
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        for name, value in keys.items():
            output.write(f"{name}={value}\n")
