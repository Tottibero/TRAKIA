# HC-03 — Importación de planes

| Tarea | Alcance | Estado | Ficha |
| --- | --- | --- | --- |
| HC-03-01 | Especificación funcional y arquitectura del importador | completada | [HC-03-01](HC-03-01.md) |
| HC-03-02 | Persistencia del catálogo; pruebas y auditoría satisfactorias, `quality` diferido al cierre del bloque | completada | [HC-03-02](HC-03-02.md) |
| HC-03-03 | Persistencia de planificación y reglas del agregado; pruebas y auditoría satisfactorias, `quality` diferido al cierre del bloque | completada | [HC-03-03](HC-03-03.md) |
| HC-03-04 | Validación del importador y corrección de permisos `dist`; pruebas y auditoría satisfactorias, `quality` diferido al cierre del bloque | completada | [HC-03-04](HC-03-04.md) |
| HC-03-05 | Revisión de importación sin escrituras; pruebas locales e integración PostgreSQL satisfactorias, auditoría sin hallazgos, `quality` diferido al cierre del bloque | completada | [HC-03-05](HC-03-05.md) |
| HC-03-06 | Confirmación transaccional e idempotente; `pnpm check`, integración PostgreSQL y auditoría sin hallazgos; `quality` diferido al cierre del bloque | completada | [HC-03-06](HC-03-06.md) |
| HC-03-07 | API HTTP y experiencia frontend móvil primero del importador JSON; verificaciones locales, integración y auditoría satisfactorias; `quality` diferido al cierre del bloque | completada | [HC-03-07](HC-03-07.md) |
| HC-03-08 | Verificación integral: `pnpm check`, contracts e integración en `trakia_test`; recuperación e idempotencia verificadas; revisión UX/UI post-MVP; `quality` reservado al cierre | completada | [HC-03-08](HC-03-08.md) |
| [HC-03-09](HC-03-09.md) | Simplificación de Importar plan; pruebas web satisfactorias y auditoría manual favorable; verificador automático de arquitectura con incidencia en sus fixtures | en revisión | [HC-03-09](HC-03-09.md) |
| [HC-03-10](HC-03-10.md) | Revisión compacta, conflictos agrupados e identificables y botones rojos con texto blanco; pruebas web y auditoría manual favorables | en revisión | [HC-03-10](HC-03-10.md) |
| [HC-03-11](HC-03-11.md) | Resumen compacto del plan combinado y sesiones desplegables en confirmación; pruebas web y auditoría arquitectónica favorables | en revisión | [HC-03-11](HC-03-11.md) |
| [HC-03-12](HC-03-12.md) | Tiempo, rondas y repeticiones diferenciados por color; sesiones, ejercicios y circuitos con colores propios; descansos compactos; verificaciones web satisfactorias | en revisión | [HC-03-12](HC-03-12.md) |

El [diseño](importador-diseno.md) propone el desglose HC-03-02–08. HC-03-07 implementa la API HTTP y experiencia frontend con sus tres decisiones aprobadas. HC-03-08 verifica el bloque sin ampliar funcionalidades ni rediseñar la interfaz; la revisión UX/UI queda aplazada hasta después del MVP. HC-03-05 añadió la consulta pública mínima de ejecución; HC-05 debe registrar el inicio online antes de depender de esa protección en producción. La política del propietario difiere `quality` hasta el cierre de HC-03, antes del merge; cada tarea mantiene pruebas locales y auditoría arquitectónica independiente.
