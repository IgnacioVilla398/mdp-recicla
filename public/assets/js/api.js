/**
 * Cliente HTTP y utilidades compartidas del frontend (MdP Recicla).
 * Se importa como modulo ES desde cada pagina.
 */

const TOKEN_KEY = 'mdp_token';

export const session = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set token(value) {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  },
  clear() { localStorage.removeItem(TOKEN_KEY); },
};

/** Error de API con status y detalles de validacion. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details ?? {};
  }
  /** Primer mensaje de validacion disponible. */
  get primerDetalle() {
    const first = Object.values(this.details)[0];
    return typeof first === 'string' ? first : null;
  }
}

async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (session.token) headers.Authorization = `Bearer ${session.token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(0, 'Sin conexion con el servidor');
  }

  let payload = null;
  try { payload = await res.json(); } catch { /* sin cuerpo */ }

  if (!res.ok) {
    if (res.status === 401) session.clear();
    throw new ApiError(res.status, payload?.error ?? `Error ${res.status}`, payload?.details);
  }
  return payload?.data ?? payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path) => request('DELETE', path),
};

/* ---------------- Formato ---------------- */

export const money = (value) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
    .format(Number(value ?? 0));

export const kg = (value) => `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(Number(value ?? 0))} kg`;

export const fecha = (value) => {
  if (!value) return '—';
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const fechaHora = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const mesLargo = (yyyymm) => {
  if (!yyyymm) return '';
  const [y, m] = yyyymm.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
};

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const ESTADOS = {
  pending:   { texto: 'Pendiente',  clase: 'etiqueta--pendiente' },
  approved:  { texto: 'Aprobada',   clase: 'etiqueta--info' },
  paid:      { texto: 'Pagada',     clase: 'etiqueta--ok' },
  rejected:  { texto: 'Rechazada',  clase: 'etiqueta--error' },
  cancelled: { texto: 'Cancelada',  clase: 'etiqueta--info' },
};

export const estadoPayout = (status) => ESTADOS[status] ?? { texto: status, clase: '' };

/** Etiqueta HTML de estado. */
export const etiquetaEstado = (status) => {
  const { texto, clase } = estadoPayout(status);
  return `<span class="etiqueta ${clase}">${texto}</span>`;
};

/* ---------------- UI ---------------- */

export function mostrarAviso(elemento, mensaje, tipo = 'ok', autoOcultarMs = 0) {
  if (!elemento) return;
  elemento.className = `aviso aviso--${tipo} aviso--visible`;
  elemento.textContent = mensaje;
  if (autoOcultarMs > 0) setTimeout(() => ocultarAviso(elemento), autoOcultarMs);
}

export function ocultarAviso(elemento) {
  if (!elemento) return;
  elemento.className = 'aviso';
  elemento.textContent = '';
}

export function escapar(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const qs = (selector, raiz = document) => raiz.querySelector(selector);
export const qsa = (selector, raiz = document) => Array.from(raiz.querySelectorAll(selector));

/** Marca errores de validacion devueltos por la API en los campos del formulario. */
export function pintarErrores(form, detalles = {}) {
  qsa('.campo', form).forEach((campo) => {
    campo.classList.remove('campo--error');
    const error = campo.querySelector('.campo__error');
    if (error) error.remove();
  });
  for (const [name, mensaje] of Object.entries(detalles ?? {})) {
    const input = form.querySelector(`[name="${name}"]`);
    const campo = input?.closest('.campo');
    if (!campo || typeof mensaje !== 'string') continue;
    campo.classList.add('campo--error');
    const span = document.createElement('span');
    span.className = 'campo__error';
    span.textContent = mensaje;
    campo.appendChild(span);
  }
}

export function ponerCargando(boton, cargando, textoCargando = 'Procesando...') {
  if (!boton) return;
  if (cargando) {
    boton.dataset.textoOriginal = boton.textContent;
    boton.textContent = textoCargando;
    boton.disabled = true;
  } else {
    boton.textContent = boton.dataset.textoOriginal ?? boton.textContent;
    boton.disabled = false;
  }
}

/**
 * Protege una pagina: exige sesion y, opcionalmente, un rol.
 * Devuelve el usuario autenticado o redirige.
 */
export async function requerirSesion(rolEsperado) {
  try {
    const { user } = await api.get('/auth/me');
    if (rolEsperado && user.role !== rolEsperado) {
      window.location.replace(user.role === 'admin' ? '/admin.html' : '/dashboard.html');
      return null;
    }
    return user;
  } catch {
    window.location.replace(`/login.html?volver=${encodeURIComponent(window.location.pathname)}`);
    return null;
  }
}

/** Cierra sesion y vuelve al login. */
export async function cerrarSesion() {
  try { await api.post('/auth/logout'); } catch { /* ignorar */ }
  session.clear();
  window.location.replace('/login.html');
}

/** Enlaza el boton de salir del encabezado. */
export function activarBotonSalir(selector = '[data-salir]') {
  qsa(selector).forEach((boton) => boton.addEventListener('click', (e) => {
    e.preventDefault();
    cerrarSesion();
  }));
}
