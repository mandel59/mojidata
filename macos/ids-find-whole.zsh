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

cli="$repo_root/packages/idstool/bin/ids-find.js"
pnp="$repo_root/.pnp.cjs"

if [[ ! -f "$cli" ]] || [[ ! -f "$pnp" ]]; then
  print -r -- "$input_text"
  exit 0
fi

node_parser="$(cat <<'NODE'
const fs = require('fs');

const input = fs.readFileSync(0, 'utf8').replace(/\r/g, '');
const exprs = input
  .split(/\n+/)
  .map((s) => s.trim())
  .filter(Boolean);

function toCommaSeparatedCandidates(s) {
  const chars = Array.from((s ?? '').replace(/\s+/g, ''));
  // Preserve order, de-dup, skip empty.
  const seen = new Set();
  const out = [];
  for (const c of chars) {
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out.join(',');
}

const outs = [];
for (const line of exprs) {
  const out = toCommaSeparatedCandidates(line);
  outs.push(out);
}

process.stdout.write(outs.join('\n'));
NODE
)"

set +e
results=""
for expr in ${(f)input_text}; do
  r="$("${node_cmd[@]}" -r "$pnp" "$cli" --whole="$expr" 2>/dev/null)"
  rc=$?
  if [[ $rc -ne 0 ]]; then
    results=""
    break
  fi
  results+="${r}"$'\n'
done
set -e

if [[ -z "${results//[[:space:]]/}" ]]; then
  print -r -- "$input_text"
  exit 0
fi

formatted="$("${node_cmd[@]}" -e "$node_parser" <<<"$results")"
if [[ -z "${formatted//[[:space:]]/}" ]]; then
  print -r -- "$input_text"
else
  print -r -- "$formatted"
fi

