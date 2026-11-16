# HC-05 — Ejecución guiada de entrenamientos

| Tarea | Estado | Objetivo |
| --- | --- | --- |
| [HC-05-01](HC-05-01.md) | Completada | Diseño técnico del ejecutor y desglose del bloque; aceptación registrada. |
| [HC-05-02](HC-05-02.md) | Completada | Inicio online, reserva idempotente y recuperación; D18 actualizado para exclusividad global por cuenta. `pnpm check`, arquitectura e integración PostgreSQL en `trakia_test` satisfactorios; aceptación registrada. |
| [HC-05-03](HC-05-03.md) | Completada | Series secuenciales, alternativas y métricas contextuales; borradores y confirmaciones IndexedDB con POST idempotente inmediato; pruebas y auditoría arquitectónica satisfactorias. Aceptación registrada en el cierre local. |
| [HC-05-04](HC-05-04.md) | Completada | Ejecutor guiado para fuerza, circuitos, AMRAP e intervalos; temporizadores y pausas locales. `pnpm check`, auditoría e integración PostgreSQL en `trakia_test` satisfactorios. `quality` remoto diferido al cierre del bloque HC-05. |
| [HC-05-05](HC-05-05.md) | Completada | Revisión móvil, datos finales y cierre local atómico; verificaciones y auditoría satisfactorias. El escaqueo no figura en el contrato y no aplica penalizaciones; queda pendiente el smoke test integral manual en móvil. Sincronización remota reservada a HC-05-06. |
| [HC-05-06](HC-05-06.md) | Completada | Cierre idempotente con consolidación transaccional; `pnpm check`, integración en `trakia_test` y auditoría arquitectónica satisfactorios. Se conserva pendiente el smoke test integral manual en móvil de HC-05-05. Aceptación del propietario registrada en el commit local. |
| [HC-05-07](HC-05-07.md) | Completada | Correcciones auditables online de sesiones cerradas, persistencia idempotente y regresión final; verificaciones y auditoría satisfactorias. Smoke test manual móvil pendiente, aceptado como limitación no bloqueante. |
| [HC-05-08](HC-05-08.md) | En revisión | Estabilización de IndexedDB, transiciones deportivas y simplificación del ejecutor. `pnpm check` pasa; smoke test visual y móvil sigue pendiente. |
| [HC-05-09-02](HC-05-09-02.md) | Completada | Modelo online, métrica común, timestamps mínimos y plan vertical HC-05-09-03 definidos; aprobación conceptual registrada. |
| [HC-05-09-03](HC-05-09-03.md) | Completada | Recorrido online y 23 pruebas PostgreSQL satisfactorias; aceptación del propietario registrada. |
| [HC-05-09-03a](HC-05-09-03a.md) | Completada | Vista PWA online, seis pruebas de interfaz, 23 pruebas PostgreSQL, `pnpm check` y arquitectura satisfactorios; smoke aceptado: press banca, 7 reps, 40 kg, RPE 7. Recuperación tras recarga no confirmada manualmente. |
| [HC-05-09-03b](HC-05-09-03b.md) | Completada | Cierre online, `pnpm check`, integración HTTP en `trakia_test`, auditoría y prueba manual aceptados; press banca conservó 7 repeticiones, 40 kg y RPE 7. |

Las fichas HC-05-01–08 conservan las decisiones y prioridades implementadas históricamente. Para HC-05-09, el orden es: recorrido vertical online mínimo (09-03), primera serie desde PWA (09-03a), cierre online (09-03b), pausas/reanudación (09-04), temporizadores y modalidades temporizadas (09-05), y retirada segura del almacenamiento heredado en fichas posteriores.

Diseño: [ejecutor-diseno.md](ejecutor-diseno.md).

HC-05-09-02 fija el objetivo online y mantiene intacto el historial de HC-05-01–08. HC-05-08 continúa en revisión; su trabajo pendiente se preserva mientras se prepara la prueba manual de 09-03a en la misma rama.
