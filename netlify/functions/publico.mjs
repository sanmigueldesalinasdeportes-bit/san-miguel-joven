// API pública: configuración, código, envío de jugada y sorteo.
import {
  codigos, votos, sorteo, codigosObligatorios, json, error, leerJSON,
  normalizarCodigo, validarReparto, nuevoId, IDS,
  PREMIO, formatoNumero, resultadoSorteo, siguienteNumero, validarParticipante,
} from "../lib/comun.mjs";

export const config = {
  path: ["/api/config", "/api/codigo", "/api/votar", "/api/sorteo/apuntarse", "/api/sorteo/resultado"],
};

async function estadoCodigo(codigo) {
  if (!codigo) return { estado: "invalido" };
  const res = await codigos().getWithMetadata(codigo, { type: "json" });
  if (!res || !res.data) return { estado: "invalido" };
  return { estado: res.data.usado ? "usado" : "libre", datos: res.data, etag: res.etag };
}

const MENSAJES = {
  invalido: "Ese código no existe. Revisa que esté bien escrito.",
  usado: "Ese código ya se ha usado para enviar una jugada.",
};

function resultadoPublico(r) {
  if (!r) return { realizado: false };
  // Número y, si el admin lo eligió, nombre con inicial ("Leo R."). Nunca apellidos completos.
  const pub = (g) => ({ numero: formatoNumero(g.numero), nombre: r.publicar === "nombres" ? g.etiqueta || "" : "" });
  return {
    realizado: true,
    fecha: r.fecha,
    premio: r.premio,
    ganadores: r.ganadores.map(pub),
    suplentes: r.suplentes.map(pub),
  };
}

export default async (req) => {
  const ruta = new URL(req.url).pathname;

  try {
    if (ruta === "/api/config" && req.method === "GET") {
      const r = await resultadoSorteo();
      return json({ ok: true, codigos: codigosObligatorios(), categorias: IDS, premio: PREMIO(), sorteoAbierto: !r, sorteo: resultadoPublico(r) });
    }
    if (ruta === "/api/sorteo/resultado" && req.method === "GET") {
      return json({ ok: true, ...resultadoPublico(await resultadoSorteo()) });
    }

    if (req.method !== "POST") return error(405, "metodo", "Método no permitido.");
    const cuerpo = await leerJSON(req);
    if (!cuerpo) return error(400, "formato", "No se ha podido leer la petición.");

    if (ruta === "/api/codigo") {
      if (!codigosObligatorios()) return json({ ok: true, estado: "libre" });
      const { estado } = await estadoCodigo(normalizarCodigo(cuerpo.codigo));
      if (estado !== "libre") return error(estado === "usado" ? 409 : 404, estado, MENSAJES[estado]);
      return json({ ok: true, estado });
    }

    if (ruta === "/api/votar") {
      const v = validarReparto(cuerpo.reparto);
      if (!v.ok) return error(400, "reparto", v.mensaje);

      if (codigosObligatorios()) {
        const codigo = normalizarCodigo(cuerpo.codigo);
        const est = await estadoCodigo(codigo);
        if (est.estado !== "libre") return error(est.estado === "usado" ? 409 : 404, est.estado, MENSAJES[est.estado]);
        const r = await codigos().setJSON(
          codigo,
          { ...est.datos, usado: true, usadoEn: new Date().toISOString().slice(0, 10) },
          est.etag ? { onlyIfMatch: est.etag } : undefined
        );
        if (r && r.modified === false) return error(409, "usado", MENSAJES.usado);
      }

      // La jugada se guarda con id aleatorio, sin datos personales.
      await votos().setJSON(`v/${nuevoId()}`, { reparto: v.reparto, fecha: new Date().toISOString().slice(0, 10) });

      // Pase de un solo uso para pedir UNA papeleta. No guarda relación con la jugada.
      let pase = null;
      if (!(await resultadoSorteo())) {
        pase = nuevoId();
        await sorteo().setJSON(`t/${pase}`, { usado: false });
      }
      return json({ ok: true, pase });
    }

    if (ruta === "/api/sorteo/apuntarse") {
      if (await resultadoSorteo()) return error(409, "cerrado", "El sorteo ya se ha hecho, así que no se pueden añadir más papeletas.");
      const pase = typeof cuerpo.pase === "string" && /^[0-9a-f-]{36}$/.test(cuerpo.pase) ? cuerpo.pase : "";
      const s = sorteo();
      const t = pase ? await s.getWithMetadata(`t/${pase}`, { type: "json" }) : null;
      if (!t || !t.data || t.data.usado) return error(410, "pase", "Esta jugada ya tiene su papeleta. Envía otra jugada para conseguir otra.");

      const d = validarParticipante(cuerpo.datos);
      if (!d.ok) return error(400, "datos", d.mensaje);

      const w = await s.setJSON(`t/${pase}`, { usado: true }, t.etag ? { onlyIfMatch: t.etag } : undefined);
      if (w && w.modified === false) return error(410, "pase", "Esta jugada ya tiene su papeleta.");

      let numero;
      for (let i = 0; i < 5; i++) {
        numero = await siguienteNumero();
        const p = await s.setJSON(`p/${formatoNumero(numero).padStart(6, "0")}`, {
          numero, ...d.datos, fecha: new Date().toISOString(),
        }, { onlyIfNew: true });
        if (!p || p.modified !== false) break;
      }

      return json({ ok: true, numero: formatoNumero(numero) });
    }

    return error(404, "ruta", "Ruta no encontrada.");
  } catch (e) {
    console.error(e);
    return error(500, "servidor", "No hemos podido guardar los datos. Inténtalo de nuevo en un momento.");
  }
};
