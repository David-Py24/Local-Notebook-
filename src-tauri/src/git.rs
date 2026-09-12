use git2::{DiffFormat, DiffOptions, Repository, Status, StatusOptions};
use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "snake_case")]
pub enum FileChangeKind {
    Added,
    Modified,
    Deleted,
    Renamed,
    Untracked,
    Conflicted,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusEntry {
    path: String,
    kind: FileChangeKind,
    staged: bool,
    old_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoStatus {
    is_repo: bool,
    root: String,
    branch: Option<String>,
    entries: Vec<GitStatusEntry>,
}

fn normalize(path: &std::path::Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn classify_entry(entry: &git2::StatusEntry) -> GitStatusEntry {
    let status = entry.status();
    let path = entry.path().unwrap_or_default().to_string();

    // CASE A: conflicted (merge/checkout conflict) — highest priority.
    if status.contains(Status::CONFLICTED) {
        return GitStatusEntry { path, kind: FileChangeKind::Conflicted, staged: false, old_path: None };
    }

    // CASE B: a staged change (the index differs from HEAD).
    let index = status & (Status::INDEX_NEW
        | Status::INDEX_MODIFIED
        | Status::INDEX_DELETED
        | Status::INDEX_RENAMED
        | Status::INDEX_TYPECHANGE);
    if !index.is_empty() {
        let (kind, old_path) = if index.contains(Status::INDEX_NEW) {
            (FileChangeKind::Added, None)
        } else if index.contains(Status::INDEX_DELETED) {
            (FileChangeKind::Deleted, None)
        } else if index.contains(Status::INDEX_RENAMED) {
            let old = entry
                .head_to_index()
                .and_then(|d| d.old_file().path())
                .map(|p| normalize(p));
            (FileChangeKind::Renamed, old)
        } else {
            (FileChangeKind::Modified, None)
        };
        return GitStatusEntry { path, kind, staged: true, old_path };
    }

    // CASE C: untracked working-tree file.
    if status.contains(Status::WT_NEW) {
        return GitStatusEntry { path, kind: FileChangeKind::Untracked, staged: false, old_path: None };
    }

    // CASE D: unstaged working-tree change.
    let wt = status & (Status::WT_MODIFIED
        | Status::WT_DELETED
        | Status::WT_RENAMED
        | Status::WT_TYPECHANGE);
    let (kind, old_path) = if wt.contains(Status::WT_DELETED) {
        (FileChangeKind::Deleted, None)
    } else if wt.contains(Status::WT_RENAMED) {
        let old = entry
            .index_to_workdir()
            .and_then(|d| d.old_file().path())
            .map(|p| normalize(p));
        (FileChangeKind::Renamed, old)
    } else {
        (FileChangeKind::Modified, None)
    };
    GitStatusEntry { path, kind, staged: false, old_path }
}

fn branch_name(repo: &Repository) -> Option<String> {
    repo.head().ok().and_then(|head| head.shorthand().map(|s| s.to_string()))
}

/// Lists the git working-tree changes that apply to the repository containing
/// `vault_root`. Returns an `is_repo: false` payload when no repo is found.
pub fn get_repo_status(vault_root: &str) -> Result<GitRepoStatus, String> {
    let repo = match Repository::discover(vault_root) {
        Ok(r) => r,
        Err(_) => {
            return Ok(GitRepoStatus {
                is_repo: false,
                root: String::new(),
                branch: None,
                entries: Vec::new(),
            })
        }
    };

    let root = repo
        .workdir()
        .map(|w| normalize(w))
        .unwrap_or_else(|| normalize(std::path::Path::new(vault_root)))
        .trim_end_matches('/')
        .to_string();

    let branch = branch_name(&repo);

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(false)
        .include_ignored(false)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(|e| format!("Failed to read git status: {e}"))?;

    let mut entries: Vec<GitStatusEntry> = Vec::new();
    for entry in statuses.iter() {
        if entry.status().is_empty() || entry.status().contains(Status::IGNORED) {
            continue;
        }
        entries.push(classify_entry(&entry));
    }

    Ok(GitRepoStatus { is_repo: true, root, branch, entries })
}

fn git_diff_patch(diff: &git2::Diff) -> Result<String, String> {
    let mut out = String::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        let content = String::from_utf8_lossy(line.content()).into_owned();
        // Only context/content lines carry a +/-/space prefix separate from the text;
        // file headers ('F') and hunk headers ('H') already embed their full text.
        let origin = line.origin() as u8;
        if origin == b' ' || origin == b'+' || origin == b'-' {
            out.push(origin as char);
        }
        out.push_str(&content);
        true
    })
    .map_err(|e| format!("Failed to render diff: {e}"))?;
    Ok(out)
}

/// Produces a unified-diff string for one file. `path` is an absolute filesystem
/// path (may use either separator on Windows); `staged` selects HEAD->index vs
/// index->worktree. Returns `None` when the file has no diff in the given scope.
pub fn diff_file(vault_root: &str, path: &str, staged: bool) -> Result<Option<String>, String> {
    let repo = Repository::discover(vault_root).map_err(|e| format!("Not a git repository: {e}"))?;
    let workdir = repo.workdir().ok_or_else(|| "Repository has no working directory".to_string())?;

    let abs = workdir.join(std::path::Path::new(path));
    let norm_abs = normalize(&abs);
    let norm_root = format!("{}/", normalize(workdir));
    let rel_str = norm_abs
        .strip_prefix(&norm_root)
        .ok_or_else(|| format!("Path is outside the repository: {path}"))?
        .to_string();

    let index = repo.index().map_err(|e| e.to_string())?;

    let mut opts = DiffOptions::new();
    opts.pathspec(rel_str.as_str())
        .context_lines(3)
        .include_untracked(!staged)
        .recurse_untracked_dirs(false);

    let diff = if staged {
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), Some(&index), Some(&mut opts))
            .map_err(|e| e.to_string())?
    } else {
        repo.diff_index_to_workdir(Some(&index), Some(&mut opts))
            .map_err(|e| e.to_string())?
    };

    if diff.deltas().len() == 0 {
        return Ok(None);
    }

    let patch = git_diff_patch(&diff)?;
    Ok(Some(patch))
}

/// Tauri command handlers (registered in lib.rs).
#[tauri::command]
pub fn git_status(vault_root: String) -> Result<GitRepoStatus, String> {
    get_repo_status(&vault_root)
}

#[tauri::command]
pub fn git_diff_file(vault_root: String, path: String, staged: bool) -> Result<Option<String>, String> {
    diff_file(&vault_root, &path, staged)
}