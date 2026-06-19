import { FileStatus } from './models';

export interface BranchOverview {
    branch: string;
    upstream?: string;
    ahead: number;
    behind: number;
    hasUpstream: boolean;
}

export interface RepoState {
    overview: BranchOverview;
    files: FileStatus[];
    stashCount: number;
}

export type ChangeBucket = 'conflicted' | 'staged' | 'unstaged' | 'untracked';

export interface ChangeGroup {
    id: ChangeBucket;
    label: string;
    description: string;
    files: FileStatus[];
}

const bucketOrder: ChangeBucket[] = ['conflicted', 'staged', 'unstaged', 'untracked'];

function getBucket(file: FileStatus): ChangeBucket {
    if (file.status === 'conflicted') {
        return 'conflicted';
    }
    if (file.status === 'staged' || file.status === 'renamed') {
        return 'staged';
    }
    if (file.status === 'untracked') {
        return 'untracked';
    }
    return 'unstaged';
}

export function buildChangeGroups(files: FileStatus[]): ChangeGroup[] {
    const grouped = new Map<ChangeBucket, FileStatus[]>();

    for (const file of files) {
        const bucket = getBucket(file);
        const existing = grouped.get(bucket) ?? [];
        existing.push(file);
        grouped.set(bucket, existing);
    }

    return bucketOrder
        .map((bucket) => {
            const bucketFiles = grouped.get(bucket) ?? [];
            if (bucketFiles.length === 0) {
                return undefined;
            }

            return {
                id: bucket,
                label: getBucketLabel(bucket),
                description: `${bucketFiles.length} file${bucketFiles.length === 1 ? '' : 's'}`,
                files: bucketFiles
            };
        })
        .filter((group): group is ChangeGroup => Boolean(group));
}

function getBucketLabel(bucket: ChangeBucket): string {
    switch (bucket) {
        case 'conflicted':
            return 'Conflicted';
        case 'staged':
            return 'Staged';
        case 'untracked':
            return 'Untracked';
        case 'unstaged':
        default:
            return 'Unstaged';
    }
}
