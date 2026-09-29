/**
 * Landing page de MdP Recicla.
 * - Navegación con smooth scroll, menú mobile y link activo por scroll
 * - Acordeón de preguntas frecuentes
 * - Animaciones de aparición
 * - Modal de acceso (login / registro) conectado a la API
 * - Cronograma de zonas y días cargado en vivo desde la API
 */
import { api, session, mostrarAviso, ocultarAviso, pintarErrores, ponerCargando, escapar, qs, qsa, ApiError } from './api.js';

/* ============================================================
   Configuración
   ============================================================ */
// >>> Reemplazar por el número real de WhatsApp de MdP Recicla (formato internacional, solo dígitos).
const WHATSAPP = '5492235550000';
const MENSAJE_WHATSAPP = '¡Hola MdP Recicla! Quisiera hacer una consulta sobre la recolección en mi barrio.';

const esMovil = () => window.matchMedia('(max-width: 899px)').matches;
const prefiereMenosMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============================================================
   WhatsApp y año del pie
   ============================================================ */
function configurarWhatsApp() {
  const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(MENSAJE_WHATSAPP)}`;
  qsa('[data-whatsapp]').forEach((enlace) => { enlace.href = url; });
}

qs('#anio').textContent = String(new Date().getFullYear());

/* ============================================================
   Cabecera: sombra al hacer scroll y menú mobile
   ============================================================ */
const cabecera = qs('#cabecera');
const menu = qs('#menu');
const botonMenu = qs('#btn-menu');

function actualizarCabecera() {
  cabecera.classList.toggle('cabecera--scrolled', window.scrollY > 8);
}
window.addEventListener('scroll', actualizarCabecera, { passive: true });
actualizarCabecera();

function abrirMenu(abrir) {
  menu.classList.toggle('menu--abierto', abrir);
  botonMenu.setAttribute('aria-expanded', String(abrir));
  botonMenu.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
}

botonMenu.addEventListener('click', () => abrirMenu(botonMenu.getAttribute('aria-expanded') !== 'true'));
qsa('.menu__enlace, .menu__cta .boton').forEach((enlace) => enlace.addEventListener('click', () => abrirMenu(false)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrirMenu(false); });
document.addEventListener('click', (e) => {
  if (!esMovil() || !menu.classList.contains('menu--abierto')) return;
  if (!menu.contains(e.target) && !botonMenu.contains(e.target)) abrirMenu(false);
});
window.addEventListener('resize', () => { if (!esMovil()) abrirMenu(false); });

/* ============================================================
   Link activo según la sección visible
   ============================================================ */
const secciones = qsa('main section[id]');
const enlaces = qsa('.menu__enlace');

if ('IntersectionObserver' in window && secciones.length) {
  const observadorSecciones = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      enlaces.forEach((enlace) => {
        enlace.classList.toggle('menu__enlace--activo', enlace.getAttribute('href') === `#${entrada.target.id}`);
      });
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  secciones.forEach((seccion) => observadorSecciones.observe(seccion));
}

/* ============================================================
   Animaciones de aparición
   ============================================================ */
const aRevelar = qsa('.revelar');
if ('IntersectionObserver' in window && !prefiereMenosMovimiento()) {
  const observadorRevelar = new IntersectionObserver((entradas, observador) => {
    entradas.forEach((entrada) => {
      if (!entrada.isIntersecting) return;
      entrada.target.classList.add('revelar--visible');
      observador.unobserve(entrada.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
  aRevelar.forEach((elemento) => observadorRevelar.observe(elemento));
} else {
  aRevelar.forEach((elemento) => elemento.classList.add('revelar--visible'));
}

/* ============================================================
   FAQ (acordeón)
   ============================================================ */
const preguntas = qsa('.faq__pregunta');

function ajustarAltura(item) {
  const respuesta = item.querySelector('.faq__respuesta');
  const abierta = item.querySelector('.faq__pregunta').getAttribute('aria-expanded') === 'true';
  respuesta.style.maxHeight = abierta ? `${respuesta.scrollHeight}px` : '0px';
}

function alternarFaq(boton) {
  const item = boton.closest('.faq__item');
  const abierta = boton.getAttribute('aria-expanded') === 'true';

  // Solo una respuesta abierta a la vez
  preguntas.forEach((otra) => {
    if (otra !== boton) {
      otra.setAttribute('aria-expanded', 'false');
      ajustarAltura(otra.closest('.faq__item'));
    }
  });

  boton.setAttribute('aria-expanded', String(!abierta));
  ajustarAltura(item);
}

preguntas.forEach((boton) => boton.addEventListener('click', () => alternarFaq(boton)));
window.addEventListener('resize', () => qsa('.faq__item').forEach(ajustarAltura));

/* ============================================================
   Modal de acceso
   ============================================================ */
const modal = qs('#modal');
const modalAviso = qs('#modal-aviso');
const formLogin = qs('#form-login');
const formRegistro = qs('#form-registro');
let focoAnterior = null;

function abrirModal(pestana = 'login') {
  focoAnterior = document.activeElement;
  modal.hidden = false;
  modal.classList.add('modal--abierto');
  document.body.style.overflow = 'hidden';
  cambiarPestana(pestana);
  const primerCampo = qs(`.modal__panel--activo input`);
  setTimeout(() => primerCampo?.focus(), 60);
}

function cerrarModal() {
  modal.classList.remove('modal--abierto');
  modal.hidden = true;
  document.body.style.overflow = '';
  ocultarAviso(modalAviso);
  focoAnterior?.focus?.();
}

function cambiarPestana(nombre) {
  qsa('.modal__tab').forEach((tab) => {
    const activo = tab.dataset.tab === nombre;
    tab.classList.toggle('modal__tab--activo', activo);
    tab.setAttribute('aria-selected', String(activo));
  });
  qsa('.modal__panel').forEach((panel) => {
    panel.classList.toggle('modal__panel--activo', panel.id === `panel-${nombre}`);
  });
  ocultarAviso(modalAviso);
}

qsa('[data-abrir-modal]').forEach((boton) => {
  boton.addEventListener('click', () => {
    abrirMenu(false);
    abrirModal(boton.dataset.abrirModal);
  });
});
qsa('[data-cerrar-modal]').forEach((elemento) => elemento.addEventListener('click', cerrarModal));
qsa('.modal__tab').forEach((tab) => tab.addEventListener('click', () => cambiarPestana(tab.dataset.tab)));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modal.classList.contains('modal--abierto')) cerrarModal();
});

/** Redirige al panel que corresponde según el rol. */
function irAlPanel(usuario) {
  window.location.href = usuario.role === 'admin' ? '/admin.html' : '/dashboard.html';
}

formLogin.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = qs('#btn-login');
  const datos = Object.fromEntries(new FormData(formLogin));
  if (!datos.email || !datos.password) {
    mostrarAviso(modalAviso, 'Completá tu email y contraseña.', 'error');
    return;
  }
  ponerCargando(boton, true, 'Ingresando…');
  try {
    const { user, token } = await api.post('/auth/login', datos);
    session.token = token;
    mostrarAviso(modalAviso, `¡Hola ${user.name.split(' ')[0]}! Entrando a tu panel…`, 'ok');
    irAlPanel(user);
  } catch (error) {
    ponerCargando(boton, false);
    if (error instanceof ApiError) pintarErrores(formLogin, error.details);
    mostrarAviso(modalAviso, error.message, 'error');
  }
});

let barrios = [];

async function cargarBarrios() {
  const select = qs('#reg-barrio');
  try {
    const { items } = await api.get('/neighborhoods');
    barrios = items ?? [];
    select.innerHTML = '<option value="">Elegí tu barrio…</option>' + barrios
      .map((b) => `<option value="${b.id}">${escapar(b.name)}${b.weekday_name ? ` — ${escapar(b.weekday_name)}` : ''}</option>`)
      .join('');
  } catch {
    select.innerHTML = '<option value="">No pudimos cargar los barrios. Escribinos por WhatsApp</option>';
  }
}

qs('#reg-barrio').addEventListener('change', (e) => {
  const barrio = barrios.find((b) => String(b.id) === e.target.value);
  qs('#reg-ayuda-barrio').textContent = barrio?.weekday_name
    ? `Pasamos los ${barrio.weekday_name.toLowerCase()} por ${barrio.name}.`
    : 'Elegí tu barrio y te confirmamos el día de recolección.';
});

formRegistro.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const boton = qs('#btn-registro');
  const datos = Object.fromEntries(new FormData(formRegistro));
  if (datos.password?.length < 6) {
    mostrarAviso(modalAviso, 'La contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }
  ponerCargando(boton, true, 'Creando tu cuenta…');
  try {
    const { user, token } = await api.post('/auth/register', datos);
    session.token = token;
    mostrarAviso(modalAviso, '¡Listo! Te llevamos la primera bolsa. Entrando a tu panel…', 'ok');
    irAlPanel(user);
  } catch (error) {
    ponerCargando(boton, false);
    if (error instanceof ApiError) pintarErrores(formRegistro, error.details);
    mostrarAviso(modalAviso, error.message, 'error');
  }
});

/* ============================================================
   Zonas y días de recolección
   ============================================================ */
const DIAS_SEMANA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

async function cargarZonas() {
  const grilla = qs('#zonas-grilla');
  const filtros = qs('#zonas-filtros');

  let items = [];
  try {
    const respuesta = await api.get('/neighborhoods');
    items = (respuesta.items ?? []).filter((b) => b.is_active && b.weekday);
  } catch {
    grilla.innerHTML = '<p class="zonas__vacio">No pudimos cargar el cronograma. Escribinos por WhatsApp y te decimos qué día pasamos por tu barrio.</p>';
    return;
  }

  if (!items.length) {
    grilla.innerHTML = '<p class="zonas__vacio">Estamos armando el cronograma de recorridos. Escribinos y coordinamos una visita.</p>';
    return;
  }

  // Filtros por día (solo los días que tienen barrios asignados)
  const dias = [...new Set(items.map((b) => b.weekday))].sort((a, b) => a - b);
  filtros.innerHTML = '<button class="zonas__filtro" type="button" data-dia="todos" aria-pressed="true">Todos</button>' +
    dias.map((d) => `<button class="zonas__filtro" type="button" data-dia="${d}" aria-pressed="false">${DIAS_SEMANA[d]}</button>`).join('');

  const pintar = (filtroDia) => {
    const visibles = filtroDia === 'todos' ? items : items.filter((b) => String(b.weekday) === String(filtroDia));
    const porDia = new Map();
    for (const barrio of visibles) {
      if (!porDia.has(barrio.weekday)) porDia.set(barrio.weekday, []);
      porDia.get(barrio.weekday).push(barrio);
    }
    grilla.innerHTML = [...porDia.entries()].sort((a, b) => a[0] - b[0]).map(([numeroDia, lista]) => `
      <div class="zona-dia">
        <div class="zona-dia__cabecera">
          ${DIAS_SEMANA[numeroDia]}
          <span>${lista.length} ${lista.length === 1 ? 'barrio' : 'barrios'}</span>
        </div>
        <ul class="zona-dia__lista">
          ${lista.map((b) => `
            <li>
              <span>${escapar(b.name)}</span>
              <span class="zona-dia__zona">${escapar(b.zone ?? '')}</span>
            </li>`).join('')}
        </ul>
      </div>`).join('');
  };

  pintar('todos');

  filtros.querySelectorAll('.zonas__filtro').forEach((boton) => {
    boton.addEventListener('click', () => {
      filtros.querySelectorAll('.zonas__filtro').forEach((otro) => otro.setAttribute('aria-pressed', String(otro === boton)));
      pintar(boton.dataset.dia);
    });
  });
}

/* ============================================================
   Inicio
   ============================================================ */
configurarWhatsApp();
cargarBarrios();
cargarZonas();

// Permite enlazar directo al formulario: /#registro, /#login o /?acceso=registro
const accesoDirecto = new URLSearchParams(location.search).get('acceso')
  ?? (['registro', 'login'].includes(location.hash.slice(1)) ? location.hash.slice(1) : null);
if (accesoDirecto) abrirModal(accesoDirecto);

// Si ya hay sesión activa, el botón de acceso lleva directo al panel
(async () => {
  try {
    const { user } = await api.get('/auth/me');
    qsa('[data-abrir-modal="login"]').forEach((boton) => {
      boton.textContent = `Ir a mi panel (${user.name.split(' ')[0]})`;
      boton.replaceWith(Object.assign(document.createElement('a'), {
        className: boton.className,
        href: user.role === 'admin' ? '/admin.html' : '/dashboard.html',
        textContent: boton.textContent,
      }));
    });
  } catch { /* visitante sin sesión: dejamos el modal */ }
})();
