from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from typing import Mapping


@dataclass(frozen=True)
class EvalWorkerConfig:
    worker_name: str


def load_config(env: Mapping[str, str] | None = None) -> EvalWorkerConfig:
    source = os.environ if env is None else env
    worker_name = source.get("EVAL_WORKER_NAME", "eval-worker").strip() or "eval-worker"
    return EvalWorkerConfig(worker_name=worker_name)


def main() -> int:
    config = load_config()
    print(json.dumps({"status": "placeholder", "config": asdict(config)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
