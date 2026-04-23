import * as vscode from 'vscode';
import { WorkingTreeProvider, FileItem } from './providers/workingTreeProvider';
import { commitCommand, commitAmendCommand } from './commands/commitCommands';
import { createBranchCommand, fetchCommand, pullCommand, pushCommand, resetCommitCommand, revertLastCommitCommand, revertMultipleCommitsCommand, revertRecentCommitCommand, stashSaveCommand, switchBranchCommand } from './commands/repoCommands';
import { findGitRepo, clearRepoCache } from './git/git';
import { showError } from './utils/logger';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const workingTreeProvider = new WorkingTreeProvider();

    vscode.window.registerTreeDataProvider('gitCommanderWorkingTree', workingTreeProvider);

    const refresh = () => {
        clearRepoCache();
        workingTreeProvider.refresh();
    };

    const disposable = vscode.Disposable.from(
        vscode.commands.registerCommand('gitCommander.refresh', refresh),
        vscode.commands.registerCommand('gitCommander.stage', (item: FileItem) => workingTreeProvider.stage(item)),
        vscode.commands.registerCommand('gitCommander.stageAll', () => workingTreeProvider.stage()),
        vscode.commands.registerCommand('gitCommander.unstage', (item: FileItem) => workingTreeProvider.unstage(item)),
        vscode.commands.registerCommand('gitCommander.unstageAll', () => workingTreeProvider.unstage()),
        vscode.commands.registerCommand('gitCommander.discard', (item: FileItem) => workingTreeProvider.discard(item)),
        vscode.commands.registerCommand('gitCommander.openFile', (item: FileItem) => workingTreeProvider.openFile(item)),
        vscode.commands.registerCommand('gitCommander.openDiff', (item: FileItem) => workingTreeProvider.openDiff(item)),
        vscode.commands.registerCommand('gitCommander.switchBranch', async () => {
            try {
                await switchBranchCommand();
                refresh();
            } catch (error) {
                showError('Failed to switch branch', error);
            }
        }),
        vscode.commands.registerCommand('gitCommander.createBranch', async () => {
            try {
                await createBranchCommand();
                refresh();
            } catch (error) {
                showError('Failed to create branch', error);
            }
        }),
        vscode.commands.registerCommand('gitCommander.fetch', async () => {
            try {
                await fetchCommand();
                refresh();
            } catch (error) {
                showError('Failed to fetch', error);
            }
        }),
        vscode.commands.registerCommand('gitCommander.pull', async () => {
            try {
                await pullCommand();
                refresh();
            } catch (error) {
                showError('Failed to pull', error);
            }
        }),
        vscode.commands.registerCommand('gitCommander.push', async () => {
            try {
                await pushCommand();
                refresh();
            } catch (error) {
                showError('Failed to push', error);
            }
        }),
        vscode.commands.registerCommand('gitCommander.stashSave', async () => {
            try {
                await stashSaveCommand();
                refresh();
            } catch (error) {
                showError('Failed to stash changes', error);
            }
        }),
        vscode.commands.registerCommand('gitCommander.revertLastCommit', async () => {
            try {
                await revertLastCommitCommand();
                refresh();
            } catch (error) {
                showError('Failed to revert latest commit', error);
            }
        }),
        vscode.commands.registerCommand('gitCommander.revertCommit', async () => {
            try {
                await revertRecentCommitCommand();
                refresh();
            } catch (error) {
                showError('Failed to revert selected commit', error);
            }
        }),
        vscode.commands.registerCommand('gitCommander.revertMultipleCommits', async () => {
            try {
                await revertMultipleCommitsCommand();
                refresh();
            } catch (error) {
                showError('Failed to revert selected commits', error);
            }
        }),
        vscode.commands.registerCommand('gitCommander.resetCommit', async () => {
            try {
                await resetCommitCommand();
                refresh();
            } catch (error) {
                showError('Failed to reset selected commit', error);
            }
        }),
        vscode.commands.registerCommand('gitCommander.commit', async () => {
            try {
                await commitCommand();
                refresh();
            } catch (error) {
                showError('Failed to commit', error);
            }
        }),
        vscode.commands.registerCommand('gitCommander.commitAmend', async () => {
            try {
                await commitAmendCommand();
                refresh();
            } catch (error) {
                showError('Failed to amend commit', error);
            }
        })
    );

    context.subscriptions.push(disposable);

    // Auto-refresh on file changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/.git/index');
    watcher.onDidChange(refresh);
    watcher.onDidCreate(refresh);
    watcher.onDidDelete(refresh);
    context.subscriptions.push(watcher);

    // Polling refresh every 3 seconds keeps branch and sync status fresh.
    let interval: NodeJS.Timeout | undefined;
    const startPolling = () => {
        if (!interval) {
            interval = setInterval(refresh, 3000);
        }
    };
    const stopPolling = () => {
        if (interval) {
            clearInterval(interval);
            interval = undefined;
        }
    };

    vscode.window.onDidChangeVisibleTextEditors(() => {
        // Keep polling simple; we poll continuously while extension is active
    });

    startPolling();
    context.subscriptions.push({ dispose: stopPolling });

    // Initial refresh
    refresh();
}

export function deactivate(): void {
    // Cleanup handled by disposables
}
