"""Prove the isolated scientific importer never executes cached bytecode."""
import hashlib
import importlib
import importlib.machinery
import importlib.util
from importlib import _bootstrap_external
from pathlib import Path
import shutil
import sys
import tempfile
import unittest


WORKSPACE = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("payload_gat_runner", WORKSPACE / "scripts" / "gat-audit-runner.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class SourceOnlyScientificImportTests(unittest.TestCase):
    def setUp(self):
        scratch = WORKSPACE / ".stamp"
        scratch.mkdir(exist_ok=True)
        self.root = Path(tempfile.mkdtemp(prefix="gat-source-loader-test-", dir=scratch))
        self.package = self.root / "numpy"
        self.package.mkdir()
        self.source = self.package / "__init__.py"
        self.source.write_text('VALUE = "verified-source"\n', encoding="utf-8")
        self.original = self.source.read_bytes()
        self.original_path = list(sys.path)
        self.original_meta = list(sys.meta_path)
        self.original_dont_write = sys.dont_write_bytecode
        sys.path.insert(0, str(self.root))

    def tearDown(self):
        for name in list(sys.modules):
            if name == "numpy" or name.startswith("numpy."):
                del sys.modules[name]
        sys.path[:] = self.original_path
        sys.meta_path[:] = self.original_meta
        sys.dont_write_bytecode = self.original_dont_write
        shutil.rmtree(self.root)  # Only this test's own mkdtemp directory.

    def poison_cache(self):
        cache = Path(importlib.util.cache_from_source(str(self.source)))
        cache.parent.mkdir()
        # Correct CPython header, timestamp and size: the default loader really
        # would consume this harmless sentinel instead of the intact source.
        code = compile('VALUE = "untrusted-cached-code"\n', str(self.source), "exec")
        cached = _bootstrap_external._code_to_timestamp_pyc(
            code, int(self.source.stat().st_mtime), len(self.original))
        cache.write_bytes(cached)
        return cache, bytes(cached)

    def test_valid_but_untrusted_cached_code_is_not_consumed(self):
        cache, cached = self.poison_cache()
        default = importlib.machinery.SourceFileLoader("numpy", str(self.source))
        control = {}
        exec(default.get_code("numpy"), control)
        self.assertEqual(control["VALUE"], "untrusted-cached-code")
        runner.install_source_only_imports()
        loaded = importlib.import_module("numpy")
        self.assertEqual(loaded.VALUE, "verified-source")
        self.assertEqual(self.source.read_bytes(), self.original)
        self.assertEqual(cache.read_bytes(), cached)

    def test_malformed_cached_code_is_not_parsed_or_removed(self):
        cache, _ = self.poison_cache()
        malformed = b"not even a CPython bytecode header"
        cache.write_bytes(malformed)
        runner.install_source_only_imports()
        self.assertEqual(importlib.import_module("numpy").VALUE, "verified-source")
        self.assertEqual(cache.read_bytes(), malformed)

    def test_sourceless_bytecode_is_refused(self):
        orphan = self.package / "orphan.pyc"
        code = compile('VALUE = "must-not-load"\n', str(orphan), "exec")
        orphan.write_bytes(_bootstrap_external._code_to_timestamp_pyc(code, 0, 0))
        before = hashlib.sha256(orphan.read_bytes()).hexdigest()
        runner.install_source_only_imports()
        importlib.import_module("numpy")
        with self.assertRaises(ImportError):
            importlib.import_module("numpy.orphan")
        self.assertEqual(hashlib.sha256(orphan.read_bytes()).hexdigest(), before)

    def test_cache_directory_cannot_be_imported_as_a_namespace(self):
        cache, cached = self.poison_cache()
        runner.install_source_only_imports()
        importlib.import_module("numpy")
        with self.assertRaises(ImportError):
            importlib.import_module("numpy.__pycache__")
        self.assertEqual(cache.read_bytes(), cached)

    def test_clean_source_import_creates_no_bytecode(self):
        runner.install_source_only_imports()
        self.assertEqual(importlib.import_module("numpy").VALUE, "verified-source")
        self.assertFalse((self.package / "__pycache__").exists())


if __name__ == "__main__":
    unittest.main()
