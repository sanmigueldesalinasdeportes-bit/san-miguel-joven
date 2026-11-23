import { CATEGORIAS, TOTAL } from "./categorias.js";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const reduceMov = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- Almacenamiento local (solo borrador en este dispositivo) ----------
const local = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* nada */ } },
};
const K_BORRADOR = "smj-borrador";

const estado = {
  codigosObligatorios: true,
  pase: null,
  codigo: "",
  reparto: Object.fromEntries(CATEGORIAS.map((c) => [c.id, 0])),
};
const suma = () => Object.values(estado.reparto).reduce((a, b) => a + b, 0);
const restante = () => TOTAL - suma();

// ---------- Navegación entre vistas ----------
function mostrar(nombre, { foco = true } = {}) {
  $$("[data-vista]").forEach((v) => (v.hidden = v.dataset.vista !== nombre));
  window.scrollTo(0, 0);
  if (foco) {
    const vista = $(`[data-vista="${nombre}"]`);
    const objetivo = $("#panel-ok", vista) || $("h1", vista);
    if (objetivo) { objetivo.setAttribute("tabindex", "-1"); objetivo.focus({ preventScroll: true }); }
  }
}

// ---------- API ----------
async function api(ruta, cuerpo) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(ruta, {
      method: cuerpo ? "POST" : "GET",
      headers: cuerpo ? { "content-type": "application/json" } : {},
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: ctrl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* respuesta no JSON */ }
    if (!res.ok || !data || data.ok === false) {
      const e = new Error(data?.mensaje || "Algo ha fallado en el servidor. Inténtalo de nuevo.");
      e.codigo = data?.error; e.status = res.status;
      throw e;
    }
    return data;
  } catch (e) {
    if (e.name === "AbortError") throw Object.assign(new Error("La conexión va muy lenta. Inténtalo otra vez."), { codigo: "red" });
    if (e instanceof TypeError) throw Object.assign(new Error("Parece que no tienes conexión. Revísala e inténtalo de nuevo."), { codigo: "red" });
    throw e;
  } finally { clearTimeout(t); }
}

// ---------- Portada ----------
function pintarBorde() {
  $("#borde-casillas").innerHTML = CATEGORIAS.map(
    (c) => `<div class="casilla-mini" style="--c:${c.color}">${c.icono}</div>`
  ).join("");
}

// ---------- Código ----------
const formatear = (v) => {
  const l = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return l.length > 4 ? `${l.slice(0, 4)}-${l.slice(4)}` : l;
};

function initCodigo() {
  const input = $("#codigo");
  const msg = $("#codigo-msg");
  const btn = $("#btn-codigo");
  input.addEventListener("input", () => {
    input.value = formatear(input.value);
    input.removeAttribute("aria-invalid"); msg.textContent = "";
  });
  $("#form-codigo").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const limpio = input.value.replace(/-/g, "");
    if (limpio.length !== 8) {
      input.setAttribute("aria-invalid", "true");
      msg.textContent = "El código tiene 8 letras o números (por ejemplo ABCD-1234).";
      input.focus(); return;
    }
    btn.disabled = true; btn.setAttribute("aria-busy", "true");
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Comprobando…';
    try {
      await api("/api/codigo", { codigo: limpio });
      estado.codigo = limpio;
      guardarBorrador();
      irAReparto();
    } catch (e) {
      input.setAttribute("aria-invalid", "true");
      msg.textContent = e.message; input.focus();
    } finally {
      btn.disabled = false; btn.removeAttribute("aria-busy");
      btn.textContent = "Entrar al tablero";
    }
  });
}

// ---------- Reparto ----------
const iconoMenos = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><path d="M5 12h14"/></svg>';
const iconoMas = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"><path d="M5 12h14M12 5v14"/></svg>';

function pintarCasillas() {
  $("#casillas").innerHTML = CATEGORIAS.map((c) => `
    <li class="carta" data-id="${c.id}" style="--c:${c.color};--ct:${c.tinta}">
      <div class="carta-color">${c.icono}</div>
      <div class="carta-cuerpo">
        <h2 id="t-${c.id}">${c.nombre}</h2>
        <p class="carta-desc">${c.desc}</p>
        <div class="control" role="group" aria-labelledby="t-${c.id}">
          <button class="ctl ctl-menos" type="button" data-paso="-1" aria-label="Quitar una moneda de ${c.nombre}">${iconoMenos}</button>
          <input class="valor" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="100" step="1"
                 value="0" aria-label="Monedas en ${c.nombre}" data-id="${c.id}">
          <button class="ctl ctl-mas" type="button" data-paso="1" aria-label="Añadir una moneda a ${c.nombre}">${iconoMas}</button>
          <span class="ctl-pct" aria-hidden="true">0%</span>
        </div>
        <div class="barrita" aria-hidden="true"><i></i></div>
      </div>
    </li>`).join("");

  $$(".carta").forEach((carta) => {
    const id = carta.dataset.id;
    const input = $(".valor", carta);

    $$(".ctl", carta).forEach((btn) => {
      const paso = Number(btn.dataset.paso);
      let t = null, n = 0;
      const parar = () => { clearTimeout(t); t = null; };
      const repetir = () => {
        if (!cambiar(id, paso, btn)) return parar();
        n++;
        t = setTimeout(repetir, n < 4 ? 220 : n < 12 ? 110 : 55); // acelera al mantener
      };
      btn.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || btn.disabled) return;
        try { btn.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
        n = 0;
        cambiar(id, paso, btn);
        t = setTimeout(repetir, 420);
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => btn.addEventListener(ev, parar));
      btn.addEventListener("contextmenu", (e) => e.preventDefault());
      // Teclado (Enter/Espacio) dispara "click" con detail 0
      btn.addEventListener("click", (e) => { if (e.detail === 0) cambiar(id, paso, btn); });
    });

    input.addEventListener("focus", () => input.select());
    input.addEventListener("input", () => {
      if (input.value === "") return; // permite borrar para escribir
      fijar(id, input.value, true);
    });
    input.addEventListener("blur", () => fijar(id, input.value === "" ? 0 : input.value, false));
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); cambiar(id, e.key === "ArrowUp" ? 1 : -1); }
      if ([".", ",", "e", "E", "-", "+"].includes(e.key)) e.preventDefault(); // solo enteros
      if (e.key === "Enter") input.blur();
    });
  });
}

let avisoTimer = null;
function avisar(texto, tono = "aviso") {
  const ayuda = $("#ayuda");
  ayuda.textContent = texto; ayuda.dataset.tono = tono;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(actualizarAyuda, 2600);
}

/** Suma o resta. Devuelve false si no ha podido cambiar. */
function cambiar(id, paso, btn) {
  const actual = estado.reparto[id];
  const nuevo = actual + paso;
  if (nuevo < 0) return false;
  if (paso > 0 && restante() <= 0) { avisar("Ya has repartido las 100 monedas. Quita de otra casilla para mover monedas aquí."); return false; }
  estado.reparto[id] = nuevo;
  if (paso > 0 && btn && !reduceMov()) volarMoneda(btn);
  actualizar(id, true);
  return true;
}

function fijar(id, valorTexto, escribiendo) {
  let v = parseInt(String(valorTexto).replace(/\D/g, ""), 10);
  if (Number.isNaN(v)) v = 0;
  const maximo = estado.reparto[id] + restante();
  if (v > maximo) {
    v = maximo;
    avisar(maximo === 0
      ? "No te quedan monedas. Quita de otra casilla primero."
      : `Solo te quedaban ${maximo} monedas para esta casilla.`);
  }
  estado.reparto[id] = v;
  actualizar(id, !escribiendo, escribiendo);
}

function volarMoneda(btn) {
  const m = document.createElement("span");
  m.className = "moneda vuela"; m.setAttribute("aria-hidden", "true");
  btn.appendChild(m);
  m.addEventListener("animationend", () => m.remove(), { once: true });
}

function actualizar(idCambiado, animar = false, escribiendo = false) {
  const total = suma();
  const quedan = TOTAL - total;
  $$(".carta").forEach((carta) => {
    const id = carta.dataset.id;
    const v = estado.reparto[id];
    const input = $(".valor", carta);
    if (!(escribiendo && id === idCambiado) && input.value !== String(v)) input.value = v;
    if (escribiendo && id === idCambiado && input.value !== String(v)) input.value = v; // tras recorte
    $(".ctl-menos", carta).disabled = v === 0;
    $(".ctl-mas", carta).disabled = quedan === 0;
    $(".ctl-pct", carta).textContent = `${v}%`;
    $(".barrita i", carta).style.width = `${v}%`;
    carta.dataset.activa = v > 0 ? "true" : "false";
    if (animar && id === idCambiado && !reduceMov()) {
      input.classList.remove("salto"); void input.offsetWidth; input.classList.add("salto");
    }
  });

  $("#quedan").textContent = quedan;
  $("#quedan-txt").textContent = quedan === 1 ? "moneda por repartir" : "monedas por repartir";
  $("#asignadas").textContent = total;
  $(".banca").dataset.estado = quedan === 0 ? "lleno" : "";
  $("#pista").innerHTML = CATEGORIAS.filter((c) => estado.reparto[c.id] > 0)
    .map((c) => `<span style="--c:${c.color};flex:0 0 ${estado.reparto[c.id]}%"></span>`).join("");

  $("#btn-revisar").disabled = quedan !== 0;
  if (!avisoTimer) actualizarAyuda();
  guardarBorrador();
}

let anuncioTimer = null;
function actualizarAyuda() {
  avisoTimer = null;
  const quedan = restante();
  const ayuda = $("#ayuda");
  if (quedan === 0) { ayuda.textContent = "¡Justo 100! Ya puedes revisar y enviar tu jugada."; ayuda.dataset.tono = "ok"; }
  else if (quedan === TOTAL) { ayuda.textContent = "Usa + y − para repartir tus 100 monedas."; ayuda.dataset.tono = ""; }
  else { ayuda.textContent = `Te ${quedan === 1 ? "queda 1 moneda" : `quedan ${quedan} monedas`} por repartir.`; ayuda.dataset.tono = ""; }
  // Anuncio para lectores de pantalla, sin saturar al mantener pulsado
  clearTimeout(anuncioTimer);
  anuncioTimer = setTimeout(() => { $("#anuncio").textContent = ayuda.textContent; }, 700);
}

function guardarBorrador() { local.set(K_BORRADOR, { reparto: estado.reparto, codigo: estado.codigo }); }

function irAReparto() { mostrar("reparto"); actualizar(); }

// ---------- Revisión ----------
function pintarRejilla(el, animar) {
  const celdas = [];
  for (const c of CATEGORIAS) for (let i = 0; i < estado.reparto[c.id]; i++) celdas.push(c.color);
  el.innerHTML = celdas.map((col, n) => `<i style="--c:${col};--n:${n}"></i>`).join("");
  el.classList.toggle("animar", animar && !reduceMov());
  const partes = CATEGORIAS.filter((c) => estado.reparto[c.id] > 0).map((c) => `${c.nombre}: ${estado.reparto[c.id]}`);
  el.setAttribute("aria-label", `Tablero de 100 casillas. ${partes.join(". ")}.`);
}

function irARevision() {
  if (restante() !== 0) return;
  pintarRejilla($("#rejilla-revision"), true);
  const orden = [...CATEGORIAS].sort((a, b) => estado.reparto[b.id] - estado.reparto[a.id]);
  $("#resumen").innerHTML = orden.map((c) => `
    <li data-cero="${estado.reparto[c.id] === 0}" style="--c:${c.color}">
      <span class="punto" aria-hidden="true"></span>
      <span>${c.nombre}</span>
      <b>${estado.reparto[c.id]} <span class="sr-only">monedas</span></b>
    </li>`).join("");
  $("#envio-msg").textContent = "";
  mostrar("revision");
}

async function enviar() {
  const btn = $("#btn-enviar");
  const msg = $("#envio-msg");
  if (restante() !== 0) { msg.textContent = "Tienes que repartir exactamente 100 monedas."; return; }
  btn.disabled = true; btn.setAttribute("aria-busy", "true");
  btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Enviando…';
  msg.textContent = "";
  try {
    const r = await api("/api/votar", { reparto: estado.reparto, codigo: estado.codigo || undefined });
    estado.pase = r.pase || null;
    pintarRejilla($("#rejilla-final"), false);
    local.del(K_BORRADOR);
    estado.codigo = ""; // un código sirve para una sola jugada
    $("#caja-sorteo").hidden = !estado.pase;
    mostrar("enviado");
  } catch (e) {
    if (e.codigo === "usado" || e.codigo === "invalido") {
      msg.textContent = `${e.message} Si crees que es un error, avisa a la persona que organiza la actividad.`;
    } else {
      msg.textContent = `${e.message} Tu reparto sigue guardado en este móvil.`;
    }
  } finally {
    btn.disabled = false; btn.removeAttribute("aria-busy");
    btn.textContent = "Enviar mi jugada";
  }
}

// ---------- Sorteo ----------
const K_DATOS = "smj-datos-sorteo";

function pintarResultado(s) {
  const caja = $("#sorteo");
  if (!s || !s.realizado) { caja.hidden = true; return; }
  const fecha = new Date(s.fecha).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  $("#sorteo-pub-texto").textContent = `Sorteo de ${s.premio}, realizado el ${fecha}.`;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const li = (g) => `<li>${esc(g.numero)}${g.nombre ? `<small>${esc(g.nombre)}</small>` : ""}</li>`;
  $("#sorteo-ganadores").innerHTML = s.ganadores.map(li).join("");
  $("#sorteo-suplentes").innerHTML = s.suplentes.map(li).join("");
  $("#sorteo-suplentes-wrap").hidden = !s.suplentes.length;
  caja.hidden = false;
}

function initSorteo() {
  const form = $("#form-sorteo");
  const msg = $("#sorteo-msg");
  const btn = $("#btn-papeleta");

  const actualizarEdad = () => {
    const menor = form.edad.value === "no";
    $("#txt-consentimiento").textContent = menor
      ? "Mi madre, padre o tutor/a legal ha leído la información sobre protección de datos y autoriza que se usen mis datos para este sorteo."
      : "He leído la información sobre protección de datos y acepto que se usen mis datos para este sorteo.";
  };
  form.addEventListener("change", (e) => { if (e.target.name === "edad") actualizarEdad(); msg.textContent = ""; });

  const guardados = local.get(K_DATOS);
  if (guardados) {
    for (const k of ["nombre", "apellidos"]) if (typeof guardados[k] === "string") form[k].value = guardados[k];
    if (guardados.edad) { form.edad.value = guardados.edad; actualizarEdad(); }
    form.recordar.checked = true;
  }

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    msg.textContent = "";
    const falta = (texto, campo) => { msg.textContent = texto; campo?.focus?.(); };
    if (!form.edad.value) return falta("Indica si tienes 14 años o más.", form.querySelector('[name="edad"]'));
    if (form.nombre.value.trim().length < 2) return falta("Escribe tu nombre.", form.nombre);
    if (form.apellidos.value.trim().length < 2) return falta("Escribe tus apellidos.", form.apellidos);
    if (!form.consentimiento.checked) {
      return falta(form.edad.value === "no" ? "Hace falta la autorización de tu madre, padre o tutor/a." : "Tienes que aceptar la protección de datos para participar.", form.consentimiento);
    }
    const datos = {
      mayor14: form.edad.value === "si",
      nombre: form.nombre.value, apellidos: form.apellidos.value,
      consentimiento: true,
    };
    btn.disabled = true; btn.setAttribute("aria-busy", "true");
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Guardando…';
    try {
      const r = await api("/api/sorteo/apuntarse", { pase: estado.pase, datos });
      if (form.recordar.checked) local.set(K_DATOS, { nombre: datos.nombre, apellidos: datos.apellidos, edad: form.edad.value });
      else local.del(K_DATOS);
      estado.pase = null;
      $("#caja-sorteo").hidden = true;
      $("#papeleta-num").textContent = r.numero;
      form.consentimiento.checked = false;
      mostrar("papeleta");
    } catch (e) {
      msg.textContent = e.message;
      if (e.codigo === "pase" || e.codigo === "cerrado") $("#caja-sorteo").hidden = true;
    } finally {
      btn.disabled = false; btn.removeAttribute("aria-busy");
      btn.textContent = "Conseguir mi papeleta";
    }
  });
}

function otraJugada() {
  CATEGORIAS.forEach((c) => (estado.reparto[c.id] = 0));
  estado.pase = null;
  $("#codigo").value = "";
  empezar();
}

// ---------- Arranque ----------
function empezar() {
  if (estado.codigosObligatorios && !estado.codigo) {
    mostrar("codigo");
    const url = new URL(location.href).searchParams.get("codigo");
    if (url && !$("#codigo").value) $("#codigo").value = formatear(url);
  } else irAReparto();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-accion]");
  if (!b) return;
  const acciones = {
    recargar: () => location.reload(),
    empezar,
    "ir-portada": () => mostrar("portada"),
    "ir-reparto": irAReparto,
    revisar: irARevision,
    enviar,
    "ir-sorteo": () => mostrar("sorteo"),
    "volver-enviado": () => mostrar("enviado"),
    "otra-jugada": otraJugada,
    reiniciar: () => {
      if (suma() === 0) return;
      CATEGORIAS.forEach((c) => (estado.reparto[c.id] = 0));
      actualizar();
      avisar("Has vuelto a tener 100 monedas.", "");
    },
  };
  acciones[b.dataset.accion]?.();
});

async function iniciar() {
  pintarBorde();
  pintarCasillas();
  initCodigo();
  initSorteo();
  try {
    const cfg = await api("/api/config");
    estado.codigosObligatorios = !!cfg.codigos;
    $$("[data-premio]").forEach((el) => (el.textContent = cfg.premio || "el sorteo"));
    $("#aviso-sorteo").hidden = !cfg.sorteoAbierto;
    pintarResultado(cfg.sorteo);
  } catch (e) {
    $("#fallo-texto").textContent = e.message;
    mostrar("fallo", { foco: false });
    return;
  }

  const b = local.get(K_BORRADOR);
  if (b && b.reparto && typeof b.reparto === "object") {
    for (const c of CATEGORIAS) {
      const v = b.reparto[c.id];
      if (Number.isInteger(v) && v >= 0) estado.reparto[c.id] = v;
    }
    if (suma() > TOTAL) CATEGORIAS.forEach((c) => (estado.reparto[c.id] = 0));
    if (estado.codigosObligatorios && typeof b.codigo === "string") estado.codigo = b.codigo;
  }
  mostrar("portada", { foco: false });
  if (location.hash === "#sorteo" && !$("#sorteo").hidden) $("#sorteo").scrollIntoView();
}

iniciar();
