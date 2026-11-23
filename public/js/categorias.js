// Las ocho casillas del tablero. Los "id" deben coincidir con netlify/lib/comun.mjs
const s = (d) => `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

export const CATEGORIAS = [
  {
    id: "viajes",
    nombre: "Viajes y Excursiones",
    desc: "Escapadas de un día, rutas y viajes con tu grupo.",
    color: "#2D8FD5", tinta: "#FFFFFF",
    icono: s('<rect x="8" y="8" width="32" height="27" rx="5"/><path d="M8 24h32M15 15h18"/><circle cx="15" cy="39" r="3"/><circle cx="33" cy="39" r="3"/>'),
  },
  {
    id: "conciertos",
    nombre: "Conciertos y Festivales",
    desc: "Música en directo, festivales y noches para darlo todo.",
    color: "#D6336C", tinta: "#FFFFFF",
    icono: s('<rect x="18" y="5" width="12" height="21" rx="6"/><path d="M11 21a13 13 0 0 0 26 0M24 34v8M17 42h14"/>'),
  },
  {
    id: "deportes",
    nombre: "Deportes, Salud y Aventuras",
    desc: "Torneos, kayak, escalada, rutas y retos al aire libre.",
    color: "#25964A", tinta: "#FFFFFF",
    icono: s('<path d="M4 41 18 18l7 10 6-8 13 21Z"/><path d="M31 21V7l8 3.5-8 3.5"/>'),
  },
  {
    id: "talleres",
    nombre: "Talleres Creativos",
    desc: "Graffiti, foto, música, cocina, diseño… crea algo tuyo.",
    color: "#F28C28", tinta: "#14274A",
    icono: s('<path d="M31 5 43 17 25 35l-6-6Z"/><path d="M19 30c-6 0-9 4-9 8 0 2-2 4-4 4 7 2 17 0 17-8"/>'),
  },
  {
    id: "terror",
    nombre: "Juegos y Experiencias de Terror",
    desc: "Escape rooms, pasajes del terror y noches de misterio.",
    color: "#6B3FA0", tinta: "#FFFFFF",
    icono: s('<path d="M10 42V22a14 14 0 0 1 28 0v20l-5-4-4.5 4-4.5-4-4.5 4-4.5-4Z"/><path d="M19 21v3M29 21v3"/>'),
  },
  {
    id: "cultura",
    nombre: "Actividades Culturales",
    desc: "Teatro, cine, museos, exposiciones y patrimonio.",
    color: "#8A5A2E", tinta: "#FFFFFF",
    icono: s('<path d="M6 18 24 7l18 11Z"/><path d="M11 23v13M19 23v13M29 23v13M37 23v13M6 41h36"/>'),
  },
  {
    id: "encuentros",
    nombre: "Encuentros con jóvenes de otros municipios",
    desc: "Conocer a gente de tu edad de otros pueblos y ciudades.",
    color: "#E03131", tinta: "#FFFFFF",
    icono: s('<path d="M14 27s-8-7-8-13a8 8 0 0 1 16 0c0 6-8 13-8 13Z"/><circle cx="14" cy="14" r="2.5"/><path d="M34 43s-8-7-8-13a8 8 0 0 1 16 0c0 6-8 13-8 13Z"/><circle cx="34" cy="30" r="2.5"/><path d="M15 33c1 6 5 9 9 9" stroke-dasharray="1 5"/>'),
  },
  {
    id: "espacios",
    nombre: "Espacios Juveniles",
    desc: "Sitios propios para quedar, crear y pasar el rato.",
    color: "#F2C200", tinta: "#14274A",
    icono: s('<path d="M6 22 24 8l18 14v20H6Z"/><path d="M15 42v-9a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9M15 36h18"/>'),
  },
];

export const TOTAL = 100;
