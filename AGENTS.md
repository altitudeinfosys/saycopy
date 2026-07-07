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

## Artifact Format

- All durable project artifacts created by agents must be HTML files unless the user explicitly requests a different format.
- This includes requirements captures, product specs, design docs, implementation plans, research summaries, testing guides, and handoff notes.
- Store project artifacts inside this project folder, preferably under `docs/`.
- Keep transient tool state, local servers, scratch files, and generated companion sessions out of Git unless explicitly requested.
