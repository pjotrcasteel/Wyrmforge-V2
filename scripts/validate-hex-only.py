#!/usr/bin/env python3
"""Block textures and browser-owned gameplay in the new frontend until N05."""
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
frontend = root / "frontends" / "web"
forbidden_extensions = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".ktx", ".dds", ".aseprite"}
bad = [str(path.relative_to(root)) for path in frontend.rglob("*")
       if path.is_file() and path.suffix.lower() in forbidden_extensions]
if bad:
    print("Final art/textures may not enter the frontend before N05:", *bad, sep="\n", file=sys.stderr)
    sys.exit(1)

print("HEX-only frontend asset gate passed; no texture/image assets in active web frontend.")
