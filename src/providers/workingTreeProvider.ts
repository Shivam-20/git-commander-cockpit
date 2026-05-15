import * as vscode from 'vscode';
import { execGit, getRepoState } from '../git/git';
import { FileStatus } from '../git/models';
import { buildChangeGroups, BranchOverview, ChangeBucket, ChangeGroup, RepoState } from '../git/repoState';

type GitTreeNode = SectionItem | StatusGroupItem | FileItem | OverviewItem | ActionItem | EmptyStateItem;

class SectionItem extends vscode.TreeItem {
    constructor(
        public readonly section: 'overview' | 'changes' | 'actions',
        label: string,
        description?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.description = description;
        this.contextValue = `section:${section}`;
    }
}

class EmptyStateItem extends vscode.TreeItem {
    constructor(label: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'empty';
        this.iconPath = new vscode.ThemeIcon('circle-slash');
        this.description = 'all clear';
    }
}

export class FileItem extends vscode.TreeItem {
    constructor(
        public readonly file: FileStatus
    ) {
        super(file.path, vscode.TreeItemCollapsibleState.None);

        this.tooltip = `${file.indexStatus}${file.worktreeStatus} ${file.path}`;
        this.contextValue = `file:${file.status}`;

        switch (file.status) {
            case 'modified':
                this.iconPath = new vscode.ThemeIcon('diff-modified', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));
                this.description = 'modified';
                break;
            case 'staged':
                this.iconPath = new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
                this.description = 'staged';
                break;
            case 'untracked':
                this.iconPath = new vscode.ThemeIcon('diff-added', new vscode.ThemeColor('gitDecoration.untrackedResourceForeground'));
                this.description = 'new';
                break;
            case 'deleted':
                this.iconPath = new vscode.ThemeIcon('diff-removed', new vscode.ThemeColor('gitDecoration.deletedResourceForeground'));
                this.description = 'deleted';
                break;
            case 'conflicted':
                this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('gitDecoration.conflictingResourceForeground'));
                this.description = 'conflicted';
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('file');
        }

        this.command = {
            command: 'gitCommander.openDiff',
            title: 'Open Changes',
            arguments: [this]
        };
    }
}

class StatusGroupItem extends vscode.TreeItem {
    constructor(public readonly group: ChangeGroup) {
        super(group.label, vscode.TreeItemCollapsibleState.Expanded);
        this.description = group.description;
        this.contextValue = `group:${group.id}`;
        this.iconPath = new vscode.ThemeIcon(getGroupIcon(group.id));
    }
}

class OverviewItem extends vscode.TreeItem {
    constructor(
        label: string,
        description: string,
        iconId: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.contextValue = 'overview-item';
        this.iconPath = new vscode.ThemeIcon(iconId);
    }
}

class ActionItem extends vscode.TreeItem {
    constructor(
        label: string,
        description: string,
        commandId: string,
        iconId: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.contextValue = 'action-item';
        this.iconPath = new vscode.ThemeIcon(iconId);
        this.command = {
            command: commandId,
            title: label
        };
    }
}

function getGroupIcon(id: ChangeBucket): string {
    switch (id) {
        case 'conflicted':
            return 'warning';
        case 'staged':
            return 'check';
        case 'untracked':
            return 'diff-added';
        case 'unstaged':
        default:
            return 'edit';
    }
}

export class WorkingTreeProvider implements vscode.TreeDataProvider<GitTreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<GitTreeNode | undefined | void> = new vscode.EventEmitter<GitTreeNode | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<GitTreeNode | undefined | void> = this._onDidChangeTreeData.event;

    private readonly overviewSection = new SectionItem('overview', 'Overview');
    private readonly changesSection = new SectionItem('changes', 'Changes');
    private readonly actionsSection = new SectionItem('actions', 'Actions');

    private repoState: RepoState | undefined;
    private readonly actionItems: ActionItem[] = [
        new ActionItem('Switch Branch', 'checkout another local branch', 'gitCommander.switchBranch', 'git-branch'),
        new ActionItem('Create Branch', 'start a new branch from HEAD', 'gitCommander.createBranch', 'repo-create'),
        new ActionItem('Fetch', 'update remote refs safely', 'gitCommander.fetch', 'cloud-download'),
        new ActionItem('Pull', 'fast-forward from upstream', 'gitCommander.pull', 'arrow-down'),
        new ActionItem('Push', 'publish local commits', 'gitCommander.push', 'arrow-up'),
        new ActionItem('Stash Changes', 'save work-in-progress safely', 'gitCommander.stashSave', 'archive'),
        new ActionItem('Commit', 'create a new commit from staged changes', 'gitCommander.commit', 'check'),
        new ActionItem('Amend Last Commit', 'edit the message or content of HEAD', 'gitCommander.commitAmend', 'edit'),
        new ActionItem('Revert Last Commit', 'create a revert for HEAD safely', 'gitCommander.revertLastCommit', 'history'),
        new ActionItem('Search And Revert Commit', 'search by message, author, or hash and revert one commit', 'gitCommander.revertCommit', 'history'),
        new ActionItem('Revert Multiple Commits', 'search and multi-select commits to revert together', 'gitCommander.revertMultipleCommits', 'history'),
        new ActionItem('Reset Commit', 'search one commit then choose soft, mixed, or hard', 'gitCommander.resetCommit', 'debug-restart')
    ];

    refresh(): void {
        this.repoState = undefined;
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: GitTreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: GitTreeNode): Promise<GitTreeNode[]> {
        if (!element) {
            await this.ensureState();
            if (!this.repoState) {
                return [];
            }
            const items: GitTreeNode[] = [this.overviewSection, this.changesSection];
            const showActionSection = vscode.workspace.getConfiguration('gitCommander').get<boolean>('showActionSection', true);
            if (showActionSection) {
                items.push(this.actionsSection);
            }
            return items;
        }

        if (element instanceof SectionItem) {
            await this.ensureState();
            if (!this.repoState) {
                return [];
            }

            switch (element.section) {
                case 'overview':
                    return this.getOverviewItems(this.repoState.overview, this.repoState.stashCount);
                case 'changes': {
                    const groups = buildChangeGroups(this.repoState.files);
                    if (groups.length === 0) {
                        return [new EmptyStateItem('Working tree is clean')];
                    }
                    return groups.map((group) => new StatusGroupItem(group));
                }
                case 'actions':
                    return this.actionItems;
            }
        }

        if (element instanceof StatusGroupItem) {
            return element.group.files.map((file) => new FileItem(file));
        }

        return [];
    }

    async stage(item?: FileItem): Promise<void> {
        const path = item ? item.file.path : '.';
        await execGit(['add', '--', path]);
        this.refresh();
    }

    async unstage(item?: FileItem): Promise<void> {
        const path = item ? item.file.path : '.';
        await execGit(['restore', '--staged', '--', path]);
        this.refresh();
    }

    async discard(item?: FileItem): Promise<void> {
        const config = vscode.workspace.getConfiguration('gitCommander');
        const confirm = config.get<boolean>('confirmDiscard', true);

        if (confirm) {
            const result = await vscode.window.showWarningMessage(
                `Discard changes in ${item ? item.file.path : 'all files'}?`,
                { modal: true },
                'Discard'
            );
            if (result !== 'Discard') {
                return;
            }
        }

        if (item) {
            if (item.file.status === 'untracked') {
                const uri = await this.resolveFileUri(item.file.path);
                if (uri) {
                    await vscode.workspace.fs.delete(uri);
                }
            } else if (item.file.status === 'staged') {
                // Unstage first, then restore working tree
                await execGit(['restore', '--staged', '--', item.file.path]);
                await execGit(['restore', '--', item.file.path]).catch(() => { /* may not exist in worktree */ });
            } else {
                // Modified or deleted in worktree
                await execGit(['restore', '--', item.file.path]);
            }
        } else {
            // Discard all unstaged changes (restore tracked files)
            await execGit(['restore', '--', '.']);
        }
        this.refresh();
    }

    async openFile(item: FileItem): Promise<void> {
        const uri = await this.resolveFileUri(item.file.path);
        if (uri) {
            const document = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(document);
        }
    }

    async openDiff(item: FileItem): Promise<void> {
        const uri = await this.resolveFileUri(item.file.path);
        if (!uri) {
            return;
        }

        if (item.file.status === 'untracked') {
            await this.openFile(item);
            return;
        }

        const repoRelativePath = item.file.path.replace(/\\/g, '/');
        // Staged files: diff index vs working tree (ref: '' = index)
        // All other files: diff HEAD vs working tree
        const ref = item.file.status === 'staged' ? '' : 'HEAD';
        const left = uri.with({
            scheme: 'git',
            query: JSON.stringify({ path: repoRelativePath, ref })
        });
        const title = item.file.status === 'staged'
            ? `${item.file.path} (Index ↔ Working Tree)`
            : `${item.file.path} (Working Tree)`;
        await vscode.commands.executeCommand('vscode.diff', left, uri, title);
    }

    private async ensureState(): Promise<void> {
        if (!this.repoState) {
            this.repoState = await getRepoState().catch(() => undefined);
        }
    }

    private getOverviewItems(overview: BranchOverview, stashCount: number): OverviewItem[] {
        const upstreamLabel = overview.hasUpstream ? overview.upstream ?? 'configured' : 'not set';
        const syncSummary = overview.hasUpstream
            ? `${overview.ahead} ahead, ${overview.behind} behind`
            : 'publish branch to set upstream';

        return [
            new OverviewItem('Current Branch', overview.branch, 'git-branch'),
            new OverviewItem('Tracking', upstreamLabel, overview.hasUpstream ? 'link' : 'link-external'),
            new OverviewItem('Sync Status', syncSummary, 'sync'),
            new OverviewItem('Stashes', `${stashCount} saved`, 'archive')
        ];
    }

    private async resolveFileUri(filename: string): Promise<vscode.Uri | undefined> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return undefined;
        }

        for (const folder of folders) {
            const uri = vscode.Uri.joinPath(folder.uri, filename);
            try {
                await vscode.workspace.fs.stat(uri);
                return uri;
            } catch {
                // Try next workspace folder.
            }
        }

        return vscode.Uri.joinPath(folders[0].uri, filename);
    }
}
