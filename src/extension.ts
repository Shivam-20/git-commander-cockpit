import * as vscode from 'vscode';
import { CockpitWebviewProvider } from './providers/cockpitWebviewProvider';
import { commitCommand, commitAmendCommand } from './commands/commitCommands';
import { createBranchCommand, fetchCommand, pullCommand, pushCommand, resetCommitCommand, revertLastCommitCommand, revertMultipleCommitsCommand, revertRecentCommitCommand, stashSaveCommand, switchBranchCommand } from './commands/repoCommands';
import { clearRepoCache } from './git/git';
import { showError } from './utils/logger';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const cockpitProvider = new CockpitWebviewProvider();

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            CockpitWebviewProvider.viewType,
            cockpitProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    const refresh = () => cockpitProvider.refresh();

    const hardRefresh = () => {
        clearRepoCache();
        cockpitProvider.refresh();
    };

    const disposable = vscode.Disposable.from(
        vscode.commands.registerCommand('gitCommander.refresh', hardRefresh),
        // File-level commands — still usable from command palette / keybindings
        vscode.commands.registerCommand('gitCommander.stage', () => {}),
        vscode.commands.registerCommand('gitCommander.stageAll', async () => { await vscode.commands.executeCommand('gitCommander.refresh'); }),
        vscode.commands.registerCommand('gitCommander.unstage', () => {}),
        vscode.commands.registerCommand('gitCommander.unstageAll', async () => { await vscode.commands.executeCommand('gitCommander.refresh'); }),
        vscode.commands.registerCommand('gitCommander.discard', () => {}),
        vscode.commands.registerCommand('gitCommander.openFile', () => {}),
        vscode.commands.registerCommand('gitCommander.openDiff', () => {}),
        vscode.commands.registerCommand('gitCommander.switchBranch', async () => {
            try { await switchBranchCommand(); refresh(); } catch (e) { showError('Failed to switch branch', e); }
        }),
        vscode.commands.registerCommand('gitCommander.createBranch', async () => {
            try { await createBranchCommand(); refresh(); } catch (e) { showError('Failed to create branch', e); }
        }),
        vscode.commands.registerCommand('gitCommander.fetch', async () => {
            try { await fetchCommand(); refresh(); } catch (e) { showError('Failed to fetch', e); }
        }),
        vscode.commands.registerCommand('gitCommander.pull', async () => {
            try { await pullCommand(); refresh(); } catch (e) { showError('Failed to pull', e); }
        }),
        vscode.commands.registerCommand('gitCommander.push', async () => {
            try { await pushCommand(); refresh(); } catch (e) { showError('Failed to push', e); }
        }),
        vscode.commands.registerCommand('gitCommander.stashSave', async () => {
            try { await stashSaveCommand(); refresh(); } catch (e) { showError('Failed to stash changes', e); }
        }),
        vscode.commands.registerCommand('gitCommander.revertLastCommit', async () => {
            try { await revertLastCommitCommand(); refresh(); } catch (e) { showError('Failed to revert latest commit', e); }
        }),
        vscode.commands.registerCommand('gitCommander.revertCommit', async () => {
            try { await revertRecentCommitCommand(); refresh(); } catch (e) { showError('Failed to revert selected commit', e); }
        }),
        vscode.commands.registerCommand('gitCommander.revertMultipleCommits', async () => {
            try { await revertMultipleCommitsCommand(); refresh(); } catch (e) { showError('Failed to revert selected commits', e); }
        }),
        vscode.commands.registerCommand('gitCommander.resetCommit', async () => {
            try { await resetCommitCommand(); refresh(); } catch (e) { showError('Failed to reset selected commit', e); }
        }),
        vscode.commands.registerCommand('gitCommander.commit', async () => {
            try { await commitCommand(); refresh(); } catch (e) { showError('Failed to commit', e); }
        }),
        vscode.commands.registerCommand('gitCommander.commitAmend', async () => {
            try { await commitAmendCommand(); refresh(); } catch (e) { showError('Failed to amend commit', e); }
        })
    );

    context.subscriptions.push(disposable);

    // Auto-refresh on .git/index changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/.git/index');
    watcher.onDidChange(hardRefresh);
    watcher.onDidCreate(hardRefresh);
    watcher.onDidDelete(hardRefresh);
    context.subscriptions.push(watcher);

    // Clear repo cache on workspace changes
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(hardRefresh));

    // Polling refresh every 3 seconds
    let interval: NodeJS.Timeout | undefined;
    const startPolling = () => { if (!interval) { interval = setInterval(refresh, 3000); } };
    const stopPolling  = () => { if (interval) { clearInterval(interval); interval = undefined; } };
    startPolling();
    context.subscriptions.push({ dispose: stopPolling });

    refresh();
}

export function deactivate(): void {}
