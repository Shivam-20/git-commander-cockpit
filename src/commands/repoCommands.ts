import * as vscode from 'vscode';
import { buildCommitQuickPick, getRevertOrder } from '../git/commitHistory';
import { execGit, getRecentCommits, getRepoState, isWorkingTreeClean, runGitWithProgress } from '../git/git';
import { showBranchPicker, showCommitMultiPicker, showCommitPicker } from '../ui/quickPicks';
import { showDestructiveConfirmation } from '../ui/dialogs';
import { Commit } from '../git/models';

export async function switchBranchCommand(): Promise<void> {
    const branches = (await execGit(['branch', '--format=%(refname:short)']))
        .split('\n')
        .map((branch) => branch.trim())
        .filter(Boolean);

    const target = await showBranchPicker(branches, 'Switch to branch');
    if (!target) {
        return;
    }

    await runGitWithProgress('Switching branch...', ['checkout', target]);
    vscode.window.showInformationMessage(`Switched to ${target}`);
}

export async function createBranchCommand(): Promise<void> {
    const name = await vscode.window.showInputBox({
        prompt: 'Enter a new branch name',
        placeHolder: 'feature/my-change',
        validateInput: (value) => value.trim() ? undefined : 'Branch name is required'
    });

    if (!name) {
        return;
    }

    await runGitWithProgress('Creating branch...', ['checkout', '-b', name.trim()]);
    vscode.window.showInformationMessage(`Created and switched to ${name.trim()}`);
}

export async function fetchCommand(): Promise<void> {
    await runGitWithProgress('Fetching from upstream...', ['fetch', '--all', '--prune']);
    vscode.window.showInformationMessage('Fetch complete.');
}

export async function pullCommand(): Promise<void> {
    const state = await getRepoState();
    if (!state.overview.hasUpstream) {
        vscode.window.showWarningMessage('No upstream branch is configured for the current branch.');
        return;
    }

    await runGitWithProgress('Pulling from upstream...', ['pull', '--ff-only']);
    vscode.window.showInformationMessage('Pull complete.');
}

export async function pushCommand(): Promise<void> {
    const state = await getRepoState();
    if (!state.overview.hasUpstream) {
        const result = await vscode.window.showInformationMessage(
            'No upstream branch is configured. Push and set upstream?',
            { modal: true },
            'Push'
        );
        if (result !== 'Push') {
            return;
        }

        const branchName = state.overview.branch;
        await runGitWithProgress('Pushing and setting upstream...', ['push', '--set-upstream', 'origin', branchName]);
        vscode.window.showInformationMessage(`Pushed ${branchName} and set upstream.`);
        return;
    }

    await runGitWithProgress('Pushing to upstream...', ['push']);
    vscode.window.showInformationMessage('Push complete.');
}

export async function stashSaveCommand(): Promise<void> {
    const isClean = await isWorkingTreeClean();
    if (isClean) {
        vscode.window.showInformationMessage('Nothing to stash — working tree is already clean.');
        return;
    }

    const message = await vscode.window.showInputBox({
        prompt: 'Optional stash message',
        placeHolder: 'WIP: describe your changes'
    });

    if (message === undefined) {
        // User cancelled
        return;
    }

    const args = ['stash', 'push'];
    if (message.trim()) {
        args.push('-m', message.trim());
    }

    await runGitWithProgress('Saving stash...', args);
    vscode.window.showInformationMessage('Changes stashed.');
}

async function confirmRevertPreconditions(title: string): Promise<boolean> {
    const isClean = await isWorkingTreeClean();
    if (!isClean) {
        vscode.window.showWarningMessage('Revert requires a clean working tree. Commit, stash, or discard changes first.');
        return false;
    }

    return showDestructiveConfirmation(title, [
        'I understand this creates new revert commit(s)',
        'I understand conflicts may need manual resolution'
    ]);
}

async function pickRecentCommits(): Promise<Commit[] | undefined> {
    const recentCommits = await getRecentCommits(100);
    if (recentCommits.length === 0) {
        vscode.window.showWarningMessage('No recent local commits are available.');
        return undefined;
    }

    return recentCommits;
}

async function pickCommitToRevert(placeHolder: string): Promise<{ commits: Commit[]; selectedHash: string } | undefined> {
    const recentCommits = await pickRecentCommits();
    if (!recentCommits) {
        return undefined;
    }

    const selectedHash = await showCommitPicker(
        buildCommitQuickPick(recentCommits),
        `${placeHolder} - type message, author, or hash to search`
    );
    if (!selectedHash) {
        return undefined;
    }

    return { commits: recentCommits, selectedHash };
}

async function pickCommitsToRevert(placeHolder: string): Promise<{ commits: Commit[]; selectedHashes: string[] } | undefined> {
    const recentCommits = await pickRecentCommits();
    if (!recentCommits) {
        return undefined;
    }

    const selectedHashes = await showCommitMultiPicker(
        recentCommits,
        `${placeHolder} - type message, author, or hash to search`
    );
    if (!selectedHashes || selectedHashes.length === 0) {
        return undefined;
    }

    return { commits: recentCommits, selectedHashes };
}

async function pickResetMode(): Promise<'soft' | 'mixed' | 'hard' | undefined> {
    const result = await vscode.window.showQuickPick(
        [
            { label: 'Soft', description: 'move HEAD and keep changes staged', value: 'soft' as const },
            { label: 'Mixed', description: 'move HEAD and keep changes unstaged', value: 'mixed' as const },
            { label: 'Hard', description: 'move HEAD and discard later changes', value: 'hard' as const }
        ],
        { placeHolder: 'Select reset mode' }
    );

    return result?.value;
}

async function confirmResetPreconditions(mode: 'soft' | 'mixed' | 'hard', target: Commit): Promise<boolean> {
    const items = [`I understand reset --${mode} moves HEAD to ${target.shortHash}`];

    if (mode === 'soft') {
        items.push('I understand later changes will stay staged');
    } else if (mode === 'mixed') {
        items.push('I understand later changes will stay unstaged');
    } else {
        items.push('I understand reset --hard discards later working tree changes');
        items.push('I understand this is destructive');
    }

    return showDestructiveConfirmation(`Reset current branch to ${target.shortHash} with --${mode}?`, items);
}

export async function revertLastCommitCommand(): Promise<void> {
    const commits = await getRecentCommits(1);
    const latest = commits[0];
    if (!latest) {
        vscode.window.showWarningMessage('No local commits are available to revert.');
        return;
    }

    const confirmed = await confirmRevertPreconditions(`Revert latest commit ${latest.shortHash}?`);
    if (!confirmed) {
        return;
    }

    await runGitWithProgress('Reverting latest commit...', ['revert', '--no-edit', latest.hash]);
    vscode.window.showInformationMessage(`Reverted ${latest.shortHash}.`);
}

export async function revertRecentCommitCommand(): Promise<void> {
    const selection = await pickCommitToRevert('Select commit to revert');
    if (!selection) {
        // User cancelled or no commits — warning already shown by pickRecentCommits if needed
        return;
    }

    const target = selection.commits.find((commit) => commit.hash === selection.selectedHash);
    const confirmed = await confirmRevertPreconditions(`Revert commit ${target?.shortHash ?? selection.selectedHash.slice(0, 7)}?`);
    if (!confirmed) {
        return;
    }

    await runGitWithProgress('Reverting selected commit...', ['revert', '--no-edit', selection.selectedHash]);
    vscode.window.showInformationMessage(`Reverted ${target?.shortHash ?? selection.selectedHash.slice(0, 7)}.`);
}

export async function revertMultipleCommitsCommand(): Promise<void> {
    const selection = await pickCommitsToRevert('Select commits to revert');
    if (!selection) {
        // User cancelled or no commits — warning already shown if needed
        return;
    }

    const orderedHashes = getRevertOrder(selection.selectedHashes, selection.commits);
    const confirmed = await confirmRevertPreconditions(`Revert ${orderedHashes.length} selected commits?`);
    if (!confirmed) {
        return;
    }

    await runGitWithProgress('Reverting selected commits...', ['revert', '--no-edit', ...orderedHashes]);
    vscode.window.showInformationMessage(`Reverted ${orderedHashes.length} commits.`);
}

export async function resetCommitCommand(): Promise<void> {
    const selection = await pickCommitToRevert('Select commit to reset to');
    if (!selection) {
        // User cancelled or no commits — warning already shown if needed
        return;
    }

    const target = selection.commits.find((commit) => commit.hash === selection.selectedHash);
    if (!target) {
        vscode.window.showWarningMessage('The selected commit could not be resolved.');
        return;
    }

    const mode = await pickResetMode();
    if (!mode) {
        return;
    }

    const confirmed = await confirmResetPreconditions(mode, target);
    if (!confirmed) {
        return;
    }

    await runGitWithProgress(`Resetting branch with --${mode}...`, ['reset', `--${mode}`, target.hash]);
    vscode.window.showInformationMessage(`Reset current branch to ${target.shortHash} with --${mode}.`);
}
