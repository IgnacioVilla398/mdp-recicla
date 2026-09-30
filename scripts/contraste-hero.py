"""
Mide el contraste real del texto del hero sobre la foto.

Toma la captura y las metricas que genera scripts/diagnostico-hero.mjs y, para
cada texto, estima el color de fondo local (la mayoria de los pixeles de su caja)
y el de las letras (los mas claros), y calcula la relacion de contraste WCAG.

Uso: python scripts/contraste-hero.py [ancho]
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ANCHO = sys.argv[1] if len(sys.argv) > 1 else "1440"
BASE = Path(os.environ.get("TEMP", "/tmp")) / "mdp_shots"
IMAGEN = BASE / f"hero-{ANCHO}.png"
METRICAS = BASE / f"hero-metricas-{ANCHO}.json"


def luminancia_relativa(rgb: np.ndarray) -> np.ndarray:
    """Luminancia relativa WCAG (0..1) para un array de color 0..1."""
    def canal(c):
        return np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * canal(rgb[..., 0]) + 0.7152 * canal(rgb[..., 1]) + 0.0722 * canal(rgb[..., 2])


def contraste(l1: float, l2: float) -> float:
    claro, oscuro = max(l1, l2), min(l1, l2)
    return (claro + 0.05) / (oscuro + 0.05)


def main() -> None:
    if not IMAGEN.exists() or not METRICAS.exists():
        print(f"Faltan archivos. Ejecuta primero: node scripts/diagnostico-hero.mjs http://localhost:3000/ {ANCHO}")
        raise SystemExit(1)

    metricas = json.loads(METRICAS.read_text(encoding="utf-8"))
    imagen = np.asarray(Image.open(IMAGEN).convert("RGB")).astype(np.float32) / 255.0
    alto, ancho = imagen.shape[:2]
    print(f"Captura {ancho}x{alto} | viewport {metricas['viewport']['ancho']}x{metricas['viewport']['alto']}\n")

    # viewport 1440 == ancho de la captura; si no, escalamos las coordenadas
    escala = ancho / metricas["viewport"]["ancho"]

    etiquetas = {
        ".hero__etiqueta": "Etiqueta superior",
        ".hero h1": "Titular",
        ".hero__bajada": "Subtitulo",
        ".hero__beneficios li": "Chip (una pastilla)",
    }

    print(f"{'elemento':<22}{'fondo local':>14}{'letras':>18}{'contraste':>11}   minimo  estado")
    print("-" * 92)

    for elemento in metricas["elementos"]:
        sel = elemento["sel"]
        if sel not in etiquetas or elemento.get("falta"):
            continue

        x1 = max(0, int(elemento["izquierda"] * escala))
        x2 = min(ancho, int(elemento["derecha"] * escala))
        y1 = max(0, int(elemento["y"] * escala))
        y2 = min(alto, int((elemento["y"] + elemento["alto"]) * escala))
        if x2 <= x1 or y2 <= y1:
            continue

        recorte = imagen[y1:y2, x1:x2]
        lum = luminancia_relativa(recorte).ravel()

        # El fondo es la mayoria de los pixeles; las letras, la cola clara.
        percentil_fondo = 35
        lum_fondo = float(np.percentile(lum, percentil_fondo))
        lum_letras = float(np.percentile(lum, 92))
        color_fondo = (np.percentile(recorte.reshape(-1, 3), percentil_fondo, axis=0) * 255).astype(int)
        color_letras = (np.percentile(recorte.reshape(-1, 3), 92, axis=0) * 255).astype(int)

        # El minimo WCAG depende del tamano: 3:1 para texto grande (>=24px o 18.66px bold)
        tamano = float(elemento["tamanoFuente"].replace("px", ""))
        minimo = 3.0 if tamano >= 24 else (4.5 if tamano < 18.66 else 3.0)
        relacion = contraste(lum_letras, lum_fondo)
        estado = "OK" if relacion >= minimo else "REVISAR"

        print(
            f"{etiquetas[sel]:<22}"
            f"{str(tuple(color_fondo)):>14}"
            f"{str(tuple(color_letras)) + f'  {tamano:.0f}px':>18}"
            f"{relacion:>10.1f}:1"
            f"{minimo:>9.1f}  {estado}"
        )

    print("\nNota: la estimacion toma el 35% mas oscuro de la caja como fondo y el 8% mas")
    print("claro como letras; sirve para detectar texto que se pierde sobre la foto.")


if __name__ == "__main__":
    main()
