"""Package only runtime assets: no saved participants, sources or development dependencies."""
from pathlib import Path
import stat
import zipfile
from package_files import APP_FILES

ROOT = Path(__file__).resolve().parents[1]
FILES = [*APP_FILES, "DEMARRER.md", "WINDOWS.md", "Lancer Soundcrossing.command", "Lancer Soundcrossing.bat"]
output = ROOT / "livraison" / "Soundcrossing.zip"
output.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name in FILES:
        path = ROOT / name
        if not path.is_file():
            raise FileNotFoundError(name)
        info = zipfile.ZipInfo.from_file(path, arcname=f"Soundcrossing/{name}")
        info.compress_type = zipfile.ZIP_DEFLATED
        if name.endswith(".command"):
            info.external_attr = (stat.S_IFREG | 0o755) << 16
        archive.writestr(info, path.read_bytes())
print(f"{output.name} : {output.stat().st_size:,} octets, {len(FILES)} fichiers, aucune donnée de participant.")
