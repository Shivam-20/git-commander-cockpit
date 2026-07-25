import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeRepoPath } from '../utils/pathUtils';

describe('safeRepoPath', () => {
    it('resolves a normal relative path', () => {
        const result = safeRepoPath('/home/user/repo', 'src/app.ts');
        assert.equal(result, '/home/user/repo/src/app.ts');
    });

    it('resolves a nested relative path', () => {
        const result = safeRepoPath('/home/user/repo', 'src/components/button.tsx');
        assert.equal(result, '/home/user/repo/src/components/button.tsx');
    });

    it('rejects path traversal with ..', () => {
        const result = safeRepoPath('/home/user/repo', '../../etc/passwd');
        assert.equal(result, null);
    });

    it('rejects absolute path', () => {
        const result = safeRepoPath('/home/user/repo', '/etc/passwd');
        assert.equal(result, null);
    });

    it('rejects path with embedded ..', () => {
        const result = safeRepoPath('/home/user/repo', 'src/../../etc/passwd');
        assert.equal(result, null);
    });

    it('allows path at repo root', () => {
        const result = safeRepoPath('/home/user/repo', '.');
        assert.equal(result, '/home/user/repo');
    });

    it('resolves path with leading slash as relative', () => {
        const result = safeRepoPath('/home/user/repo', '/absolute/path');
        // path.resolve makes this absolute, so it should be rejected
        assert.equal(result, null);
    });
});
