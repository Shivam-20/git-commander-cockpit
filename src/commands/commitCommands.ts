import * as vscode from 'vscode';
import { execGit, runGitWithProgress } from '../git/git';

export async function commitCommand(): Promise<void> {
    const message = await vscode.window.showInputBox({
        prompt: 'Enter commit message',
        placeHolder: 'feat: add awesome feature'
    });

    if (!message) {
        return;
    }

    await runGitWithProgress('Committing...', ['commit', '-m', message]);

    vscode.window.showInformationMessage(`Committed: ${message}`);
}

export async function commitAmendCommand(): Promise<void> {
    // Check if the last commit has already been pushed to upstream
    try {
        const unpushedCount = await execGit(['rev-list', '--count', 'HEAD', '^@{upstream}']);
        if (unpushedCount.trim() === '0') {
            const result = await vscode.window.showWarningMessage(
                'The last commit has already been pushed. Amending will require a force-push. Continue?',
                { modal: true },
                'Amend'
            );
            if (result !== 'Amend') {
                return;
            }
        }
    } catch {
        // No upstream configured — safe to amend without warning
    }

    const currentMessage = await execGit(['log', '-1', '--pretty=%B']).catch(() => '');

    const message = await vscode.window.showInputBox({
        prompt: 'Amend last commit message (leave empty to keep current)',
        value: currentMessage,
        placeHolder: currentMessage
    });

    if (message === undefined) {
        return;
    }

    const args = message ? ['commit', '--amend', '-m', message] : ['commit', '--amend', '--no-edit'];

    await runGitWithProgress('Amending commit...', args);

    vscode.window.showInformationMessage('Last commit amended.');
}
