# Git Commander Cockpit

Git Commander is a VS Code extension that turns common Git operations into a focused sidebar workflow.

## Features

- Stage, unstage, discard, and open changed files from the sidebar
- Inline commit message box with one-click commit
- Filter changed files by path in the Changes section
- View grouped working tree state: Overview, Changes, and action sections
- Commit and amend the latest commit
- Switch branches, create branches, fetch, pull, push, and stash changes
- Search commits by message, author, or hash before reverting or resetting
- Revert the latest commit, one selected commit, or multiple selected commits
- Reset a selected commit with `soft`, `mixed`, or `hard`
- Oops macros, WIP backup, LFS manager, patch export/apply, and more

## How To Use

1. Open a folder that contains a Git repository.
2. Open the **Git Commander** activity-bar view.
3. Use the toolbar for quick Refresh, Stage All, and Commit.
4. Use the **Changes** section for file operations, filtering, and inline commits.
5. Use the action sections for branch, sync, revert, and reset workflows.

## Sidebar Sections

- **Overview** — branch, upstream, sync status, stash count (click branch or sync badges for quick actions)
- **Changes** — commit box, file filter, and grouped files (Conflicted, Staged, Unstaged, Untracked)
- **Commits & Changes** — commit, amend, stash
- **Branch & Remote** — switch, create, fetch, pull, push
- **History & Revert** — undo, time machine, revert, reset
- **Tools & Workflows** — oops macros, WIP backup, LFS, patches, repo config

Enable `gitCommander.compactActions` to collapse the four action sections into one compact panel.

## Commit History Operations

### Search And Revert Commit

- Opens a searchable commit picker
- Filters by commit message, author, or hash
- Reverts exactly one selected commit

### Revert Multiple Commits

- Opens the same searchable picker in multi-select mode
- Reverts every selected commit in stable history order

### Reset Commit

- Opens a searchable commit picker
- Lets you choose one commit
- Prompts for `soft`, `mixed`, or `hard`

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `gitCommander.autoRefresh` | `true` | Poll for Git state changes every 3 seconds (file watcher always refreshes) |
| `gitCommander.confirmDiscard` | `true` | Confirm before discarding file changes |
| `gitCommander.confirmHardReset` | `true` | Confirm before hard reset operations |
| `gitCommander.showActionSection` | `true` | Show action sections in the sidebar |
| `gitCommander.compactActions` | `false` | Collapse action sections into one panel |

## Notes

- The extension activates when a Git repository is present in the workspace.
- Revert flows require a clean working tree before they run.
- Partially staged files appear in both Staged and Unstaged groups.
- Palette commands for stage/unstage/discard/open/diff prompt you to pick a file.
