#!/usr/bin/env python3
"""Require every pure engine module to depend on contracts only; old/ never builds."""
from pathlib import Path
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[1]
projects = sorted((root / "game" / "src").glob("Wyrmforge.V2.Engine.*/*.csproj"))
assert len(projects) >= 13, "Missing expected new C# engine boundaries"

for project in projects:
    xml = ET.parse(project).getroot()
    refs = [ref.attrib["Include"] for ref in xml.iter("ProjectReference")]
    expected = ["../Wyrmforge.V2.Contracts/Wyrmforge.V2.Contracts.csproj"]
    assert refs == expected, f"{project}: only Contracts reference allowed, got {refs}"
    assert "old/" not in project.read_text(encoding="utf-8"), project

solution = (root / "Wyrmforge.V2.slnx").read_text(encoding="utf-8")
assert "old/" not in solution
assert "Wyrmforge.V2.Engine.Terrain" in solution
assert "Wyrmforge.V2.Engine.WorldGeneration" in solution
print(f"PASS: {len(projects)} independent C# engine boundaries reference Contracts only")
