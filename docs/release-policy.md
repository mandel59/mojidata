# Release Policy

- Every package in `packages/*` is currently considered publishable except explicitly private/internal workspaces such as `@mandel59/mojidata-api-bench`.
- Add a normal changeset when a user-visible package change should affect versioning or changelog output.
- Add an empty changeset when the change is repo-only infrastructure, CI/CD, policy, or documentation work.
- Keep `@mandel59/mojidata-api` in the release set while it serves as the published compatibility facade.
