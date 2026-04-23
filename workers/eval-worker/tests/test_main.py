import unittest

from app.main import load_config


class EvalWorkerConfigTests(unittest.TestCase):
    def test_load_config_uses_default_worker_name(self) -> None:
        config = load_config({})

        self.assertEqual(config.worker_name, "eval-worker")

    def test_load_config_trims_worker_name(self) -> None:
        config = load_config({"EVAL_WORKER_NAME": " scorer "})

        self.assertEqual(config.worker_name, "scorer")
