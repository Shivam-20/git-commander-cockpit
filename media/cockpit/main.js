/* global acquireVsCodeApi */
const vsc = acquireVsCodeApi();
let repoState = null;
let settings = { showActionSection: true, compactActions: false };
let state = vsc.getState() || { col: {}, filter: '', commitMsg: '' };
let toastTimer = null;

const root = document.getElementById('root');

function send(msg) { vsc.postMessage(msg); }
function saveState() { vsc.setState(state); }

function showToast(message, level) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast ' + (level === 'error' ? 'error' : 'info');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

function toggleSection(hdr, id) {
  hdr.classList.toggle('collapsed');
  state.col[id] = hdr.classList.contains('collapsed');
  saveState();
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(s) { return escHtml(s); }

function pathDisplay(path) {
  const parts = path.split('/');
  const name = parts.pop() || path;
  const dir = parts.length ? parts.join('/') + '/' : '';
  return { dir, name };
}

function matchesFilter(path, filter) {
  if (!filter) return true;
  return path.toLowerCase().includes(filter.toLowerCase());
}

function stageFile(path) { send({ type: 'stage', path }); }
function unstageFile(path) { send({ type: 'unstage', path }); }
function discardFile(path, status) { send({ type: 'discard', path, status }); }
function openDiff(path, status) { send({ type: 'openDiff', path, status }); }
function openFile(path) { send({ type: 'openFile', path }); }
function execCmd(cmd) { send({ type: 'exec', cmd }); }

document.getElementById('btn-refresh').addEventListener('click', () => send({ type: 'refresh' }));
document.getElementById('btn-stage-all').addEventListener('click', () => send({ type: 'stageAll', scope: '.' }));
document.getElementById('btn-commit').addEventListener('click', () => {
  const input = document.getElementById('commit-input');
  if (input && input.value.trim()) {
    send({ type: 'commit', message: input.value.trim() });
  }
});

root.addEventListener('click', (e) => {
  const target = e.target;

  const gaBtn = target.closest('.ga-btn[data-action]');
  if (gaBtn) {
    e.stopPropagation();
    const action = gaBtn.dataset.action;
    if (action === 'unstageAll') send({ type: 'unstageAll' });
    else if (action === 'stageAll') send({ type: 'stageAll', scope: '.' });
    else if (action === 'stageUntracked') send({ type: 'stageAllUntracked' });
    return;
  }

  const faBtn = target.closest('.fa-btn[data-action]');
  if (faBtn) {
    e.stopPropagation();
    const { action, path, status } = faBtn.dataset;
    if (action === 'stage') stageFile(path);
    else if (action === 'unstage') unstageFile(path);
    else if (action === 'discard') discardFile(path, status);
    else if (action === 'diff') openDiff(path, status);
    else if (action === 'open') openFile(path);
    return;
  }

  const commitBtn = target.closest('#commit-btn-inner');
  if (commitBtn) {
    e.stopPropagation();
    sendCommit();
    return;
  }

  const syncBadge = target.closest('[data-sync]');
  if (syncBadge) {
    e.stopPropagation();
    const sync = syncBadge.dataset.sync;
    if (sync === 'push') send({ type: 'exec', cmd: 'gitCommander.push' });
    else if (sync === 'pull') send({ type: 'exec', cmd: 'gitCommander.pull' });
    return;
  }

  const actRow = target.closest('.act-row[data-cmd]');
  if (actRow) {
    execCmd(actRow.dataset.cmd);
    return;
  }

  const ovRow = target.closest('.ov-row[data-action]');
  if (ovRow) {
    const action = ovRow.dataset.action;
    if (action === 'branch') send({ type: 'exec', cmd: 'gitCommander.switchBranch' });
    else if (action === 'sync') send({ type: 'execMenu', menu: 'sync' });
    return;
  }

  const grpHdr = target.closest('.grp-hdr[data-grp-id]');
  if (grpHdr) {
    toggleSection(grpHdr, grpHdr.dataset.grpId);
    return;
  }

  const secHdr = target.closest('.sec-hdr[data-sec-id]');
  if (secHdr) {
    toggleSection(secHdr, secHdr.dataset.secId);
    return;
  }

  const fileRow = target.closest('.file-row[data-path]');
  if (fileRow) {
    openDiff(fileRow.dataset.path, fileRow.dataset.status);
  }
});

window.addEventListener('message', (e) => {
  const msg = e.data;
  if (msg.type === 'state') {
    repoState = msg.state;
    if (msg.settings) settings = msg.settings;
    render(msg.state);
    restoreCollapse();
    restoreFilterAndCommit();
  } else if (msg.type === 'noRepo') {
    root.innerHTML = '<div class="empty">No Git repository found in this workspace.</div>';
  } else if (msg.type === 'toast') {
    showToast(msg.message, msg.level || 'info');
  } else if (msg.type === 'commitDone') {
    state.commitMsg = '';
    saveState();
    const input = document.getElementById('commit-input');
    if (input) input.value = '';
  }
});

function restoreCollapse() {
  root.querySelectorAll('.sec-hdr[data-sec-id]').forEach((hdr) => {
    if (state.col[hdr.dataset.secId]) hdr.classList.add('collapsed');
  });
  root.querySelectorAll('.grp-hdr[data-grp-id]').forEach((hdr) => {
    if (state.col[hdr.dataset.grpId]) hdr.classList.add('collapsed');
  });
}

function restoreFilterAndCommit() {
  const filterInput = document.getElementById('filter-input');
  if (filterInput) {
    filterInput.value = state.filter || '';
    filterInput.oninput = () => {
      state.filter = filterInput.value;
      saveState();
      applyFileFilter();
    };
  }
  const commitInput = document.getElementById('commit-input');
  if (commitInput) {
    commitInput.value = state.commitMsg || '';
    commitInput.oninput = () => {
      state.commitMsg = commitInput.value;
      saveState();
    };
    commitInput.onkeydown = (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey && commitInput.value.trim()) {
        send({ type: 'commit', message: commitInput.value.trim() });
      }
    };
  }
  const clearBtn = document.getElementById('filter-clear');
  if (clearBtn) {
    clearBtn.onclick = () => {
      state.filter = '';
      saveState();
      if (filterInput) filterInput.value = '';
      applyFileFilter();
    };
  }
}

function applyFileFilter() {
  const filter = state.filter || '';
  root.querySelectorAll('.file-row').forEach((row) => {
    const path = row.dataset.path || '';
    row.style.display = matchesFilter(path, filter) ? '' : 'none';
  });
}

function render(s) {
  const scrollTop = root.scrollTop;

  const files = s.files || [];
  const filter = state.filter || '';
  const conflicted = files.filter((f) => f.status === 'conflicted');
  const staged = files.filter((f) => f.status === 'staged' || f.status === 'renamed');
  const unstaged = files.filter((f) => f.status === 'modified' || f.status === 'deleted');
  const untracked = files.filter((f) => f.status === 'untracked');
  const stagedCount = staged.length;

  const upLabel = s.overview.hasUpstream ? escHtml(s.overview.upstream || 'configured') : 'not set';
  const syncBadges = s.overview.hasUpstream
    ? (s.overview.ahead ? '<span class="badge clickable" data-sync="push">' + s.overview.ahead + ' ahead</span>' : '')
      + (s.overview.behind ? '<span class="badge behind clickable" data-sync="pull">' + s.overview.behind + ' behind</span>' : '')
      || (s.overview.ahead === 0 && s.overview.behind === 0 ? '<span style="opacity:.6">up to date</span>' : '')
    : '<span style="opacity:.6">no upstream</span>';

  const totalChanges = files.length;
  const commitDisabled = stagedCount === 0;
  const commitHint = commitDisabled ? 'Stage files first' : stagedCount + ' file' + (stagedCount !== 1 ? 's' : '') + ' staged';

  document.getElementById('btn-commit').disabled = commitDisabled;

  let html = '';

  html += secHdr('overview', 'Overview');
  html += '<div class="sec-body">';
  html += ovRow('codicon-git-branch', 'Branch', escHtml(s.overview.branch), 'branch');
  html += ovRow('codicon-link', 'Tracking', upLabel, '');
  html += ovRow('codicon-arrow-swap', 'Sync', syncBadges, 'sync');
  html += ovRow('codicon-archive', 'Stashes', escHtml(s.stashCount + ' saved'), '');
  html += '</div>';

  html += secHdr('changes', 'Changes', totalChanges ? '<span class="badge" style="margin-left:6px">' + totalChanges + '</span>' : '');
  html += '<div class="sec-body">';
  html += '<div class="commit-box">';
  html += '<div class="commit-row"><input id="commit-input" type="text" placeholder="Commit message…" ' + (commitDisabled ? 'disabled' : '') + ' value="' + escAttr(state.commitMsg || '') + '">';
  html += '<button class="commit-btn" id="commit-btn-inner" type="button" ' + (commitDisabled ? 'disabled' : '') + '>Commit</button></div>';
  html += '<span class="commit-hint">' + escHtml(commitHint) + '</span></div>';
  html += '<div class="filter-row"><input id="filter-input" type="text" placeholder="Filter files…" value="' + escAttr(filter) + '">';
  html += '<button class="filter-clear" id="filter-clear" type="button" title="Clear filter"><i class="codicon codicon-close"></i></button></div>';
  if (totalChanges === 0) html += '<div class="empty"><i class="codicon codicon-check"></i>&nbsp; Working tree is clean</div>';
  html += grpBlock('grp-conflicted', 'codicon-warning', 'c-conflict', 'Conflicted', conflicted, 'conflicted', filter);
  html += grpBlock('grp-staged', 'codicon-diff-added', 'c-add', 'Staged', staged, 'staged', filter);
  html += grpBlock('grp-unstaged', 'codicon-diff-modified', 'c-mod', 'Unstaged', unstaged, 'unstaged', filter);
  html += grpBlock('grp-untracked', 'codicon-diff-added', 'c-new', 'Untracked', untracked, 'untracked', filter);
  html += '</div>';

  if (settings.showActionSection) {
    html += settings.compactActions ? renderCompactActions() : renderFullActions();
  }

  root.innerHTML = html;
  root.scrollTop = scrollTop;
}

function sendCommit() {
  const input = document.getElementById('commit-input');
  if (input && input.value.trim()) send({ type: 'commit', message: input.value.trim() });
}

function secHdr(id, label, extra) {
  return '<div class="sec-hdr" data-sec-id="' + id + '"><span class="chevron codicon codicon-chevron-down"></span>' + label + (extra || '') + '</div>';
}

function ovRow(icon, key, val, action) {
  const clickable = action ? ' clickable' : '';
  const dataAction = action ? ' data-action="' + action + '"' : '';
  return '<div class="ov-row' + clickable + '"' + dataAction + '><span class="ov-icon"><i class="codicon ' + icon + '"></i></span><span class="ov-key">' + key + '</span><span class="ov-val">' + val + '</span></div>';
}

function grpBlock(grpId, icon, cls, label, files, bucket, filter) {
  if (!files.length) return '';
  const visible = files.filter((f) => matchesFilter(f.path, filter));
  if (!visible.length && filter) return '';
  let acts = '';
  if (bucket === 'staged') acts = '<button class="ga-btn" type="button" title="Unstage All" data-action="unstageAll"><i class="codicon codicon-diff-removed"></i></button>';
  if (bucket === 'unstaged') acts = '<button class="ga-btn" type="button" title="Stage All" data-action="stageAll"><i class="codicon codicon-diff-added"></i></button>';
  if (bucket === 'untracked') acts = '<button class="ga-btn" type="button" title="Stage All Untracked" data-action="stageUntracked"><i class="codicon codicon-diff-added"></i></button>';
  const lbl = '<span class="grp-icon ' + cls + '"><i class="codicon ' + icon + '"></i></span><span class="grp-lbl">' + label + '</span><span class="grp-cnt">' + files.length + ' file' + (files.length !== 1 ? 's' : '') + '</span>';
  return '<div class="grp-hdr" data-grp-id="' + grpId + '"><span class="g-chev codicon codicon-chevron-down"></span>' + lbl + '<div class="grp-acts">' + acts + '</div></div><div class="grp-files">' + visible.map((f) => fileRow(f, bucket)).join('') + '</div>';
}

function fileRow(f, bucket) {
  const p = escHtml(f.path);
  const { dir, name } = pathDisplay(f.path);
  const dirHtml = dir ? '<span class="f-dir" title="' + escAttr(f.path) + '">' + escHtml(dir) + '</span>' : '';
  const renameHtml = f.originalPath ? '<span class="f-rename" title="' + escAttr(f.originalPath) + ' → ' + escAttr(f.path) + '">' + escHtml(f.originalPath) + ' → </span>' : '';
  let ico = 'codicon-diff-modified', cls = 'c-mod', tag = f.status;
  if (bucket === 'staged') { ico = 'codicon-diff-added'; cls = 'c-add'; }
  else if (f.status === 'deleted') { ico = 'codicon-diff-removed'; cls = 'c-del'; }
  else if (bucket === 'untracked') { ico = 'codicon-diff-added'; cls = 'c-new'; }
  else if (bucket === 'conflicted') { ico = 'codicon-warning'; cls = 'c-conflict'; }

  const dsPath = escAttr(f.path);
  const dsStatus = escAttr(f.status);
  const stageBtn = (bucket !== 'staged' && bucket !== 'conflicted') ? faBtn('stage', 'Stage', 'codicon-add', dsPath, dsStatus) : '';
  const unstageBtn = (bucket === 'staged') ? faBtn('unstage', 'Unstage', 'codicon-remove', dsPath, dsStatus) : '';
  const discardBtn = (bucket !== 'conflicted') ? faBtn('discard', 'Discard', 'codicon-discard', dsPath, dsStatus) : '';
  const diffBtn = (bucket !== 'untracked') ? faBtn('diff', 'Open Changes', 'codicon-diff', dsPath, dsStatus) : '';
  const fileBtn = faBtn('open', 'Open File', 'codicon-go-to-file', dsPath, dsStatus);

  return '<div class="file-row" data-path="' + escAttr(f.path) + '" data-status="' + escAttr(f.status) + '">' +
    '<span class="f-ico ' + cls + '"><i class="codicon ' + ico + '"></i></span>' +
    '<div class="f-name-wrap">' + dirHtml + renameHtml + '<span class="f-name" title="' + escAttr(f.path) + '">' + escHtml(name) + '</span></div>' +
    '<span class="f-tag">' + escHtml(tag) + '</span>' +
    '<div class="fa-wrap">' + stageBtn + unstageBtn + discardBtn + diffBtn + fileBtn + '</div></div>';
}

function faBtn(action, title, icon, path, status) {
  return '<button class="fa-btn" type="button" title="' + title + '" data-action="' + action + '" data-path="' + path + '" data-status="' + status + '"><i class="codicon ' + icon + '"></i></button>';
}

function actRow(icon, label, desc, cmd) {
  return '<div class="act-row" data-cmd="' + cmd + '"><span class="act-icon"><i class="codicon ' + icon + '"></i></span><span class="act-lbl">' + escHtml(label) + '</span><span class="act-desc">' + escHtml(desc) + '</span></div>';
}

function actSubHdr(label) {
  return '<div class="act-sub-hdr">' + escHtml(label) + '</div>';
}

function renderFullActions() {
  let h = '';
  h += secHdr('actions-commits', 'Commits & Changes');
  h += '<div class="sec-body">';
  h += actRow('codicon-check', 'Commit', 'create a new commit', 'gitCommander.commit');
  h += actRow('codicon-edit', 'Amend Last Commit', 'edit HEAD message or content', 'gitCommander.commitAmend');
  h += actRow('codicon-archive', 'Stash Changes', 'save work-in-progress', 'gitCommander.stashSave');
  h += '</div>';
  h += secHdr('actions-branch', 'Branch & Remote');
  h += '<div class="sec-body">';
  h += actRow('codicon-git-branch', 'Switch Branch', 'checkout another branch', 'gitCommander.switchBranch');
  h += actRow('codicon-add', 'Create Branch', 'start a new branch from HEAD', 'gitCommander.createBranch');
  h += actRow('codicon-cloud-download', 'Fetch', 'update remote refs safely', 'gitCommander.fetch');
  h += actRow('codicon-arrow-down', 'Pull', 'fast-forward from upstream', 'gitCommander.pull');
  h += actRow('codicon-arrow-up', 'Push', 'publish local commits', 'gitCommander.push');
  h += '</div>';
  h += secHdr('actions-history', 'History & Revert');
  h += '<div class="sec-body">';
  h += actRow('codicon-discard', 'Undo Last Action', 'undo last commit, reset, or rebase', 'gitCommander.undoLast');
  h += actRow('codicon-history', 'Git Time Machine', 'view reflog and revert to past states', 'gitCommander.timeMachine');
  h += actRow('codicon-reply', 'Revert Last Commit', 'create a revert for HEAD', 'gitCommander.revertLastCommit');
  h += actRow('codicon-search', 'Search & Revert Commit', 'find and revert a commit', 'gitCommander.revertCommit');
  h += actRow('codicon-list-selection', 'Revert Multiple Commits', 'multi-select commits to revert', 'gitCommander.revertMultipleCommits');
  h += actRow('codicon-debug-step-back', 'Reset Commit', 'soft / mixed / hard reset', 'gitCommander.resetCommit');
  h += '</div>';
  h += secHdr('actions-tools', 'Tools & Workflows');
  h += '<div class="sec-body">';
  h += actRow('codicon-warning', 'Oops! Quick Fixes', 'macros for common git mistakes', 'gitCommander.oopsMacros');
  h += actRow('codicon-cloud-upload', 'Cloud WIP Checkpoint', 'commit and push work-in-progress', 'gitCommander.wipBackup');
  h += actRow('codicon-trash', 'Clean Merged Branches', 'auto-delete safely merged branches', 'gitCommander.cleanMergedBranches');
  h += actRow('codicon-package', 'Git LFS Manager', 'scan and track large files with LFS', 'gitCommander.lfsManager');
  h += actRow('codicon-export', 'Export to Patch', 'export uncommitted changes to a .patch file', 'gitCommander.exportPatch');
  h += actRow('codicon-import', 'Apply Patch', 'apply a .patch file to your working tree', 'gitCommander.applyPatch');
  h += actRow('codicon-gear', 'Configure Repository', 'set user name/email or open raw config', 'gitCommander.repoConfig');
  h += '</div>';
  return h;
}

function renderCompactActions() {
  let h = secHdr('actions-compact', 'Actions');
  h += '<div class="sec-body">';
  h += actSubHdr('Commits');
  h += actRow('codicon-check', 'Commit', 'create a new commit', 'gitCommander.commit');
  h += actRow('codicon-edit', 'Amend Last Commit', 'edit HEAD', 'gitCommander.commitAmend');
  h += actRow('codicon-archive', 'Stash Changes', 'save WIP', 'gitCommander.stashSave');
  h += actSubHdr('Branch & Remote');
  h += actRow('codicon-git-branch', 'Switch Branch', 'checkout branch', 'gitCommander.switchBranch');
  h += actRow('codicon-add', 'Create Branch', 'new branch from HEAD', 'gitCommander.createBranch');
  h += actRow('codicon-cloud-download', 'Fetch', 'update remote refs', 'gitCommander.fetch');
  h += actRow('codicon-arrow-down', 'Pull', 'fast-forward upstream', 'gitCommander.pull');
  h += actRow('codicon-arrow-up', 'Push', 'publish commits', 'gitCommander.push');
  h += actSubHdr('History');
  h += actRow('codicon-discard', 'Undo Last Action', 'undo last git action', 'gitCommander.undoLast');
  h += actRow('codicon-history', 'Git Time Machine', 'reflog reset', 'gitCommander.timeMachine');
  h += actRow('codicon-reply', 'Revert Last Commit', 'revert HEAD', 'gitCommander.revertLastCommit');
  h += actRow('codicon-search', 'Search & Revert', 'find and revert', 'gitCommander.revertCommit');
  h += actRow('codicon-list-selection', 'Revert Multiple', 'multi-select revert', 'gitCommander.revertMultipleCommits');
  h += actRow('codicon-debug-step-back', 'Reset Commit', 'soft/mixed/hard', 'gitCommander.resetCommit');
  h += actSubHdr('Tools');
  h += actRow('codicon-warning', 'Oops! Quick Fixes', 'common git mistakes', 'gitCommander.oopsMacros');
  h += actRow('codicon-cloud-upload', 'Cloud WIP Checkpoint', 'commit and push WIP', 'gitCommander.wipBackup');
  h += actRow('codicon-trash', 'Clean Merged Branches', 'delete merged branches', 'gitCommander.cleanMergedBranches');
  h += actRow('codicon-package', 'Git LFS Manager', 'track large files', 'gitCommander.lfsManager');
  h += actRow('codicon-export', 'Export to Patch', 'save .patch file', 'gitCommander.exportPatch');
  h += actRow('codicon-import', 'Apply Patch', 'apply .patch file', 'gitCommander.applyPatch');
  h += actRow('codicon-gear', 'Configure Repository', 'user/email config', 'gitCommander.repoConfig');
  h += '</div>';
  return h;
}
