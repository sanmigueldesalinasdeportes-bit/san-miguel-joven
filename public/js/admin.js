import { CATEGORIAS } from "./categorias.js";

const $ = (s) => document.querySelector(s);
const color = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.color]));
const fmt = (n) => n.toLocaleString("es-ES");

// La contraseña solo se guarda en memoria de esta pestaña (sessionStorage).
let clave = "";
try { clave = sessionStorage.getItem("smj-admin") || ""; } catch { /* sin almacenamiento */ }

async function api(ruta, { metodo = "GET", cuerpo, crudo = false } = {}) {
  const res = await fetch(ruta, {
    method: metodo,
    headers: { authorization: `Bearer ${clave}`, ...(cuerpo ? { "content-type": "application/json" } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  }).catch(() => { throw new Error("Sin conexión con el servidor."); });
  if (crudo && res.ok) return res;
  let data = null;
  try { data = await res.json(); } catch { /* no JSON */ }
  if (!res.ok || !data?.ok) {
    const e = new Error(data?.mensaje || `Error ${res.status}`); e.status = res.status; throw e;
  }
  return data;
}

function mostrar(v) { document.querySelectorAll("[data-vista]").forEach((s) => (s.hidden = s.dataset.vista !== v)); }

// ---------- Acceso ----------
$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#btn-login");
  clave = $("#clave").value;
  if (!clave) { $("#login-msg").textContent = "Escribe la contraseña."; return; }
  btn.disabled = true; btn.textContent = "Comprobando…";
  try {
    await cargar();
    try { sessionStorage.setItem("smj-admin", clave); } catch { /* nada */ }
    $("#clave").value = "";
    mostrar("panel");
  } catch (err) {
    $("#login-msg").textContent = err.message;
  } finally { btn.disabled = false; btn.textContent = "Entrar"; }
});

$("#btn-salir").addEventListener("click", () => {
  clave = ""; try { sessionStorage.removeItem("smj-admin"); } catch { /* nada */ }
  mostrar("login"); $("#clave").focus();
});
$("#btn-actualizar").addEventListener("click", async (e) => {
  const b = e.currentTarget; b.disabled = true; b.textContent = "Actualizando…";
  try { await cargar(); $("#panel-msg").textContent = ""; }
  catch (err) { $("#panel-msg").textContent = err.message; }
  finally { b.disabled = false; b.textContent = "Actualizar"; }
});

// ---------- Resultados ----------
async function cargar() {
  const r = await api("/api/admin/resultados");
  pintar(r);
  if (r.modoCodigos) { $("#bloque-codigos").hidden = false; await cargarCodigos(); }
  else $("#bloque-codigos").hidden = true;
  await cargarSorteo();
}

// ---------- Sorteo ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let publicarActual = "numeros";
const filaPersona = (g) => `<tr><td><b>${esc(g.numero)}</b></td><td>${esc(g.nombre)} ${esc(g.apellidos)}</td>
  <td>${g.menor14 ? "Sí" : "No"}</td><td>${publicarActual === "nombres" && g.publicado ? `${esc(g.numero)} · ${esc(g.publicado)}` : esc(g.numero)}</td></tr>`;

async function cargarSorteo() {
  const s = await api("/api/admin/sorteo");
  $("#h-sorteo").textContent = `Sorteo de ${s.premio}`;
  const cifras = [[fmt(s.papeletas), s.papeletas === 1 ? "papeleta" : "papeletas"], [fmt(s.personas), "personas distintas"]];
  $("#sorteo-cifras").innerHTML = cifras.map(([b, t]) => `<div class="cifra"><b>${b}</b><span>${t}</span></div>`).join("");

  const hecho = !!s.resultado;
  $("#sorteo-pendiente").hidden = hecho;
  $("#sorteo-hecho").hidden = !hecho;
  $("#form-anular").hidden = !hecho;
  if (hecho) {
    const r = s.resultado;
    publicarActual = r.publicar;
    $("#publicar-hecho").value = r.publicar;
    const f = new Date(r.fecha).toLocaleString("es-ES", { dateStyle: "long", timeStyle: "short" });
    $("#sorteo-hecho-texto").textContent = `Sorteo hecho el ${f} entre ${fmt(r.totalPapeletas)} papeletas de ${fmt(r.totalPersonas)} personas. Ya está publicado en la web.`;
    $("#tabla-ganadores").innerHTML = r.ganadores.map(filaPersona).join("");
    $("#tabla-suplentes").innerHTML = r.suplentes.map(filaPersona).join("");
    $("#h-suplentes").hidden = !r.suplentes.length;
    $("#tabla-suplentes").closest(".tabla-wrap").hidden = !r.suplentes.length;
  } else {
    $("#sorteo-ultimas").innerHTML = s.ultimas.length
      ? `<p class="nota">Últimas papeletas: ${s.ultimas.map((u) => `${esc(u.numero)} (${esc(u.nombre)})`).join(", ")}</p>`
      : '<p class="vacio-txt">Aún no hay papeletas. Aparecerán cuando alguien envíe su jugada y rellene sus datos.</p>';
  }
}

$("#form-realizar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#panel-msg");
  if (!$("#ok-publicar").checked) { msg.textContent = "Marca la casilla de confirmación para hacer el sorteo."; return; }
  const btn = $("#btn-realizar");
  btn.disabled = true; btn.textContent = "Sorteando…";
  try {
    await api("/api/admin/sorteo/realizar", { metodo: "POST", cuerpo: { premios: parseInt($("#n-premios").value, 10), suplentes: parseInt($("#n-suplentes").value, 10), publicar: $("#publicar").value } });
    msg.textContent = "";
    $("#ok-publicar").checked = false;
    await cargarSorteo();
    $("#bloque-sorteo").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  } catch (err) { msg.textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = "Hacer el sorteo"; }
});

$("#form-publicacion").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api("/api/admin/sorteo/publicacion", { metodo: "POST", cuerpo: { publicar: $("#publicar-hecho").value } });
    $("#panel-msg").textContent = "Guardado. La web ya muestra el cambio.";
    await cargarSorteo();
  } catch (err) { $("#panel-msg").textContent = err.message; }
});

$("#form-anular").addEventListener("submit", async (e) => {
  e.preventDefault();
  if ($("#confirmar-anular").value.trim() !== "ANULAR") { $("#panel-msg").textContent = "Escribe ANULAR en mayúsculas para confirmar."; return; }
  try {
    await api("/api/admin/sorteo/anular", { metodo: "POST", cuerpo: { confirmacion: "ANULAR" } });
    $("#confirmar-anular").value = "";
    $("#panel-msg").textContent = "Sorteo anulado. Las papeletas vuelven a estar abiertas.";
    await cargarSorteo();
  } catch (err) { $("#panel-msg").textContent = err.message; }
});

$("#form-borrar-sorteo").addEventListener("submit", async (e) => {
  e.preventDefault();
  if ($("#confirmar-sorteo").value.trim() !== "BORRAR") { $("#panel-msg").textContent = "Escribe BORRAR en mayúsculas para confirmar."; return; }
  try {
    const r = await api("/api/admin/sorteo/borrar", { metodo: "POST", cuerpo: { confirmacion: "BORRAR" } });
    $("#confirmar-sorteo").value = "";
    $("#panel-msg").textContent = `Borrados los datos de ${r.borrados} papeletas.`;
    await cargarSorteo();
  } catch (err) { $("#panel-msg").textContent = err.message; }
});

function pintar(r) {
  const cifras = [
    [fmt(r.participantes), r.participantes === 1 ? "jugada enviada" : "jugadas enviadas"],
    [fmt(r.monedasTotales), "monedas repartidas"],
    [r.participantes ? r.ranking[0].nombre : "—", "categoría favorita"],
  ];
  if (r.codigos) cifras.push([`${fmt(r.codigos.usados)} / ${fmt(r.codigos.total)}`, "códigos usados"]);
  $("#cifras").innerHTML = cifras.map(([b, s], i) =>
    `<div class="cifra"><b ${i === 2 ? 'style="font-size:1.2rem;line-height:1.25"' : ""}>${b}</b><span>${s}</span></div>`).join("");

  if (!r.participantes) {
    $("#grafico").innerHTML = '<p class="vacio-txt">Todavía no hay jugadas. Los resultados aparecerán aquí en cuanto alguien envíe la suya.</p>';
  } else {
    const max = Math.max(...r.ranking.map((c) => c.monedas), 1);
    $("#grafico").innerHTML = r.ranking.map((c) => `
      <div class="g-fila" tabindex="0" aria-label="Puesto ${c.puesto}: ${c.nombre}, ${c.monedas} monedas, ${c.porcentaje}%">
        <span class="g-puesto" aria-hidden="true">${c.puesto}</span>
        <span class="g-nombre" aria-hidden="true"><i style="--c:${color[c.id]}"></i><span>${c.nombre}</span></span>
        <span class="g-valor" aria-hidden="true">${fmt(c.monedas)}<small>${String(c.porcentaje).replace(".", ",")}%</small></span>
        <span class="g-pista" aria-hidden="true"><b style="width:${(c.monedas / max) * 100}%"></b></span>
        <span class="g-tip" aria-hidden="true">${c.sinMonedas} ${c.sinMonedas === 1 ? "jugada" : "jugadas"} con 0 monedas</span>
      </div>`).join("");
  }
  $("#tabla").innerHTML = r.ranking.map((c) => `
    <tr><td>${c.puesto}</td><td>${c.nombre}</td><td class="num">${fmt(c.monedas)}</td>
    <td class="num">${String(c.porcentaje).replace(".", ",")}</td><td class="num">${c.sinMonedas}</td></tr>`).join("");
}

// ---------- CSV ----------
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-csv]");
  if (!b) return;
  const txt = b.textContent; b.disabled = true; b.textContent = "Preparando…";
  try {
    const res = await api(b.dataset.csv, { crudo: true });
    const nombre = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") || "")?.[1] || "resultados.csv";
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) { $("#panel-msg").textContent = err.message; }
  finally { b.disabled = false; b.textContent = txt; }
});

// ---------- Códigos ----------
async function cargarCodigos() {
  const { codigos } = await api("/api/admin/codigos");
  const usados = codigos.filter((c) => c.usado).length;
  $("#codigos-resumen").textContent = codigos.length
    ? `${codigos.length} códigos creados · ${usados} usados · ${codigos.length - usados} libres`
    : "Aún no hay códigos. Sin códigos nadie puede votar.";
  $("#codigos-lista").innerHTML = codigos.map((c) =>
    `<span data-usado="${c.usado}" title="${c.usado ? "Usado" : "Libre"}">${c.codigo}</span>`).join("");
}

$("#form-codigos").addEventListener("submit", async (e) => {
  e.preventDefault();
  const n = parseInt($("#cantidad").value, 10);
  const btn = $("#btn-generar");
  if (!(n >= 1 && n <= 500)) { $("#panel-msg").textContent = "Indica una cantidad entre 1 y 500."; return; }
  btn.disabled = true; btn.textContent = "Generando…";
  try {
    const r = await api("/api/admin/codigos", { metodo: "POST", cuerpo: { cantidad: n } });
    $("#panel-msg").textContent = "";
    await cargar();
    $("#codigos-resumen").textContent += ` · ${r.creados.length} nuevos generados`;
  } catch (err) { $("#panel-msg").textContent = err.message; }
  finally { btn.disabled = false; btn.textContent = "Generar códigos"; }
});

// ---------- Borrado ----------
$("#form-borrar").addEventListener("submit", async (e) => {
  e.preventDefault();
  if ($("#confirmar").value.trim() !== "BORRAR") { $("#panel-msg").textContent = "Escribe BORRAR en mayúsculas para confirmar."; return; }
  try {
    const r = await api("/api/admin/borrar", { metodo: "POST", cuerpo: { confirmacion: "BORRAR", liberarCodigos: $("#liberar").checked } });
    $("#confirmar").value = "";
    $("#panel-msg").textContent = `Borradas ${r.borrados} jugadas${r.liberados ? ` y liberados ${r.liberados} códigos` : ""}.`;
    await cargar();
  } catch (err) { $("#panel-msg").textContent = err.message; }
});

// Si ya había sesión en esta pestaña, entra directamente
if (clave) {
  cargar().then(() => mostrar("panel")).catch(() => { clave = ""; try { sessionStorage.removeItem("smj-admin"); } catch { /* nada */ } });
}
