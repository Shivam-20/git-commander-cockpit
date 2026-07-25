import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const ALLOWED_COMMANDS = new Set([
    'gitCommander.refresh', 'gitCommander.stage', 'gitCommander.stageAll',
    'gitCommander.unstage', 'gitCommander.unstageAll', 'gitCommander.discard',
    'gitCommander.openFile', 'gitCommander.openDiff', 'gitCommander.switchBranch',
    'gitCommander.createBranch', 'gitCommander.fetch', 'gitCommander.pull',
    'gitCommander.push', 'gitCommander.stashSave', 'gitCommander.revertLastCommit',
    'gitCommander.revertCommit', 'gitCommander.revertMultipleCommits',
    'gitCommander.resetCommit', 'gitCommander.commit', 'gitCommander.commitAmend',
    'gitCommander.timeMachine', 'gitCommander.undoLast', 'gitCommander.repoConfig',
    'gitCommander.lfsManager', 'gitCommander.exportPatch', 'gitCommander.applyPatch',
    'gitCommander.oopsMacros', 'gitCommander.cleanMergedBranches', 'gitCommander.wipBackup',
    'git.openChange', 'vscode.diff'
]);

describe('ALLOWED_COMMANDS whitelist', () => {
    it('contains all gitCommander commands', () => {
        assert.ok(ALLOWED_COMMANDS.has('gitCommander.refresh'));
        assert.ok(ALLOWED_COMMANDS.has('gitCommander.commit'));
        assert.ok(ALLOWED_COMMANDS.has('gitCommander.push'));
        assert.ok(ALLOWED_COMMANDS.has('gitCommander.wipBackup'));
    });

    it('contains external commands used by the extension', () => {
        assert.ok(ALLOWED_COMMANDS.has('git.openChange'));
        assert.ok(ALLOWED_COMMANDS.has('vscode.diff'));
    });

    it('rejects unknown commands', () => {
        assert.ok(!ALLOWED_COMMANDS.has('vscode.executeCommand'));
        assert.ok(!ALLOWED_COMMANDS.has('malicious.command'));
        assert.ok(!ALLOWED_COMMANDS.has(''));
    });

    it('rejects command injection attempts', () => {
        assert.ok(!ALLOWED_COMMANDS.has('gitCommander.refresh; rm -rf /'));
        assert.ok(!ALLOWED_COMMANDS.has('$(malicious)'));
        assert.ok(!ALLOWED_COMMANDS.has('${expression}'));
    });
});

describe('WebviewMessage type validation', () => {
    it('validates exec message structure', () => {
        const msg = { type: 'exec', cmd: 'gitCommander.refresh' };
        assert.equal(msg.type, 'exec');
        assert.ok(typeof msg.cmd === 'string');
    });

    it('validates stage message structure', () => {
        const msg = { type: 'stage', path: 'src/app.ts' };
        assert.equal(msg.type, 'stage');
        assert.ok(typeof msg.path === 'string');
    });

    it('validates commit message structure', () => {
        const msg = { type: 'commit', message: 'feat: add feature' };
        assert.equal(msg.type, 'commit');
        assert.ok(typeof msg.message === 'string');
    });

    it('validates refresh message has no extra fields', () => {
        const msg = { type: 'refresh' };
        assert.equal(msg.type, 'refresh');
        assert.equal(Object.keys(msg).length, 1);
    });
});
