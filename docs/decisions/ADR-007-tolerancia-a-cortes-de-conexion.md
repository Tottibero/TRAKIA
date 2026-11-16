# ADR-007: Tolerancia a cortes de conexión

- **Estado:** Aprobada en HC-00
- **Decisión original:** el registro debe tolerar cortes de conexión.
- **Concreción para ejecución deportiva en HC-05-09-02:** las operaciones requieren conexión y confirmación de la API. Un corte conserva lo que PostgreSQL ya confirmó; no se continúa registrando ni se difieren escrituras para sincronización posterior. Al reconectar se recupera el estado del servidor.
- **Historial y alcance:** esta regla sustituye para ejecución la tolerancia offline y sincronización del diseño local-first HC-05-01–08. Esta ADR no redefine el comportamiento de otras áreas de TRAKIA.
