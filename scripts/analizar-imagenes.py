"""
Analiza las imagenes de img/ para inferir que tipo de foto es cada una.
Como no puedo verlas, uso estadisticas: una foto urbana/paisaje al aire libre
suele tener una franja superior clara y azulada (cielo) y mucha variedad de
tonos; un primer plano de objetos tiene colores mas planos y saturados.

Uso: python scripts/analizar-imagenes.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ORIGEN = RAIZ / "img"

MINIATURA = 240


def analizar(ruta: Path) -> dict:
    with Image.open(ruta) as im:
        im = im.convert("RGB")
        ancho, alto = im.size
        chica = im.resize((MINIATURA, MINIATURA), Image.LANCZOS)
        datos = np.asarray(chica).astype(np.float32) / 255.0

    r, g, b = datos[..., 0], datos[..., 1], datos[..., 2]
    luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b

    # "cielo": pixeles claros y azulados
    cielo = (luminancia > 0.62) & (b >= r - 0.02) & (b > 0.45)
    superior = luminancia[: MINIATURA // 4, :]          # franja superior (25%)
    inferior = luminancia[-MINIATURA // 4 :, :]         # franja inferior

    saturacion = datos.max(axis=2) - datos.min(axis=2)

    return {
        "archivo": ruta.name,
        "px": f"{ancho}x{alto}",
        "luminancia": round(float(luminancia.mean()), 3),
        "luminancia_superior": round(float(superior.mean()), 3),
        "luminancia_inferior": round(float(inferior.mean()), 3),
        "cielo_pct": round(float(cielo.mean()) * 100, 1),
        "saturacion": round(float(saturacion.mean()), 3),
        "variedad": round(float(luminancia.std()), 3),
        "color_medio": "#%02x%02x%02x" % tuple(int(c * 255) for c in datos.reshape(-1, 3).mean(axis=0)),
    }


def main() -> None:
    filas = []
    for ruta in sorted(ORIGEN.glob("*")):
        if ruta.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        try:
            filas.append(analizar(ruta))
        except Exception as error:  # noqa: BLE001
            print(f"  !! {ruta.name}: {error}")

    cabecera = f"{'archivo':<22}{'px':>12}{'lum':>7}{'lum.sup':>9}{'lum.inf':>9}{'cielo%':>8}{'sat':>7}{'var':>7}  color"
    print(cabecera)
    print("-" * len(cabecera))
    for f in sorted(filas, key=lambda x: -x["cielo_pct"]):
        print(
            f"{f['archivo']:<22}{f['px']:>12}{f['luminancia']:>7}{f['luminancia_superior']:>9}"
            f"{f['luminancia_inferior']:>9}{f['cielo_pct']:>8}{f['saturacion']:>7}{f['variedad']:>7}  {f['color_medio']}"
        )

    print("\nLas de mayor 'cielo%' y 'variedad' son las candidatas a foto urbana/paisaje al aire libre.")


if __name__ == "__main__":
    main()
