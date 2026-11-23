// Utilidades compartidas por las funciones de servidor.
import { getStore } from "@netlify/blobs";
import { timingSafeEqual, createHash, randomInt, randomUUID } from "node:crypto";

export const CATEGORIAS = [
  { id: "viajes", nombre: "Viajes y Excursiones" },
  { id: "conciertos", nombre: "Conciertos y Festivales" },
  { id: "deportes", nombre: "Deportes, Salud y Aventuras" },
  { id: "talleres", nombre: "Talleres Creativos" },
  { id: "terror", nombre: "Juegos y Experiencias de Terror" },
  { id: "cultura", nombre: "Actividades Culturales" },
  { id: "encuentros", nombre: "Encuentros con jóvenes de otros municipios" },
  { id: "espacios", nombre: "Espacios Juveniles" },
];
export const IDS = CATEGORIAS.map((c) => c.id);
export const TOTAL = 100;

// Votos: una entrada por jugada (clave aleatoria, sin datos personales).
export const votos = () => getStore({ name: "smj-votos", consistency: "strong" });
// Códigos de participación: clave = código, valor = { usado, creado, usadoEn }.
export const codigos = () => getStore({ name: "smj-codigos", consistency: "strong" });

/** Los códigos son obligatorios salvo que PARTICIPACION_ABIERTA = "si". */
export function codigosObligatorios() {
  const v = (process.env.PARTICIPACION_ABIERTA || "").trim().toLowerCase();
  return !["si", "sí", "true", "1", "yes"].includes(v);
}

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra,
    },
  });
}

export function error(status, codigo, mensaje) {
  return json({ ok: false, error: codigo, mensaje }, status);
}

// ---- Códigos ----
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I
export function normalizarCodigo(raw) {
  if (typeof raw !== "string") return "";
  const limpio = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (limpio.length !== 8) return "";
  for (const ch of limpio) if (!ALFABETO.includes(ch)) return "";
  return limpio;
}
export function nuevoCodigo() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}
export const formatoCodigo = (c) => `${c.slice(0, 4)}-${c.slice(4)}`;
export const nuevoId = () => randomUUID();

// ---- Validación del reparto ----
export function validarReparto(reparto) {
  if (!reparto || typeof reparto !== "object" || Array.isArray(reparto)) {
    return { ok: false, mensaje: "Falta el reparto de monedas." };
  }
  const claves = Object.keys(reparto);
  if (claves.length !== IDS.length || !IDS.every((id) => claves.includes(id))) {
    return { ok: false, mensaje: "El reparto debe incluir las ocho categorías." };
  }
  let suma = 0;
  const limpio = {};
  for (const id of IDS) {
    const v = reparto[id];
    if (!Number.isInteger(v) || v < 0 || v > TOTAL) {
      return { ok: false, mensaje: "Cada categoría debe tener un número entero entre 0 y 100." };
    }
    limpio[id] = v;
    suma += v;
  }
  if (suma !== TOTAL) {
    return { ok: false, mensaje: `La suma debe ser exactamente ${TOTAL} (ahora es ${suma}).` };
  }
  return { ok: true, reparto: limpio };
}

// ---- Autenticación de administración ----
const sha = (s) => createHash("sha256").update(String(s)).digest();
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/** Devuelve null si está autorizado, o una Response de error si no. */
export async function exigirAdmin(req) {
  const clave = process.env.ADMIN_PASSWORD || "";
  if (clave.length < 10) {
    return error(503, "sin_configurar",
      "La administración no está configurada: define ADMIN_PASSWORD (mínimo 10 caracteres) en Netlify.");
  }
  const cab = req.headers.get("authorization") || "";
  const enviada = cab.startsWith("Bearer ") ? cab.slice(7) : "";
  // Comparación en tiempo constante sobre hashes de igual longitud.
  if (!enviada || !timingSafeEqual(sha(enviada), sha(clave))) {
    await espera(700); // frena intentos repetidos
    return error(401, "no_autorizado", "Contraseña incorrecta.");
  }
  return null;
}

export async function leerJSON(req) {
  try {
    const txt = await req.text();
    if (txt.length > 10_000) return null;
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

/** Lee todos los votos (en lotes para no saturar). */
export async function todosLosVotos() {
  const store = votos();
  const { blobs } = await store.list({ prefix: "v/" });
  const out = [];
  for (let i = 0; i < blobs.length; i += 25) {
    const lote = await Promise.all(
      blobs.slice(i, i + 25).map((b) => store.get(b.key, { type: "json" }))
    );
    for (const v of lote) if (v && v.reparto) out.push(v);
  }
  return out;
}

// =================== SORTEO ===================
// Almacén aparte de los votos. Claves:
//   t/<uuid>   pase de un solo uso que se entrega al enviar una jugada
//   p/<0001>   papeleta con los datos de contacto
//   contador   último número asignado
//   resultado  resultado del sorteo (una vez hecho)
export const sorteo = () => getStore({ name: "smj-sorteo", consistency: "strong" });
export const PREMIO = () => (process.env.PREMIO_SORTEO || "9 entradas para los karts").trim();
export const formatoNumero = (n) => String(n).padStart(4, "0");

export async function resultadoSorteo() {
  return (await sorteo().get("resultado", { type: "json" })) || null;
}

/** Número correlativo con escritura condicional (evita repetir números). */
export async function siguienteNumero() {
  const s = sorteo();
  for (let i = 0; i < 10; i++) {
    const r = await s.getWithMetadata("contador", { type: "json" });
    const sig = (r?.data?.n || 0) + 1;
    const op = r ? (r.etag ? { onlyIfMatch: r.etag } : undefined) : { onlyIfNew: true };
    const w = await s.setJSON("contador", { n: sig }, op);
    if (!w || w.modified !== false) return sig;
    await espera(40 + Math.random() * 160);
  }
  throw new Error("No se ha podido reservar un número");
}

export async function todasLasPapeletas() {
  const s = sorteo();
  const { blobs } = await s.list({ prefix: "p/" });
  const out = [];
  for (let i = 0; i < blobs.length; i += 25) {
    const lote = await Promise.all(blobs.slice(i, i + 25).map((b) => s.get(b.key, { type: "json" })));
    for (const p of lote) if (p && p.numero) out.push(p);
  }
  return out.sort((a, b) => a.numero - b.numero);
}

const recorta = (v, max) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");
export function validarParticipante(d) {
  if (!d || typeof d !== "object") return { ok: false, mensaje: "Faltan tus datos." };
  const nombre = recorta(d.nombre, 60);
  const apellidos = recorta(d.apellidos, 80);
  if (typeof d.mayor14 !== "boolean") return { ok: false, mensaje: "Indica si tienes 14 años o más." };
  if (nombre.length < 2) return { ok: false, mensaje: "Escribe tu nombre." };
  if (apellidos.length < 2) return { ok: false, mensaje: "Escribe tus apellidos." };
  if (d.consentimiento !== true) {
    return { ok: false, mensaje: d.mayor14 ? "Tienes que aceptar la protección de datos para participar." : "Hace falta la autorización de tu madre, padre o tutor/a para participar." };
  }
  return { ok: true, datos: { nombre, apellidos, menor14: !d.mayor14 } };
}

const normaliza = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
/** Clave de persona (nombre + apellidos) para que nadie gane dos premios. */
export const clavePersona = (p) => normaliza(`${p.nombre} ${p.apellidos}`);
/** "Leo R." — nombre y la inicial del primer apellido. */
export const nombreCorto = (p) => `${p.nombre} ${(p.apellidos || "").charAt(0).toUpperCase()}.`;

export function agregar(lista) {
  const totales = Object.fromEntries(IDS.map((id) => [id, 0]));
  for (const v of lista) for (const id of IDS) totales[id] += v.reparto[id] || 0;
  const monedas = lista.length * TOTAL;
  const categorias = CATEGORIAS.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    monedas: totales[c.id],
    porcentaje: monedas ? Math.round((totales[c.id] / monedas) * 1000) / 10 : 0,
    sinMonedas: lista.filter((v) => (v.reparto[c.id] || 0) === 0).length,
  }));
  const ranking = [...categorias].sort((a, b) => b.monedas - a.monedas || a.nombre.localeCompare(b.nombre, "es"));
  // Empates: comparten puesto (1, 2, 2, 4…)
  ranking.forEach((c) => (c.puesto = 1 + ranking.filter((o) => o.monedas > c.monedas).length));
  return { participantes: lista.length, monedasTotales: monedas, categorias, ranking };
}
