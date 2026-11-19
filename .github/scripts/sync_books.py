"""Stage verified Bookdown artifacts from the current source master commits."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import stat
import subprocess
import zipfile


BOOKS = {
    "pg_ing918": ("ing918-book", "drafts/pg_ing918"),
    "pg_ble_stack": ("ble-stack-book", "application-notes/pg_ble_stack_cn"),
    "pg_ing916": ("ing916-book", "drafts/pg_ing916"),
    "pg_ing20": ("ing20-book", "drafts/pg_ing20"),
}
STATE_FILE = ".github/book-sync-state.json"
ASSET_DIRS = {"css", "images", "img", "libs"}
INDEX_FILES = {"reference-keys.txt", "search_index.json"}


def api(path):
    return subprocess.check_output(["gh", "api", path], timeout=120)


def find_artifact(source, head, artifact_name):
    query = f"branch=master&head_sha={head}&status=success&per_page=20"
    runs = json.loads(
        api(f"{source}/actions/workflows/build-book.yml/runs?{query}")
    )["workflow_runs"]
    for run in runs:
        if (
            run["head_sha"] != head
            or run["head_branch"] != "master"
            or run["event"] not in {"push", "workflow_dispatch"}
            or run["conclusion"] != "success"
        ):
            continue
        artifacts = json.loads(
            api(f"{source}/actions/runs/{run['id']}/artifacts")
        )["artifacts"]
        for artifact in artifacts:
            if artifact["name"] == artifact_name and not artifact["expired"]:
                return artifact
    return None


def read_book(source, repo, artifact):
    data = api(f"{source}/actions/artifacts/{artifact['id']}/zip")
    digest = "sha256:" + hashlib.sha256(data).hexdigest()
    if digest != artifact["digest"]:
        raise ValueError(f"{repo}: artifact ZIP digest does not match GitHub")
    files = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for entry in archive.infolist():
            parts = entry.filename.rstrip("/").split("/")
            if (
                any(p in {"", ".", ".."} or p.startswith(".") for p in parts)
                or any("\\" in p or ":" in p for p in parts)
                or stat.S_ISLNK(entry.external_attr >> 16)
            ):
                raise ValueError(f"{repo}: unsafe artifact entry {entry.filename!r}")
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
                raise ValueError(f"{repo}: unexpected artifact entry {entry.filename!r}")
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-dir", type=Path, default=Path.cwd())
    args = parser.parse_args()
    site = args.site_dir.resolve(strict=True)
    state_path = site / STATE_FILE
    state = json.loads(state_path.read_text(encoding="utf-8")) if state_path.exists() else {}
    updates = []
    for repo, (artifact_name, destination) in BOOKS.items():
        source = f"repos/ingchips/{repo}"
        head = json.loads(api(f"{source}/git/ref/heads/master"))["object"]["sha"]
        if state.get(repo, {}).get("source_sha") == head:
            print(f"{repo}: already synchronized")
            continue
        artifact = find_artifact(source, head, artifact_name)
        if artifact is None:
            print(f"{repo}: no unexpired successful build for current master; keeping published version")
            continue
        files = read_book(source, repo, artifact)
        updates.append((repo, destination, head, files))

    for repo, destination, head, files in updates:
        # Preserve historical URLs and assets that were not emitted by this build.
        for name, data in files.items():
            write_file(site, PurePosixPath(destination) / name, data)
        state[repo] = {"source_sha": head}
        print(f"{repo}: staged {len(files)} files from {head[:12]} in {destination}/")

    if updates:
        state_data = json.dumps(state, indent=2, sort_keys=True) + "\n"
        write_file(site, PurePosixPath(STATE_FILE), state_data.encode("utf-8"))
    if output := os.environ.get("GITHUB_OUTPUT"):
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"changed={str(bool(updates)).lower()}\n")


if __name__ == "__main__":
    main()
