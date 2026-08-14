# idsflow-eids

This optional adapter converts an IDSgrep EIDS dictionary to the versioned,
backend-independent `idsflow-records` JSONL format.

```sh
yarn workspace @mandel59/idsflow-eids exec idsflow-eids \
  --data-source chise dictionary.eids > chise.idsflow.jsonl
```

The adapter canonicalizes supported IDSgrep operator aliases, removes
structural-node heads, and maps named components to IDS entity tokens.
Structures that ordinary IDS cannot represent are counted as skipped and the
count is recorded in the JSONL header.

The package depends on the MIT-licensed `@mandel59/idsdb-utils`; no MIT
Mojidata package depends on this adapter. Run it as a separate process and
pass only its output file to a database builder. This package's license does
not determine the license of an input dictionary or of data derived from it;
review the data source's terms separately.

## License

Undecided. The package is private and marked `UNLICENSED` until a license is
selected.
