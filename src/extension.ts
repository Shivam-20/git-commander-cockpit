import * as vscode from 'vscode';
import { CockpitWebviewProvider, pickFileAndRun } from './providers/cockpitWebviewProvider';
import { commitCommand, commitAmendCommand } from './commands/commitCommands';
import { createBranchCommand, fetchCommand, pullCommand, pushCommand, resetCommitCommand, revertLastCommitCommand, revertMultipleCommitsCommand, revertRecentCommitCommand, stashSaveCommand, switchBranchCommand, timeMachineCommand, undoLastCommand, repoConfigCommand, lfsManagerCommand, exportPatchCommand, applyPatchCommand, oopsMacrosCommand, cleanMergedBranchesCommand, wipBackupCommand } from './commands/repoCommands';
import { clearRepoCache, execGit, findGitRepo } from './git/git';
import { showError } from './utils/logger';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    const cockpitProvider = new CockpitWebviewProvider(context.extensionUri);

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

    const config = () => vscode.workspace.getConfiguration('gitCommander');

    const disposable = vscode.Disposable.from(
        vscode.commands.registerCommand('gitCommander.refresh', hardRefresh),
        vscode.commands.registerCommand('gitCommander.stage', () =>
            pickFileAndRun(async (p) => { await execGit(['add', '--', p]); refresh(); }, 'Select file to stage')
        ),
        vscode.commands.registerCommand('gitCommander.stageAll', async () => {
            await execGit(['add', '-A', '--', '.']);
            refresh();
        }),
        vscode.commands.registerCommand('gitCommander.unstage', () =>
            pickFileAndRun(async (p) => { await execGit(['restore', '--staged', '--', p]); refresh(); }, 'Select file to unstage')
        ),
        vscode.commands.registerCommand('gitCommander.unstageAll', async () => {
            await execGit(['restore', '--staged', '--', '.']);
            refresh();
        }),
        vscode.commands.registerCommand('gitCommander.discard', () =>
            pickFileAndRun(async (p, status) => {
                if (status === 'untracked') {
                    const root = await findGitRepo();
                    if (root) {
                        await vscode.workspace.fs.delete(vscode.Uri.file(`${root}/${p}`), { recursive: true });
                    }
                } else {
                    await execGit(['restore', '--', p]);
                }
                refresh();
            }, 'Select file to discard changes')
        ),
        vscode.commands.registerCommand('gitCommander.openFile', () =>
            pickFileAndRun(async (p) => {
                const root = await findGitRepo();
                if (root) {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(`${root}/${p}`));
                    await vscode.window.showTextDocument(doc);
                }
            }, 'Select file to open')
        ),
        vscode.commands.registerCommand('gitCommander.openDiff', () =>
            pickFileAndRun(async (p) => {
                const root = await findGitRepo();
                if (root) {
                    const uri = vscode.Uri.file(`${root}/${p}`);
                    try {
                        await vscode.commands.executeCommand('git.openChange', uri);
                    } catch {
                        const left = uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.fsPath, ref: 'HEAD' }) });
                        await vscode.commands.executeCommand('vscode.diff', left, uri, `${p} (HEAD ↔ Working Tree)`);
                    }
                }
            }, 'Select file to diff')
        ),
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
        }),
        vscode.commands.registerCommand('gitCommander.timeMachine', async () => {
            try { await timeMachineCommand(); refresh(); } catch (e) { showError('Failed to run time machine', e); }
        }),
        vscode.commands.registerCommand('gitCommander.undoLast', async () => {
            try { await undoLastCommand(); refresh(); } catch (e) { showError('Failed to undo last action', e); }
        }),
        vscode.commands.registerCommand('gitCommander.repoConfig', async () => {
            try { await repoConfigCommand(); refresh(); } catch (e) { showError('Failed to configure repo', e); }
        }),
        vscode.commands.registerCommand('gitCommander.lfsManager', async () => {
            try { await lfsManagerCommand(); refresh(); } catch (e) { showError('Failed to manage LFS', e); }
        }),
        vscode.commands.registerCommand('gitCommander.exportPatch', async () => {
            try { await exportPatchCommand(); } catch (e) { showError('Failed to export patch', e); }
        }),
        vscode.commands.registerCommand('gitCommander.applyPatch', async () => {
            try { await applyPatchCommand(); refresh(); } catch (e) { showError('Failed to apply patch', e); }
        }),
        vscode.commands.registerCommand('gitCommander.oopsMacros', async () => {
            try { await oopsMacrosCommand(); refresh(); } catch (e) { showError('Failed to execute oops macro', e); }
        }),
        vscode.commands.registerCommand('gitCommander.cleanMergedBranches', async () => {
            try { await cleanMergedBranchesCommand(); refresh(); } catch (e) { showError('Failed to clean merged branches', e); }
        }),
        vscode.commands.registerCommand('gitCommander.wipBackup', async () => {
            try { await wipBackupCommand(); refresh(); } catch (e) { showError('Failed to manage WIP backup', e); }
        })
    );

    context.subscriptions.push(disposable);

    const watcher = vscode.workspace.createFileSystemWatcher('**/.git/index');
    watcher.onDidChange(hardRefresh);
    watcher.onDidCreate(hardRefresh);
    watcher.onDidDelete(hardRefresh);
    context.subscriptions.push(watcher);

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(hardRefresh));

    let interval: NodeJS.Timeout | undefined;
    const startPolling = () => {
        if (!interval && config().get<boolean>('autoRefresh', true)) {
            interval = setInterval(refresh, 3000);
        }
    };
    const stopPolling = () => {
        if (interval) {
            clearInterval(interval);
            interval = undefined;
        }
    };
    const syncPolling = () => {
        stopPolling();
        startPolling();
    };

    syncPolling();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('gitCommander.autoRefresh')) {
                syncPolling();
            }
            if (e.affectsConfiguration('gitCommander.showActionSection') ||
                e.affectsConfiguration('gitCommander.compactActions')) {
                refresh();
            }
        })
    );
    context.subscriptions.push({ dispose: stopPolling });

    refresh();
}

export function deactivate(): void {}
