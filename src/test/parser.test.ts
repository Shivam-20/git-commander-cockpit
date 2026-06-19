import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseStatus, parseMergedBranches } from '../git/parser';

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
});

describe('parseMergedBranches', () => {
    it('filters protected and current branch', () => {
        const output = '* feature\n  main\n  merged-feature\n';
        const result = parseMergedBranches(output, 'feature');
        assert.deepEqual(result, ['merged-feature']);
    });
});
