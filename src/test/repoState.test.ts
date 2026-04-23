import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChangeGroups } from '../git/repoState';
import { parseAheadBehind, parseCurrentBranch, parseUpstreamRef } from '../git/parser';
import { FileStatus } from '../git/models';

test('parseCurrentBranch falls back to detached head label', () => {
    assert.equal(parseCurrentBranch('HEAD\n'), 'Detached HEAD');
    assert.equal(parseCurrentBranch('feature/cockpit\n'), 'feature/cockpit');
});

test('parseUpstreamRef ignores missing upstream markers', () => {
    assert.equal(parseUpstreamRef('fatal: no upstream configured'), undefined);
    assert.equal(parseUpstreamRef('origin/main\n'), 'origin/main');
});

test('parseAheadBehind returns zeroes when counts are unavailable', () => {
    assert.deepEqual(parseAheadBehind(''), { ahead: 0, behind: 0 });
    assert.deepEqual(parseAheadBehind('3\t7\n'), { ahead: 3, behind: 7 });
});

test('buildChangeGroups orders cockpit buckets by urgency', () => {
    const files: FileStatus[] = [
        { path: 'conflict.ts', status: 'conflicted', indexStatus: 'U', worktreeStatus: 'U' },
        { path: 'staged.ts', status: 'staged', indexStatus: 'M', worktreeStatus: ' ' },
        { path: 'edited.ts', status: 'modified', indexStatus: ' ', worktreeStatus: 'M' },
        { path: 'new.ts', status: 'untracked', indexStatus: '?', worktreeStatus: '?' }
    ];

    const groups = buildChangeGroups(files);

    assert.deepEqual(groups.map((group) => group.id), ['conflicted', 'staged', 'unstaged', 'untracked']);
    assert.equal(groups[0].files[0].path, 'conflict.ts');
    assert.equal(groups[2].files[0].path, 'edited.ts');
});
