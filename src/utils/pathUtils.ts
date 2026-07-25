import * as nodePath from 'path';

export function safeRepoPath(repoRoot: string, relativePath: string): string | null {
    const resolved = nodePath.resolve(repoRoot, relativePath);
    if (!resolved.startsWith(repoRoot + nodePath.sep) && resolved !== repoRoot) {
        return null;
    }
    return resolved;
}
