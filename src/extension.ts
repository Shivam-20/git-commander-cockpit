import * as vscode from 'vscode';
import { CockpitWebviewProvider, pickFileAndRun } from './providers/cockpitWebviewProvider';
import { commitCommand, commitAmendCommand } from './commands/commitCommands';
import {
    createBranchCommand, fetchCommand, pullCommand, pushCommand,
    revertMultipleCommitsCommand, stashSaveCommand, switchBranchCommand,
    timeMachineCommand, repoConfigCommand, lfsManagerCommand,
    exportPatchCommand, applyPatchCommand, oopsMacrosCommand,
    cleanMergedBranchesCommand, wipBackupCommand
} from './commands/repoCommands';
import { enhancedRevertLastCommit, enhancedRevertSelectedCommit } from './commands/revert';
import { enhancedResetCommit } from './commands/reset';
import { enhancedUndoLastAction } from './commands/undo';
import { clearRepoCache, execGit, findGitRepo, safeRepoPath } from './git/git';
import { showError } from './utils/logger';

type CommandFn = () => Promise<void>;

function registerWithRefresh(
    id: string,
    fn: CommandFn,
    refresh: () => void,
    errorMsg: string
): vscode.Disposable {
    return vscode.commands.registerCommand(id, async () => {
        try {
            await fn();
            refresh();
        } catch (e) {
            showError(errorMsg, e);
        }
    });
}

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

    const commands: Array<[string, CommandFn, string]> = [
        ['gitCommander.switchBranch', switchBranchCommand, 'Failed to switch branch'],
        ['gitCommander.createBranch', createBranchCommand, 'Failed to create branch'],
        ['gitCommander.fetch', fetchCommand, 'Failed to fetch'],
        ['gitCommander.pull', pullCommand, 'Failed to pull'],
        ['gitCommander.push', pushCommand, 'Failed to push'],
        ['gitCommander.stashSave', stashSaveCommand, 'Failed to stash changes'],
        ['gitCommander.revertLastCommit', enhancedRevertLastCommit, 'Failed to revert latest commit'],
        ['gitCommander.revertCommit', enhancedRevertSelectedCommit, 'Failed to revert selected commit'],
        ['gitCommander.revertMultipleCommits', revertMultipleCommitsCommand, 'Failed to revert selected commits'],
        ['gitCommander.resetCommit', enhancedResetCommit, 'Failed to reset selected commit'],
        ['gitCommander.commit', commitCommand, 'Failed to commit'],
        ['gitCommander.commitAmend', commitAmendCommand, 'Failed to amend commit'],
        ['gitCommander.timeMachine', timeMachineCommand, 'Failed to run time machine'],
        ['gitCommander.undoLast', enhancedUndoLastAction, 'Failed to undo last action'],
        ['gitCommander.repoConfig', repoConfigCommand, 'Failed to configure repo'],
        ['gitCommander.lfsManager', lfsManagerCommand, 'Failed to manage LFS'],
        ['gitCommander.applyPatch', applyPatchCommand, 'Failed to apply patch'],
        ['gitCommander.oopsMacros', oopsMacrosCommand, 'Failed to execute oops macro'],
        ['gitCommander.cleanMergedBranches', cleanMergedBranchesCommand, 'Failed to clean merged branches'],
        ['gitCommander.wipBackup', wipBackupCommand, 'Failed to manage WIP backup'],
    ];

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
                        const filePath = safeRepoPath(root, p);
                        if (!filePath) { return; }
                        await vscode.workspace.fs.delete(vscode.Uri.file(filePath), { recursive: true });
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
                    const filePath = safeRepoPath(root, p);
                    if (!filePath) { return; }
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                    await vscode.window.showTextDocument(doc);
                }
            }, 'Select file to open')
        ),
        vscode.commands.registerCommand('gitCommander.openDiff', () =>
            pickFileAndRun(async (p) => {
                const root = await findGitRepo();
                if (root) {
                    const filePath = safeRepoPath(root, p);
                    if (!filePath) { return; }
                    const uri = vscode.Uri.file(filePath);
                    try {
                        await vscode.commands.executeCommand('git.openChange', uri);
                    } catch {
                        const left = uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.fsPath, ref: 'HEAD' }) });
                        await vscode.commands.executeCommand('vscode.diff', left, uri, `${p} (HEAD ↔ Working Tree)`);
                    }
                }
            }, 'Select file to diff')
        ),
        vscode.commands.registerCommand('gitCommander.exportPatch', async () => {
            try { await exportPatchCommand(); } catch (e) { showError('Failed to export patch', e); }
        }),

        ...commands.map(([id, fn, error]) => registerWithRefresh(id, fn, refresh, error))
    );

    context.subscriptions.push(disposable);

    const watcher = vscode.workspace.createFileSystemWatcher('**/.git/index');
    watcher.onDidChange(hardRefresh);
    watcher.onDidCreate(hardRefresh);
    watcher.onDidDelete(hardRefresh);
    context.subscriptions.push(watcher);

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(hardRefresh));

    const config = () => vscode.workspace.getConfiguration('gitCommander');

    let interval: NodeJS.Timeout | undefined;
    const startPolling = () => {
        if (!interval && config().get<boolean>('autoRefresh', true) && cockpitProvider.isVisible) {
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

    context.subscriptions.push(
        cockpitProvider.onDidChangeVisibility((visible) => {
            if (visible) {
                startPolling();
            } else {
                stopPolling();
            }
        })
    );

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
