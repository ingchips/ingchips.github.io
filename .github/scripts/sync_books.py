"""Prepare a local website update from the four Git Bookdown branches."""

import argparse
from datetime import datetime, timezone
import io
import json
from pathlib import Path, PurePosixPath
import stat
import subprocess
import tempfile
import zipfile


BOOKS = {
    "pg_ing918": ("pg_ing918", "drafts/pg_ing918"),
    "pg_ble_stack": ("pg_ble_stack", "application-notes/pg_ble_stack_cn"),
    "pg_ing916": ("916per_doc/pg_ing916", "drafts/pg_ing916"),
    "pg_ing20": ("920pre_doc/pg_ing20", "drafts/pg_ing20"),
}
STATE_FILE = ".github/book-sync-state.json"
ASSET_DIRS = {"css", "images", "img", "libs"}
INDEX_FILES = {"reference-keys.txt", "search_index.json"}
MASTER = "refs/heads/master"
OUTPUT = "refs/heads/book-output"


def git(repo, *args):
    return subprocess.check_output(
        ["git", "-C", str(repo), *map(str, args)], timeout=180
    )


def git_text(repo, *args):
    return git(repo, *args).decode("utf-8").strip()


def read_book(repo, data):
    files = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for entry in archive.infolist():
            if entry.filename == ".source-sha":
                continue
            parts = entry.filename.rstrip("/").split("/")
            if (
                any(p in {"", ".", ".."} or p.startswith(".") for p in parts)
                or any("\\" in p or ":" in p for p in parts)
                or stat.S_ISLNK(entry.external_attr >> 16)
            ):
                raise ValueError(f"{repo}: unsafe Git archive entry {entry.filename!r}")
            if entry.is_dir():
                continue
            name = PurePosixPath(*parts)
            if len(parts) == 1:
                allowed = (
                    name.suffix == ".html"
                    or name.name in INDEX_FILES | {f"{repo}.pdf", f"{repo}.epub"}
                )
            else:
                allowed = parts[0] in ASSET_DIRS
            if not allowed or name in files:
                raise ValueError(f"{repo}: unexpected Git archive entry {entry.filename!r}")
            files[name] = archive.read(entry)
    pdf = files.get(PurePosixPath(f"{repo}.pdf"), b"")
    epub = files.get(PurePosixPath(f"{repo}.epub"), b"")
    if not files.get(PurePosixPath("index.html")) or not pdf.startswith(b"%PDF-"):
        raise ValueError(f"{repo}: missing entry page or invalid PDF")
    with zipfile.ZipFile(io.BytesIO(epub)) as ebook:
        if ebook.read("mimetype") != b"application/epub+zip" or ebook.testzip():
            raise ValueError(f"{repo}: invalid EPUB")
    return files


def write_file(site, relative, data):
    path = site
    for part in relative.parts:
        path /= part
        if path.is_symlink():
            raise ValueError(f"Cannot write through a symbolic link: {relative}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def update_books(checkout, sources, workspace):
    state_path = checkout / STATE_FILE
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    changed = []
    pending = []
    for repo, (relative_source, destination) in BOOKS.items():
        local_source = workspace / relative_source
        remote = (
            git_text(local_source, "remote", "get-url", "origin")
            if (local_source / ".git").exists()
            else f"git@github.com:ingchips/{repo}.git"
        )
        refs = {
            ref: sha
            for sha, ref in (
                line.split("\t") for line in
                git_text(sources, "ls-remote", "--refs", remote, MASTER, OUTPUT).splitlines()
            )
        }
        if not (head := refs.get(MASTER)):
            raise ValueError(f"{repo}: origin has no master branch")
        if state.get(repo, {}).get("source_sha") == head:
            print(f"{repo}: already synchronized", flush=True)
            continue

        if OUTPUT not in refs:
            pending.append(repo)
            continue
        git(sources, "fetch", "--quiet", "--no-tags", "--depth=1", remote, OUTPUT)
        if git_text(sources, "show", "FETCH_HEAD:.source-sha") != head:
            pending.append(repo)
            continue
        data = git(sources, "archive", "--format=zip", "FETCH_HEAD")
        files = read_book(repo, data)
        # Preserve older pages and assets still reachable through existing URLs.
        for name, content in files.items():
            write_file(checkout, PurePosixPath(destination) / name, content)
        state[repo] = {"source_sha": head}
        changed.append(destination)
        print(f"{repo}: staged {len(files)} files from {head[:12]}", flush=True)

    for repo in pending:
        print(f"{repo}: no book-output for current master; keeping published version", flush=True)
    if changed:
        state_data = json.dumps(state, indent=2, sort_keys=True) + "\n"
        write_file(checkout, PurePosixPath(STATE_FILE), state_data.encode("utf-8"))
    return changed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-dir", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--source-root", type=Path, help="Parent directory of the manual checkouts")
    parser.add_argument("--dry-run", action="store_true", help="Show the diff without creating a branch")
    args = parser.parse_args()
    site = args.site_dir.resolve(strict=True)
    if Path(git_text(site, "rev-parse", "--show-toplevel")).resolve() != site:
        parser.error("--site-dir must be the website repository root")
    workspace = args.source_root.resolve() if args.source_root else site.parent

    origin = git_text(site, "remote", "get-url", "origin")
    with tempfile.TemporaryDirectory(prefix="book-sync-") as temp:
        checkout = Path(temp) / "site"
        sources = Path(temp) / "sources.git"
        git(site, "clone", "--quiet", "--shared", "--no-checkout", "--", site, checkout)
        git(checkout, "fetch", "--quiet", "--no-tags", origin, MASTER)
        base = git_text(checkout, "rev-parse", "FETCH_HEAD")
        git(checkout, "checkout", "--quiet", "--detach", base)
        git(site, "init", "--quiet", "--bare", sources)

        changed = update_books(checkout, sources, workspace)
        if not changed:
            print("No book updates to commit.")
            return
        git(checkout, "add", "--", STATE_FILE, *changed)
        print(git_text(checkout, "diff", "--cached", "--stat"))
        if args.dry_run:
            return
        name = git_text(site, "config", "user.name")
        email = git_text(site, "config", "user.email")
        git(checkout, "-c", f"user.name={name}", "-c", f"user.email={email}",
            "commit", "--quiet", "-m", "Sync published Bookdown artifacts")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
        branch = f"book-sync/{stamp}"
        git(site, "fetch", "--quiet", "--no-tags", "--no-write-fetch-head",
            checkout, f"HEAD:refs/heads/{branch}")

    print(f"\nCreated local branch {branch}.")
    print(f"Review: git diff {base[:12]}..{branch} --stat")
    print(f"Publish: git push origin {branch}:master")
    print(f"If master requires a PR: git push -u origin {branch}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError, zipfile.BadZipFile) as error:
        raise SystemExit(f"Book sync failed: {error}") from None
