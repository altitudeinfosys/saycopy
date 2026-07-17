# Agent Instructions

## Start From Latest Main

- Before starting any new branch, worktree, workdir, repository modification, implementation, experiment, or investigation that may lead to code changes, update from the latest upstream main first.
- Run `git fetch origin main` at minimum. When working from local `main`, fast-forward it with `git pull --ff-only origin main` before branching.
- Create new work branches and worktrees from the updated `origin/main` or updated local `main`, never from a stale local branch.
- If the repository uses a default branch other than `main`, apply the same rule to that default branch.
- If dirty local changes, conflicts, missing remotes, or worktree constraints prevent updating from main, stop and report the blocker before creating a branch, worktree, or starting implementation.
- For a brand-new repository with no remote yet, record that upstream sync is not applicable, initialize on `main`, and add the remote before future implementation work.

## Main Branch Protection

- Do not commit, push, merge, rebase, or otherwise apply agent-authored changes directly to `main`.
- All agent-authored implementation, documentation, configuration, and release changes must land through a feature branch and pull request unless the user explicitly overrides this rule for a one-off emergency.
- Do not perform local merges into `main` as a shortcut for integration testing; test the feature branch or pull request branch instead.

## Finish Fully Synced With Main

- Do not consider repository changes complete while they exist only in a local worktree or feature branch.
- After validation, commit and push all intended changes, open or update the pull request, and complete the merge into `origin/main` while respecting required reviews and checks. If permissions, approvals, conflicts, or failing checks prevent the merge, stop and report the blocker.
- After the merge, fetch `origin/main`, switch the primary local checkout to `main`, fast-forward it with `git pull --ff-only origin main`, and verify that local `main` and `origin/main` resolve to the same commit with a clean working tree.
- Push `main` only when necessary and permitted; never force-push `main` or bypass branch protection. A completed remote pull-request merge already updates `origin/main` and does not require a redundant direct push.

## Artifact Format

- All durable project artifacts created by agents must be HTML files unless the user explicitly requests a different format.
- This includes requirements captures, product specs, design docs, implementation plans, research summaries, testing guides, and handoff notes.
- Store project artifacts inside this project folder, preferably under `docs/`.
- Keep transient tool state, local servers, scratch files, and generated companion sessions out of Git unless explicitly requested.

## User Documentation Parity

- Every user-facing behavior change must include a documentation review in the same pull request.
- Update `website/support/index.html`, `website/setup/index.html`, or both whenever a change affects setup, model selection, language behavior, Auto-detect, transcription, translation, Light cleanup, privacy, billing, storage, permissions, or troubleshooting.
- Use the same labels and terminology in the app and website so users do not have to translate between two explanations.
- When a behavior change does not require a help or tutorial update, state the reason in the pull-request description.
- Validate the affected website pages and internal links before considering the change complete.
