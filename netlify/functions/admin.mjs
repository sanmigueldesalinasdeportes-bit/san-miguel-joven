// API de administración. Todas las rutas exigen ADMIN_PASSWORD.
import {
  codigos, votos, exigirAdmin, json, error, leerJSON, todosLosVotos, agregar,
  nuevoCodigo, formatoCodigo, codigosObligatorios, CATEGORIAS, IDS,
  sorteo, PREMIO, formatoNumero, resultadoSorteo, todasLasPapeletas, clavePersona, nombreCorto,
} from "../lib/comun.mjs";
import { randomInt } from "node:crypto";

const conDatos = (lista, papeletas) => {
  const porNumero = new Map(papeletas.map((p) => [p.numero, p]));
  return lista.map((g) => {
    const p = porNumero.get(g.numero) || {};
    return { numero: formatoNumero(g.numero), nombre: p.nombre || "(datos borrados)", apellidos: p.apellidos || "", menor14: !!p.menor14, publicado: g.etiqueta || "" };
  });
};

export const config = { path: "/api/admin/*" };

const csvCelda = (v) => {
  const s = String(v ?? "");
  return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
// Separador ";" y BOM para que Excel en español lo abra bien.
const csv = (filas) => "﻿" + filas.map((f) => f.map(csvCelda).join(";")).join("\r\n");
const descarga = (texto, nombre) =>
  new Response(texto, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nombre}"`,
      "cache-control": "no-store",
    },
  });

async function listarCodigos() {
  const store = codigos();
  const { blobs } = await store.list();
  const out = [];
  for (let i = 0; i < blobs.length; i += 25) {
    const lote = await Promise.all(blobs.slice(i, i + 25).map(async (b) => ({
      codigo: b.key, ...(await store.get(b.key, { type: "json" })),
    })));
    out.push(...lote);
  }
  return out.sort((a, b) => (a.creado || "").localeCompare(b.creado || "") || a.codigo.localeCompare(b.codigo));
}

export default async (req) => {
  const denegado = await exigirAdmin(req);
  if (denegado) return denegado;

  const ruta = new URL(req.url).pathname.replace("/api/admin/", "");
  const hoy = new Date().toISOString().slice(0, 10);

  try {
    if (ruta === "resultados" && req.method === "GET") {
      const lista = await todosLosVotos();
      const res = agregar(lista);
      let cods = null;
      if (codigosObligatorios()) {
        const c = await listarCodigos();
        cods = { total: c.length, usados: c.filter((x) => x.usado).length };
      }
      return json({ ok: true, ...res, codigos: cods, modoCodigos: codigosObligatorios() });
    }

    if (ruta === "csv/resumen" && req.method === "GET") {
      const r = agregar(await todosLosVotos());
      const filas = [["Puesto", "Categoría", "Monedas", "Porcentaje", "Jugadas con 0 monedas"]];
      for (const c of r.ranking) filas.push([c.puesto, c.nombre, c.monedas, String(c.porcentaje).replace(".", ","), c.sinMonedas]);
      filas.push([]);
      filas.push(["Participantes", r.participantes]);
      filas.push(["Monedas totales", r.monedasTotales]);
      filas.push(["Fecha de exportación", hoy]);
      return descarga(csv(filas), `san-miguel-joven-resumen-${hoy}.csv`);
    }

    if (ruta === "csv/jugadas" && req.method === "GET") {
      const lista = await todosLosVotos();
      // Orden aleatorio estable no necesario: se ordena por fecha y reparto,
      // sin ningún identificador que permita relacionar jugadas y códigos.
      lista.sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));
      const filas = [["Fecha", ...CATEGORIAS.map((c) => c.nombre)]];
      for (const v of lista) filas.push([v.fecha || "", ...IDS.map((id) => v.reparto[id] ?? 0)]);
      return descarga(csv(filas), `san-miguel-joven-jugadas-anonimas-${hoy}.csv`);
    }

    if (ruta === "codigos" && req.method === "GET") {
      const lista = await listarCodigos();
      return json({ ok: true, codigos: lista.map((c) => ({ codigo: formatoCodigo(c.codigo), usado: !!c.usado, creado: c.creado })) });
    }

    if (ruta === "codigos/csv" && req.method === "GET") {
      const lista = await listarCodigos();
      const filas = [["Código", "Estado", "Creado"]];
      for (const c of lista) filas.push([formatoCodigo(c.codigo), c.usado ? "Usado" : "Libre", c.creado || ""]);
      return descarga(csv(filas), `san-miguel-joven-codigos-${hoy}.csv`);
    }

    if (ruta === "codigos" && req.method === "POST") {
      const cuerpo = await leerJSON(req);
      const n = Number(cuerpo?.cantidad);
      if (!Number.isInteger(n) || n < 1 || n > 500) return error(400, "cantidad", "Indica una cantidad entre 1 y 500.");
      const store = codigos();
      const nuevos = [];
      while (nuevos.length < n) {
        const c = nuevoCodigo();
        if (nuevos.includes(c)) continue;
        const r = await store.setJSON(c, { usado: false, creado: hoy }, { onlyIfNew: true });
        if (r && r.modified === false) continue; // ya existía, se genera otro
        nuevos.push(c);
      }
      return json({ ok: true, creados: nuevos.map(formatoCodigo) });
    }

    if (ruta === "borrar" && req.method === "POST") {
      const cuerpo = await leerJSON(req);
      if (cuerpo?.confirmacion !== "BORRAR") return error(400, "confirmacion", "Escribe BORRAR para confirmar.");
      const vs = votos();
      const { blobs } = await vs.list({ prefix: "v/" });
      for (const b of blobs) await vs.delete(b.key);
      let liberados = 0;
      if (cuerpo.liberarCodigos) {
        const cs = codigos();
        for (const c of await listarCodigos()) {
          if (c.usado) { await cs.setJSON(c.codigo, { usado: false, creado: c.creado }); liberados++; }
        }
      }
      return json({ ok: true, borrados: blobs.length, liberados });
    }

    // ---------- Sorteo ----------
    if (ruta === "sorteo" && req.method === "GET") {
      const papeletas = await todasLasPapeletas();
      const r = await resultadoSorteo();
      return json({
        ok: true,
        premio: PREMIO(),
        papeletas: papeletas.length,
        personas: new Set(papeletas.map(clavePersona)).size,
        ultimas: papeletas.slice(-8).reverse().map((p) => ({ numero: formatoNumero(p.numero), nombre: `${p.nombre} ${p.apellidos.charAt(0)}.`, fecha: p.fecha?.slice(0, 10) })),
        resultado: r && {
          fecha: r.fecha, premio: r.premio, publicar: r.publicar || "numeros",
          ganadores: conDatos(r.ganadores, papeletas),
          suplentes: conDatos(r.suplentes, papeletas),
          totalPapeletas: r.totalPapeletas, totalPersonas: r.totalPersonas,
        },
      });
    }

    if (ruta === "sorteo/realizar" && req.method === "POST") {
      const cuerpo = await leerJSON(req);
      const premios = Number(cuerpo?.premios), suplentes = Number(cuerpo?.suplentes);
      if (!Number.isInteger(premios) || premios < 1 || premios > 100) return error(400, "premios", "Indica cuántos premios hay (1 a 100).");
      if (!Number.isInteger(suplentes) || suplentes < 0 || suplentes > 50) return error(400, "suplentes", "Indica cuántos suplentes quieres (0 a 50).");
      const publicar = cuerpo?.publicar === "nombres" ? "nombres" : "numeros";
      if (await resultadoSorteo()) return error(409, "hecho", "El sorteo ya está hecho. Anúlalo primero si necesitas repetirlo.");
      const papeletas = await todasLasPapeletas();
      if (!papeletas.length) return error(400, "vacio", "Todavía no hay papeletas.");

      // Cada papeleta tiene la misma probabilidad (más jugadas = más papeletas),
      // pero una misma persona solo puede salir una vez.
      const elegidos = [];
      const yaSalio = new Set();
      let bolsa = [...papeletas];
      while (elegidos.length < premios + suplentes && bolsa.length) {
        const p = bolsa[randomInt(bolsa.length)];
        elegidos.push({ numero: p.numero, etiqueta: nombreCorto(p) });
        yaSalio.add(clavePersona(p));
        bolsa = bolsa.filter((x) => !yaSalio.has(clavePersona(x)));
      }
      const resultado = {
        fecha: new Date().toISOString(), premio: PREMIO(), publicar,
        ganadores: elegidos.slice(0, premios), suplentes: elegidos.slice(premios),
        totalPapeletas: papeletas.length, totalPersonas: new Set(papeletas.map(clavePersona)).size,
      };
      const w = await sorteo().setJSON("resultado", resultado, { onlyIfNew: true });
      if (w && w.modified === false) return error(409, "hecho", "El sorteo ya está hecho.");
      return json({ ok: true });
    }

    if (ruta === "sorteo/publicacion" && req.method === "POST") {
      const cuerpo = await leerJSON(req);
      const r = await resultadoSorteo();
      if (!r) return error(400, "sin_sorteo", "Todavía no se ha hecho el sorteo.");
      r.publicar = cuerpo?.publicar === "nombres" ? "nombres" : "numeros";
      await sorteo().setJSON("resultado", r);
      return json({ ok: true, publicar: r.publicar });
    }

    if (ruta === "sorteo/anular" && req.method === "POST") {
      const cuerpo = await leerJSON(req);
      if (cuerpo?.confirmacion !== "ANULAR") return error(400, "confirmacion", "Escribe ANULAR para confirmar.");
      await sorteo().delete("resultado");
      return json({ ok: true });
    }

    if (ruta === "sorteo/csv" && req.method === "GET") {
      const papeletas = await todasLasPapeletas();
      const r = await resultadoSorteo();
      const estado = new Map();
      r?.ganadores.forEach((g, i) => estado.set(g.numero, `Ganador ${i + 1}`));
      r?.suplentes.forEach((g, i) => estado.set(g.numero, `Suplente ${i + 1}`));
      const filas = [["Número", "Nombre", "Apellidos", "Menor de 14", "Fecha", "Resultado"]];
      for (const p of papeletas) {
        filas.push([formatoNumero(p.numero), p.nombre, p.apellidos, p.menor14 ? "Sí" : "No", (p.fecha || "").slice(0, 10), estado.get(p.numero) || ""]);
      }
      return descarga(csv(filas), `san-miguel-joven-sorteo-${hoy}.csv`);
    }

    if (ruta === "sorteo/borrar" && req.method === "POST") {
      const cuerpo = await leerJSON(req);
      if (cuerpo?.confirmacion !== "BORRAR") return error(400, "confirmacion", "Escribe BORRAR para confirmar.");
      const s = sorteo();
      const { blobs } = await s.list();
      // Se conserva "resultado" (solo números) para que siga publicado en la web.
      for (const b of blobs) if (b.key !== "resultado") await s.delete(b.key);
      return json({ ok: true, borrados: blobs.filter((b) => b.key.startsWith("p/")).length });
    }

    return error(404, "ruta", "Ruta no encontrada.");
  } catch (e) {
    console.error(e);
    return error(500, "servidor", "Error al acceder a los datos guardados.");
  }
};
