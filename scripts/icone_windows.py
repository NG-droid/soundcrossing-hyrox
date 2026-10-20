"""Fabrique windows/soundcrossing.ico à partir du logo (à relancer seulement si le logo change ; nécessite Pillow)."""
from io import BytesIO
from pathlib import Path
import struct

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
LOGO = Image.open(ROOT / "assets" / "soundcrossing-logo.png").convert("RGBA")
COMPLET = (30, 120, 610, 470)  # tout le logo, lisible à partir de 48 px
PETIT = (40, 140, 225, 300)    # « SO » avec la première enceinte rouge, pour 16 à 32 px (barre des tâches, horloge)


def carreau(cadre, taille):
    image = Image.new("RGBA", (taille, taille), (0, 0, 0, 0))
    bord = max(1, taille // 26)
    ImageDraw.Draw(image).rounded_rectangle((0, 0, taille - 1, taille - 1), radius=max(2, taille // 6),
                                            fill=(255, 255, 255, 255), outline=(20, 20, 20, 255), width=bord)
    marge = max(1, taille // 12)
    morceau = LOGO.crop(cadre)
    echelle = min((taille - 2 * marge) / morceau.width, (taille - 2 * marge) / morceau.height)
    morceau = morceau.resize((max(1, round(morceau.width * echelle)), max(1, round(morceau.height * echelle))), Image.LANCZOS)
    image.alpha_composite(morceau, ((taille - morceau.width) // 2, (taille - morceau.height) // 2))
    return image


def main():
    images = []
    for taille in (16, 20, 24, 32, 48, 64, 256):
        sortie = BytesIO()
        carreau(PETIT if taille <= 32 else COMPLET, taille).save(sortie, "PNG")
        images.append((taille, sortie.getvalue()))
    # Format ICO avec des images PNG (Windows Vista et suivants).
    entete = struct.pack("<HHH", 0, 1, len(images))
    position = 6 + 16 * len(images)
    repertoire, donnees = b"", b""
    for taille, png in images:
        repertoire += struct.pack("<BBBBHHII", taille % 256, taille % 256, 0, 0, 1, 32, len(png), position + len(donnees))
        donnees += png
    (ROOT / "windows" / "soundcrossing.ico").write_bytes(entete + repertoire + donnees)


if __name__ == "__main__":
    main()
