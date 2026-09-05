"""Fixed NotationsOS entry point; does not install or modify the GAT engine."""
import hashlib
import importlib.abc
import importlib.machinery
import importlib.util
import platform
from pathlib import Path
import sys
import zipfile


class SourceOnlyLoader(importlib.machinery.SourceFileLoader):
    """Compile source directly; never inspect, deserialize or write a .pyc."""

    def get_code(self, fullname):
        source_path = self.get_filename(fullname)
        return self.source_to_code(self.get_data(source_path), source_path)


class ScientificSourceFinder(importlib.abc.MetaPathFinder):
    """Restrict the reviewed scientific packages to source/native loaders."""

    def find_spec(self, fullname, path=None, target=None):
        if not any(fullname == name or fullname.startswith(name + ".") for name in ("numpy", "gat")):
            return None
        spec = importlib.machinery.PathFinder.find_spec(fullname, path, target)
        if spec is None:
            return None
        if isinstance(spec.loader, importlib.machinery.SourceFileLoader):
            spec.loader = SourceOnlyLoader(fullname, spec.origin)
        elif not isinstance(spec.loader, importlib.machinery.ExtensionFileLoader):
            # No standalone bytecode, namespace package, zip or custom loader.
            raise ImportError("The pinned scientific runtime requires source or a verified native module.")
        return spec


def install_source_only_imports():
    sys.dont_write_bytecode = True
    finder = ScientificSourceFinder()
    sys.meta_path.insert(0, finder)
    return finder


def main() -> int:
    # All arguments are fixed backend paths, never browser-supplied options.
    if len(sys.argv) != 3 or platform.python_version() != "3.12.14" or sys.platform != "win32":
        return 70
    engine, wheel = (Path(value) for value in sys.argv[1:])
    if hashlib.sha256(wheel.read_bytes()).hexdigest() != "86945f2ee6d10cdfd67bcb4069c1662dd711f7e2a4343db5cecec06b87cf31aa":
        return 70
    # Verify installed NumPy code/data against the hash-pinned original wheel
    # before importing it. No .pth processing or user site is used (-I -S).
    packages = Path(sys.executable).parent.parent / "Lib" / "site-packages"
    with zipfile.ZipFile(wheel) as archive:
        names = {name for name in archive.namelist() if not name.endswith("/") and
                 (name.startswith("numpy/") or name.startswith("numpy.libs/"))}
        for name in sorted(names):
            target = packages / name
            if not target.is_file() or target.is_symlink():
                return 70
            if hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(archive.read(name)).digest():
                return 70
        for package in (packages / "numpy", packages / "numpy.libs"):
            for target in package.rglob("*"):
                if target.is_symlink():
                    return 70
                if target.is_file() and target.relative_to(packages).as_posix() not in names:
                    # Preserve inert caches produced by unrelated tooling. The
                    # source-only finder below cannot consume these bytes.
                    if target.parent.name != "__pycache__" or target.suffix != ".pyc":
                        return 70
    install_source_only_imports()
    sys.path.insert(0, str(packages))
    import numpy
    if numpy.__version__ != "2.3.5":
        return 70
    # Add only the verified gat package, not the repository root as a general
    # Python import path (which could shadow stdlib/dependency modules).
    spec = importlib.util.spec_from_file_location("gat", engine / "gat" / "__init__.py",
                                               loader=SourceOnlyLoader("gat", str(engine / "gat" / "__init__.py")),
                                               submodule_search_locations=[str(engine / "gat")])
    if spec is None or spec.loader is None:
        return 70
    package = importlib.util.module_from_spec(spec)
    sys.modules["gat"] = package
    spec.loader.exec_module(package)
    from gat.adapters.ifc.parser import parse_ifc
    from gat.adapters.ifc.schema import PRODUCT_CLASSES, ANNOTATED_PRODUCT_CLASSES
    try:
        parsed = parse_ifc(Path("source.ifc").read_bytes().decode("utf-8"))
    except Exception:
        parsed = None  # The original audit produces the structured parse blocker.
    if parsed is not None:
        products = sum(len(parsed.by_type(kind)) for kind in set(PRODUCT_CLASSES) | set(ANNOTATED_PRODUCT_CLASSES))
        if len(parsed.instances) > 2048 or products > 64:
            return 72
    from gat.ifc_audit import audit_ifc_file
    report = audit_ifc_file("source.ifc")
    sys.stdout.reconfigure(encoding="utf-8", errors="strict", newline="\n")
    sys.stdout.write(report.to_json(pretty=False))
    return 0 if report.pipeline_ready else 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        # Never emit uncontrolled Python exception text or host paths.
        raise SystemExit(71)
