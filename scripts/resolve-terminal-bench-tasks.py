# path: scripts/resolve-terminal-bench-tasks.py
# role: terminal-bench task.toml の difficulty から実行対象 task 名を解決する
# why: run-terminal-bench.sh で難易度ごとの件数指定を簡単に扱えるようにするため
# related: scripts/run-terminal-bench.sh, bench/terminal-bench/README.md, docs/03-development/06-terminal-bench.md, /Users/mekann/.cache/harbor/tasks

from __future__ import annotations

import argparse
import sys
from pathlib import Path
import tomllib


def parse_selection(raw: str) -> list[tuple[str, int | None]]:
    selections: list[tuple[str, int | None]] = []
    for chunk in raw.split(","):
        item = chunk.strip()
        if not item:
            continue

        difficulty, sep, count_raw = item.partition("=")
        difficulty = difficulty.strip().lower()
        if not difficulty:
            raise ValueError(f"invalid difficulty selector: {item!r}")

        if not sep:
            selections.append((difficulty, None))
            continue

        count_raw = count_raw.strip()
        if not count_raw:
            selections.append((difficulty, None))
            continue

        count = int(count_raw)
        if count < 0:
            raise ValueError(f"difficulty count must be >= 0: {item!r}")
        selections.append((difficulty, count))

    return selections


def iter_task_files(dataset_path: Path | None, cache_root: Path) -> list[Path]:
    if dataset_path is not None:
        return sorted(dataset_path.rglob("task.toml"))
    return sorted(cache_root.glob("*/*/task.toml"))


def load_tasks_by_difficulty(task_files: list[Path]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for task_file in task_files:
        try:
            payload = tomllib.loads(task_file.read_text())
        except (tomllib.TOMLDecodeError, OSError):
            continue

        metadata = payload.get("metadata")
        if not isinstance(metadata, dict):
            continue

        difficulty = metadata.get("difficulty")
        if not isinstance(difficulty, str) or not difficulty:
            continue

        grouped.setdefault(difficulty.lower(), []).append(task_file.parent.name)

    for task_names in grouped.values():
        task_names.sort()
    return grouped


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--selection", required=True)
    parser.add_argument("--dataset-path")
    parser.add_argument(
        "--cache-root",
        default=str(Path.home() / ".cache" / "harbor" / "tasks"),
    )
    args = parser.parse_args()

    try:
        selections = parse_selection(args.selection)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    if not selections:
        return 0

    dataset_path = Path(args.dataset_path).expanduser().resolve() if args.dataset_path else None
    cache_root = Path(args.cache_root).expanduser().resolve()
    tasks_by_difficulty = load_tasks_by_difficulty(iter_task_files(dataset_path, cache_root))

    selected_tasks: list[str] = []
    seen: set[str] = set()
    requested_difficulties = [difficulty for difficulty, _ in selections]
    missing = [difficulty for difficulty in requested_difficulties if difficulty not in tasks_by_difficulty]
    if missing:
        print(
            "difficulty metadata not found for: " + ", ".join(sorted(set(missing))),
            file=sys.stderr,
        )
        return 1

    for difficulty, count in selections:
        task_names = tasks_by_difficulty[difficulty]
        if count is None:
            chosen = task_names
        else:
            chosen = task_names[:count]

        for task_name in chosen:
            if task_name in seen:
                continue
            seen.add(task_name)
            selected_tasks.append(task_name)

    for task_name in selected_tasks:
        print(task_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
