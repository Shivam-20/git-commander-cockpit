import * as vscode from 'vscode';
import { getRevertOrder } from '../git/commitHistory';
import { execGit, getRecentCommits, getRepoState, isWorkingTreeClean, runGitWithProgress } from '../git/git';
import { parseMergedBranches } from '../git/parser';
import { showBranchPicker, showCommitMultiPicker } from '../ui/quickPicks';
import { showDestructiveConfirmation } from '../ui/dialogs';
import { Commit } from '../git/models';

async function confirmHardResetIfEnabled(title: string, items: string[]): Promise<boolean> {
    const config = vscode.workspace.getConfiguration('gitCommander');
    if (!config.get<boolean>('confirmHardReset', true)) {
        return true;
    }
    return showDestructiveConfirmation(title, items);
}

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
    if (state.overview.branch === 'Detached HEAD') {
        vscode.window.showWarningMessage(
            'Cannot push from detached HEAD. Checkout or create a branch first.',
            'Switch Branch'
        ).then((choice) => {
            if (choice === 'Switch Branch') {
                vscode.commands.executeCommand('gitCommander.switchBranch');
            }
        });
        return;
    }

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
        const remote = await execGit(['config', '--get', `branch.${branchName}.remote`]).catch(() => '');
        const pushRemote = remote.trim() || 'origin';
        await runGitWithProgress('Pushing and setting upstream...', ['push', '--set-upstream', pushRemote, branchName]);
        vscode.window.showInformationMessage(`Pushed ${branchName} to ${pushRemote} and set upstream.`);
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

export async function timeMachineCommand(): Promise<void> {
    const reflog = await execGit(['reflog', '-n', '50', '--format=%h %gs']);
    if (!reflog.trim()) {
        vscode.window.showInformationMessage('Reflog is empty.');
        return;
    }

    const items = reflog.split('\n').filter(Boolean).map(line => {
        const hash = line.slice(0, 7);
        const message = line.slice(8);
        return { label: hash, description: message, hash };
    });

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a reflog entry to reset to (Warning: Destructive!)'
    });

    if (selected) {
        const confirmed = await confirmHardResetIfEnabled(`Reset hard to ${selected.hash}?`, [
            `This will move HEAD to ${selected.hash}`,
            'All current uncommitted changes will be lost'
        ]);
        if (confirmed) {
            await runGitWithProgress('Resetting via Time Machine...', ['reset', '--hard', selected.hash]);
            vscode.window.showInformationMessage(`Time Machine reset to ${selected.hash}`);
        }
    }
}

export async function repoConfigCommand(): Promise<void> {
    const actions = [
        { label: 'Set User Name', config: 'user.name' },
        { label: 'Set User Email', config: 'user.email' },
        { label: 'Pull Rebase Strategy (pull.rebase)', config: 'pull.rebase', options: ['true', 'false', 'interactive'] },
        { label: 'Pull Fast-Forward Only (pull.ff)', config: 'pull.ff', options: ['only', 'true', 'false'] },
        { label: 'Auto CRLF (core.autocrlf)', config: 'core.autocrlf', options: ['true', 'false', 'input'] },
        { label: 'Auto Prune Fetches (fetch.prune)', config: 'fetch.prune', options: ['true', 'false'] },
        { label: 'Default Branch Name (init.defaultBranch)', config: 'init.defaultBranch' },
        { label: 'Edit .git/config (Raw)', config: 'raw' }
    ];

    const selected = await vscode.window.showQuickPick(actions, { placeHolder: 'Select repository configuration' });
    if (!selected) return;

    if (selected.config === 'raw') {
        const gitDir = await execGit(['rev-parse', '--absolute-git-dir']);
        const configUri = vscode.Uri.file(gitDir.trim() + '/config');
        const doc = await vscode.workspace.openTextDocument(configUri);
        await vscode.window.showTextDocument(doc);
        return;
    }

    const currentVal = await execGit(['config', selected.config]).catch(() => '');
    
    let newVal: string | undefined;
    
    if (selected.options) {
        const items = selected.options.map(opt => ({
            label: opt,
            description: currentVal.trim() === opt ? '(Current)' : ''
        }));
        items.push({ label: 'Unset (Remove config)', description: '' });
        
        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: `Select value for ${selected.config}`
        });
        if (picked) {
            newVal = picked.label === 'Unset (Remove config)' ? '' : picked.label;
        }
    } else {
        newVal = await vscode.window.showInputBox({
            prompt: `Enter new value for ${selected.config} (Local to repo, clear to unset)`,
            value: currentVal.trim()
        });
    }

    if (newVal !== undefined) {
        if (newVal.trim() === '') {
            await execGit(['config', '--unset', selected.config]).catch(() => {});
            vscode.window.showInformationMessage(`Unset local ${selected.config}`);
        } else {
            await execGit(['config', '--local', selected.config, newVal.trim()]);
            vscode.window.showInformationMessage(`Updated local ${selected.config} to ${newVal.trim()}`);
        }
    }
}

export async function lfsManagerCommand(): Promise<void> {
    try {
        await execGit(['lfs', 'version']);
    } catch {
        vscode.window.showErrorMessage('Git LFS is not installed or initialized on your system.');
        return;
    }

    const action = await vscode.window.showQuickPick([
        { label: 'Track New File/Extension', description: 'e.g., *.mp4, *.psd' },
        { label: 'List Tracked Files' }
    ], { placeHolder: 'Git LFS Manager' });

    if (!action) return;

    if (action.label.startsWith('Track')) {
        const pattern = await vscode.window.showInputBox({
            prompt: 'Enter file pattern to track with LFS (e.g., *.mp4)'
        });
        if (pattern) {
            await runGitWithProgress('Tracking with LFS...', ['lfs', 'track', pattern]);
            await execGit(['add', '.gitattributes']).catch(() => {});
            vscode.window.showInformationMessage(`Tracking ${pattern} with Git LFS. (.gitattributes staged)`);
        }
    } else {
        const tracked = await execGit(['lfs', 'ls-files']).catch(() => '');
        if (!tracked) {
            vscode.window.showInformationMessage('No LFS tracked files found.');
            return;
        }
        vscode.window.showInformationMessage(`LFS Tracked Files:\n${tracked}`, { modal: true });
    }
}

export async function exportPatchCommand(): Promise<void> {
    const exportMode = await vscode.window.showQuickPick([
        { label: 'Uncommitted Changes', description: 'Export your current working tree and staged changes' },
        { label: 'Stashes', description: 'Select one or more stashes to export' }
    ], { placeHolder: 'What would you like to export as a patch?' });

    if (!exportMode) return;

    let diffContent = '';

    if (exportMode.label === 'Uncommitted Changes') {
        const diff = await execGit(['diff', 'HEAD']).catch(() => '');
        if (!diff) {
            vscode.window.showInformationMessage('No changes to export.');
            return;
        }
        diffContent = diff;
    } else {
        const stashes = await execGit(['stash', 'list']).catch(() => '');
        if (!stashes) {
            vscode.window.showInformationMessage('No stashes found.');
            return;
        }

        const stashItems = stashes.split('\n').filter(Boolean).map(line => {
            const ref = line.split(':')[0];
            return { label: ref, description: line.slice(ref.length + 2) };
        });

        const selectedStashes = await vscode.window.showQuickPick(stashItems, {
            canPickMany: true,
            placeHolder: 'Select stashes to export (Check multiple if desired)'
        });

        if (!selectedStashes || selectedStashes.length === 0) return;

        for (const s of selectedStashes) {
            const sDiff = await execGit(['stash', 'show', '-p', s.label]).catch(() => '');
            if (sDiff) {
                diffContent += `\n# --- Exported from ${s.label} ---\n${sDiff}\n`;
            }
        }

        if (!diffContent.trim()) {
            vscode.window.showInformationMessage('Selected stashes are empty or could not be generated.');
            return;
        }
    }

    const uri = await vscode.window.showSaveDialog({
        saveLabel: 'Save Patch',
        filters: { 'Patch Files': ['patch'] },
        defaultUri: vscode.workspace.workspaceFolders ? vscode.Uri.file(`${vscode.workspace.workspaceFolders[0].uri.fsPath}/changes.patch`) : undefined
    });

    if (!uri) return;

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(uri, encoder.encode(diffContent.trim() + '\n'));
    vscode.window.showInformationMessage('Patch exported successfully.');
}

export async function applyPatchCommand(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Apply Patch',
        filters: { 'Patch Files': ['patch'], 'All Files': ['*'] }
    });

    if (!uris || uris.length === 0) return;

    const path = uris[0].fsPath;
    
    try {
        await runGitWithProgress('Applying Patch...', ['apply', '--whitespace=nowarn', path]);
        vscode.window.showInformationMessage('Patch applied successfully.');
    } catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(String(e));
        const gitErr = e as { stderr?: string };
        let errorMsg = gitErr.stderr || err.message || 'Unknown error';
        if (errorMsg.length > 300) {
            errorMsg = errorMsg.substring(0, 300) + '...';
        }
        
        const res = await vscode.window.showWarningMessage(
            `Failed to apply patch cleanly:\n${errorMsg}\n\nForce apply what you can?`,
            { modal: true },
            'Force Apply (--reject)'
        );
        
        if (res === 'Force Apply (--reject)') {
            try {
                await runGitWithProgress('Force Applying Patch...', ['apply', '--reject', '--whitespace=nowarn', path]);
                vscode.window.showInformationMessage('Patch applied with conflicts. Check for .rej files.');
            } catch {
                vscode.window.showWarningMessage('Patch partially applied with conflicts. Please review the generated .rej files in your workspace.');
            }
        }
    }
}

async function macroCommittedToWrongBranch(): Promise<void> {
    await runGitWithProgress('Undoing commit...', ['reset', '--soft', 'HEAD~1']);
    await runGitWithProgress('Stashing changes...', ['stash']);

    const branches = await execGit(['branch', '--format=%(refname:short)']).catch(() => '');
    const branchList = branches.split('\n').filter(Boolean);
    const targetBranch = await vscode.window.showQuickPick(branchList, { placeHolder: 'Which branch did you mean to commit to?' });

    if (targetBranch) {
        await runGitWithProgress('Switching branch...', ['checkout', targetBranch]);
        await runGitWithProgress('Restoring changes...', ['stash', 'pop']);
        vscode.window.showInformationMessage(`Moved changes to ${targetBranch}. You can now commit them!`);
    } else {
        await runGitWithProgress('Restoring changes...', ['stash', 'pop']);
        vscode.window.showInformationMessage('Action cancelled. Changes are unstaged in your current branch.');
    }
}

async function macroForgotFile(): Promise<void> {
    const res = await vscode.window.showWarningMessage(
        'This will amend your last commit. Do you want to auto-stage ALL tracked modified files, or just amend what is already staged?',
        { modal: true },
        'Stage All Tracked', 'Use Already Staged'
    );
    if (res === 'Stage All Tracked') {
        await runGitWithProgress('Amending...', ['commit', '-a', '--amend', '--no-edit']);
        vscode.window.showInformationMessage('Amended the last commit with all tracked changes!');
    } else if (res === 'Use Already Staged') {
        await runGitWithProgress('Amending...', ['commit', '--amend', '--no-edit']);
        vscode.window.showInformationMessage('Amended the last commit with staged changes!');
    }
}

async function macroPushedBadCommit(): Promise<void> {
    const confirmed = await showDestructiveConfirmation('Revert and push?', [
        'This will create a new commit that reverts the last commit',
        'And it will immediately push to the remote'
    ]);
    if (confirmed) {
        await runGitWithProgress('Reverting...', ['revert', '--no-edit', 'HEAD']);
        await runGitWithProgress('Pushing...', ['push']);
        vscode.window.showInformationMessage('Successfully reverted the last commit and pushed to remote.');
    }
}

async function macroMessedUpEverything(): Promise<void> {
    const currentBranch = await execGit(['branch', '--show-current']).catch(() => '');
    if (!currentBranch.trim()) {
        vscode.window.showErrorMessage('Not currently on any branch.');
        return;
    }
    const remote = await execGit(['config', '--get', `branch.${currentBranch.trim()}.remote`]).catch(() => '');
    const pushRemote = remote.trim() || 'origin';
    const remoteRef = `${pushRemote}/${currentBranch.trim()}`;
    const confirmed = await confirmHardResetIfEnabled(`Hard reset ${currentBranch.trim()} to ${remoteRef}?`, [
        'ALL uncommitted changes will be PERMANENTLY LOST',
        'Any local commits not pushed will be LOST'
    ]);
    if (confirmed) {
        await runGitWithProgress(`Fetching ${pushRemote}...`, ['fetch', pushRemote]);
        try {
            await execGit(['rev-parse', '--verify', remoteRef]);
        } catch {
            vscode.window.showErrorMessage(`Remote branch ${remoteRef} does not exist.`);
            return;
        }
        await runGitWithProgress('Hard Resetting...', ['reset', '--hard', remoteRef]);
        vscode.window.showInformationMessage(`Hard reset to ${remoteRef}`);
    }
}

export async function oopsMacrosCommand(): Promise<void> {
    const macros = [
        { label: 'Committed to wrong branch!', description: 'Move the last commit to a different branch', fn: macroCommittedToWrongBranch },
        { label: 'Forgot a file!', description: 'Amend the last commit with new changes', fn: macroForgotFile },
        { label: 'Pushed a bad commit!', description: 'Revert HEAD and push immediately', fn: macroPushedBadCommit },
        { label: 'Messed up everything!', description: 'Hard reset your local branch to match remote', fn: macroMessedUpEverything }
    ];

    const action = await vscode.window.showQuickPick(macros, { placeHolder: 'Select a quick fix macro' });
    if (action) {
        await action.fn();
    }
}

export async function cleanMergedBranchesCommand(): Promise<void> {
    const currentBranch = await execGit(['branch', '--show-current']).catch(() => '');
    if (!currentBranch.trim()) {
        vscode.window.showErrorMessage('Not currently on any branch.');
        return;
    }

    const mergedBranchesStr = await execGit(['branch', '--merged']).catch(() => '');
    const branches = parseMergedBranches(mergedBranchesStr, currentBranch.trim());

    if (branches.length === 0) {
        vscode.window.showInformationMessage('No safely merged branches found to clean up.');
        return;
    }

    const confirmed = await showDestructiveConfirmation(`Delete ${branches.length} merged branches?`, [
        'The following branches have been merged into ' + currentBranch.trim() + ':',
        ...branches.map(b => `- ${b}`)
    ]);

    if (confirmed) {
        let deleted = 0;
        for (const branch of branches) {
            try {
                await runGitWithProgress(`Deleting ${branch}...`, ['branch', '-d', branch]);
                deleted++;
            } catch (e) {
                // Ignore failures for individual branches
            }
        }
        vscode.window.showInformationMessage(`Successfully cleaned up ${deleted} merged branches.`);
    }
}

export async function wipBackupCommand(): Promise<void> {
    const action = await vscode.window.showQuickPick([
        { label: 'Save Cloud WIP Checkpoint', description: 'Commit all changes as "WIP" and push to remote' },
        { label: 'Resume Work (Undo WIP Checkpoint)', description: 'Soft reset the last WIP commit' }
    ], { placeHolder: 'Cloud WIP Checkpoint Manager' });

    if (!action) return;

    if (action.label.startsWith('Save')) {
        await runGitWithProgress('Staging all changes...', ['add', '.']);
        
        const date = new Date().toLocaleString();
        const wipMessage = `WIP: Checkpoint created on ${date}`;
        
        await runGitWithProgress('Creating WIP commit...', ['commit', '-m', wipMessage, '--no-verify']);
        
        const currentBranch = await execGit(['branch', '--show-current']).catch(() => '');
        const remote = await execGit(['config', '--get', `branch.${currentBranch.trim()}.remote`]).catch(() => '');
        const pushRemote = remote.trim() || 'origin';
        try {
            await runGitWithProgress('Pushing WIP checkpoint to cloud...', ['push', '-u', pushRemote, currentBranch.trim()]);
            vscode.window.showInformationMessage('WIP Checkpoint successfully saved to the cloud!');
        } catch (e) {
            vscode.window.showWarningMessage('WIP commit created, but failed to push to cloud. Ensure your remote is configured.');
        }
    } else {
        const lastCommitMsg = await execGit(['log', '-1', '--pretty=%B']).catch(() => '');
        if (!lastCommitMsg.startsWith('WIP:')) {
            const confirmed = await vscode.window.showWarningMessage(
                'The last commit does not appear to be a WIP checkpoint. Soft reset anyway?',
                { modal: true },
                'Yes, Undo Last Commit'
            );
            if (confirmed !== 'Yes, Undo Last Commit') return;
        }
        
        await runGitWithProgress('Undoing WIP commit...', ['reset', '--soft', 'HEAD~1']);
        vscode.window.showInformationMessage('WIP Checkpoint undone. Your changes are back in the working directory ready for work!');
    }
}
