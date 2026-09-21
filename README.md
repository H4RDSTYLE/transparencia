# TransparenciaCyL

Contratación pública, subvenciones y altos cargos de Castilla y León, explicados con datos abiertos del [Portal de Datos Abiertos de la Junta de Castilla y León](https://datosabiertos.jcyl.es). Web 100 % estática (HTML + JS + ECharts/Leaflet, sin servidor) que sirve JSON preprocesados desde `data/`.

- **Acceso:** https://h4rdstyle.github.io/transparencia/

## Qué ofrece

- **Resumen:** importe adjudicado en contratos y subvenciones, ratos por habitante e indicadores clave.
- **Contratos:** importe por procedimiento, por tipo de contrato, ranking de órganos, adjudicación por habitante en cada provincia y evolución anual.
- **Subvenciones:** importe por instrumento de ayuda, órganos convocantes, top de beneficiarios y evolución anual.
- **Detalle:** tablas ordenables (clic en las cabeceras) y descargables en CSV para priorizar fiscalización y transparencia.
- **Altos cargos:** directorio con ficha de formación, experiencia y enlace a la declaración oficial.
- **Buscador:** consulta en vivo de la API de datos abiertos (contratos menores, ordinarios y subvenciones) con filtros por tipo, órgano y texto libre, ordenación y paginación.

## Datos utilizados

Fuente de todos los datos: **API de análisis de datos abiertos de Castilla y León** (`analisis.datosabiertos.jcyl.es`, Catálogo de Datos Abiertos de la Junta de Castilla y León).

- Contratación pública agregada (importes, tipos de contrato, órganos), contratos menores y ordinarios.
- Subvenciones concedidas (importes, instrumentos, órganos convocantes, beneficiarios).
- Altos cargos de la Junta de Castilla y León.
- Registro de municipios de Castilla y León (población para los ratios per cápita).

## Cómo ejecutarlo

```bash
# 1) Regenerar los datos (opcional; ya están en data/)
python scripts/fetch_data.py

# 2) Servir la web (los fetch de JSON necesitan un servidor local, no file://)
python -m http.server 8890
# Abrir  http://127.0.0.1:8890/
```

## Estructura

```
transparencia/
  index.html        interfaz (pestañas Resumen, Contratos, Subvenciones, Detalle, Altos cargos, Buscar)
  css/ js/          estilos y lógica
  lib/              librerías locales (ECharts, Leaflet)
  data/             JSON preprocesados
  scripts/          fetch_data.py (descarga y agrega)
```

## Notas

- El buscador consulta la API de la Junta en tiempo real (CORS abierto); el resto usa los JSON precalculados para funcionar offline y con carga instantánea.
- Los importes proceden de los registros públicos y pueden incluir partidas consolidadas publicadas por los propios órganos.

## Licencia

Este proyecto está licenciado bajo **[Creative Commons Atribución 4.0 Internacional (CC BY 4.0)](LICENSE)**. Los datos reutilizados conservan la licencia de su fuente (CC BY 4.0); la aplicación la cita en todo momento.