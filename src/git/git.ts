import * as vscode from 'vscode';
import * as nodePath from 'path';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec as execCb } from 'child_process';
import { parseAheadBehind, parseCurrentBranch, parseLog, parseStatus, parseUpstreamRef } from './parser';
import { RepoState } from './repoState';
import { Commit } from './models';

const execAsync = promisify(execCb);

export class GitError extends Error {
    constructor(message: string, public readonly exitCode: number, public readonly stderr: string) {
        super(message);
        this.name = 'GitError';
    }
}

let cachedRepoRoot: string | undefined;

export async function findGitRepo(): Promise<string | undefined> {
    if (cachedRepoRoot) {
        try {
            await execGit(['rev-parse', '--git-dir'], cachedRepoRoot);
            return cachedRepoRoot;
        } catch {
            cachedRepoRoot = undefined;
        }
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return undefined;
    }

    for (const folder of folders) {
        try {
            const { stdout } = await execAsync('git rev-parse --show-toplevel', { cwd: folder.uri.fsPath });
            const root = stdout.trim();
            if (root) {
                cachedRepoRoot = root;
                return root;
            }
        } catch {
            // Not a git repo
        }
    }

    return undefined;
}

export function clearRepoCache(): void {
    cachedRepoRoot = undefined;
}

export function safeRepoPath(repoRoot: string, relativePath: string): string | null {
    const resolved = nodePath.resolve(repoRoot, relativePath);
    if (!resolved.startsWith(repoRoot + nodePath.sep) && resolved !== repoRoot) {
        return null;
    }
    return resolved;
}

export async function execGit(args: string[], cwd?: string): Promise<string> {
    const repoRoot = cwd ?? await findGitRepo();
    if (!repoRoot) {
        throw new GitError('No Git repository found in workspace', 1, '');
    }

    return new Promise((resolve, reject) => {
        const child = spawn('git', args, {
            cwd: repoRoot,
            env: { ...process.env, LC_ALL: 'C' }
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new GitError(`Git command failed: git ${args.join(' ')}`, code ?? -1, stderr.trim()));
            } else {
                resolve(stdout.trim());
            }
        });

        child.on('error', (err) => {
            reject(new GitError(`Failed to spawn git: ${err.message}`, -1, ''));
        });
    });
}

export async function runGitWithProgress(title: string, args: string[]): Promise<string> {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Window,
        title
    }, async () => execGit(args));
}

export async function getRepoState(): Promise<RepoState> {
    const branchOutput = await execGit(['branch', '--show-current']);
    const branch = parseCurrentBranch(branchOutput);

    // Run independent calls in parallel
    const [upstreamResult, statusOutput, stashOutput] = await Promise.all([
        execGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => ''),
        execGit(['status', '--porcelain']),
        execGit(['stash', 'list']).catch(() => '')
    ]);

    const upstream = parseUpstreamRef(upstreamResult);

    let ahead = 0;
    let behind = 0;
    if (upstream) {
        try {
            const counts = parseAheadBehind(await execGit(['rev-list', '--left-right', '--count', `HEAD...${upstream}`]));
            ahead = counts.ahead;
            behind = counts.behind;
        } catch {
            ahead = 0;
            behind = 0;
        }
    }

    return {
        overview: {
            branch,
            upstream,
            ahead,
            behind,
            hasUpstream: Boolean(upstream)
        },
        files: parseStatus(statusOutput),
        stashCount: stashOutput ? stashOutput.split('\n').filter(Boolean).length : 0
    };
}

export async function isWorkingTreeClean(): Promise<boolean> {
    const statusOutput = await execGit(['status', '--porcelain']);
    return statusOutput.trim().length === 0;
}

export async function getRecentCommits(limit = 15): Promise<Commit[]> {
    const output = await execGit(['log', `-${limit}`, '--no-merges', '--pretty=format:%H%x09%an%x09%ar%x09%s']);
    const commits = parseLog(output);

    let upstreamHashes = new Set<string>();
    try {
        const upstream = await execGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
        if (upstream.trim()) {
            const upstreamOutput = await execGit(['log', upstream.trim(), `-${limit}`, '--pretty=format:%H']);
            upstreamHashes = new Set(upstreamOutput.split('\n').filter(Boolean));
        }
    } catch {
        upstreamHashes = new Set<string>();
    }

    return commits.map((commit) => ({
        ...commit,
        isPushed: upstreamHashes.has(commit.hash)
    }));
}
