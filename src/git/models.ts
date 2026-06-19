export type FileStatusType = 'modified' | 'staged' | 'untracked' | 'deleted' | 'renamed' | 'conflicted';

export interface FileStatus {
    path: string;
    status: FileStatusType;
    originalPath?: string;
    indexStatus: string;
    worktreeStatus: string;
}

export interface Commit {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
    relativeDate: string;
    isPushed: boolean;
}
