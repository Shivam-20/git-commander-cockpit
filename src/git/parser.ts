import { FileStatus, FileStatusType, Commit } from './models';

export function parseStatus(output: string): FileStatus[] {
    const lines = output.split('\n').filter(line => line.length > 0);
    const files: FileStatus[] = [];

    for (const line of lines) {
        if (line.startsWith('#')) {
            continue;
        }

        // Parse porcelain v1 format: XY <path> or XY <path> -> <origPath>
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

        let status: FileStatusType;
        if (
            indexStatus === 'U' ||
            worktreeStatus === 'U' ||
            (indexStatus === 'A' && worktreeStatus === 'A') ||
            (indexStatus === 'D' && worktreeStatus === 'D')
        ) {
            status = 'conflicted';
        } else if (indexStatus !== ' ' && indexStatus !== '?') {
            status = 'staged';
        } else if (worktreeStatus === 'M') {
            status = 'modified';
        } else if (worktreeStatus === 'D') {
            status = 'deleted';
        } else if (worktreeStatus === '?') {
            status = 'untracked';
        } else if (worktreeStatus === 'A') {
            status = 'modified';
        } else {
            status = 'modified';
        }

        files.push({
            path,
            status,
            originalPath,
            indexStatus,
            worktreeStatus
        });
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
            isPushed: false // Will be determined separately
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
