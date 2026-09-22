# AGENTS.md

- Use **Jujutsu VCS** for version control and commits.  
- When checking diffs, prefer `jj diff --git`: the default diff relies heavily on color to convey changes, but the agent can’t reliably interpret colorized output, while git-style diffs are explicit.  
- When committing, use the `jj commit fileset... -m "title" -m "description" -m "Related: #123" -m "Generated-by: Codex/<actual model>"` form, with the relevant issue number.
- Replace `<actual model>` with the model identity supplied by the current session or explicitly confirmed by the user. Do not copy a model name from an old commit or example. If the exact model is unavailable, use `Generated-by: Codex (model unavailable)` instead of guessing. Include the exact model variant when available.
  Example:

  ```sh
  jj commit path/to/file.ts -m "Refactor DB executor boundary" -m "Introduce SqlExecutor and move sql.js-specific statement handling into an adapter." -m "Related: #5" -m "Generated-by: Codex/<actual model>"
  ```

- When using Jujutsu, create a commit each time a coherent unit of work is completed.  

- When updating Unicode data, follow [the Unicode update workflow](docs/unicode-update.md). Compare property definitions and actual data with the previous version, and check DB views, API relation queries, and search registrations before considering the update complete.

- Sandbox/approval note: in restricted environments, these typically require permission escalation:
  - `jj commit` (needs to write to `.git/objects` to create commit objects)
  - Integration tests that start local servers / bind ports (e.g. Vite) or launch browsers (e.g. Playwright)
