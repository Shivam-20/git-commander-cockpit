import * as vscode from 'vscode';
import { execGit, getRecentCommits, runGitWithProgress } from '../git/git';
import { Commit } from '../git/models';
import { showDestructiveConfirmation } from '../ui/dialogs';
import { ResetImpact } from './types';

export async function analyzeResetImpact(targetHash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<ResetImpact> {
    const range = `${targetHash}..HEAD`;

    const logOutput = await execGit(['log', '--format=%H|%s|%an|%ad', range]).catch(() => '');
    const commitsToBeReset: Commit[] = logOutput.split('\n').filter(Boolean).map(line => {
        const [hash, message, author, date] = line.split('|');
        return {
            hash, shortHash: hash.slice(0, 7),
            message: message || '', author: author || '',
            date: date || '', relativeDate: date || '', isPushed: false
        };
    });

    const diffOutput = await execGit(['diff', '--name-status', range]).catch(() => '');
    const fileChanges = diffOutput.split('\n').filter(Boolean);

    let willLoseWork = false;
    if (mode === 'hard') {
        const uncommitted = await execGit(['status', '--porcelain']).catch(() => '');
        willLoseWork = uncommitted.trim().length > 0;
    }

    return { commitCount: commitsToBeReset.length, fileChanges, willLoseWork, commitsToBeReset };
}

export async function showResetPreview(targetCommit: Commit, mode: 'soft' | 'mixed' | 'hard'): Promise<boolean> {
    const impact = await analyzeResetImpact(targetCommit.hash, mode);

    const messages: string[] = [];
    const isDestructive = mode === 'hard';
    messages.push(`${isDestructive ? '⚠️' : 'ℹ️'} **${isDestructive ? 'DESTRUCTIVE OPERATION' : 'SAFE OPERATION'}** ${isDestructive ? '⚠️' : 'ℹ️'}\n`);
    messages.push(`**git reset --${mode} ${targetCommit.shortHash}**\n`);
    messages.push(`Target: "${targetCommit.message}" by ${targetCommit.author}\n`);

    if (impact.commitCount > 0) {
        messages.push(`\n📊 **Impact:**`);
        messages.push(`• ${impact.commitCount} commit(s) will be reset`);
        messages.push(`• ${impact.fileChanges.length} file(s) affected`);
    }

    messages.push(`\n📝 **What will happen:**`);
    switch (mode) {
        case 'soft':
            messages.push(`• HEAD will move to ${targetCommit.shortHash}`);
            messages.push(`• All changes will remain **STAGED** (ready to commit)`);
            messages.push(`• ✅ You can re-commit or modify the changes`);
            break;
        case 'mixed':
            messages.push(`• HEAD will move to ${targetCommit.shortHash}`);
            messages.push(`• All changes will be **UNSTAGED** (in working directory)`);
            messages.push(`• ✅ You can stage and commit selectively`);
            break;
        case 'hard':
            messages.push(`• HEAD will move to ${targetCommit.shortHash}`);
            messages.push(`• ⚠️ **ALL CHANGES WILL BE PERMANENTLY DELETED**`);
            if (impact.willLoseWork) {
                messages.push(`• 🔴 **WARNING: You have uncommitted work that will be LOST!**`);
            }
            break;
    }

    if (impact.commitsToBeReset.length > 0) {
        messages.push(`\n📜 **Commits to be reset:**`);
        impact.commitsToBeReset.slice(0, 5).forEach(c => {
            messages.push(`  • ${c.shortHash}: ${c.message.slice(0, 50)}${c.message.length > 50 ? '...' : ''}`);
        });
        if (impact.commitsToBeReset.length > 5) {
            messages.push(`  ... and ${impact.commitsToBeReset.length - 5} more`);
        }
    }

    if (impact.fileChanges.length > 0) {
        messages.push(`\n📁 **Affected files:**`);
        impact.fileChanges.slice(0, 10).forEach(f => {
            const [status, ...pathParts] = f.split('\t');
            const filePath = pathParts.join('\t');
            const statusEmoji = status.startsWith('M') ? '📝' : status.startsWith('A') ? '➕' : status.startsWith('D') ? '❌' : '📄';
            messages.push(`  ${statusEmoji} ${filePath}`);
        });
        if (impact.fileChanges.length > 10) {
            messages.push(`  ... and ${impact.fileChanges.length - 10} more files`);
        }
    }

    if (mode === 'hard') {
        messages.push(`\n\n🔴 **THIS ACTION CANNOT BE UNDONE!**`);
        if (impact.willLoseWork) {
            messages.push(`⚠️ Consider stashing your changes first!`);
        }
    }

    const fullMessage = messages.join('\n');

    if (mode === 'hard') {
        const checklistItems = [
            `I understand this will permanently delete ${impact.commitCount} commits`,
            `I understand this cannot be undone`,
        ];
        if (impact.willLoseWork) {
            checklistItems.push(`I understand my uncommitted changes will be lost`);
        }
        return showDestructiveConfirmation(fullMessage, checklistItems);
    }

    const result = await vscode.window.showWarningMessage(
        fullMessage,
        { modal: true, detail: 'Review the impact above before proceeding.' },
        `Reset --${mode}`,
        'Cancel'
    );
    return result === `Reset --${mode}`;
}

export async function enhancedResetCommit(): Promise<void> {
    const allCommits = await getRecentCommits(50);
    if (allCommits.length === 0) {
        vscode.window.showWarningMessage('No commits available.');
        return;
    }

    const items = allCommits.map(c => ({
        label: `${c.shortHash} ${c.message.slice(0, 40)}${c.message.length > 40 ? '...' : ''}`,
        description: `${c.author} • ${c.relativeDate}`,
        detail: `Click to reset to this commit`,
        commit: c
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select commit to reset TO (HEAD will move here)',
        matchOnDescription: true
    });
    if (!selected) return;

    const modeItems = [
        { label: '$(circle-outline) Soft', description: 'Keep all changes staged - safest option', detail: 'Changes stay staged, ready to re-commit. HEAD moves to target.', mode: 'soft' as const },
        { label: '$(circle-half-full) Mixed', description: 'Keep all changes unstaged - default behavior', detail: 'Changes stay in working directory but unstaged. HEAD moves to target.', mode: 'mixed' as const },
        { label: '$(error) Hard', description: 'DELETE all changes - DANGEROUS!', detail: '⚠️ ALL UNCOMMITTED CHANGES WILL BE PERMANENTLY LOST!', mode: 'hard' as const }
    ];

    const modeSelected = await vscode.window.showQuickPick(
        modeItems.map(m => ({ label: m.label, description: m.description, detail: m.detail, mode: m.mode })),
        { placeHolder: 'Select reset mode', ignoreFocusOut: true }
    );
    if (!modeSelected) return;

    const proceed = await showResetPreview(selected.commit, modeSelected.mode);
    if (!proceed) return;

    const mode = modeSelected.mode;
    const hash = selected.commit.hash;

    if (mode === 'hard') {
        const isReallySure = await vscode.window.showWarningMessage(
            `🔴 FINAL WARNING: This will permanently delete changes!\n\n` +
            `You are about to run: git reset --hard ${selected.commit.shortHash}\n` +
            `"${selected.commit.message.slice(0, 50)}"`,
            { modal: true },
            '💀 Yes, I understand the risk',
            'Cancel - Keep my changes safe'
        );
        if (isReallySure !== '💀 Yes, I understand the risk') {
            vscode.window.showInformationMessage('Reset cancelled - your changes are safe.');
            return;
        }
    }

    try {
        await runGitWithProgress(`Resetting with --${mode}...`, ['reset', `--${mode}`, hash]);
        const emoji = mode === 'hard' ? '💀' : mode === 'soft' ? '✅' : '📝';
        vscode.window.showInformationMessage(
            `${emoji} Reset complete! HEAD is now at ${selected.commit.shortHash}\n` +
            `"${selected.commit.message.slice(0, 40)}${selected.commit.message.length > 40 ? '...' : ''}"`
        );
        if (mode === 'soft') {
            vscode.window.showInformationMessage('💡 Your changes are staged and ready to commit. Review and commit when ready.', 'Dismiss');
        } else if (mode === 'mixed') {
            vscode.window.showInformationMessage('💡 Your changes are in the working directory. Stage the files you want to keep.', 'Dismiss');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Reset failed: ${error}`);
    }
}
