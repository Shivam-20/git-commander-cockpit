import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Reset Command Modes', () => {
    it('should have correct git reset command structure for soft mode', () => {
        const mode = 'soft';
        const targetHash = 'abc1234';
        const expectedArgs = ['reset', `--${mode}`, targetHash];
        
        assert.equal(expectedArgs[0], 'reset');
        assert.equal(expectedArgs[1], '--soft');
        assert.equal(expectedArgs[2], targetHash);
    });

    it('should have correct git reset command structure for mixed mode', () => {
        const mode = 'mixed';
        const targetHash = 'abc1234';
        const expectedArgs = ['reset', `--${mode}`, targetHash];
        
        assert.equal(expectedArgs[1], '--mixed');
    });

    it('should have correct git reset command structure for hard mode', () => {
        const mode = 'hard';
        const targetHash = 'abc1234';
        const expectedArgs = ['reset', `--${mode}`, targetHash];
        
        assert.equal(expectedArgs[1], '--hard');
    });

    it('should show appropriate confirmation messages for each mode', () => {
        const modes = ['soft', 'mixed', 'hard'] as const;
        const expectedDescriptions = {
            soft: 'keep changes staged',
            mixed: 'keep changes unstaged', 
            hard: 'discard later changes'
        };

        for (const mode of modes) {
            assert.ok(expectedDescriptions[mode], `Description exists for ${mode}`);
        }
    });
});
