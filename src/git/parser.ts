import { FileStatus, FileStatusType, Commit } from './models';

function makeEntry(
    path: string,
    status: FileStatusType,
    indexStatus: string,
    worktreeStatus: string,
    originalPath?: string
): FileStatus {
    return { path, status, indexStatus, worktreeStatus, originalPath };
}

export function parseStatus(output: string): FileStatus[] {
    const lines = output.split('\n').filter(line => line.length > 0);
    const files: FileStatus[] = [];

    for (const line of lines) {
        if (line.startsWith('#')) {
            continue;
        }

        const indexStatus = line[0] ?? ' ';
        const worktreeStatus = line[1] ?? ' ';
        const rest = line.slice(3);

        let path = rest;
        let originalPath: string | undefined;

        if (rest.includes(' -> ')) {
            const parts = rest.split(' -> ');
            originalPath = parts[0];
            path = parts[1];
        }

        if (indexStatus === '?' && worktreeStatus === '?') {
            files.push(makeEntry(path, 'untracked', indexStatus, worktreeStatus, originalPath));
            continue;
        }

        const hasIndexChange = indexStatus !== ' ' && indexStatus !== '?';
        const hasWorktreeChange = worktreeStatus !== ' ' && worktreeStatus !== '?';

        if (
            indexStatus === 'U' ||
            worktreeStatus === 'U' ||
            (indexStatus === 'A' && worktreeStatus === 'A') ||
            (indexStatus === 'D' && worktreeStatus === 'D')
        ) {
            files.push(makeEntry(path, 'conflicted', indexStatus, worktreeStatus, originalPath));
            continue;
        }

        if (hasIndexChange) {
            let stagedStatus: FileStatusType = 'staged';
            if (indexStatus === 'D') {
                stagedStatus = 'deleted';
            } else if (indexStatus === 'R' || indexStatus === 'C') {
                stagedStatus = 'renamed';
            }
            files.push(makeEntry(path, stagedStatus, indexStatus, worktreeStatus, originalPath));
        }

        if (hasWorktreeChange) {
            if (worktreeStatus === 'M') {
                files.push(makeEntry(path, 'modified', indexStatus, worktreeStatus, originalPath));
            } else if (worktreeStatus === 'D') {
                files.push(makeEntry(path, 'deleted', indexStatus, worktreeStatus, originalPath));
            } else if (!hasIndexChange) {
                files.push(makeEntry(path, 'modified', indexStatus, worktreeStatus, originalPath));
            }
        }
    }

    return files;
}

export function parseLog(output: string): Commit[] {
    const lines = output.split('\n').filter(line => line.length > 0);
    const commits: Commit[] = [];

    for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 4) {
            continue;
        }

        const hash = parts[0];
        const shortHash = hash.slice(0, 7);
        const author = parts[1];
        const relativeDate = parts[2];
        const message = parts[3];
        const date = relativeDate;

        if (!hash) {
            continue;
        }

        commits.push({
            hash,
            shortHash,
            message,
            author,
            date,
            relativeDate,
            isPushed: false
        });
    }

    return commits;
}

export function parseCurrentBranch(output: string): string {
    const branch = output.trim();
    return branch === 'HEAD' || branch.length === 0 ? 'Detached HEAD' : branch;
}

export function parseUpstreamRef(output: string): string | undefined {
    const trimmed = output.trim();
    if (!trimmed || trimmed.startsWith('fatal:')) {
        return undefined;
    }
    return trimmed;
}

export function parseAheadBehind(output: string): { ahead: number; behind: number } {
    const trimmed = output.trim();
    if (!trimmed) {
        return { ahead: 0, behind: 0 };
    }

    const [aheadText, behindText] = trimmed.split(/\s+/);
    const ahead = Number.parseInt(aheadText ?? '0', 10);
    const behind = Number.parseInt(behindText ?? '0', 10);

    return {
        ahead: Number.isFinite(ahead) ? ahead : 0,
        behind: Number.isFinite(behind) ? behind : 0
    };
}

export function parseMergedBranches(output: string, currentBranch: string): string[] {
    return output.split('\n')
        .map(b => b.replace(/^\*?\s+/, '').trim())
        .filter(b => b && b !== currentBranch.trim() && !['main', 'master', 'dev', 'development'].includes(b));
}
