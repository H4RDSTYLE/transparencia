"use strict";

/* TransparenciaCyL - main.js
   - Dashboards de contratos, subvenciones y altos cargos
   - Panel de conclusiones y toma de decisiones (tablas ordenables + CSV)
   - Buscador en vivo contra la API de datos abiertos */

const DATA = "data/";
const API = "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets/";

const fmtN = (n) => (n == null ? "–" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: 0 }));
const fmtE = (n) => (n == null ? "–" : "€ " + Number(n).toLocaleString("es-ES", { maximumFractionDigits: 0 }));
const fmtE2 = (n) => (n == null ? "–" : "€ " + Number(n).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtVal = (n) => (n == null ? "–" : Number(n).toLocaleString("es-ES", { maximumFractionDigits: 2 }));
const fmtM = (n) => {
  if (n == null) return "–";
  const v = Number(n);
  return v >= 1e9 ? (v / 1e9).toLocaleString("es-ES", { maximumFractionDigits: 2 }) + " mil M€"
    : v >= 1e6 ? (v / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " M€"
    : "€ " + v.toLocaleString("es-ES", { maximumFractionDigits: 0 });
};
const pct1 = (p) => (p == null ? "–" : p.toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " %");
const pct0 = (p) => (p == null ? "–" : (Math.round(p * 10) / 10).toLocaleString("es-ES") + " %");

const charts = {};
function mk(id, opt) {
  const c = echarts.init(document.getElementById(id));
  charts[id] = c;
  c.setOption(opt);
}
const resizeAll = () => Object.values(charts).forEach((c) => c.resize());

/* ---------- carga de ficheros JSON ---------- */
function load() {
  const files = [
    "c_kpi", "c_por_tipo", "c_por_tipo_contrato", "c_por_organo", "c_por_anio", "c_por_provincia",
    "s_kpi", "s_por_anio", "s_por_instrumento", "s_por_organo", "s_top_beneficiarios",
    "altos_cargos", "poblacion_prov",
  ];
  const ts = Date.now();
  return Promise.all(files.map((f) => fetch(DATA + f + ".json?v=" + ts).then((r) => r.json()).then((d) => [f, d])))
    .then((pairs) => Object.fromEntries(pairs));
}

function initTabs() {
  document.querySelectorAll("#tabs .tab").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#tabs .tab").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      b.classList.add("active");
      document.getElementById("tab-" + b.dataset.tab).classList.add("active");
      resizeAll();
    });
  });
}

/* ---------- KPIs ---------- */
function buildKPIs(D) {
  const tot = D.poblacion_prov.reduce((s, r) => s + (+r.poblacion || 0), 0);
  const kpis = [
    ["Importe adjudicado en contratos", fmtM(D.c_kpi.importe), fmtN(D.c_kpi.contratos) + " contratos"],
    ["Subvenciones concedidas (importe)", fmtM(D.s_kpi.importe), "cobertura 2018 → 2022 (registro publicado)"],
    ["Adjudicación por habitante", fmtE(D.c_kpi.importe / tot), "contratos ÷ población de CyL"],
    ["Subvenciones por habitante", fmtE(D.s_kpi.importe / tot), "subvenciones ÷ población de CyL"],
    ["Altos cargos con nombramiento", fmtN((D.altos_cargos || []).filter((r) => r.fechaposesion).length), "posesionados; el resto son concursos/vacantes"],
  ];
  document.getElementById("kpis").innerHTML = kpis
    .map(([l, v, s]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`)
    .join("");
}

/* ---------- Conclusiones ---------- */
function buildConclusiones(D) {
  const tot = D.poblacion_prov.reduce((s, r) => s + (+r.poblacion || 0), 0);

  // Concentración de la contratación en los top-5 órganos (disponibles top-20)
  const org5 = D.c_por_organo.slice(0, 5);
  const importeOrg5 = org5.reduce((s, r) => s + (+r.importe || 0), 0);
  const pctOrg5 = D.c_kpi.importe ? (importeOrg5 / D.c_kpi.importe) * 100 : 0;

  // Concentración de subvenciones en los top-5 beneficiarios
  const ben5 = D.s_top_beneficiarios.slice(0, 5);
  const importeBen5 = ben5.reduce((s, r) => s + (+r.importe || 0), 0);
  const pctBen5 = D.s_kpi.importe ? (importeBen5 / D.s_kpi.importe) * 100 : 0;
  const anonBen = ben5.filter((r) => String(r.nombre_razon_social) === "***").length;

  // Fragmentación de la contratación: menores frente a procedimientos abiertos
  const porTipo = {};
  D.c_por_tipo.forEach((r) => { porTipo[r.tipo] = { importe: +r.importe || 0, n: +r.n || 0 }; });
  const menores = porTipo["Menores"] || { importe: 0, n: 0 };
  const restoN = D.c_kpi.contratos - menores.n;
  const pctMenoresN = D.c_kpi.contratos ? (menores.n / D.c_kpi.contratos) * 100 : 0;
  const pctMenoresI = D.c_kpi.importe ? (menores.importe / D.c_kpi.importe) * 100 : 0;

  // Instrumento dominante de subvenciones
  const instr1 = D.s_por_instrumento[0];
  const pctInstr = D.s_kpi.importe && instr1 ? (instr1.importe / D.s_kpi.importe) * 100 : 0;

  // Evolución y concentración temporal
  const ca = D.c_por_anio.filter((x) => x.anio !== "None").map((x) => ({ anio: String(x.anio), importe: +x.importe || 0, n: +x.n || 0 }));
  const anyoMaxC = ca.reduce((a, b) => (b.importe > a.importe ? b : a), ca[0]);
  const sMax = D.s_por_anio.reduce((a, b) => (b.importe > a.importe ? b : a), D.s_por_anio[0]);

  const cards = [
    {
      t: "Adjudicación per cápita",
      b: `En el conjunto del periodo la contratación pública registrada acumula ${fmtM(D.c_kpi.importe)},`,
      p: `unos €${fmtN(Math.round((D.c_kpi.importe / tot) * 10) / 10)} por habitante en total (CyL: ${fmtN(tot)} hab.). Para un término medio anual, divida por los años de cobertura del agregado (2019→2026).`,
    },
    {
      t: "Concentración de la contratación",
      b: `Los 5 órganos con más importe acaparan el ${pct1(pctOrg5)} de todo lo adjudicado`,
      p: `(${fmtM(importeOrg5)} de ${fmtM(D.c_kpi.importe)}). Ranking completo y descargable en la pestaña Decisiones.`,
    },
    {
      t: "Fragmentación del gasto",
      b: `Los contratos menores representan el ${pct1(pctMenoresN)} del número de contratos del agregado`,
      p: `pero solo el ${pct1(pctMenoresI)} del importe (${fmtN(menores.n)} contratos por ${fmtM(menores.importe)}). Es un registro alto en número y bajo en cuantía: útil para auditar posibles fraccionamientos.`,
    },
    {
      t: "Concentración de las subvenciones",
      b: `Los 5 mayores beneficiarios acumulan el ${pct1(pctBen5)} del importe concedido`,
      p: `${anonBen ? "El primer registro es «" + lblBeneficiario(ben5[0]) + "», el agregado que la propia fuente publica anonimizado por protección de datos, " : ""}el instrumento dominante es ${instr1 ? instr1.instrumento_de_ayuda.toLowerCase() : "—"} (${pct1(pctInstr)} del importe).`,
    },
    {
      t: "Evolución anual",
      b: `El mayor importe anual adjudicado en contratos fue ${anyoMaxC ? anyoMaxC.anio : "—"} (${fmtM(anyoMaxC ? anyoMaxC.importe : 0)})`,
      p: `mientras que en subvenciones el pico fue ${sMax.anio} (${fmtM(sMax.importe)}). Subvenciones: registro publicado 2018 → 2022 (2022 parcial, termina en 2022-03-31).`,
    },
    {
      t: "Cobertura y advertencias",
      b: "Contratos: agregado anual 2019 → 2026 (2018 solo 2 registros, anecdótico). Subvenciones: 2018 → 2022.",
      p: "Dos registros muy desiguales: contraste los importes y evite comparar años fuera de cobertura. Los importes incluyen partidas consolidadas de los propios órganos.",
    },
  ];
  document.getElementById("concl-res").innerHTML = cards
    .map((c) => `<div class="concl-card"><div class="concl-t">${c.t}</div><div class="concl-b">${c.b}</div><div class="concl-p">${c.p}</div></div>`)
    .join("");
}

/* ---------- Decisiones (tabla ordenable + CSV) ---------- */
const anonEtiqueta = "***";
const lblBeneficiario = (x) => String(x.nombre_razon_social) === anonEtiqueta ? "Datos anonimizados (protección de datos)" : String(x.nombre_razon_social);

function makeSortable(bodyId, theadSel, rows, keys, numKeys, cellFmt) {
  const tbody = document.getElementById(bodyId);
  const theads = document.querySelectorAll(theadSel + " th");
  let keyIndex = 0, asc = true;
  const render = () => {
    const k = keys[keyIndex];
    const sorted = [...rows].sort((a, b) => {
      const va = a[k], vb = b[k];
      if (numKeys.includes(k)) return asc ? va - vb : vb - va;
      return asc ? String(va).localeCompare(String(vb), "es") : String(vb).localeCompare(String(va), "es");
    });
    tbody.innerHTML = sorted.map((r) => `<tr>${keys.map((kk) => {
      const cell = cellFmt ? cellFmt(r, kk) : r[kk];
      return `<td class="${numKeys.includes(kk) ? "num" : ""}">${cell}</td>`;
    }).join("")}</tr>`).join("");
  };
  theads.forEach((th, i) => {
    th.style.cursor = "pointer";
    th.addEventListener("click", () => {
      if (keyIndex === i) asc = !asc; else { keyIndex = i; asc = true; }
      theads.forEach((x) => x.classList.remove("sorted"));
      th.classList.add("sorted");
      render();
    });
  });
  render();
  return { rows, sortBy: (k, a = false) => { keyIndex = keys.indexOf(k); asc = a; render(); } };
}

function buildDecisiones(D) {
  const tot = D.poblacion_prov.reduce((s, r) => s + (+r.poblacion || 0), 0);
  document.getElementById("kpis-dec").innerHTML = [
    ["Adjudicación por habitante (contratos)", fmtE(D.c_kpi.importe / tot), "CyL: " + fmtN(tot) + " hab."],
    ["Subvenciones por habitante", fmtE(D.s_kpi.importe / tot), "cobertura 2018→2022"],
    ["Importe medio por contrato", fmtE(D.c_kpi.importe / D.c_kpi.contratos), fmtN(D.c_kpi.contratos) + " contratos registrados"],
  ].map(([l, v, s]) => `<div class="kpi"><div class="label">${l}</div><div class="value">${v}</div><div class="sub">${s}</div></div>`).join("");

  const orgRows = D.c_por_organo.map((r) => ({
    organo: r.organo, importe: +r.importe || 0, n: +r.n || 0,
    medio: r.n ? r.importe / r.n : 0,
    pct: D.c_kpi.importe ? (r.importe / D.c_kpi.importe) * 100 : 0,
  }));
  makeSortable("t-org-body", "#t-org", orgRows, ["organo", "importe", "n", "medio", "pct"], ["importe", "n", "medio", "pct"],
    (r, k) => k === "organo" ? r.organo : k === "importe" ? fmtM(r.importe) : k === "n" ? fmtN(r.n) : k === "medio" ? fmtE(r.medio) : pct1(r.pct));
  document.getElementById("csv-org").addEventListener("click", () => {
    const tsv = [["Órgano", "Importe (€)", "Nº contratos", "Importe medio (€)", "% del total"]]
      .concat(orgRows.map((r) => [r.organo, r.importe, r.n, r.medio, r.pct]));
    downloadTSV("organos_contratacion.tsv", tsv);
  });

  const benRows = D.s_top_beneficiarios.map((r) => ({
    nombre: lblBeneficiario(r), importe: +r.importe || 0, n: +r.n || 0,
    pct: D.s_kpi.importe ? (r.importe / D.s_kpi.importe) * 100 : 0,
  }));
  makeSortable("t-ben-body", "#t-ben", benRows, ["nombre", "importe", "n", "pct"], ["importe", "n", "pct"],
    (r, k) => k === "nombre" ? r.nombre : k === "importe" ? fmtM(r.importe) : k === "n" ? fmtN(r.n) : pct1(r.pct));
  document.getElementById("csv-ben").addEventListener("click", () => {
    const tsv = [["Beneficiario", "Importe (€)", "Nº subvenciones", "% del total"]]
      .concat(benRows.map((r) => [r.nombre, r.importe, r.n, r.pct]));
    downloadTSV("beneficiarios_subvenciones.tsv", tsv);
  });
}

function downloadTSV(filename, rows) {
  const tsv = rows.map((r) => r.map((c) => {
    const s = String(c == null ? "" : c);
    return s.indexOf("\t") >= 0 || s.indexOf("\n") >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join("\t")).join("\r\n");
  const blob = new Blob(["\uFEFF" + tsv], { type: "text/tab-separated-values;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- contratos ---------- */
const anyosContratos = (D) => D.c_por_anio.filter((x) => x.anio !== "None").map((x) => ({ anio: String(x.anio), importe: +x.importe || 0, n: +x.n || 0 }));

function initContratos(D) {
  const ca = anyosContratos(D);

  mk("ch-c-proc", {
    tooltip: { trigger: "item", formatter: (p) => p.name + "<br>" + fmtM(p.value) + "<br>" + fmtN(p.data.n) + " contratos" },
    legend: { type: "scroll", bottom: 0 },
    series: [{
      type: "pie", radius: ["30%", "68%"], center: ["50%", "46%"],
      data: D.c_por_tipo.map((x) => ({ name: x.tipo, value: x.importe, n: x.n })),
    }],
  });

  const tipoRev = D.c_por_tipo_contrato.map((x) => x.importe).reverse();
  const tipoMax = Math.max(...tipoRev);
  mk("ch-c-tipo", {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmtE2(v) },
    grid: { left: 140, right: 80, top: 12, bottom: 24, containLabel: true },
    xAxis: { type: "value", min: 0, max: tipoMax ? Math.round(tipoMax * 1.18) : null, axisLabel: { formatter: (v) => fmtM(v), hideOverlap: true } },
    yAxis: { type: "category", data: D.c_por_tipo_contrato.map((x) => x.tipo).reverse(), axisLabel: { width: 130, overflow: "truncate" } },
    series: [{ type: "bar", data: tipoRev, itemStyle: { color: "#0b5394" }, label: { show: true, position: "right", formatter: (p) => fmtM(p.value) } }],
  });

  const org10 = D.c_por_organo.slice(0, 10).reverse();
  mk("ch-c-organo", {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmtE2(v) },
    grid: { left: 40, right: 120, top: 12, bottom: 60, containLabel: true },
    xAxis: { type: "category", data: org10.map((x) => x.organo.replace(/Consejería de /gi, "").slice(0, 32)), axisLabel: { rotate: 30, fontSize: 9, interval: 0 } },
    yAxis: { type: "value", axisLabel: { formatter: (v) => fmtM(v) } },
    series: [{ type: "bar", data: org10.map((x) => x.importe), itemStyle: { color: "#c8511a" }, label: { show: true, position: "top", formatter: (p) => fmtM(p.value), fontSize: 9 } }],
  });

  mk("ch-ca-anio", {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps) => ps[0].axisValue + "<br>" + fmtM(ps[0].value) + "<br>" + fmtN(ps[0].data.n) + " contratos" },
    grid: { left: 70, right: 20, top: 14, bottom: 28 },
    xAxis: { type: "category", data: ca.map((x) => x.anio) },
    yAxis: { type: "value", axisLabel: { formatter: (v) => fmtM(v) } },
    series: [{ type: "bar", data: ca.map((x) => ({ value: x.importe, n: x.n })), itemStyle: { color: "#0b5394" }, label: { show: true, position: "top", formatter: (p) => fmtM(p.value), fontSize: 9 } }],
  });

  mk("ch-c-anio-2", {
    tooltip: { trigger: "axis" },
    grid: { left: 70, right: 20, top: 14, bottom: 28 },
    xAxis: { type: "category", data: ca.map((x) => x.anio) },
    yAxis: { type: "value", name: "contratos", axisLabel: { formatter: (v) => fmtN(v) } },
    series: [{ type: "line", smooth: true, data: ca.map((x) => x.n), itemStyle: { color: "#c8511a" }, areaStyle: { opacity: 0.12 } }],
  });

  // Adjudicación por habitante en cada provincia (importe territorializado ÷ padrón).
  const pob = Object.fromEntries(D.poblacion_prov.map((x) => [String(x.provincia).toUpperCase(), +x.poblacion || 0]));
  const provs = (D.c_por_provincia || []).filter((x) => x.provincia !== "No territorializado");
  const habData = provs
    .map((x) => ({ provincia: x.provincia, hab: x.importe / (pob[String(x.provincia).toUpperCase()] || 1) }))
    .filter((x) => Number.isFinite(x.hab) && x.hab > 0)
    .sort((a, b) => b.hab - a.hab);
  mk("ch-c-prov", {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmtE2(v) },
    grid: { left: 90, right: 160, top: 12, bottom: 24, containLabel: true },
    xAxis: { type: "value", axisLabel: { formatter: (v) => fmtE(v), hideOverlap: true } },
    yAxis: { type: "category", data: habData.map((x) => x.provincia).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: "bar", data: habData.map((x) => x.hab).reverse(), itemStyle: { color: "#0b5394" }, barMaxWidth: 22, label: { show: true, position: "right", formatter: (p) => fmtE(p.value), fontSize: 9 } }],
  });
}

/* ---------- subvenciones ---------- */
function initSubvenciones(D) {
  mk("ch-s-instr", {
    tooltip: { trigger: "item", formatter: (p) => p.name + "<br>" + fmtM(p.value) + "<br>" + fmtN(p.data.n) + " subvenciones" },
    legend: { type: "scroll", bottom: 0 },
    series: [{
      type: "pie", radius: ["28%", "66%"], center: ["50%", "46%"],
      data: D.s_por_instrumento.map((x) => ({ name: x.instrumento_de_ayuda, value: x.importe, n: x.n })),
    }],
  });

  const org10 = D.s_por_organo.slice(0, 10).reverse();
  mk("ch-s-organo", {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmtE2(v) },
    grid: { left: 40, right: 120, top: 12, bottom: 60, containLabel: true },
    xAxis: { type: "category", data: org10.map((x) => x.organo_convocante.replace(/CONSEJERÍA DE /g, "").slice(0, 30)), axisLabel: { rotate: 30, fontSize: 9, interval: 0 } },
    yAxis: { type: "value", axisLabel: { formatter: (v) => fmtM(v) } },
    series: [{ type: "bar", data: org10.map((x) => x.importe), itemStyle: { color: "#c8511a" }, label: { show: true, position: "top", formatter: (p) => fmtM(p.value), fontSize: 9 } }],
  });

  const anon = "***";
  const nombreBen = (x) => String(x.nombre_razon_social) === anon ? "Datos anonimizados" : String(x.nombre_razon_social);
  const ben15 = [...D.s_top_beneficiarios].reverse();
  mk("ch-s-benef", {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => fmtE2(v) },
    grid: { left: 60, right: 160, top: 12, bottom: 24, containLabel: true },
    xAxis: { type: "value", axisLabel: { formatter: (v) => fmtM(v), hideOverlap: true } },
    yAxis: { type: "category", data: ben15.map(nombreBen).reverse(), axisLabel: { fontSize: 9, width: 130, overflow: "truncate" } },
    series: [{ type: "bar", data: ben15.map((x) => x.importe).reverse(), itemStyle: { color: "#2e7d32" }, label: { show: true, position: "right", formatter: (p) => fmtM(p.value), fontSize: 9 } }],
  });

  mk("ch-sa-anio", {
    tooltip: { trigger: "axis", formatter: (ps) => ps[0].axisValue + "<br>Importe: " + fmtM(ps[0].value) + "<br>Concesiones: " + fmtN(ps[0].data.n) },
    grid: { left: 70, right: 20, top: 14, bottom: 28 },
    xAxis: { type: "category", data: D.s_por_anio.map((x) => x.anio) },
    yAxis: { type: "value", axisLabel: { formatter: (v) => fmtM(v) } },
    series: [{ type: "bar", data: D.s_por_anio.map((x) => ({ value: x.importe, n: x.n })), itemStyle: { color: "#2e7d32" }, label: { show: true, position: "top", formatter: (p) => fmtM(p.value), fontSize: 9 } }],
  });
}

/* ---------- altos cargos ---------- */
const sanHTML = (h) => (h == null ? "" : String(h)
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  .replace(/javascript:/gi, ""));

function initAltos(D) {
  // Solo cargos con nombramiento publicado (fecha de posesión).
  // Sin fecha son ganadores de concurso o cargos vacantes: se excluyen.
  const todos = (D.altos_cargos || []).filter((r) => r.fechaposesion);
  const input = document.getElementById("busq-altos");
  const clear = document.getElementById("btn-altos-clear");
  const lista = document.getElementById("altos-lista");
  const ficha = document.getElementById("altos-ficha");
  const table = document.getElementById("tabla-altos");

  const mostrarFicha = (id) => {
    const r = todos.find((x) => String(x.identificador) === String(id));
    if (!r) return;
    lista.style.display = "none";
    ficha.style.display = "block";
    const items = [];
    const add = (k, v) => { if (v) items.push(`<dt>${k}</dt><dd>${v}</dd>`); };
    if (r.fotografia) items.push(`<img class="cargo-foto" src="${r.fotografia}" alt="Foto de ${r.nombre || ""}" onerror="this.style.display='none'">`);
    add("Título", r.titulo);
    add("Directorio", r.directorio);
    add("Fecha de posesión", r.fechaposesion);
    add("Formación académica", sanHTML(r.formacionacademica));
    add("Experiencia profesional", sanHTML(r.experienciaprofesional));
    add("Lugar de nacimiento", (r.lugarnacimiento && String(r.lugarnacimiento).trim() !== "None") ? r.lugarnacimiento : "");
    if (r.curriculumlargo) items.push(`<dt>Biografía</dt><dd>${sanHTML(r.curriculumlargo)}</dd>`);
    ficha.innerHTML = `<button class="primary" id="volver-altos">← Volver a la lista</button>
      <h3 class="cargo-h">${r.nombre || "Cargo"}</h3>
      <dl class="cargo-dl">${items.join("")}</dl>
      ${r.enlace_al_contenido ? `<p class="cargo-link"><a href="${r.enlace_al_contenido}" target="_blank" rel="noopener">Ficha oficial en el portal del Gobierno de CyL ↗</a></p>` : ""}
      <div class="note">La fuente no publica retribuciones ni funciones del puesto; consulte la ficha oficial enlazada para esa información.</div>`;
    document.getElementById("volver-altos").addEventListener("click", () => {
      ficha.style.display = "none";
      lista.style.display = "block";
    });
  };

  const render = () => {
    const q = input.value.trim().toLowerCase();
    const filt = todos.filter((r) => {
      const hay = (r.nombre || "") + " " + (r.titulo || "") + " " + (r.directorio || "");
      return !q || hay.toLowerCase().indexOf(q) !== -1;
    });
    table.innerHTML = "<thead><tr><th>Nombre</th><th>Cargo</th><th>Directorio</th><th>Posesión</th><th></th></tr></thead>" +
      "<tbody>" + filt
      .map((r) => `<tr class="altos-fila" data-id="${r.identificador}">
        <td><b>${r.nombre || "–"}</b></td>
        <td>${r.titulo || "–"}</td>
        <td>${(r.directorio || "–").replace(/,+/g, ",")}</td>
        <td class="num">${r.fechaposesion || "–"}</td>
        <td><button class="btn-cv" data-id="${r.identificador}">Ver ficha ↗</button></td>
      </tr>`).join("") + "</tbody>";
    table.querySelectorAll("tr.altos-fila").forEach((tr) => {
      tr.addEventListener("click", () => mostrarFicha(tr.dataset.id));
    });
    table.querySelectorAll("button.btn-cv").forEach((b) => {
      b.addEventListener("click", (e) => { e.stopPropagation(); mostrarFicha(b.dataset.id); });
    });
  };
  input.addEventListener("input", render);
  clear.addEventListener("click", () => { input.value = ""; render(); });
  render();
}

/* ---------- buscador API ---------- */
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function fieldMaps() {
  return {
    "contratos-menores": {
      key: "codigo_expediente", fecha: "fecha_aprobacion_de_gasto", stron: "organo",
      adjud: "identidad_del_adjudicatario", imp: "presupuesto_de_adjudicacion_iva_incluido",
      nif: "nif_adjudicatario", enlace: "enlace_de_publicacion", tipo: "tipo_de_contrato",
      titulo: "titulo", etiqueta: "Contrato",
    },
    "contratos-ordinarios": {
      key: "codigo_contrato", fecha: "fecha_formalizacion", stron: "organo",
      adjud: "identidad_del_adjudicatario", imp: "presupuesto_de_adjudicacion_iva_incluido",
      nif: "nif_adjudicatario", enlace: "enlace_de_publicacion", tipo: "tipo_de_contrato",
      titulo: "titulo", etiqueta: "Contrato",
    },
    "subvenciones-concedidas": {
      key: "identificador", fecha: "fecha_de_la_concesion", stron: "organo_convocante",
      adjud: "nombre_razon_social", imp: "importe_concesion",
      nif: "nif_cif", enlace: null, tipo: "instrumento_de_ayuda",
      titulo: "titulo_descripcion", etiqueta: "Subvención",
    },
  };
}

const bbState = { ds: "", q: "", tipo: "", organo: "", offset: 0, size: 25, total: 0, sort: null, sortDir: 1 };

async function cargarOpcionesBB(ds) {
  const F = fieldMaps()[ds];
  if (!F) return;
  const cuentas = [
    [document.getElementById("bb-tipo"), F.tipo, F.etiqueta === "Subvención" ? "Instrumento" : "Tipo"],
    [document.getElementById("bb-organo"), F.stron, "Órgano"],
  ];
  for (const [sel, campo, etiqueta] of cuentas) {
    if (!sel) continue;
    sel.innerHTML = `<option value="">${etiqueta} (todos)</option>`;
    try {
      const url = API + ds + "/records?select=" + encodeURIComponent(campo) +
        "&group_by=" + encodeURIComponent(campo) + "&limit=100";
      const r = await fetch(url);
      const j = await r.json();
      const vistos = new Set();
      (j.results || []).forEach((x) => {
        const v = x[campo];
        if (v == null || vistos.has(v)) return;
        vistos.add(v);
        const o = document.createElement("option");
        o.value = v;
        o.textContent = v;
        sel.appendChild(o);
      });
    } catch (e) { /* el filtro queda vacío si la API falla */ }
  }
}

const BB_COLS = [
  { th: "Expediente", campo: "key", num: false },
  { th: "Tipo", campo: "tipo", num: false },
  { th: "Título", campo: "titulo", num: false },
  { th: "Órgano", campo: "stron", num: false },
  { th: "Importe", campo: "imp", num: true },
  { th: "Fecha", campo: "fecha", num: true },
  { th: "Adjudicatario / Beneficiario", campo: "adjud", num: false },
  { th: "CIF/NIF", campo: "nif", num: false },
];

function bbCabecera(F, sort, dir) {
  return `<thead><tr>` + BB_COLS.map((c, i) => {
    const activo = sort === i;
    const flecha = activo ? (dir === 1 ? " ▲" : " ▼") : "";
    const clas = (c.num ? "num " : "") + (activo ? "sorted" : "");
    return `<th class="${clas.trim()}" data-col="${i}" data-sortable>${c.th}${flecha}</th>`;
  }).join("") + `</tr></thead>`;
}

function bbCelda(txt, max) {
  const t = String(txt == null ? "" : txt).replace(/\s+/g, " ").trim();
  if (!t) return `<td>–</td>`;
  return t.length > max
    ? `<td class="ellip" title="${esc(t)}">${esc(t.slice(0, max))}…</td>`
    : `<td>${esc(t)}</td>`;
}

async function buscarBB(pageDelta) {
  const ds = document.getElementById("bb-base").value;
  const q = document.getElementById("bb-q").value.trim();
  const tipo = document.getElementById("bb-tipo").value;
  const organo = document.getElementById("bb-organo").value;
  const result = document.getElementById("bb-result");
  const resumo = document.getElementById("bb-resumo");
  const pageEl = document.getElementById("bb-page");
  const prev = document.getElementById("bb-prev");
  const next = document.getElementById("bb-next");

  // Búsqueda nueva o cambio de filtro/base -> página 1
  if (pageDelta == null) bbState.offset = 0;
  else bbState.offset = Math.max(0, bbState.offset + pageDelta * bbState.size);
  bbState.offset = Math.max(0, bbState.offset);

  if (!q && !tipo && !organo) {
    result.innerHTML = "";
    resumo.innerHTML = "";
    pageEl.innerHTML = "";
    prev.disabled = next.disabled = true;
    return;
  }

  const colSpan = BB_COLS.length;
  const F = fieldMaps()[ds];
  result.innerHTML = bbCabecera(F, null, 1) + `<tbody><tr><td colspan="${colSpan}" style="color:var(--muted)">Buscando…</td></tr></tbody>`;
  resumo.innerHTML = "…";
  prev.disabled = next.disabled = true;
  adjuntarSort(result);

  try {
    const term = q ? "search('" + q.replace(/'/g, " ") + "')" : "";
    const tipoF = tipo ? F.tipo + " = '" + String(tipo).replace(/'/g, "''") + "'" : "";
    const orgF = organo ? F.stron + " = '" + String(organo).replace(/'/g, "''") + "'" : "";
    const where = [term, tipoF, orgF].filter(Boolean).join(" AND ");

    const params = ["limit=" + bbState.size, "offset=" + bbState.offset, "include_appx=true"];
    if (where) params.push("where=" + encodeURIComponent(where));
    if (bbState.sort != null) {
      const campo = F[BB_COLS[bbState.sort].campo];
      params.push("order_by=" + encodeURIComponent(campo + (bbState.sortDir === -1 ? " desc" : " asc")));
    }
    const url = API + ds + "/records?" + params.join("&");
    const r = await fetch(url);
    const j = await r.json();
    const rows = j.results || [];
    const total = j.total_count || 0;
    bbState.total = total;

    if (!rows.length) {
      result.innerHTML = bbCabecera(F, bbState.sort, bbState.sortDir) +
        `<tbody><tr><td colspan="${colSpan}">Sin resultados para «${esc(q)}»${tipo ? " de tipo " + esc(tipo) : ""}</td></tr></tbody>`;
      resumo.innerHTML = `0 resultados`;
      pageEl.innerHTML = "";
      prev.disabled = next.disabled = true;
      adjuntarSort(result);
      return;
    }

    const ini = bbState.offset + 1;
    const fin = bbState.offset + rows.length;
    const paginas = Math.max(1, Math.ceil(total / bbState.size));
    const actual = Math.floor(bbState.offset / bbState.size) + 1;

    resumo.innerHTML = `<b>${fmtN(ini)}–${fmtN(fin)}</b> de <b>${fmtN(total)}</b> resultados`;
    pageEl.innerHTML = `Página <b>${actual}</b> de <b>${paginas}</b>`;
    prev.disabled = bbState.offset === 0;
    next.disabled = fin >= total;

    const cabecera = bbCabecera(F, bbState.sort, bbState.sortDir);
    result.innerHTML = cabecera + `<tbody>` +
      rows.map((x) => {
        const titulo = String(x[F.titulo] || "").trim() || String(x.titulo || x.titulo_descripcion || "").trim();
        const organoV = String(x[F.stron] || "");
        const adjud = String(x[F.adjud] || "");
        const fecha = x[F.fecha] ? String(x[F.fecha]).slice(0, 10) : "";
        return `<tr>
        <td>${esc(x[F.key] || "–")}</td>
        <td>${esc(x[F.tipo] || "–")}</td>
        ${bbCelda(titulo, 60)}
        ${bbCelda(organoV, 34)}
        <td class="num">${fmtE(x[F.imp])}</td>
        <td class="num nowrap">${fecha || "–"}</td>
        ${bbCelda(adjud, 40)}
        <td>${esc(x[F.nif] || "–")}</td>
      </tr>`;
      }).join("") + `</tbody>`;
    adjuntarSort(result);
  } catch (e) {
    result.innerHTML = bbCabecera(F, bbState.sort, bbState.sortDir) +
      `<tbody><tr><td colspan="${colSpan}" style="color:#c0392b">Error: ${esc(e.message)}</td></tr></tbody>`;
    adjuntarSort(result);
    resumo.innerHTML = "";
  }
}

function adjuntarSort(result) {
  result.querySelectorAll("th[data-sortable]").forEach((th) => {
    th.addEventListener("click", () => {
      const col = +th.dataset.col;
      if (bbState.sort === col) bbState.sortDir = -bbState.sortDir;
      else { bbState.sort = col; bbState.sortDir = 1; }
      bbState.offset = 0;
      buscarBB();
    });
  });
}

function init() {
  const loading = document.getElementById("loading");
  load()
    .then((D) => {
      buildKPIs(D);
      buildConclusiones(D);
      initContratos(D);
      initSubvenciones(D);
      buildDecisiones(D);
      initAltos(D);
      initTabs();
      document.getElementById("bb-btn").addEventListener("click", () => buscarBB());
      document.getElementById("bb-q").addEventListener("keydown", (e) => { if (e.key === "Enter") buscarBB(); });
      document.getElementById("bb-tipo").addEventListener("change", () => buscarBB());
      document.getElementById("bb-organo").addEventListener("change", () => buscarBB());
      document.getElementById("bb-base").addEventListener("change", () => { bbState.offset = 0; bbState.sort = null; cargarOpcionesBB(document.getElementById("bb-base").value); buscarBB(); });
      document.getElementById("bb-prev").addEventListener("click", () => buscarBB(-1));
      document.getElementById("bb-next").addEventListener("click", () => buscarBB(1));
      cargarOpcionesBB(document.getElementById("bb-base").value);
      loading.style.display = "none";
    })
    .catch((e) => {
      loading.innerHTML = "<div>Error al cargar los datos: " + e.message +
        "<br><br>Ejecuta primero <code>python scripts/fetch_data.py</code>.</div>";
    });
}

window.addEventListener("resize", resizeAll);
document.addEventListener("DOMContentLoaded", init);