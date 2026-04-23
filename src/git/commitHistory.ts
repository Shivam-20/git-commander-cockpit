import { Commit } from './models';

export function buildCommitQuickPick(commits: Commit[]): { label: string; description: string; hash: string }[] {
    return commits.map((commit) => ({
        label: `${commit.shortHash} ${commit.message || '(no commit message)'}`,
        description: `${commit.author} • ${commit.relativeDate}${commit.isPushed ? ' • pushed' : ' • local'}`,
        hash: commit.hash
    }));
}

export function getRevertOrder(selectedHashes: string[], recentCommits: Commit[]): string[] {
    const commitIndex = new Map<string, number>();
    recentCommits.forEach((commit, index) => {
        commitIndex.set(commit.hash, index);
    });

    return [...selectedHashes].sort((left, right) => {
        const leftIndex = commitIndex.get(left) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = commitIndex.get(right) ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
    });
}
