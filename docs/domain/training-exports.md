# Exportación de planificación y resultados deportivos

Este documento define una proyección JSON deportiva para compartir con ChatGPT. No genera archivos ni los envía a servicios externos. El contrato v1 vive en `packages/contracts/src/training-exports/` y está separado de importación, sincronización y persistencia.

## Decisiones aprobadas

6. **Periodo seleccionable.** La persona elige fechas de calendario de inicio y fin inclusivas. El historial completo usa el mismo formato y un periodo que abarque todos los datos seleccionados.
7. **Resultados vigentes.** Se exporta el valor deportivo vigente después de aplicar correcciones; no se exporta su historial de auditoría.
8. **Planificación y ejecuciones relacionadas.** Se incluyen planificación, descansos y ejecuciones relacionadas. Las actividades voluntarias retrospectivas se incorporarán cuando sus contratos estén disponibles. El documento conserva sesiones planificadas sin ejecución y varias sesiones en la misma fecha.
9. **Exportación deportiva limpia.** La proyección incluye bloques, prescripciones, claves e índices estables, nombres de ejercicios, snapshot original, tiempos deportivos, trabajo real, series/rondas adicionales y omisiones explícitas. Excluye `deviceId`, `operationId`, secuencias, estados de sincronización, intentos HTTP, respuestas del backend y correcciones auditadas; no serializa directamente `WorkoutExecution`.

La ausencia de ejecución no se convierte automáticamente en `skipped`. Estados derivados como `not_reached` se documentan, pero no se calculan en este formato.

El peso corporal y el perímetro de cintura se contemplan conceptualmente, pero HC-02-06 no crea sus contratos. Se incorporarán en una versión posterior o en una extensión compatible expresamente definida.

## Forma y coherencia

La envoltura usa `format: "trakia.training-data"`, `version: 1`, `exportedAt`, `period`, `plans` y `executions`. Cada plan exportado tiene su clave, nombre, catálogo deportivo mínimo y días planificados (`session` o `rest`). Las ejecuciones llevan un snapshot `WorkoutExecutionSnapshot` y resultados `WorkoutResult`, proyectados sin estado técnico, pausas ni auditoría de correcciones.

Las fechas usan el esquema de calendario del dominio y el periodo es inclusivo. Todas las fechas de sesión y ejecución deben caer dentro del periodo. Los IDs de planes, ejercicios, días y ejecuciones se validan para evitar duplicados dentro de su ámbito. Cada ejecución debe apuntar a un plan y sesión exportados coherentes con su snapshot. Se valida el catálogo de ejercicios que requiere la planificación y se reutilizan las invariantes existentes de resultados contra el snapshot.

El contrato no decide cómo seleccionar datos persistidos ni garantiza integridad con entidades remotas. La selección del periodo, los resultados vigentes y la construcción de la proyección son responsabilidades futuras de aplicación; el contrato valida únicamente el documento recibido.

## Extensiones fuera de v1

- Peso corporal y cintura esperan contratos de mediciones en su módulo propietario.
- Las actividades voluntarias esperan su propio contrato de dominio y una ampliación versionada/compatible.
- `not_reached`, cumplimiento, rendimiento, duración activa agregada y cualquier resumen se derivan en tareas futuras, no se almacenan ni calculan al validar la exportación.
