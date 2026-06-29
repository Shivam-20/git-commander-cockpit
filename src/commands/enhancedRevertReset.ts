import * as vscode from 'vscode';
import { execGit, getRecentCommits, isWorkingTreeClean, runGitWithProgress } from '../git/git';
import { Commit } from '../git/models';
import { showDestructiveConfirmation } from '../ui/dialogs';

interface ResetImpact {
    commitCount: number;
    fileChanges: string[];
    willLoseWork: boolean;
    commitsToBeReset: Commit[];
}

interface RevertImpact {
    canRevertCleanly: boolean;
    potentialConflicts: string[];
    commitsToRevert: Commit[];
}

export async function analyzeResetImpact(targetHash: string, mode: 'soft' | 'mixed' | 'hard'): Promise<ResetImpact> {
    const range = `${targetHash}..HEAD`;
    
    // Get commits that will be reset
    const logOutput = await execGit(['log', '--format=%H|%s|%an|%ad', range]).catch(() => '');
    const commitsToBeReset: Commit[] = logOutput.split('\n').filter(Boolean).map(line => {
        const [hash, message, author, date] = line.split('|');
        return {
            hash,
            shortHash: hash.slice(0, 7),
            message: message || '',
            author: author || '',
            date: date || '',
            relativeDate: date || '',
            isPushed: false
        };
    });

    // Get files that will be affected
    const diffOutput = await execGit(['diff', '--name-status', range]).catch(() => '');
    const fileChanges = diffOutput.split('\n').filter(Boolean);

    // Check if work will be lost (only for hard reset)
    let willLoseWork = false;
    if (mode === 'hard') {
        const uncommitted = await execGit(['status', '--porcelain']).catch(() => '');
        willLoseWork = uncommitted.trim().length > 0;
    }

    return {
        commitCount: commitsToBeReset.length,
        fileChanges,
        willLoseWork,
        commitsToBeReset
    };
}

export async function analyzeRevertImpact(commits: Commit[]): Promise<RevertImpact> {
    const hashes = commits.map(c => c.hash);
    
    // Check if revert can be done cleanly
    let canRevertCleanly = true;
    const potentialConflicts: string[] = [];

    for (const hash of hashes) {
        // Check if this commit touches files that have uncommitted changes
        const changedFiles = await execGit(['diff-tree', '--no-commit-id', '--name-only', '-r', hash]).catch(() => '');
        const files = changedFiles.split('\n').filter(Boolean);
        
        for (const file of files) {
            const status = await execGit(['status', '--porcelain', '--', file]).catch(() => '');
            if (status.trim()) {
                canRevertCleanly = false;
                if (!potentialConflicts.includes(file)) {
                    potentialConflicts.push(file);
                }
            }
        }
    }

    return {
        canRevertCleanly,
        potentialConflicts,
        commitsToRevert: commits
    };
}

export async function showResetPreview(targetCommit: Commit, mode: 'soft' | 'mixed' | 'hard'): Promise<boolean> {
    const impact = await analyzeResetImpact(targetCommit.hash, mode);
    
    // Build preview message
    const messages: string[] = [];
    
    // Header with color coding
    const isDestructive = mode === 'hard';
    const headerEmoji = isDestructive ? '⚠️' : 'ℹ️';
    const headerText = isDestructive ? 'DESTRUCTIVE OPERATION' : 'SAFE OPERATION';
    messages.push(`${headerEmoji} **${headerText}** ${headerEmoji}\n`);
    
    // Operation summary
    messages.push(`**git reset --${mode} ${targetCommit.shortHash}**\n`);
    messages.push(`Target: "${targetCommit.message}" by ${targetCommit.author}\n`);
    
    // Impact summary
    if (impact.commitCount > 0) {
        messages.push(`\n📊 **Impact:**`);
        messages.push(`• ${impact.commitCount} commit(s) will be reset`);
        messages.push(`• ${impact.fileChanges.length} file(s) affected`);
    }
    
    // Mode-specific details
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
    
    // Show commits that will be reset
    if (impact.commitsToBeReset.length > 0) {
        messages.push(`\n📜 **Commits to be reset:**`);
        impact.commitsToBeReset.slice(0, 5).forEach(c => {
            messages.push(`  • ${c.shortHash}: ${c.message.slice(0, 50)}${c.message.length > 50 ? '...' : ''}`);
        });
        if (impact.commitsToBeReset.length > 5) {
            messages.push(`  ... and ${impact.commitsToBeReset.length - 5} more`);
        }
    }
    
    // Show affected files
    if (impact.fileChanges.length > 0) {
        messages.push(`\n📁 **Affected files:**`);
        impact.fileChanges.slice(0, 10).forEach(f => {
            const [status, ...pathParts] = f.split('\t');
            const path = pathParts.join('\t');
            const statusEmoji = status.startsWith('M') ? '📝' : status.startsWith('A') ? '➕' : status.startsWith('D') ? '❌' : '📄';
            messages.push(`  ${statusEmoji} ${path}`);
        });
        if (impact.fileChanges.length > 10) {
            messages.push(`  ... and ${impact.fileChanges.length - 10} more files`);
        }
    }
    
    // Final warning for hard reset
    if (mode === 'hard') {
        messages.push(`\n\n🔴 **THIS ACTION CANNOT BE UNDONE!**`);
        if (impact.willLoseWork) {
            messages.push(`⚠️ Consider stashing your changes first!`);
        }
    }
    
    const fullMessage = messages.join('\n');
    
    // For hard reset, require explicit confirmation with checklist
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
    
    // For soft/mixed, use simple modal with preview
    const result = await vscode.window.showWarningMessage(
        fullMessage,
        { modal: true, detail: 'Review the impact above before proceeding.' },
        `Reset --${mode}`,
        'Cancel'
    );
    
    return result === `Reset --${mode}`;
}

export async function showRevertPreview(commits: Commit[]): Promise<{ proceed: boolean; autoStash: boolean }> {
    const impact = await analyzeRevertImpact(commits);
    const isMulti = commits.length > 1;
    
    const messages: string[] = [];
    messages.push(`🔄 **Revert ${isMulti ? 'Commits' : 'Commit'}**\n`);
    
    // Show commits to revert
    messages.push(`**Commits to revert:**`);
    commits.forEach(c => {
        messages.push(`  • ${c.shortHash}: ${c.message.slice(0, 60)}${c.message.length > 60 ? '...' : ''}`);
    });
    
    // Explain what revert does
    messages.push(`\n📝 **What will happen:**`);
    messages.push(`• New "revert" commit(s) will be created`);
    messages.push(`• The original commit(s) will NOT be deleted`);
    messages.push(`• This is a SAFE operation (history is preserved)`);
    
    // Warning about conflicts
    if (!impact.canRevertCleanly) {
        messages.push(`\n⚠️ **Potential conflicts detected:**`);
        messages.push(`These files have uncommitted changes that may conflict:`);
        impact.potentialConflicts.slice(0, 5).forEach(f => messages.push(`  • ${f}`));
        if (impact.potentialConflicts.length > 5) {
            messages.push(`  ... and ${impact.potentialConflicts.length - 5} more`);
        }
    }
    
    // Working tree status
    const isClean = await isWorkingTreeClean();
    let autoStash = false;
    
    if (!isClean) {
        messages.push(`\n📦 **Working tree is not clean**`);
        messages.push(`You have uncommitted changes.`);
    }
    
    messages.push(`\n✅ Original commits will remain in history`);
    
    const fullMessage = messages.join('\n');
    
    // Show options based on working tree state
    if (!isClean) {
        const result = await vscode.window.showWarningMessage(
            fullMessage,
            { modal: true },
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
            fullMessage,
            { modal: true },
            'Revert Commit',
            'Cancel'
        );
        
        return { proceed: result === 'Revert Commit', autoStash: false };
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
    
    if (autoStash) {
        await runGitWithProgress('Stashing changes...', ['stash', 'push', '-m', 'Auto-stash before revert']);
    }
    
    try {
        await runGitWithProgress('Reverting commit...', ['revert', '--no-edit', commits[0].hash]);
        vscode.window.showInformationMessage(`✅ Reverted ${commits[0].shortHash}: "${commits[0].message.slice(0, 40)}..."`);
        
        if (autoStash) {
            const restore = await vscode.window.showInformationMessage(
                'Changes were stashed before revert. Restore them now?',
                'Restore Stashed Changes',
                'Keep Stashed'
            );
            if (restore === 'Restore Stashed Changes') {
                await runGitWithProgress('Restoring stashed changes...', ['stash', 'pop']);
            }
        }
    } catch (error) {
        // If revert failed (conflict), offer to abort
        const abort = await vscode.window.showErrorMessage(
            'Revert failed - there may be conflicts. Abort the revert?',
            'Abort Revert',
            'Keep Trying (Resolve Manually)'
        );
        if (abort === 'Abort Revert') {
            await execGit(['revert', '--abort']).catch(() => {});
            if (autoStash) {
                await runGitWithProgress('Restoring stashed changes...', ['stash', 'pop']).catch(() => {});
            }
        }
    }
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
    
    if (autoStash) {
        await runGitWithProgress('Stashing changes...', ['stash', 'push', '-m', 'Auto-stash before revert']);
    }
    
    try {
        await runGitWithProgress('Reverting commit...', ['revert', '--no-edit', selected.commit.hash]);
        vscode.window.showInformationMessage(`✅ Reverted ${selected.commit.shortHash}`);
        
        if (autoStash) {
            const restore = await vscode.window.showInformationMessage(
                'Restore stashed changes?',
                'Restore',
                'Keep Stashed'
            );
            if (restore === 'Restore') {
                await runGitWithProgress('Restoring...', ['stash', 'pop']);
            }
        }
    } catch (error) {
        const abort = await vscode.window.showErrorMessage(
            'Revert failed. Abort?',
            'Abort',
            'Resolve Manually'
        );
        if (abort === 'Abort') {
            await execGit(['revert', '--abort']).catch(() => {});
            if (autoStash) {
                await runGitWithProgress('Restoring stashed changes...', ['stash', 'pop']).catch(() => {});
            }
        }
    }
}

export async function enhancedResetCommit(): Promise<void> {
    const allCommits = await getRecentCommits(50);
    if (allCommits.length === 0) {
        vscode.window.showWarningMessage('No commits available.');
        return;
    }
    
    // First step: Select commit
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
    
    // Second step: Select mode
    const modeItems = [
        { 
            label: '$(circle-outline) Soft', 
            description: 'Keep all changes staged - safest option',
            detail: 'Changes stay staged, ready to re-commit. HEAD moves to target.',
            mode: 'soft' as const,
            icon: '$(circle-outline)',
            color: 'safe'
        },
        { 
            label: '$(circle-half-full) Mixed', 
            description: 'Keep all changes unstaged - default behavior',
            detail: 'Changes stay in working directory but unstaged. HEAD moves to target.',
            mode: 'mixed' as const,
            icon: '$(circle-half-full)',
            color: 'safe'
        },
        { 
            label: '$(error) Hard', 
            description: 'DELETE all changes - DANGEROUS!',
            detail: '⚠️ ALL UNCOMMITTED CHANGES WILL BE PERMANENTLY LOST!',
            mode: 'hard' as const,
            icon: '$(error)',
            color: 'danger'
        }
    ];
    
    const modeSelected = await vscode.window.showQuickPick(
        modeItems.map(m => ({
            label: m.label,
            description: m.description,
            detail: m.detail,
            mode: m.mode
        })),
        { 
            placeHolder: 'Select reset mode',
            ignoreFocusOut: true
        }
    );
    
    if (!modeSelected) return;
    
    // Third step: Show detailed preview
    const proceed = await showResetPreview(selected.commit, modeSelected.mode);
    if (!proceed) return;
    
    // Execute
    const mode = modeSelected.mode;
    const hash = selected.commit.hash;
    
    // Extra safety for hard reset
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
        
        // Post-reset guidance
        if (mode === 'soft') {
            vscode.window.showInformationMessage(
                '💡 Your changes are staged and ready to commit. Review and commit when ready.',
                'Dismiss'
            );
        } else if (mode === 'mixed') {
            vscode.window.showInformationMessage(
                '💡 Your changes are in the working directory. Stage the files you want to keep.',
                'Dismiss'
            );
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Reset failed: ${error}`);
    }
}

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
    
    const prevState = entries[1]; // HEAD@{1}
    
    const messages: string[] = [];
    messages.push(`⏪ **Undo Last Git Action**\n`);
    messages.push(`Current: ${entries[0].hash} - ${entries[0].action} (${entries[0].time})`);
    messages.push(`Previous: ${prevState.hash} - ${prevState.action} (${prevState.time})\n`);
    messages.push(`⚠️ This will run: git reset --hard HEAD@{1}`);
    messages.push(`🔴 Any uncommitted changes will be LOST!`);
    
    const fullMessage = messages.join('\n');
    
    const result = await vscode.window.showWarningMessage(
        fullMessage,
        { modal: true },
        'Undo (Hard Reset)',
        'Cancel'
    );
    
    if (result !== 'Undo (Hard Reset)') return;
    
    // Double-confirm
    const really = await vscode.window.showWarningMessage(
        `Are you absolutely sure?\nUncommitted work WILL BE LOST!`,
        { modal: true },
        'Yes, Undo It',
        'Cancel - Keep Changes'
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
