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
    // Check if last commit is already pushed
    try {
        const upstream = await execGit(['rev-parse', '--abbrev-ref', '@{upstream}']);
        if (upstream) {
            const result = await vscode.window.showWarningMessage(
                'The last commit appears to have an upstream branch. Amending may require force-push. Continue?',
                { modal: true },
                'Amend'
            );
            if (result !== 'Amend') {
                return;
            }
        }
    } catch {
        // No upstream, safe to amend
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
