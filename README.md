# Git Commander

Git Commander is a VS Code extension that turns common Git operations into a focused sidebar workflow.

## Features

- Stage, unstage, discard, and open changed files from the sidebar
- View grouped working tree state in `Overview`, `Changes`, and `Actions`
- Commit and amend the latest commit
- Switch branches, create branches, fetch, pull, push, and stash changes
- Search commits by message, author, or hash before reverting or resetting
- Revert the latest commit, one selected commit, or multiple selected commits
- Reset a selected commit with `soft`, `mixed`, or `hard`

## How To Use

1. Open a folder that contains a Git repository.
2. Open the `Git Commander` activity-bar view.
3. Use the `Changes` section for file operations.
4. Use the `Actions` section for branch, sync, revert, and reset workflows.

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

- `gitCommander.autoRefresh`: refresh sidebar state automatically
- `gitCommander.confirmDiscard`: confirm discard operations
- `gitCommander.confirmHardReset`: confirm destructive reset operations
- `gitCommander.showActionSection`: show or hide the action section

## Notes

- The extension activates when a Git repository is present, when the view opens, or when its refresh command is invoked.
- Revert flows require a clean working tree before they run.
