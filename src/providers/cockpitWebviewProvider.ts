import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { execGit, getRepoState, findGitRepo, runGitWithProgress, safeRepoPath } from '../git/git';
import { showError } from '../utils/logger';

const ALLOWED_COMMANDS = new Set([
    'gitCommander.refresh', 'gitCommander.stage', 'gitCommander.stageAll',
    'gitCommander.unstage', 'gitCommander.unstageAll', 'gitCommander.discard',
    'gitCommander.openFile', 'gitCommander.openDiff', 'gitCommander.switchBranch',
    'gitCommander.createBranch', 'gitCommander.fetch', 'gitCommander.pull',
    'gitCommander.push', 'gitCommander.stashSave', 'gitCommander.revertLastCommit',
    'gitCommander.revertCommit', 'gitCommander.revertMultipleCommits',
    'gitCommander.resetCommit', 'gitCommander.commit', 'gitCommander.commitAmend',
    'gitCommander.timeMachine', 'gitCommander.undoLast', 'gitCommander.repoConfig',
    'gitCommander.lfsManager', 'gitCommander.exportPatch', 'gitCommander.applyPatch',
    'gitCommander.oopsMacros', 'gitCommander.cleanMergedBranches', 'gitCommander.wipBackup',
    'git.openChange', 'vscode.diff'
]);

type WebviewMessage =
    | { type: 'exec'; cmd: string }
    | { type: 'execMenu'; menu: string }
    | { type: 'stage'; path: string }
    | { type: 'stageAll'; scope?: string }
    | { type: 'stageAllUntracked'; paths?: string[] }
    | { type: 'unstage'; path: string }
    | { type: 'unstageAll' }
    | { type: 'discard'; path: string; status: string }
    | { type: 'openFile'; path: string }
    | { type: 'openDiff'; path: string; status: string }
    | { type: 'commit'; message: string }
    | { type: 'refresh' };

export class CockpitWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'gitCommanderCockpit';
    private _view?: vscode.WebviewView;
    private _lastStateJson = '';
    private _visibilityChangeEmitter = new vscode.EventEmitter<boolean>();
    public readonly onDidChangeVisibility = this._visibilityChangeEmitter.event;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    get isVisible(): boolean {
        return this._view?.visible ?? false;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._buildHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            await this._handleMessage(msg);
        });

        webviewView.onDidChangeVisibility(() => {
            this._visibilityChangeEmitter.fire(webviewView.visible);
        });

        this.refresh();
    }

    private async _handleMessage(msg: WebviewMessage): Promise<void> {
        const cleanPath = 'path' in msg && msg.path ? msg.path.replace(/^"(.*)"$/, '$1') : undefined;

        try {
            switch (msg.type) {
                case 'exec':
                    if (msg.cmd) {
                        if (!ALLOWED_COMMANDS.has(msg.cmd)) {
                            showError(`Rejected unknown command: ${msg.cmd}`);
                            return;
                        }
                        await vscode.commands.executeCommand(msg.cmd);
                    }
                    break;
                case 'execMenu':
                    if (msg.menu === 'sync') {
                        const pick = await vscode.window.showQuickPick(
                            [
                                { label: 'Fetch', command: 'gitCommander.fetch' },
                                { label: 'Pull', command: 'gitCommander.pull' },
                                { label: 'Push', command: 'gitCommander.push' }
                            ],
                            { placeHolder: 'Sync with remote' }
                        );
                        if (pick?.command) {
                            if (!ALLOWED_COMMANDS.has(pick.command)) {
                                showError(`Rejected unknown command: ${pick.command}`);
                                return;
                            }
                            await vscode.commands.executeCommand(pick.command);
                        }
                    }
                    break;
                case 'stage':
                    if (!cleanPath) { return; }
                    await execGit(['add', '--', cleanPath]);
                    await this.refresh();
                    break;
                case 'stageAll':
                    await execGit(['add', '-A', '--', msg.scope ?? '.']);
                    await this.refresh();
                    break;
                case 'stageAllUntracked': {
                    let paths = msg.paths;
                    if (!paths || paths.length === 0) {
                        const repoState = await getRepoState();
                        paths = repoState.files.filter((f) => f.status === 'untracked').map((f) => f.path);
                    }
                    if (paths.length > 0) {
                        await execGit(['add', '--', ...paths]);
                    }
                    await this.refresh();
                    break;
                }
                case 'unstage':
                    if (!cleanPath) { return; }
                    await execGit(['restore', '--staged', '--', cleanPath]);
                    await this.refresh();
                    break;
                case 'unstageAll':
                    await execGit(['restore', '--staged', '--', '.']);
                    await this.refresh();
                    break;
                case 'discard':
                    if (!cleanPath) { return; }
                    await this._discard(cleanPath, msg.status ?? '');
                    await this.refresh();
                    break;
                case 'openFile':
                    if (!cleanPath) { return; }
                    await this._openFile(cleanPath);
                    break;
                case 'openDiff':
                    if (!cleanPath) { return; }
                    await this._openDiff(cleanPath, msg.status ?? '');
                    break;
                case 'commit':
                    if (msg.message?.trim()) {
                        await runGitWithProgress('Committing...', ['commit', '-m', msg.message.trim()]);
                        this._postToast('Committed successfully.', 'info');
                        this._view?.webview.postMessage({ type: 'commitDone' });
                        await this.refresh();
                    }
                    break;
                case 'refresh':
                    await this.refresh();
                    break;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Git operation failed';
            showError(message, error);
            this._postToast(message, 'error');
        }
    }

    async refresh(): Promise<void> {
        if (!this._view) { return; }
        try {
            const state = await getRepoState();
            const config = vscode.workspace.getConfiguration('gitCommander');
            const settings = {
                showActionSection: config.get<boolean>('showActionSection', true),
                compactActions: config.get<boolean>('compactActions', false)
            };
            const stateJson = JSON.stringify({ state, settings });
            if (stateJson !== this._lastStateJson) {
                this._lastStateJson = stateJson;
                this._view.webview.postMessage({ type: 'state', state, settings });
            }
        } catch (error) {
            this._lastStateJson = '';
            this._view.webview.postMessage({ type: 'noRepo' });
        }
    }

    private _postToast(message: string, level: 'info' | 'error'): void {
        this._view?.webview.postMessage({ type: 'toast', message, level });
    }

    private async _discard(filePath: string, status: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('gitCommander');
        if (config.get<boolean>('confirmDiscard', true)) {
            const res = await vscode.window.showWarningMessage(
                `Discard changes in ${filePath}?`, { modal: true }, 'Discard'
            );
            if (res !== 'Discard') { return; }
        }
        if (status === 'untracked') {
            const repoRoot = await findGitRepo();
            if (repoRoot) {
                const fullPath = safeRepoPath(repoRoot, filePath);
                if (!fullPath) { return; }
                await vscode.workspace.fs.delete(vscode.Uri.file(fullPath), { recursive: true });
            }
        } else if (status === 'staged') {
            await execGit(['restore', '--staged', '--', filePath]);
            await execGit(['restore', '--', filePath]);
        } else {
            await execGit(['restore', '--', filePath]);
        }
    }

    private async _openFile(filePath: string): Promise<void> {
        const repoRoot = await findGitRepo();
        if (!repoRoot) { return; }
        const fullPath = safeRepoPath(repoRoot, filePath);
        if (!fullPath) { return; }
        const uri = vscode.Uri.file(fullPath);
        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
    }

    private async _openDiff(filePath: string, status: string): Promise<void> {
        if (status === 'untracked') {
            return this._openFile(filePath);
        }
        const repoRoot = await findGitRepo();
        if (!repoRoot) { return; }
        const fullPath = safeRepoPath(repoRoot, filePath);
        if (!fullPath) { return; }
        const uri = vscode.Uri.file(fullPath);

        try {
            await vscode.commands.executeCommand('git.openChange', uri);
        } catch {
            const ref = status === 'staged' ? '' : 'HEAD';
            const left = uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.fsPath, ref }) });
            const title = status === 'staged'
                ? `${filePath} (Index ↔ Working Tree)`
                : `${filePath} (HEAD ↔ Working Tree)`;
            await vscode.commands.executeCommand('vscode.diff', left, uri, title);
        }
    }

    private _buildHtml(webview: vscode.Webview): string {
        const cockpitDir = vscode.Uri.joinPath(this._extensionUri, 'media', 'cockpit');
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(cockpitDir, 'styles.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(cockpitDir, 'main.js'));
        const codiconUri = webview.asWebviewUri(vscode.Uri.joinPath(cockpitDir, 'codicon.css'));

        const htmlPath = path.join(cockpitDir.fsPath, 'index.html');
        const html = fs.readFileSync(htmlPath, 'utf8');

        return html
            .replace(/\{\{CSP_SOURCE\}\}/g, webview.cspSource)
            .replace(/\{\{STYLE_URI\}\}/g, styleUri.toString())
            .replace(/\{\{SCRIPT_URI\}\}/g, scriptUri.toString())
            .replace(/\{\{CODICON_URI\}\}/g, codiconUri.toString());
    }
}

/** Pick a changed file and run an action — used by palette commands. */
export async function pickFileAndRun(
    action: (filePath: string, status: string) => Promise<void>,
    placeHolder: string
): Promise<void> {
    const state = await getRepoState();
    if (state.files.length === 0) {
        vscode.window.showInformationMessage('No changed files in the working tree.');
        return;
    }
    const items = state.files.map((f) => ({
        label: f.path,
        description: f.status,
        path: f.path,
        status: f.status
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder });
    if (picked) {
        await action(picked.path, picked.status);
    }
}
