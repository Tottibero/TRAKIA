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
| [HC-05-09-04](HC-05-09-04.md) | Pendiente | Especificación de trabajo efectivo, descanso, pausas, recuperación online y desglose de implementación; sin cambios de software. |
| [HC-05-09-04a](HC-05-09-04a.md) | En revisión | Continuación manual, cierre online y recuperación tras recarga verificados; smoke manual de la corrección pendiente. |
| [HC-05-09-04a-UX](HC-05-09-04a-UX.md) | En revisión | Estado y resumen anidados en lecturas de calendario/detalle, con consulta de ejecución por lote; `pnpm check`, integración PostgreSQL y arquitectura satisfactorias, smoke manual pendiente. |
| [HC-05-09-04a-UX-02](HC-05-09-04a-UX-02.md) | Completada | Objetivos planificados visibles durante el smoke manual conjunto; `pnpm check` y arquitectura satisfactorios. Viewports específicos de 375/390 px pendientes. |
| [HC-05-09-04b](HC-05-09-04b.md) | Completada | Descanso de 20 segundos, métricas, recuperación, continuación manual y cierre de dos series superados en smoke; integración `trakia_test`, `pnpm check` y arquitectura satisfactorios. Viewports específicos de 375/390 px pendientes. |
| [HC-05-09-04c](HC-05-09-04c.md) | Completada | Pausa/reanudación online aceptadas manualmente; integración `trakia_test`, `pnpm check` y arquitectura satisfactorias. |
| [HC-05-09-05](HC-05-09-05.md) | Completada | Motor online de rondas `circuit` con N ejercicios y resumen de duración/resultados; smoke aceptado para superserie 2×2 y triserie 3×2, verificaciones e integración `trakia_test` satisfactorias. |
| [HC-05-09-06](HC-05-09-06.md) | Completada | HIIT online aceptado manualmente: transiciones, estados, pausas, recarga y 56 s efectivos. Checks finales satisfactorios; anchos exactos 375/390 px no medidos. |
| [HC-05-09-06a](HC-05-09-06a.md) | Completada | Métricas HIIT aceptadas manualmente: 26 reps, RPE 10 y resultados por intervalo. «Volver al calendario» tiene pruebas automatizadas; smoke manual posterior del enlace pendiente. |
| [HC-05-09-07](HC-05-09-07.md) | Completada | AMRAP online; propietario acepta ejecución, rondas completas, métricas por ejercicio/ronda y persistencia. `pnpm check`, arquitectura e integración `trakia_test` satisfactorias; escenarios de pausa, recarga, cierre anticipado y parcial quedan fuera del smoke aceptado. |
| [HC-05-10-01](HC-05-10-01.md) | Completada | Tokens y shell visual; login con marca centrada, CTA rojo AA y toggle de contraseña. `pnpm check` y arquitectura pasan; el propietario acepta la limitación de Chrome documentada. |
| [HC-05-10-02](HC-05-10-02.md) | Completada | Rediseño del detalle aceptado y regla autoritativa de inicio en `Europe/Madrid`; `pnpm check`, arquitectura e integración `trakia_test` satisfactorias. Cierre autorizado por el propietario. |
| [HC-05-10-02b](HC-05-10-02b.md) | Completada | Inicio limitado a su fecha en `Europe/Madrid`, con validación API y sin ejecución tras rechazo. `pnpm check`, arquitectura e integración `trakia_test` satisfactorias; cierre autorizado por el propietario. |
| [HC-05-10-07](HC-05-10-07.md) | En revisión | Resultados reales al cerrar y reabrir; checks y auditoría arquitectónica satisfactorios. Validación manual pendiente. |

Las fichas HC-05-01–08 conservan las decisiones y prioridades implementadas históricamente. Para HC-05-09, el recorrido vertical online mínimo (09-03), la primera serie desde PWA (09-03a) y el cierre online (09-03b) están completados. HC-05-09-04 especifica ahora los tiempos online en tareas incrementales; la integración posterior de circuitos, HIIT y AMRAP y la retirada segura del almacenamiento heredado quedan para fichas posteriores.

Diseño: [ejecutor-diseno.md](ejecutor-diseno.md). Propuesta integral UX/UI y correcciones del propietario: [HC-05-10](HC-05-10-propuesta-ux.md).

HC-05-09-02 fija el objetivo online y mantiene intacto el historial de HC-05-01–08. HC-05-08 continúa en revisión y su trabajo pendiente se preserva; HC-05-09-07 está completada tras el smoke aceptado por el propietario.
