#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH}"

script_dir="${0:A:h}"
repo_root="${script_dir:h}"

input_text=""
if [[ "${1-}" == "--text" ]]; then
  input_text="${2-}"
elif [[ "${1-}" == "--stdin" ]] || [[ $# -eq 0 ]]; then
  input_text="$(cat)"
else
  input_text="$*"
fi

input_text="${input_text//$'\r'/}"
input_text="${input_text##[[:space:]]#}"
input_text="${input_text%%[[:space:]]#}"

if [[ -z "$input_text" ]]; then
  exit 0
fi

fnm_path=""
if (( $+commands[fnm] )); then
  fnm_path="fnm"
elif [[ -x /opt/homebrew/bin/fnm ]]; then
  fnm_path="/opt/homebrew/bin/fnm"
elif [[ -x /usr/local/bin/fnm ]]; then
  fnm_path="/usr/local/bin/fnm"
fi

typeset -a node_cmd
if [[ -n "$fnm_path" ]]; then
  node_cmd=("$fnm_path" exec --using=v24 node)
else
  if (( $+commands[node] )); then
    node_cmd=("node")
  elif [[ -x /opt/homebrew/bin/node ]]; then
    node_cmd=("/opt/homebrew/bin/node")
  elif [[ -x /usr/local/bin/node ]]; then
    node_cmd=("/usr/local/bin/node")
  else
    print -r -- "$input_text"
    exit 0
  fi
fi

cli="$repo_root/packages/mojidata-cli/bin/mojidata.js"
pnp="$repo_root/.pnp.cjs"

if [[ ! -f "$cli" ]] || [[ ! -f "$pnp" ]]; then
  print -r -- "$input_text"
  exit 0
fi

node_parser="$(cat <<'NODE'
const fs = require('fs');

const lines = fs.readFileSync(0, 'utf8')
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

function uniqInOrder(values) {
  const seen = new Set();
  const out = [];
  for (const v of values) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

const outputs = [];
for (const line of lines) {
  try {
    const obj = JSON.parse(line);
    const ids = Array.isArray(obj.ids) ? obj.ids.map((x) => x && x.IDS) : [];
    const uniq = uniqInOrder(ids);
    outputs.push(uniq.length ? uniq.join(',') : (obj.char ?? ''));
  } catch {
    // Ignore parse errors; they'll be handled by the caller.
  }
}

process.stdout.write(outputs.join('\n'));
NODE
)"

set +e
result="$("${node_cmd[@]}" -r "$pnp" "$cli" --select=char,ids "$input_text" 2>/dev/null | "${node_cmd[@]}" -e "$node_parser")"
exit_code=$?
set -e

if [[ $exit_code -ne 0 ]] || [[ -z "$result" ]]; then
  print -r -- "$input_text"
else
  print -r -- "$result"
fi
