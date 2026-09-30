# Landing page de MdP Recicla

Archivos:

| Archivo | Rol |
| --- | --- |
| [`public/index.html`](../public/index.html) | Estructura y contenido de la landing |
| [`public/assets/css/landing.css`](../public/assets/css/landing.css) | Estilos propios (se carga después de `styles.css`) |
| [`public/assets/js/landing.js`](../public/assets/js/landing.js) | Interactividad: navegación, FAQ, animaciones, modal, zonas |
| [`public/img/`](../public/img) | Imágenes optimizadas (webp + jpg) |
| [`scripts/optimizar-imagenes.py`](../scripts/optimizar-imagenes.py) | Genera esas imágenes a partir de los originales en `img/` |

Se respetó la convención del proyecto (`public/assets/...`) en lugar de `styles.css` y `script.js` sueltos en la raíz, para no mezclar la landing con el sistema de diseño que usan los paneles.

Capturas: [`docs/capturas/`](capturas) — `01-landing.png`, `08-landing-mobile.png`, `09-landing-modal-registro.png`.

## Secciones implementadas

| Sección | Ancla | Contenido |
| --- | --- | --- |
| Cabecera fija | — | Logo SVG propio, menú con smooth scroll y CTA "Acceso / Registrarse" |
| Hero | `#inicio` | Título, subtítulo, los dos CTA pedidos, beneficios y foto de fondo con `srcset` |
| Quiénes somos | `#nosotros` | Imagen + texto del emprendimiento + tres datos destacados |
| Cómo funciona | `#como-funciona` | Los 4 pasos numerados y dos fotos del servicio |
| Precios | `#precios` | Tarjetas de Aluminio $1.600, PET $350 y Cobre $9.600 (destacada) + banda de otros materiales |
| Zonas y días | `#zonas` | Cronograma interactivo por día, cargado en vivo desde la API |
| FAQ | `#faq` | Las 4 preguntas en formato acordeón |
| CTA final | — | Llamado a crear cuenta + WhatsApp sobre foto de la ciudad |
| Pie | — | Navegación, accesos, contacto y año dinámico |
| WhatsApp flotante | — | Botón fijo abajo a la derecha con mensaje precargado |

## Detalles técnicos

- **Mobile first**: estilos base para celular, menú desplegable con animación por debajo de 900 px y mejoras por `min-width` (900/960/1000 px).
- **Paleta**: verde `#2E7D32` (sobreescribe los tokens de `styles.css` solo en la landing), crema `#F5F5F0` de fondo, dorado `#FBC02D` para los CTA de dinero y el botón de WhatsApp.
- **Interactividad JS** (todo en `landing.js`, sin dependencias):
  - smooth scroll nativo (`scroll-behavior: smooth`) + `scroll-margin-top` para compensar la cabecera fija;
  - menú mobile con `aria-expanded`, cierre con `Escape`, al tocar un enlace o fuera del panel;
  - link activo del menú con `IntersectionObserver`;
  - acordeón FAQ con `aria-expanded` / `aria-controls`, animación de `max-height` y una sola respuesta abierta;
  - animaciones de aparición con `IntersectionObserver` (se desactivan con `prefers-reduced-motion`);
  - modal de acceso con pestañas, cierre por fondo/`Escape`/botón, bloqueo del scroll de fondo y foco al primer campo.
- **Accesibilidad**: link "saltar al contenido", `aria-label` en el botón de WhatsApp y el menú, `aria-live` en la grilla de zonas, textos alternativos en todas las imágenes.

## Imágenes

Los originales de `img/` pesaban **45,9 MB** (una sola imagen, 19,8 MB), imposible de servir en una landing mobile. `scripts/optimizar-imagenes.py` genera versiones recortadas y comprimidas:

```
Originales: 45,9 MB  ->  webp + jpg generados: 3,7 MB
```

- Hero en tres anchos (`480/900/1600`) con `srcset` + `sizes="100vw"` y `<picture>` con webp y fallback jpg; la de 900 px se precarga con `<link rel="preload">`.
- El resto de las imágenes van en `loading="lazy"` con `width`/`height` para evitar saltos de layout.
- `img/` (originales) quedó en `.gitignore`; sí se versiona `public/img/` (lo que sirve el sitio). Para regenerarlas: `python scripts/optimizar-imagenes.py`.

Mapeo usado (los nombres del pedido no coincidían con los archivos reales). Las fotos se eligieron por estadísticas de la imagen (proporción de cielo, orientación, variedad de tonos) y **confirmadas por el cliente**:

| Sección | Archivo original | Destino |
| --- | --- | --- |
| Hero (fondo de portada) | `mdp-imagen-3.png` | `hero-480/900/1600` |
| Quiénes somos | `mdp-imagen-2.png` | `nosotros` |
| Tarjeta Aluminio | `aluminio-1.png` | `material-aluminio` |
| Tarjeta Plásticos PET | `plastico.png` | `material-plastico` |
| Tarjeta Cobre | `cobre-reciclaje.png` | `material-cobre` |
| Banda "también pasamos a buscar" | `cartom.png` | `material-carton` |
| Cómo funciona | `reciclaje-3.png`, `reciclaje-4.png` | `paso-registro`, `paso-pesaje` |
| Fondo del CTA final | `reciclaje-1.jpg` | `ciudad` |
| Logo | *no existía `logo.png`* | logo SVG vectorial embebido en el HTML |

Sin usar: `reciclaje-1.png` (duplicado de `reciclaje-1.jpg`), `reciclaje-2.jpg` y `mdp-imagen-1.png`. La hoja de contactos con las 12 imágenes rotuladas está en [`capturas/00-imagenes-disponibles.png`](capturas/00-imagenes-disponibles.png).

## Corrección del hero (texto ilegible y desalineado)

El hero se veía mal por un **conflicto de hojas de estilo**, no por el diseño nuevo: en `styles.css` habían quedado cuatro reglas de la primera landing (`/* ---------- Landing ---------- */`) que chocaban con las clases nuevas:

```css
.hero { padding: 2.5rem 0 1.5rem; text-align: center; }
.hero p { color: var(--gris-700); max-width: 40rem; margin: 0 auto 1.25rem; }   /* ← el problema */
.hero__acciones { max-width: 320px; margin: 0 auto; }
```

Consecuencias y arreglos:

| Síntoma | Causa | Arreglo |
| --- | --- | --- |
| El subtítulo y la etiqueta se leían en gris oscuro sobre la foto | `.hero p` (especificidad 0,1,1) le ganaba a `.hero__bajada` (0,1,0) y aplicaba `--gris-700` | Se eliminaron esas reglas de `styles.css` |
| Unos elementos centrados y otros a la izquierda | `.hero p { margin: 0 auto }` centraba solo los `<p>`; `.hero { text-align: center }` y `.hero__acciones { max-width: 320px; margin: 0 auto }` centraban el resto | Todo el contenido quedó **alineado a la izquierda**, arrancando en la misma coordenada |
| El texto tocaba el borde de la pantalla | `.hero__contenido { padding: 3.5rem 0 3rem }` pisaba el `padding: 0 1rem` de `.contenedor` | Ahora usa `padding-block`, así conserva el padding lateral del contenedor |
| El titular se perdía sobre las zonas claras de la foto | Un solo degradado vertical suave | Velo en dos capas (diagonal + vertical) y `text-shadow` en titular y subtítulo |
| Chips de beneficios con poco contraste | Fondo blanco al 12% sobre la foto | Fondo verde oscuro al 60% + borde y sombra de texto |

Verificación medida sobre el render (ver herramientas más abajo):

| Elemento | Contraste medido | Mínimo WCAG | Estado |
| --- | --- | --- | --- |
| Titular (54 px) | 13.0:1 | 3:1 | OK |
| Subtítulo (19 px) | 6.0:1 | 3:1 | OK |
| Etiqueta superior (13 px) | 5.6:1 | 4.5:1 | OK |
| Chip de beneficio (16 px) | 7.3:1 | 4.5:1 | OK |

En mobile (390 px): titular 12.3:1, subtítulo 8.2:1, etiqueta 5.6:1, chip 7.3:1. Toda la columna de contenido arranca en la misma coordenada horizontal (x=189 en escritorio).

## Herramientas de diagnóstico

Estos scripts se usan para revisar la landing sin abrir el navegador a mano (fueron los que encontraron el conflicto de CSS):

| Script | Para qué |
| --- | --- |
| `node scripts/diagnostico-hero.mjs [url] [ancho] [alto]` | Mide geometría, padding y colores computados del hero y guarda una captura + métricas en JSON |
| `node scripts/diagnostico-css.mjs [url] [selectores...]` | Lista qué reglas aplica el navegador a cada selector, con archivo y línea |
| `python scripts/contraste-hero.py [ancho]` | Estima el contraste WCAG real del texto del hero sobre la foto |
| `python scripts/analizar-imagenes.py` | Estadísticas de las imágenes (cielo, luminancia, saturación) para inferir qué foto es cada una |
| `python scripts/hoja-de-contactos.py` | Genera la hoja de contactos rotulada de todas las imágenes |

Los scripts de diagnóstico usan el protocolo DevTools de Chrome por WebSocket, sin dependencias externas.

## Modal de acceso conectado a la API

El modal no es decorativo: usa los mismos endpoints que las páginas de login/registro.

- **Ingresar** → `POST /api/auth/login`, guarda el token y redirige a `/dashboard.html` o `/admin.html` según el rol.
- **Registrarme** → `POST /api/auth/register` con el barrio elegido (lista cargada de `GET /api/neighborhoods`); al elegir el barrio se muestra el día de recolección.
- Los errores de la API se pintan campo por campo (`pintarErrores`).

Además se puede enlazar directo al formulario con `/#registro`, `/#login` o `/?acceso=registro` (útil para campañas y para el pie de página).

## Zonas y días

El cronograma **no está hardcodeado**: se carga de `GET /api/neighborhoods` y se agrupa por día de recolección, así que si el admin cambia el día de un barrio en el panel, la landing se actualiza sola. Los botones de filtro se generan solo con los días que tienen barrios asignados. Si la API no responde, se muestra un mensaje que invita a escribir por WhatsApp.

## Precios

La sección publica los precios indicados en el pedido ($1.600 / $350 / $9.600) de forma fija, según lo decidido. **Ojo**: el catálogo del sistema (panel admin y panel del vecino) maneja otros valores (Aluminio $2.500, PET $750, Cobre $9.500), así que hoy la landing y la app muestran precios distintos. Para unificarlos alcanza con:

1. actualizar los precios desde el panel admin (`/admin.html#precios`), o
2. cambiar los valores del `<article class="precio-card">` correspondiente en `index.html` y el seed en `src/db/seed.js`.

## WhatsApp

El número está centralizado en `landing.js`:

```js
const WHATSAPP = '5492235550000'; // >>> reemplazar por el número real
```

Al cambiar esa constante se actualizan **todos** los enlaces (`data-whatsapp`): botón flotante, CTA final, pie y el enlace de ayuda del modal. Los `href` del HTML quedan como respaldo por si el JavaScript no corre, así que conviene actualizarlos también.

## Verificación

- `npm run test:api` valida que la landing y sus assets se sirven (200) y que el HTML entregado incluye las 8 secciones pedidas.
- Renderizado en Chrome headless e inspección del DOM ya ejecutado: hero, las 4 tarjetas de precio con sus valores, **6 tarjetas de día con los 10 barrios** y 7 filtros, 4 preguntas del FAQ, 10 barrios en el select del registro, modal abierto con `/#registro` y el mensaje de WhatsApp precargado.
- Hero medido con `diagnostico-hero.mjs` + `contraste-hero.py` en 1440 px y 390 px: alineación consistente y contrastes por encima del mínimo WCAG (tabla más arriba). Captura final en [`capturas/10-hero-corregido.png`](capturas/10-hero-corregido.png).
