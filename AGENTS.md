# AGENTS.md

- Use **Jujutsu VCS** for version control and commits.  
- When checking diffs, prefer `jj diff --git`: the default diff relies heavily on color to convey changes, but the agent can’t reliably interpret colorized output, while git-style diffs are explicit.  
- When committing, use the `jj commit fileset... -m "title" -m "description" -m "Related: #123" -m "Generated-by: Codex/GPT-5.4"` form, with the relevant issue number.  
  Example:

  ```sh
  jj commit path/to/file.ts -m "Refactor DB executor boundary" -m "Introduce SqlExecutor and move sql.js-specific statement handling into an adapter." -m "Related: #5" -m "Generated-by: Codex/GPT-5.4"
  ```

- When using Jujutsu, create a commit each time a coherent unit of work is completed.  

- Sandbox/approval note: in restricted environments, these typically require permission escalation:
  - `jj commit` (needs to write to `.git/objects` to create commit objects)
  - Integration tests that start local servers / bind ports (e.g. Vite) or launch browsers (e.g. Playwright)
