import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatus, parseMergedBranches, parseLog, parseCurrentBranch, parseUpstreamRef, parseAheadBehind } from '../git/parser';

describe('parseStatus', () => {
    it('parses untracked files', () => {
        const files = parseStatus('?? new-file.txt\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].path, 'new-file.txt');
        assert.equal(files[0].status, 'untracked');
    });

    it('parses modified unstaged files', () => {
        const files = parseStatus(' M src/app.ts\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].status, 'modified');
        assert.equal(files[0].path, 'src/app.ts');
    });

    it('parses staged files', () => {
        const files = parseStatus('M  src/app.ts\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].status, 'staged');
    });

    it('parses partially staged files (MM) as staged and modified', () => {
        const files = parseStatus('MM src/app.ts\n');
        assert.equal(files.length, 2);
        assert.equal(files[0].status, 'staged');
        assert.equal(files[1].status, 'modified');
        assert.equal(files[0].path, 'src/app.ts');
        assert.equal(files[1].path, 'src/app.ts');
    });

    it('parses conflicted files', () => {
        const files = parseStatus('UU src/conflict.ts\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].status, 'conflicted');
    });

    it('parses renamed files with original path', () => {
        const files = parseStatus('R  old.ts -> new.ts\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].status, 'renamed');
        assert.equal(files[0].path, 'new.ts');
        assert.equal(files[0].originalPath, 'old.ts');
    });

    it('parses deleted staged files', () => {
        const files = parseStatus('D  removed.ts\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].status, 'deleted');
    });

    it('handles empty input', () => {
        const files = parseStatus('');
        assert.equal(files.length, 0);
    });

    it('handles filenames with spaces', () => {
        const files = parseStatus('M  path with spaces/file name.ts\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].path, 'path with spaces/file name.ts');
    });

    it('handles typechange status (T)', () => {
        const files = parseStatus('T  src/changed.ts\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].status, 'staged');
        assert.equal(files[0].indexStatus, 'T');
    });

    it('handles copied files (C status)', () => {
        const files = parseStatus('C  original.ts -> copy.ts\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].status, 'renamed');
        assert.equal(files[0].path, 'copy.ts');
        assert.equal(files[0].originalPath, 'original.ts');
    });

    it('handles both deleted (DD conflict)', () => {
        const files = parseStatus('DD deleted.ts\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].status, 'conflicted');
    });

    it('handles both added (AA conflict)', () => {
        const files = parseStatus('AA added.ts\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].status, 'conflicted');
    });

    it('skips comment lines', () => {
        const files = parseStatus('# Untracked files:\n?? file.txt\n');
        assert.equal(files.length, 1);
        assert.equal(files[0].path, 'file.txt');
    });
});

describe('parseLog', () => {
    it('parses tab-delimited git history rows', () => {
        const output = 'abc1234\tJohn Doe\t2 hours ago\tfeat: add login';
        const commits = parseLog(output);
        assert.equal(commits.length, 1);
        assert.equal(commits[0].hash, 'abc1234');
        assert.equal(commits[0].shortHash, 'abc1234');
        assert.equal(commits[0].author, 'John Doe');
        assert.equal(commits[0].message, 'feat: add login');
        assert.equal(commits[0].relativeDate, '2 hours ago');
    });

    it('handles empty input', () => {
        const commits = parseLog('');
        assert.equal(commits.length, 0);
    });

    it('skips lines with fewer than 4 tab-separated parts', () => {
        const output = 'abc1234\tJohn\t2h';
        const commits = parseLog(output);
        assert.equal(commits.length, 0);
    });

    it('parses multiple commits', () => {
        const output = 'aaa1111\tA\t1h\tfirst\nbbb2222\tB\t2h\tsecond';
        const commits = parseLog(output);
        assert.equal(commits.length, 2);
        assert.equal(commits[0].message, 'first');
        assert.equal(commits[1].message, 'second');
    });

    it('handles tabs in commit messages', () => {
        const output = 'abc1234\tAuthor\t1h\tfeat: tab\there in message';
        const commits = parseLog(output);
        assert.equal(commits.length, 1);
        assert.equal(commits[0].message, 'feat: tab');
    });
});

describe('parseCurrentBranch', () => {
    it('returns branch name', () => {
        assert.equal(parseCurrentBranch('feature/login\n'), 'feature/login');
    });

    it('returns Detached HEAD for HEAD', () => {
        assert.equal(parseCurrentBranch('HEAD'), 'Detached HEAD');
    });

    it('returns Detached HEAD for empty', () => {
        assert.equal(parseCurrentBranch(''), 'Detached HEAD');
    });

    it('trims whitespace', () => {
        assert.equal(parseCurrentBranch('  main  \n'), 'main');
    });
});

describe('parseUpstreamRef', () => {
    it('parses upstream ref', () => {
        assert.equal(parseUpstreamRef('origin/main\n'), 'origin/main');
    });

    it('returns undefined for empty', () => {
        assert.equal(parseUpstreamRef(''), undefined);
    });

    it('returns undefined for fatal error', () => {
        assert.equal(parseUpstreamRef('fatal: no upstream configured'), undefined);
    });
});

describe('parseAheadBehind', () => {
    it('parses ahead and behind counts', () => {
        const result = parseAheadBehind('3\t2');
        assert.equal(result.ahead, 3);
        assert.equal(result.behind, 2);
    });

    it('returns zeroes for empty', () => {
        const result = parseAheadBehind('');
        assert.equal(result.ahead, 0);
        assert.equal(result.behind, 0);
    });

    it('handles non-numeric gracefully', () => {
        const result = parseAheadBehind('abc\tdef');
        assert.equal(result.ahead, 0);
        assert.equal(result.behind, 0);
    });
});

describe('parseMergedBranches', () => {
    it('filters protected and current branch', () => {
        const output = '* feature\n  main\n  merged-feature\n';
        const result = parseMergedBranches(output, 'feature');
        assert.deepEqual(result, ['merged-feature']);
    });

    it('filters all protected branches', () => {
        const output = 'main\nmaster\ndev\ndevelopment\nfeature-x\n';
        const result = parseMergedBranches(output, 'other');
        assert.deepEqual(result, ['feature-x']);
    });

    it('returns empty for no merged branches', () => {
        const output = '* main\n';
        const result = parseMergedBranches(output, 'main');
        assert.deepEqual(result, []);
    });
});
