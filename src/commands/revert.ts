import * as vscode from 'vscode';
import { execGit, getRecentCommits, isWorkingTreeClean, runGitWithProgress } from '../git/git';
import { Commit } from '../git/models';
import { RevertImpact } from './types';

export async function analyzeRevertImpact(commits: Commit[]): Promise<RevertImpact> {
    const statusOutput = await execGit(['status', '--porcelain']).catch(() => '');
    const dirtyFiles = new Set(statusOutput.split('\n').filter(Boolean).map(l => l.slice(3)));

    let canRevertCleanly = true;
    const potentialConflicts: string[] = [];

    for (const commit of commits) {
        const changedFiles = await execGit(['diff-tree', '--no-commit-id', '--name-only', '-r', commit.hash]).catch(() => '');
        for (const file of changedFiles.split('\n').filter(Boolean)) {
            if (dirtyFiles.has(file) && !potentialConflicts.includes(file)) {
                canRevertCleanly = false;
                potentialConflicts.push(file);
            }
        }
    }

    return { canRevertCleanly, potentialConflicts, commitsToRevert: commits };
}

export async function showRevertPreview(commits: Commit[]): Promise<{ proceed: boolean; autoStash: boolean }> {
    const impact = await analyzeRevertImpact(commits);
    const isMulti = commits.length > 1;

    const messages: string[] = [];
    messages.push(`🔄 **Revert ${isMulti ? 'Commits' : 'Commit'}**\n`);
    messages.push(`**Commits to revert:**`);
    commits.forEach(c => {
        messages.push(`  • ${c.shortHash}: ${c.message.slice(0, 60)}${c.message.length > 60 ? '...' : ''}`);
    });
    messages.push(`\n📝 **What will happen:**`);
    messages.push(`• New "revert" commit(s) will be created`);
    messages.push(`• The original commit(s) will NOT be deleted`);
    messages.push(`• This is a SAFE operation (history is preserved)`);

    if (!impact.canRevertCleanly) {
        messages.push(`\n⚠️ **Potential conflicts detected:**`);
        messages.push(`These files have uncommitted changes that may conflict:`);
        impact.potentialConflicts.slice(0, 5).forEach(f => messages.push(`  • ${f}`));
        if (impact.potentialConflicts.length > 5) {
            messages.push(`  ... and ${impact.potentialConflicts.length - 5} more`);
        }
    }

    const isClean = await isWorkingTreeClean();
    if (!isClean) {
        messages.push(`\n📦 **Working tree is not clean**`);
        messages.push(`You have uncommitted changes.`);
    }
    messages.push(`\n✅ Original commits will remain in history`);

    const fullMessage = messages.join('\n');

    if (!isClean) {
        const result = await vscode.window.showWarningMessage(
            fullMessage, { modal: true },
            'Revert (Stash my changes first)',
            'Revert (Keep my changes - may conflict)',
            'Cancel'
        );
        if (result === 'Revert (Stash my changes first)') {
            return { proceed: true, autoStash: true };
        }
        return { proceed: result === 'Revert (Keep my changes - may conflict)', autoStash: false };
    } else {
        const result = await vscode.window.showInformationMessage(
            fullMessage, { modal: true },
            'Revert Commit',
            'Cancel'
        );
        return { proceed: result === 'Revert Commit', autoStash: false };
    }
}

async function revertWithStashFlow(
    hash: string,
    shortHash: string,
    message: string,
    autoStash: boolean
): Promise<void> {
    if (autoStash) {
        await runGitWithProgress('Stashing changes...', ['stash', 'push', '-m', 'Auto-stash before revert']);
    }

    try {
        await runGitWithProgress('Reverting commit...', ['revert', '--no-edit', hash]);
        vscode.window.showInformationMessage(`✅ Reverted ${shortHash}: "${message.slice(0, 40)}..."`);

        if (autoStash) {
            const restore = await vscode.window.showInformationMessage(
                'Changes were stashed before revert. Restore them now?',
                'Restore Stashed Changes', 'Keep Stashed'
            );
            if (restore === 'Restore Stashed Changes') {
                await runGitWithProgress('Restoring stashed changes...', ['stash', 'pop']);
            }
        }
    } catch {
        const abort = await vscode.window.showErrorMessage(
            'Revert failed - there may be conflicts. Abort the revert?',
            'Abort Revert', 'Keep Trying (Resolve Manually)'
        );
        if (abort === 'Abort Revert') {
            await execGit(['revert', '--abort']).catch(() => {});
            if (autoStash) {
                await runGitWithProgress('Restoring stashed changes...', ['stash', 'pop']).catch(() => {});
            }
        }
    }
}

export async function enhancedRevertLastCommit(): Promise<void> {
    const commits = await getRecentCommits(1);
    if (commits.length === 0) {
        vscode.window.showWarningMessage('No commits to revert.');
        return;
    }
    const { proceed, autoStash } = await showRevertPreview(commits);
    if (!proceed) return;
    await revertWithStashFlow(commits[0].hash, commits[0].shortHash, commits[0].message, autoStash);
}

export async function enhancedRevertSelectedCommit(): Promise<void> {
    const allCommits = await getRecentCommits(50);
    if (allCommits.length === 0) {
        vscode.window.showWarningMessage('No commits available.');
        return;
    }

    const items = allCommits.map(c => ({
        label: `${c.shortHash} ${c.message.slice(0, 50)}${c.message.length > 50 ? '...' : ''}`,
        description: `${c.author} • ${c.relativeDate}${c.isPushed ? ' • pushed' : ' • local'}`,
        commit: c
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a commit to revert',
        matchOnDescription: true,
        matchOnDetail: true
    });

    if (!selected) return;
    const { proceed, autoStash } = await showRevertPreview([selected.commit]);
    if (!proceed) return;
    await revertWithStashFlow(selected.commit.hash, selected.commit.shortHash, selected.commit.message, autoStash);
}
