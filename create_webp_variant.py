#!/usr/bin/env python3
"""Create WEBP variant(s) for PNG soubory ve složce /cities a původní PNG smaž."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


def _cities_dir() -> Path:
    return Path(__file__).resolve().parent / "app" / "static" / "assets" / "cities"


def convert_png_to_webp(png_file: Path, quality: int = 80) -> Path:
    if not png_file.exists():
        raise FileNotFoundError(f"PNG soubor neexistuje: {png_file}")
    if png_file.suffix.lower() != ".png":
        raise ValueError("Vstupní soubor musí mít příponu .png")
    cities_dir = _cities_dir()
    try:
        png_file.resolve().relative_to(cities_dir)
    except ValueError as exc:
        raise ValueError(f"Soubor musí být ve složce {cities_dir}") from exc

    webp_path = png_file.with_suffix(".webp")
    with Image.open(png_file) as img:
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGBA")
        else:
            img = img.convert("RGB")
        img.save(webp_path, "WEBP", quality=quality, method=6)
    png_file.unlink()
    return webp_path


def convert_directory_to_webp(directory: Path, quality: int = 80) -> list[Path]:
    if not directory.exists():
        raise FileNotFoundError(f"Adresář neexistuje: {directory}")
    if not directory.is_dir():
        raise NotADirectoryError(f"Cesta není adresář: {directory}")

    cities_dir = _cities_dir()
    try:
        directory.resolve().relative_to(cities_dir)
    except ValueError as exc:
        raise ValueError(f"Adresář musí být ve složce {cities_dir}") from exc

    created: list[Path] = []
    for png_file in sorted(directory.rglob("*.png")):
        created.append(convert_png_to_webp(png_file, quality=quality))
    return created


def main(argv: list[str]) -> None:
    target = Path(argv[1]).expanduser() if len(argv) > 1 else _cities_dir()
    if target.is_dir():
        created = convert_directory_to_webp(target)
        if not created:
            print("Nenalezeny žádné PNG soubory k převodu.")
            return
        print("Vytvořeno WEBP souborů:")
        for path in created:
            print(f"- {path}")
        return

    webp_path = convert_png_to_webp(target)
    print(f"Hotovo: {webp_path}")


if __name__ == "__main__":
    main(sys.argv)
