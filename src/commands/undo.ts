import * as vscode from 'vscode';
import { execGit, runGitWithProgress } from '../git/git';

export async function enhancedUndoLastAction(): Promise<void> {
    const reflogOutput = await execGit(['reflog', '-n', '5', '--format=%h|%gs|%cr']).catch(() => '');
    const entries = reflogOutput.split('\n').filter(Boolean).map(line => {
        const [hash, action, time] = line.split('|');
        return { hash, action, time };
    });

    if (entries.length < 2) {
        vscode.window.showWarningMessage('No previous state to undo to.');
        return;
    }

    const prevState = entries[1];

    const messages: string[] = [];
    messages.push(`⏪ **Undo Last Git Action**\n`);
    messages.push(`Current: ${entries[0].hash} - ${entries[0].action} (${entries[0].time})`);
    messages.push(`Previous: ${prevState.hash} - ${prevState.action} (${prevState.time})\n`);
    messages.push(`⚠️ This will run: git reset --hard HEAD@{1}`);
    messages.push(`🔴 Any uncommitted changes will be LOST!`);

    const fullMessage = messages.join('\n');

    const result = await vscode.window.showWarningMessage(
        fullMessage, { modal: true },
        'Undo (Hard Reset)', 'Cancel'
    );
    if (result !== 'Undo (Hard Reset)') return;

    const really = await vscode.window.showWarningMessage(
        `Are you absolutely sure?\nUncommitted work WILL BE LOST!`,
        { modal: true },
        'Yes, Undo It', 'Cancel - Keep Changes'
    );
    if (really !== 'Yes, Undo It') {
        vscode.window.showInformationMessage('Undo cancelled.');
        return;
    }

    try {
        await runGitWithProgress('Undoing last action...', ['reset', '--hard', 'HEAD@{1}']);
        vscode.window.showInformationMessage(`⏪ Undone! HEAD is now at ${prevState.hash}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Undo failed: ${error}`);
    }
}
