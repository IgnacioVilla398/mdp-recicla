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

Mapeo usado (los nombres del pedido no coincidían con los archivos reales):

| Pedido | Archivo original | Destino |
| --- | --- | --- |
| `hero-bg.jpg` | `reciclaje-1.jpg` | `hero-480/900/1600` |
| `nosotros.jpg` | `mdp-imagen-2.png` | `nosotros` |
| `aluminio.jpg` | `aluminio-1.png` | `material-aluminio` |
| `plastico.jpg` | `plastico.png` | `material-plastico` |
| `cobre.jpg` | `cobre-reciclaje.png` | `material-cobre` |
| — | `cartom.png` | `material-carton` (banda "también pasamos a buscar") |
| — | `reciclaje-3.png`, `reciclaje-4.png` | `paso-registro`, `paso-pesaje` |
| — | `mdp-imagen-1.png` | `ciudad` (fondo del CTA final) |
| `logo.png` | *no existía* | logo SVG vectorial embebido en el HTML |

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
