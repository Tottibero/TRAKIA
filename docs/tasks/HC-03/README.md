# HC-03 — Importación de planes

| Tarea | Alcance | Estado | Ficha |
| --- | --- | --- | --- |
| HC-03-01 | Especificación funcional y arquitectura del importador | completada | [HC-03-01](HC-03-01.md) |
| HC-03-02 | Persistencia del catálogo; pruebas y auditoría satisfactorias, `quality` diferido al cierre del bloque | completada | [HC-03-02](HC-03-02.md) |
| HC-03-03 | Persistencia de planificación y reglas del agregado; pruebas y auditoría satisfactorias, `quality` diferido al cierre del bloque | completada | [HC-03-03](HC-03-03.md) |
| HC-03-04 | Validación del importador y corrección de permisos `dist`; pruebas y auditoría satisfactorias, `quality` diferido al cierre del bloque | completada | [HC-03-04](HC-03-04.md) |
| HC-03-05 | Revisión de importación sin escrituras; pruebas locales e integración PostgreSQL satisfactorias, auditoría sin hallazgos, `quality` diferido al cierre del bloque | completada | [HC-03-05](HC-03-05.md) |
| HC-03-06 | Confirmación transaccional e idempotente; `pnpm check`, integración PostgreSQL y auditoría sin hallazgos; `quality` diferido al cierre del bloque | completada | [HC-03-06](HC-03-06.md) |

El [diseño](importador-diseno.md) propone el desglose HC-03-02–08; HC-03-07–08 siguen pendientes de ficha. HC-03-05 añadió la consulta pública mínima de ejecución; el inicio online debe registrar estados antes de depender de ella en producción. La política del propietario difiere `quality` hasta el cierre de HC-03, antes del merge; cada tarea mantiene pruebas locales y auditoría arquitectónica independiente.
