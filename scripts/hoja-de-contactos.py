"""
Genera una hoja de contactos con todas las imagenes de img/ rotuladas, para
poder decidir que foto corresponde a cada seccion de la landing sin abrirlas
una por una.

Uso: python scripts/hoja-de-contactos.py
Salida: docs/capturas/00-imagenes-disponibles.png
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "img"
DESTINO = RAIZ / "docs" / "capturas" / "00-imagenes-disponibles.png"

COLS = 4
ANCHO_CELDA = 420
ALTO_IMAGEN = 260
ALTO_CELDA = ALTO_IMAGEN + 74
MARGEN = 18
FONDO = (245, 245, 240)

# En que seccion esta usada hoy cada imagen (si corresponde)
USO = {
    "mdp-imagen-3.png": "HERO (fondo de portada)",
    "mdp-imagen-2.png": "Quienes somos",
    "mdp-imagen-1.png": "sin usar",
    "reciclaje-1.jpg": "CTA final de la landing",
    "reciclaje-1.png": "duplicado de reciclaje-1.jpg",
    "reciclaje-2.jpg": "sin usar",
    "reciclaje-3.png": "Como funciona (paso 1)",
    "reciclaje-4.png": "Como funciona (paso 2)",
    "aluminio-1.png": "Tarjeta Aluminio",
    "plastico.png": "Tarjeta Plasticos PET",
    "cobre-reciclaje.png": "Tarjeta Cobre",
    "cartom.png": "Banda otros materiales",
}


def fuente(tamano: int):
    for ruta in ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"):
        if Path(ruta).exists():
            return ImageFont.truetype(ruta, tamano)
    return ImageFont.load_default()


def main() -> None:
    archivos = sorted(
        (p for p in ORIGEN.glob("*") if p.suffix.lower() in {".png", ".jpg", ".jpeg"}),
        key=lambda p: p.name,
    )
    filas = (len(archivos) + COLS - 1) // COLS
    ancho = MARGEN + COLS * (ANCHO_CELDA + MARGEN)
    alto = MARGEN + filas * (ALTO_CELDA + MARGEN) + 70

    hoja = Image.new("RGB", (ancho, alto), FONDO)
    dibujo = ImageDraw.Draw(hoja)
    f_titulo = fuente(30)
    f_nombre = fuente(20)
    f_uso = fuente(17)

    dibujo.text((MARGEN, 18), "Imagenes disponibles en img/  -  MdP Recicla", fill=(20, 40, 20), font=f_titulo)

    for indice, ruta in enumerate(archivos):
        col = indice % COLS
        fila = indice // COLS
        x = MARGEN + col * (ANCHO_CELDA + MARGEN)
        y = 70 + MARGEN + fila * (ALTO_CELDA + MARGEN)

        with Image.open(ruta) as im:
            im = im.convert("RGB")
            im.thumbnail((ANCHO_CELDA, ALTO_IMAGEN), Image.LANCZOS)
            caja = Image.new("RGB", (ANCHO_CELDA, ALTO_IMAGEN), (225, 225, 218))
            caja.paste(im, ((ANCHO_CELDA - im.width) // 2, (ALTO_IMAGEN - im.height) // 2))
            hoja.paste(caja, (x, y))

        numero = indice + 1
        dibujo.text((x, y + ALTO_IMAGEN + 6), f"{numero}. {ruta.name}", fill=(15, 40, 15), font=f_nombre)
        uso = USO.get(ruta.name, "sin usar")
        color = (180, 30, 30) if uso == "sin usar" else (46, 125, 50)
        dibujo.text((x, y + ALTO_IMAGEN + 32), uso, fill=color, font=f_uso)
        dibujo.text(
            (x, y + ALTO_IMAGEN + 52),
            f"{im.width}x{im.height}px  original {ruta.stat().st_size / 1024 / 1024:.1f} MB",
            fill=(110, 110, 105),
            font=f_uso,
        )

    DESTINO.parent.mkdir(parents=True, exist_ok=True)
    hoja.save(DESTINO, "PNG", optimize=True)
    print(f"Hoja de contactos: {DESTINO} ({DESTINO.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
