# Agent Instructions

## Start From Latest Main

- Before starting any new branch, worktree, workdir, repository modification, implementation, experiment, or investigation that may lead to code changes, update from the latest upstream main first.
- Run `git fetch origin main` at minimum. When working from local `main`, fast-forward it with `git pull --ff-only origin main` before branching.
- Create new work branches and worktrees from the updated `origin/main` or updated local `main`, never from a stale local branch.
- If the repository uses a default branch other than `main`, apply the same rule to that default branch.
- If dirty local changes, conflicts, missing remotes, or worktree constraints prevent updating from main, stop and report the blocker before creating a branch, worktree, or starting implementation.
- For a brand-new repository with no remote yet, record that upstream sync is not applicable, initialize on `main`, and add the remote before future implementation work.

## Artifact Format

- All durable project artifacts created by agents must be HTML files unless the user explicitly requests a different format.
- This includes requirements captures, product specs, design docs, implementation plans, research summaries, testing guides, and handoff notes.
- Store project artifacts inside this project folder, preferably under `docs/`.
- Keep transient tool state, local servers, scratch files, and generated companion sessions out of Git unless explicitly requested.
