import * as vscode from 'vscode';
import { execGit, getRepoState, isWorkingTreeClean, findGitRepo } from '../git/git';
import { FileStatus } from '../git/models';

export class CockpitWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'gitCommanderCockpit';
    private _view?: vscode.WebviewView;

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._buildHtml();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            const cleanPath = msg.path ? msg.path.replace(/^"(.*)"$/, '$1') : undefined;
            switch (msg.type) {
                case 'exec':
                    await vscode.commands.executeCommand(msg.cmd);
                    break;
                case 'stage':
                    await execGit(['add', '--', cleanPath!]).catch(() => {});
                    await this.refresh();
                    break;
                case 'stageAll':
                    await execGit(['add', '-A', '--', msg.scope ?? '.']).catch(() => {});
                    await this.refresh();
                    break;
                case 'unstage':
                    await execGit(['restore', '--staged', '--', cleanPath!]).catch(() => {});
                    await this.refresh();
                    break;
                case 'unstageAll':
                    await execGit(['restore', '--staged', '--', '.']).catch(() => {});
                    await this.refresh();
                    break;
                case 'discard':
                    await this._discard(cleanPath!, msg.status);
                    await this.refresh();
                    break;
                case 'openFile':
                    await this._openFile(cleanPath!);
                    break;
                case 'openDiff':
                    await this._openDiff(cleanPath!, msg.status);
                    break;
                case 'refresh':
                    await this.refresh();
                    break;
            }
        });

        this.refresh();
    }

    async refresh(): Promise<void> {
        if (!this._view) { return; }
        try {
            const state = await getRepoState();
            this._view.webview.postMessage({ type: 'state', state });
        } catch {
            this._view.webview.postMessage({ type: 'noRepo' });
        }
    }

    private async _discard(path: string, status: string): Promise<void> {
        const config = vscode.workspace.getConfiguration('gitCommander');
        if (config.get<boolean>('confirmDiscard', true)) {
            const res = await vscode.window.showWarningMessage(
                `Discard changes in ${path}?`, { modal: true }, 'Discard'
            );
            if (res !== 'Discard') { return; }
        }
        if (status === 'untracked') {
            const repoRoot = await findGitRepo();
            if (repoRoot) {
                const uri = vscode.Uri.file(`${repoRoot}/${path}`);
                await vscode.workspace.fs.delete(uri).then(() => {}, () => {});
            }
        } else if (status === 'staged') {
            await execGit(['restore', '--staged', '--', path]).catch(() => {});
            await execGit(['restore', '--', path]).catch(() => {});
        } else {
            await execGit(['restore', '--', path]).catch(() => {});
        }
    }

    private async _openFile(path: string): Promise<void> {
        const repoRoot = await findGitRepo();
        if (!repoRoot) return;
        const uri = vscode.Uri.file(`${repoRoot}/${path}`);
        try {
            await vscode.workspace.fs.stat(uri);
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc);
        } catch {}
    }

    private async _openDiff(path: string, status: string): Promise<void> {
        if (status === 'untracked') {
            return this._openFile(path);
        }
        const repoRoot = await findGitRepo();
        if (!repoRoot) return;
        const uri = vscode.Uri.file(`${repoRoot}/${path}`);
        
        try {
            await vscode.commands.executeCommand('git.openChange', uri);
        } catch {
            const ref = status === 'staged' ? '' : '~';
            const left = uri.with({ scheme: 'git', query: JSON.stringify({ path: uri.fsPath, ref }) });
            const title = status === 'staged'
                ? `${path} (Index ↔ Working Tree)`
                : `${path} (Working Tree)`;
            await vscode.commands.executeCommand('vscode.diff', left, uri, title);
        }
    }

    private _buildHtml(): string {
        return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:var(--vscode-font-family,'Segoe UI',system-ui,sans-serif);font-size:var(--vscode-font-size,13px);color:var(--vscode-foreground);background:var(--vscode-sideBar-background);overflow-x:hidden;user-select:none}
/* Sections */
.sec-hdr{height:24px;display:flex;align-items:center;gap:5px;padding:0 6px;cursor:pointer;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--vscode-sideBarSectionHeader-foreground,var(--vscode-foreground));background:var(--vscode-sideBarSectionHeader-background,transparent)}
.sec-hdr:hover{background:var(--vscode-list-hoverBackground)}
.chevron{font-size:9px;transition:transform .15s;display:inline-block;opacity:.7}
.collapsed .chevron{transform:rotate(-90deg)}
.sec-body{display:block}.collapsed+.sec-body{display:none}
/* Overview */
.ov-row{height:22px;display:flex;align-items:center;padding:0 6px 0 22px;gap:6px;font-size:12px}
.ov-icon{width:15px;text-align:center;opacity:.6;flex-shrink:0}
.ov-key{color:var(--vscode-descriptionForeground);min-width:72px;flex-shrink:0}
.ov-val{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.badge{display:inline-flex;align-items:center;padding:0 5px;height:14px;border-radius:10px;font-size:10px;font-weight:600;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);margin-left:3px}
.badge.behind{background:var(--vscode-editorError-foreground,#e45454);color:#fff}
/* Group header */
.grp-hdr{height:24px;display:flex;align-items:center;padding:0 4px 0 14px;cursor:pointer;gap:5px;font-size:12px;position:relative}
.grp-hdr:hover{background:var(--vscode-list-hoverBackground)}
.grp-hdr:hover .grp-acts{opacity:1}
.g-chev{font-size:9px;color:var(--vscode-descriptionForeground);transition:transform .15s}
.grp-hdr.collapsed .g-chev{transform:rotate(-90deg)}
.grp-icon{width:14px;text-align:center;font-size:12px}
.grp-lbl{flex:1;font-weight:600}
.grp-cnt{font-size:11px;color:var(--vscode-descriptionForeground);padding-right:2px}
.grp-acts{opacity:0;display:flex;gap:1px;transition:opacity .12s}
.ga-btn{width:18px;height:18px;display:flex;align-items:center;justify-content:center;border-radius:2px;cursor:pointer;font-size:13px;color:var(--vscode-descriptionForeground);border:none;background:transparent;transition:background .1s,color .1s}
.ga-btn:hover{background:var(--vscode-toolbar-hoverBackground,rgba(128,128,128,.2));color:var(--vscode-foreground)}
.grp-files{display:block}.grp-hdr.collapsed+.grp-files{display:none}
/* File item */
.file-row{height:22px;display:flex;align-items:center;padding:0 4px 0 28px;gap:5px;cursor:pointer;position:relative}
.file-row:hover{background:var(--vscode-list-hoverBackground)}
.file-row:hover .fa-wrap{opacity:1}
.f-ico{width:13px;text-align:center;font-size:11px;flex-shrink:0}
.f-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.f-tag{font-size:11px;color:var(--vscode-descriptionForeground);flex-shrink:0}
.fa-wrap{opacity:0;display:flex;gap:1px;transition:opacity .12s}
.fa-btn{width:17px;height:17px;display:flex;align-items:center;justify-content:center;border-radius:2px;cursor:pointer;font-size:12px;color:var(--vscode-descriptionForeground);border:none;background:transparent;transition:background .1s,color .1s}
.fa-btn:hover{background:var(--vscode-toolbar-hoverBackground,rgba(128,128,128,.2));color:var(--vscode-foreground)}
/* Action items */
.act-row{height:22px;display:flex;align-items:center;padding:0 6px 0 22px;gap:7px;cursor:pointer;font-size:12px}
.act-row:hover{background:var(--vscode-list-hoverBackground)}
.act-icon{width:14px;text-align:center;opacity:.7;flex-shrink:0}
.act-lbl{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.act-desc{font-size:11px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px}
/* Status colors */
.c-mod{color:var(--vscode-gitDecoration-modifiedResourceForeground,#e2c08d)}
.c-add{color:var(--vscode-gitDecoration-addedResourceForeground,#73c991)}
.c-del{color:var(--vscode-gitDecoration-deletedResourceForeground,#f14c4c)}
.c-new{color:var(--vscode-gitDecoration-untrackedResourceForeground,#73c991)}
.c-conflict{color:var(--vscode-gitDecoration-conflictingResourceForeground,#e4676b)}
/* Loading / empty */
.empty{padding:12px 16px;font-size:12px;color:var(--vscode-descriptionForeground)}
.loading{padding:8px 16px;font-size:12px;color:var(--vscode-descriptionForeground);display:flex;align-items:center;gap:6px}
@keyframes spin{to{transform:rotate(360deg)}}
.spinner{display:inline-block;animation:spin 1s linear infinite}
</style>
</head>
<body>
<div id="root"><div class="loading"><span class="spinner">↺</span> Loading...</div></div>
<script>
const vsc = acquireVsCodeApi();
let state = vsc.getState() || { col: {} };

function send(msg){ vsc.postMessage(msg); }
function saveState() { vsc.setState(state); }

function toggleSec(hdr){ 
  hdr.classList.toggle('collapsed'); 
  const key = hdr.textContent.trim();
  state.col[key] = hdr.classList.contains('collapsed');
  saveState();
}
function toggleGrp(hdr){ 
  hdr.classList.toggle('collapsed'); 
  const key = hdr.querySelector('.grp-lbl').textContent.trim();
  state.col[key] = hdr.classList.contains('collapsed');
  saveState();
}

function stageFile(e, path) { if(e) e.stopPropagation(); send({type:'stage', path}); }
function unstageFile(e, path) { if(e) e.stopPropagation(); send({type:'unstage', path}); }
function discardFile(e, path, status) { if(e) e.stopPropagation(); send({type:'discard', path, status}); }
function openDiff(e, path, status) { if(e) e.stopPropagation(); send({type:'openDiff', path, status}); }
function openFile(e, path) { if(e) e.stopPropagation(); send({type:'openFile', path}); }
function stageAll(e) { if(e) e.stopPropagation(); send({type:'stageAll', scope:'.'}); }
function unstageAll(e) { if(e) e.stopPropagation(); send({type:'unstageAll'}); }

window.addEventListener('message', e => {
  const msg = e.data;
  if(msg.type === 'state') {
    render(msg.state);
    
    // Restore collapsed state
    document.querySelectorAll('.sec-hdr').forEach(hdr => {
      if(state.col[hdr.textContent.trim()]) hdr.classList.add('collapsed');
    });
    document.querySelectorAll('.grp-hdr').forEach(hdr => {
      const lbl = hdr.querySelector('.grp-lbl');
      if(lbl && state.col[lbl.textContent.trim()]) hdr.classList.add('collapsed');
    });
  }
  else if(msg.type === 'noRepo') document.getElementById('root').innerHTML =
    '<div class="empty">No Git repository found in this workspace.</div>';
});

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function render(s){
  const files = s.files || [];
  const conflicted = files.filter(f=>f.status==='conflicted');
  const staged     = files.filter(f=>f.status==='staged');
  const unstaged   = files.filter(f=>f.status==='modified'||f.status==='deleted');
  const untracked  = files.filter(f=>f.status==='untracked');

  const upLabel = s.overview.hasUpstream ? escHtml(s.overview.upstream||'configured') : 'not set';
  const syncBadges = s.overview.hasUpstream
    ? (s.overview.ahead?'<span class="badge">'+s.overview.ahead+' ahead</span>':'')
      +(s.overview.behind?'<span class="badge behind">'+s.overview.behind+' behind</span>':'')
      ||(s.overview.ahead===0&&s.overview.behind===0?'<span style="opacity:.6">up to date</span>':'')
    : '<span style="opacity:.6">no upstream</span>';

  const totalChanges = files.length;

  document.getElementById('root').innerHTML = \`
<div class="sec-hdr" onclick="toggleSec(this)"><span class="chevron">▾</span>Overview</div>
<div class="sec-body">
  \${ovRow('⎇','Branch',escHtml(s.overview.branch))}
  \${ovRow('🔗','Tracking',upLabel)}
  \${ovRow('↕','Sync',syncBadges)}
  \${ovRow('◫','Stashes',escHtml(s.stashCount+' saved'))}
</div>

<div class="sec-hdr" onclick="toggleSec(this)"><span class="chevron">▾</span>Changes\${totalChanges?'<span class="badge" style="margin-left:6px">'+totalChanges+'</span>':''}</div>
<div class="sec-body">
  \${totalChanges===0?'<div class="empty">✓&nbsp; Working tree is clean</div>':''}
  \${grpBlock('conflict','⚠','c-conflict','Conflicted',conflicted,'conflicted')}
  \${grpBlock('staged','✓','c-add','Staged',staged,'staged')}
  \${grpBlock('unstaged','~','c-mod','Unstaged',unstaged,'unstaged')}
  \${grpBlock('untracked','+','c-new','Untracked',untracked,'untracked')}
</div>

<div class="sec-hdr" onclick="toggleSec(this)"><span class="chevron">▾</span>Commits & Changes</div>
<div class="sec-body">
  \${actRow('✓','Commit','create a new commit','gitCommander.commit')}
  \${actRow('✎','Amend Last Commit','edit HEAD message or content','gitCommander.commitAmend')}
  \${actRow('▣','Stash Changes','save work-in-progress','gitCommander.stashSave')}
</div>

<div class="sec-hdr" onclick="toggleSec(this)"><span class="chevron">▾</span>Branch & Remote</div>
<div class="sec-body">
  \${actRow('⎇','Switch Branch','checkout another branch','gitCommander.switchBranch')}
  \${actRow('⊕','Create Branch','start a new branch from HEAD','gitCommander.createBranch')}
  \${actRow('☁','Fetch','update remote refs safely','gitCommander.fetch')}
  \${actRow('↓','Pull','fast-forward from upstream','gitCommander.pull')}
  \${actRow('↑','Push','publish local commits','gitCommander.push')}
</div>

<div class="sec-hdr" onclick="toggleSec(this)"><span class="chevron">▾</span>History & Revert</div>
<div class="sec-body">
  \${actRow('⎌','Undo Last Action','undo last commit, reset, or rebase','gitCommander.undoLast')}
  \${actRow('⏳','Git Time Machine','view reflog and revert to past states','gitCommander.timeMachine')}
  \${actRow('⟳','Revert Last Commit','create a revert for HEAD','gitCommander.revertLastCommit')}
  \${actRow('⟳','Search & Revert Commit','find and revert a commit','gitCommander.revertCommit')}
  \${actRow('⟳','Revert Multiple Commits','multi-select commits to revert','gitCommander.revertMultipleCommits')}
  \${actRow('↺','Reset Commit','soft / mixed / hard reset','gitCommander.resetCommit')}
</div>

<div class="sec-hdr" onclick="toggleSec(this)"><span class="chevron">▾</span>Tools & Workflows</div>
<div class="sec-body">
  \${actRow('🚨','Oops! Quick Fixes','macros for common git mistakes','gitCommander.oopsMacros')}
  \${actRow('☁','Cloud WIP Checkpoint','commit and push work-in-progress','gitCommander.wipBackup')}
  \${actRow('🧹','Clean Merged Branches','auto-delete safely merged branches','gitCommander.cleanMergedBranches')}
  \${actRow('📦','Git LFS Manager','scan and track large files with LFS','gitCommander.lfsManager')}
  \${actRow('📤','Export to Patch','export uncommitted changes to a .patch file','gitCommander.exportPatch')}
  \${actRow('📥','Apply Patch','apply a .patch file to your working tree','gitCommander.applyPatch')}
  \${actRow('⚙','Configure Repository','set user name/email or open raw config','gitCommander.repoConfig')}
</div>\`;
}

function ovRow(icon,key,val){
  return \`<div class="ov-row"><span class="ov-icon">\${icon}</span><span class="ov-key">\${key}</span><span class="ov-val">\${val}</span></div>\`;
}

function grpBlock(id,icon,cls,label,files,bucket){
  if(!files.length) return '';
  const lbl = \`<span class="grp-icon \${cls}">\${icon}</span><span class="grp-lbl">\${label}</span><span class="grp-cnt">\${files.length} file\${files.length!==1?'s':''}</span>\`;
  let acts='';
  if(bucket==='staged')    acts=\`<button class="ga-btn" title="Unstage All" onclick="event.stopPropagation();unstageAll()">−</button>\`;
  if(bucket==='unstaged')  acts=\`<button class="ga-btn" title="Stage All" onclick="event.stopPropagation();stageAll('.')">+</button>\`;
  if(bucket==='untracked') acts=\`<button class="ga-btn" title="Stage All Untracked" onclick="event.stopPropagation();stageAll('.')">+</button>\`;
  return \`<div class="grp-hdr" onclick="toggleGrp(this)"><span class="g-chev">▾</span>\${lbl}<div class="grp-acts">\${acts}</div></div>
<div class="grp-files">\${files.map(f=>fileRow(f,bucket)).join('')}</div>\`;
}

function fileRow(f,bucket){
  const p=escHtml(f.path);
  const name=p.split('/').pop();
  let ico='~',cls='c-mod',tag=f.status;
  if(bucket==='staged'){ico='+';cls='c-add';}
  else if(f.status==='deleted'){ico='−';cls='c-del';}
  else if(bucket==='untracked'){ico='U';cls='c-new';}
  else if(bucket==='conflict'){ico='⚠';cls='c-conflict';}

  const ds = \`data-path="\${escHtml(f.path)}" data-status="\${escHtml(f.status)}"\`;

  const stageBtn  = (bucket!=='staged'&&bucket!=='conflict') ? \`<button class="fa-btn" title="Stage" \${ds} onclick="stageFile(event, this.dataset.path)">+</button>\` : '';
  const unstageBtn= (bucket==='staged') ? \`<button class="fa-btn" title="Unstage" \${ds} onclick="unstageFile(event, this.dataset.path)">−</button>\` : '';
  const discardBtn= (bucket!=='conflict') ? \`<button class="fa-btn" title="Discard" \${ds} onclick="discardFile(event, this.dataset.path, this.dataset.status)">⟲</button>\` : '';
  const diffBtn   = (bucket!=='untracked') ? \`<button class="fa-btn" title="Open Changes" \${ds} onclick="openDiff(event, this.dataset.path, this.dataset.status)">◑</button>\` : '';
  const fileBtn   = \`<button class="fa-btn" title="Open File" \${ds} onclick="openFile(event, this.dataset.path)">↗</button>\`;

  return \`<div class="file-row" \${ds} onclick="openDiff(event, this.dataset.path, this.dataset.status)">
  <span class="f-ico \${cls}">\${ico}</span>
  <span class="f-name" title="\${p}">\${name}</span>
  <span class="f-tag">\${tag}</span>
  <div class="fa-wrap">\${stageBtn}\${unstageBtn}\${discardBtn}\${diffBtn}\${fileBtn}</div>
</div>\`;
}

function actRow(icon,label,desc,cmd){
  return \`<div class="act-row" onclick="send({type:'exec',cmd:'\${cmd}'})">
  <span class="act-icon">\${icon}</span>
  <span class="act-lbl">\${label}</span>
  <span class="act-desc">\${desc}</span>
</div>\`;
}


</script>
</body>
</html>`;
    }
}
