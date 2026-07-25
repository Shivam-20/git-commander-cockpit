export interface ResetImpact {
    commitCount: number;
    fileChanges: string[];
    willLoseWork: boolean;
    commitsToBeReset: import('../git/models').Commit[];
}

export interface RevertImpact {
    canRevertCleanly: boolean;
    potentialConflicts: string[];
    commitsToRevert: import('../git/models').Commit[];
}
