# HC-05 — Ejecución guiada de entrenamientos

| Tarea | Estado | Objetivo |
| --- | --- | --- |
| [HC-05-01](HC-05-01.md) | Completada | Diseño técnico del ejecutor y desglose del bloque; aceptación registrada. |
| [HC-05-02](HC-05-02.md) | Completada | Inicio online, reserva idempotente y recuperación; D18 actualizado para exclusividad global por cuenta. `pnpm check`, arquitectura e integración PostgreSQL en `trakia_test` satisfactorios; aceptación registrada. |
| [HC-05-03](HC-05-03.md) | Completada | Series secuenciales, alternativas y métricas contextuales; borradores y confirmaciones IndexedDB con POST idempotente inmediato; pruebas y auditoría arquitectónica satisfactorias. Aceptación registrada en el cierre local. |
| [HC-05-04](HC-05-04.md) | Completada | Ejecutor guiado para fuerza, circuitos, AMRAP e intervalos; temporizadores y pausas locales. `pnpm check`, auditoría e integración PostgreSQL en `trakia_test` satisfactorios. `quality` remoto diferido al cierre del bloque HC-05. |
| [HC-05-05](HC-05-05.md) | Completada | Revisión móvil, datos finales y cierre local atómico; verificaciones y auditoría satisfactorias. El escaqueo no figura en el contrato y no aplica penalizaciones; queda pendiente el smoke test integral manual en móvil. Sincronización remota reservada a HC-05-06. |
| HC-05-06 | Planificada | Cola de sincronización, idempotencia, errores y reconciliación. |
| HC-05-07 | Planificada | Correcciones auditables y recuperación transversal; auditoría e integración del bloque. |

El alcance y los criterios detallados de cada tarea se definirán en su ficha antes de implementarla. Orden de prioridad: inicio/reserva, captura persistente, cierre y recuperación; después sincronización/correcciones y verificación integral.

Diseño: [ejecutor-diseno.md](ejecutor-diseno.md).
