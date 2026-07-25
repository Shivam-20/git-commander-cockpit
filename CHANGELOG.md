# Changelog

## 0.3.0

- Security: Add webview command whitelist to prevent arbitrary command execution
- Security: Add path traversal validation via safeRepoPath helper
- Security: Replace hardcoded 'origin' remote with dynamic remote detection
- Refactor: Split enhancedRevertReset.ts (525 lines) into revert.ts, reset.ts, undo.ts, types.ts
- Refactor: Extract command registration boilerplate into registerWithRefresh helper
- Refactor: Deduplicate revert stash/revert/restore flow into revertWithStashFlow
- Refactor: Extract oopsMacrosCommand into individual macro functions
- Refactor: Remove indirection-only wrapper functions
- Performance: Parallelize getRepoState with Promise.all for independent git calls
- Performance: Only poll when webview is visible via onDidChangeVisibility
- Performance: Batch analyzeRevertImpact status checks into single git call
- Type Safety: Add WebviewMessage discriminated union type for message handling
- Type Safety: Fix any types in catch blocks
- Testing: Add parser edge case tests (59 total tests, up from 20)
- Testing: Add safeRepoPath security tests
- Testing: Add webview command whitelist tests
- DX: Merge duplicate toggle functions in webview
- DX: Add lint step to test script

## 0.2.0

- Added user-friendly revert and reset with detailed previews and safety confirmations
- Added enhanced undo last action with reflog preview
- Added oops quick fix macros for common git mistakes
- Added cloud WIP checkpoint backup
- Added merged branches cleanup tool
- Added Git LFS manager
- Added patch export/import tools
- Added repository configuration editor

## 0.1.0

- Added the Git Commander sidebar with overview, changes, and action sections
- Added branch, sync, stash, revert, and reset workflows
- Added searchable commit selection for history operations
- Added packaged extension metadata and publish-ready docs
