import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCommitQuickPick, getRevertOrder } from '../git/commitHistory';
import { Commit } from '../git/models';
import { parseLog } from '../git/parser';

test('parseLog reads tab-delimited git history rows', () => {
    const commits = parseLog([
        'abc123456789\tdev@example.com\t2 hours ago\tfeat: add revert support',
        'def987654321\tdev@example.com\t3 days ago\tfix: clean up status parser'
    ].join('\n'));

    assert.equal(commits.length, 2);
    assert.equal(commits[0].shortHash, 'abc1234');
    assert.equal(commits[0].relativeDate, '2 hours ago');
    assert.equal(commits[0].message, 'feat: add revert support');
});

test('getRevertOrder keeps selected commits in newest-first history order', () => {
    const commits: Commit[] = [
        { hash: 'aaa111', shortHash: 'aaa111', message: 'latest', author: 'a', date: '1 hour ago', relativeDate: '1 hour ago', isPushed: false },
        { hash: 'bbb222', shortHash: 'bbb222', message: 'middle', author: 'a', date: '2 hours ago', relativeDate: '2 hours ago', isPushed: false },
        { hash: 'ccc333', shortHash: 'ccc333', message: 'older', author: 'a', date: '1 day ago', relativeDate: '1 day ago', isPushed: false }
    ];

    assert.deepEqual(getRevertOrder(['ccc333', 'aaa111'], commits), ['aaa111', 'ccc333']);
});

test('buildCommitQuickPick exposes hash and message for quick-pick search', () => {
    const commits: Commit[] = [
        { hash: 'aaa111222', shortHash: 'aaa1112', message: 'feat: latest', author: 'Alice', date: '1 hour ago', relativeDate: '1 hour ago', isPushed: false },
        { hash: 'bbb222333', shortHash: 'bbb2223', message: 'fix: parser', author: 'Bob', date: '2 hours ago', relativeDate: '2 hours ago', isPushed: true }
    ];

    const picks = buildCommitQuickPick(commits);

    assert.equal(picks[0].label, 'aaa1112 feat: latest');
    assert.match(picks[0].description, /Alice/);
    assert.equal(picks[1].hash, 'bbb222333');
});
