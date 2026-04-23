import * as vscode from 'vscode';
import { Commit } from '../git/models';
import { buildCommitQuickPick } from '../git/commitHistory';

export async function showBranchPicker(branches: string[], placeHolder = 'Select a branch'): Promise<string | undefined> {
    const result = await vscode.window.showQuickPick(branches, { placeHolder });
    return result;
}

export async function showCommitPicker(commits: { label: string; description: string; hash: string }[], placeHolder = 'Select a commit'): Promise<string | undefined> {
    const result = await vscode.window.showQuickPick(
        commits.map(c => ({ label: c.label, description: c.description, detail: c.hash })),
        {
            placeHolder,
            matchOnDescription: true,
            matchOnDetail: true
        }
    );
    return result?.detail;
}

export async function showCommitMultiPicker(
    commits: Commit[],
    placeHolder = 'Select commits'
): Promise<string[] | undefined> {
    const result = await vscode.window.showQuickPick(
        buildCommitQuickPick(commits).map((commit) => ({
            label: commit.label,
            description: commit.description,
            detail: commit.hash
        })),
        {
            placeHolder,
            canPickMany: true,
            matchOnDescription: true,
            matchOnDetail: true
        }
    );

    return result?.map((item) => item.detail ?? '').filter(Boolean);
}
