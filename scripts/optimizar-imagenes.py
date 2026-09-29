"""
Optimiza las imagenes de img/ para la landing page.

Genera versiones redimensionadas y comprimidas (webp + jpg de respaldo)
en public/img/, con recorte centrado a la relacion de aspecto indicada.

Uso: python scripts/optimizar-imagenes.py
"""
from pathlib import Path

from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "img"
DESTINO = RAIZ / "public" / "img"

# (archivo origen, nombre destino, ancho, alto, relacion)
# ancho/alto = None mantiene el tamano original en ese eje.
TRABAJOS = [
    # Hero: 16:9 y variantes para srcset
    ("reciclaje-1.jpg", "hero-1600", 1600, 900, 16 / 9),
    ("reciclaje-1.jpg", "hero-900", 900, 506, 16 / 9),
    ("reciclaje-1.jpg", "hero-480", 480, 270, 16 / 9),
    # Nosotros
    ("mdp-imagen-2.png", "nosotros", 1200, 900, 4 / 3),
    # Como funciona
    ("reciclaje-3.png", "paso-registro", 900, 675, 4 / 3),
    ("reciclaje-4.png", "paso-pesaje", 900, 675, 4 / 3),
    # Tarjetas de materiales
    ("aluminio-1.png", "material-aluminio", 800, 600, 4 / 3),
    ("plastico.png", "material-plastico", 800, 600, 4 / 3),
    ("cobre-reciclaje.png", "material-cobre", 800, 600, 4 / 3),
    ("cartom.png", "material-carton", 800, 600, 4 / 3),
    # Imagen de apoyo para la seccion de zonas / CTA
    ("mdp-imagen-1.png", "ciudad", 1400, 788, 16 / 9),
]

CALIDAD_WEBP = 78
CALIDAD_JPG = 82


def recortar(imagen: Image.Image, ancho: int, alto: int) -> Image.Image:
    """Recorte centrado a la relacion pedida y redimensionado."""
    return ImageOps.fit(imagen, (ancho, alto), method=Image.LANCZOS, centering=(0.5, 0.45))


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    total_antes = 0
    total_despues = 0

    for origen, nombre, ancho, alto, _ in TRABAJOS:
        ruta = ORIGEN / origen
        if not ruta.exists():
            print(f"  !! falta {origen}, se omite")
            continue

        peso_original = ruta.stat().st_size
        total_antes += peso_original

        with Image.open(ruta) as im:
            im = ImageOps.exif_transpose(im)
            if im.mode in ("RGBA", "P", "LA"):
                fondo = Image.new("RGB", im.size, (245, 245, 240))
                fondo.paste(im.convert("RGBA"), mask=im.convert("RGBA").split()[-1])
                im = fondo
            else:
                im = im.convert("RGB")

            ajustada = recortar(im, ancho, alto)

            salida_webp = DESTINO / f"{nombre}.webp"
            salida_jpg = DESTINO / f"{nombre}.jpg"
            ajustada.save(salida_webp, "WEBP", quality=CALIDAD_WEBP, method=6)
            ajustada.save(salida_jpg, "JPEG", quality=CALIDAD_JPG, optimize=True, progressive=True)

        peso_nuevo = salida_webp.stat().st_size + salida_jpg.stat().st_size
        total_despues += peso_nuevo
        print(
            f"  {nombre:<20} {ancho}x{alto:<5} "
            f"{peso_original / 1024:>8.0f} KB  ->  webp {salida_webp.stat().st_size / 1024:>5.0f} KB "
            f"+ jpg {salida_jpg.stat().st_size / 1024:>5.0f} KB"
        )

    print(
        f"\n  Originales: {total_antes / 1024 / 1024:.1f} MB  ->  "
        f"generados (webp+jpg): {total_despues / 1024 / 1024:.1f} MB"
    )


if __name__ == "__main__":
    main()
