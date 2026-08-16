# -*- coding: utf-8 -*-
"""
TransparenciaCyL - preprocesado de datos.

Descarga y agrega los conjuntos de datos de contratación pública,
subvenciones y altos cargos del Portal de Datos Abiertos de la Junta
de Castilla y León (API Opendatasoft) y genera los JSON que consume la
aplicación web estática (carpeta ../data).

Idempotente: si el fichero de salida ya existe, se salta esa etapa, de
modo que la ejecución puede retomarse tras un corte (rate-limit).

Ejecutar:  python fetch_data.py
"""

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://analisis.datosabiertos.jcyl.es/api/explore/v2.1/catalog/datasets"
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

PAUSE = 1.0          # segundos entre peticiones (evita throttling de la API)
_last = 0.0


def _pace():
    global _last
    now = time.time()
    dt = now - _last
    if dt < PAUSE:
        time.sleep(PAUSE - dt)
    _last = time.time()


def http_get(url, timeout=120):
    _pace()
    last = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            last = e
            cooldown = 2 ** attempt + 3 * (attempt + 1)
            if e.code == 429:
                retry = e.headers.get("Retry-After")
                if retry:
                    try:
                        cooldown = min(int(retry), 60)
                    except ValueError:
                        pass
            time.sleep(cooldown)
        except Exception as e:
            last = e
            time.sleep(2 ** attempt + 2)
    raise last


def records(dataset, select=None, group_by=None, where=None, limit=100, order_by=None):
    """Devuelve registros u agregaciones.
    Para group_by: una sola página (la API aplica limit/order_by en servidor),
    evitando paginar datos cuyo total real no se publica (rate-limit).
    Para consultas de agregación (sum/count en select) no se pagina: el
    total_count devuelto es el de los registros subyacentes y no hay páginas."""
    page = max(1, min(limit, 100))
    params = {"limit": str(page)}
    if select:
        params["select"] = select
    if group_by:
        params["group_by"] = group_by
    if where:
        params["where"] = where
    if order_by:
        params["order_by"] = order_by
    aggregate = bool(select and ("(" in select))
    if group_by or aggregate:
        url = f"{BASE}/{urllib.parse.quote(dataset)}/records?" + urllib.parse.urlencode(params)
        return list(json.loads(http_get(url)).get("results", []))
    url = f"{BASE}/{urllib.parse.quote(dataset)}/records?" + urllib.parse.urlencode(params)
    data = json.loads(http_get(url))
    out = list(data.get("results", []))
    total = data.get("total_count", len(out))
    # Solo se pagina cuando se pidió una página completa (limit=100) y aún hay
    # más registros. Una query con limit menor devuelve exactamente ese top y
    # total_count sería el total subyacente (no se debe paginar).
    if page < 100:
        return out
    offset = page
    while offset < total and offset <= 50000:
        url = f"{BASE}/{urllib.parse.quote(dataset)}/records?"
        url += urllib.parse.urlencode({**params, "offset": str(offset)})
        data = json.loads(http_get(url))
        chunk = data.get("results", [])
        if not chunk:
            break
        out.extend(chunk)
        offset += page
    return out


def save(name, obj):
    path = os.path.join(DATA_DIR, name)
    if os.path.exists(path):
        print(f"  = {name} ya existe; se omite")
        return False
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  -> {name}  ({os.path.getsize(path) / 1024:.0f} KB)")
    return True


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    print("== Contratos (dataset agregado de hacienda) ==")
    derivados = ["c_kpi.json", "c_por_tipo.json", "c_por_tipo_contrato.json",
                 "c_por_organo.json", "c_por_anio.json", "c_por_provincia.json"]
    if not all(os.path.exists(os.path.join(DATA_DIR, d)) for d in derivados):
        no_group = records("contratos-agregado",
                           select="fecha,organo,tipo_de_contrato,contratos,tipo,importe_total",
                           limit=100)
        print(f"    filas contratos descargadas: {len(no_group)}")

        def limpio(v):
            if v is None:
                return "No consta"
            s = str(v).strip()
            return s if s else "No consta"

        c_kpi = {
            "importe": round(sum(float(r["importe_total"] or 0) for r in no_group), 2),
            "contratos": sum(int(r["contratos"] or 0) for r in no_group),
        }
        save("c_kpi.json", c_kpi)

        by_type = {}
        for r in no_group:
            t = limpio(r["tipo"])
            v = by_type.setdefault(t, {"importe": 0.0, "n": 0})
            v["importe"] += float(r["importe_total"] or 0)
            v["n"] += int(r["contratos"] or 0)
        save("c_por_tipo.json",
             [{"tipo": k, **v} for k, v in sorted(by_type.items(), key=lambda x: -x[1]["importe"])])

        by_tc = {}
        for r in no_group:
            t = limpio(r["tipo_de_contrato"])
            v = by_tc.setdefault(t, {"importe": 0.0, "n": 0})
            v["importe"] += float(r["importe_total"] or 0)
            v["n"] += int(r["contratos"] or 0)
        save("c_por_tipo_contrato.json",
             [{"tipo": k, **v} for k, v in sorted(by_tc.items(), key=lambda x: -x[1]["importe"])])

        by_organo = {}
        for r in no_group:
            v = by_organo.setdefault(r["organo"], {"importe": 0.0, "n": 0})
            v["importe"] += float(r["importe_total"] or 0)
            v["n"] += int(r["contratos"] or 0)
        top_organo = [{"organo": k, **v} for k, v in sorted(by_organo.items(), key=lambda x: -x[1]["importe"])][:20]
        save("c_por_organo.json", top_organo)

        by_anio = {}
        for r in no_group:
            a = str(r["fecha"])
            v = by_anio.setdefault(a, {"importe": 0.0, "n": 0})
            v["importe"] += float(r["importe_total"] or 0)
            v["n"] += int(r["contratos"] or 0)
        save("c_por_anio.json", [{"anio": k, **v} for k, v in sorted(by_anio.items())])

        # Adjudicación atribuida a cada provincia a partir de los órganos
        # cuyo nombre la menciona ("Dirección Provincial de Educación de Burgos",
        # "Gerencia Territorial de Servicios Sociales de Zamora", etc.).
        provincias = ["Ávila", "Burgos", "León", "Palencia", "Salamanca",
                      "Segovia", "Soria", "Valladolid", "Zamora"]
        by_prov = {p: {"importe": 0.0, "n": 0} for p in provincias}
        no_prov = {"importe": 0.0, "n": 0}
        for r in no_group:
            org = str(r["organo"] or "")
            imp = float(r["importe_total"] or 0)
            n = int(r["contratos"] or 0)
            hit = next((p for p in provincias if p.lower() in org.lower()), None)
            if hit:
                by_prov[hit]["importe"] += imp
                by_prov[hit]["n"] += n
            else:
                no_prov["importe"] += imp
                no_prov["n"] += n
        save("c_por_provincia.json",
             [{"provincia": p, **by_prov[p]} for p in provincias if by_prov[p]["n"] or by_prov[p]["importe"]] +
             [{"provincia": "No territorializado", **no_prov}])
    else:
        print("    ya existen los derivados de contratos; se omite la descarga")

    print("== Subvenciones concedidas ==")
    s_por_anio = []
    for anio in range(2018, 2027):
        where = f"fecha_de_la_concesion >= '{anio}-01-01' and fecha_de_la_concesion < '{anio + 1}-01-01'"
        out = records("subvenciones-concedidas",
                      select="sum(importe_concesion) as importe,count(*) as n", where=where, limit=1)
        s_por_anio.append({"anio": str(anio),
                           "importe": round(float(out[0].get("importe") or 0), 2) if out else 0,
                           "n": int(out[0].get("n") or 0) if out else 0})
    # El registro publicado acaba en 2022 (2023+ salen vacíos): se eliminan
    # los años finales sin datos para no presentar 0 como si fuese real.
    anios_con_datos = [r for r in s_por_anio if r["n"] > 0]
    s_por_anio = anios_con_datos

    # Fecha máxima real de concesión (para etiquetar la cobertura como parcial)
    max_dt = records("subvenciones-concedidas",
                     select="fecha_de_la_concesion", order_by="fecha_de_la_concesion desc", limit=1)
    cobertura_hasta = (max_dt[0].get("fecha_de_la_concesion") if max_dt else None)
    anio_max = s_por_anio[-1]["anio"] if s_por_anio else None

    save("s_por_anio.json", s_por_anio)

    s_instrumento = records("subvenciones-concedidas",
                            select="instrumento_de_ayuda,sum(importe_concesion) as importe,count(*) as n",
                            group_by="instrumento_de_ayuda")
    save("s_por_instrumento.json", sorted(s_instrumento, key=lambda x: -(x.get("importe") or 0)))

    s_organo = records("subvenciones-concedidas",
                       select="organo_convocante,sum(importe_concesion) as importe,count(*) as n",
                       group_by="organo_convocante",
                       order_by="sum(importe_concesion) desc", limit=20)
    save("s_por_organo.json", s_organo)

    s_benef = records("subvenciones-concedidas",
                      select="nombre_razon_social,sum(importe_concesion) as importe,count(*) as n",
                      group_by="nombre_razon_social",
                      order_by="sum(importe_concesion) desc", limit=20)
    save("s_top_beneficiarios.json", s_benef)

    s_kpi = records("subvenciones-concedidas",
                    select="sum(importe_concesion) as importe,count(*) as n", limit=1)
    save("s_kpi.json", {"importe": round(float(s_kpi[0].get("importe") or 0), 2) if s_kpi else 0,
                        "n": int(s_kpi[0].get("n") or 0) if s_kpi else 0,
                        "anio_min": s_por_anio[0]["anio"] if s_por_anio else None,
                        "anio_max": anio_max,
                        "cobertura_hasta": cobertura_hasta})

    print("== Población por provincia (para ratios per cápita) ==")
    pobl = records("registro-de-municipios-de-castilla-y-leon",
                   select="provincia,sum(poblacion) as poblacion",
                   group_by="provincia",
                   order_by="poblacion desc")
    save("poblacion_prov.json", pobl)

    print("== Altos cargos ==")
    altos = records(
        "altos-cargos",
        select=("titulo,nombre,directorio,descripcion,fechaposesion,formacionacademica,"
                "experienciaprofesional,lugarnacimiento,retribuciones,curriculum,curriculumlargo,"
                "identificador,enlace_al_contenido,fotografia"),
        limit=100,
        order_by="titulo",
    )
    # La API devuelve además el campo 'nombre' (a veces ned), por eso se filtra a registro con datos
    # Deja fuera los registros sin fecha de posesión (ganadores de concurso/vacantes) -> filtro en app
    for r in altos:
        r.pop("actualizacionmetadatos", None)
        r["nombre"] = (r.get("nombre") or "") .strip()
    save("altos_cargos.json", altos)
    if altos:
        print("    campos:", list(altos[0].keys()))

    print("== OK ==")


if __name__ == "__main__":
    main()