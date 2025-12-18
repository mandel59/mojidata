# AGENTS.md

- Use **Jujutsu VCS** for version control and commits.  
- Include agent and model details in the commit-message trailers.  
  Example:  

  ```text
  Generated-by: Codex (GPT-5.2, reasoning: medium)
  ```

- When creating multi-line commit messages, do **not** pass `\n` escapes to `jj commit -m` (they will be recorded literally).  
  Use `$'...'` or a heredoc to include real newlines, e.g.:

  ```sh
  jj commit -m $'Subject line\n\nGenerated-by: Codex (GPT-5.2, reasoning: medium)'
  ```
