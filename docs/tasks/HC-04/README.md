# HC-04 — Home semanal y detalle de entrenamiento

**Objetivo:** ofrecer una vista semanal conjunta de la planificación importada y una pantalla independiente de consulta completa de cada sesión. HC-04 no ejecuta entrenamientos ni modifica planes.

**Estado del bloque:** HC-04-01 a HC-04-06 completadas. La rama está preparada localmente para publicación y PR; no se han ejecutado operaciones remotas.

| Tarea | Alcance | Estado | Ficha |
| --- | --- | --- | --- |
| HC-04-01 | Especificación técnica de planificación semanal; D1–D29 y T1–T7 aprobadas, auditoría sin hallazgos | completada | [HC-04-01](HC-04-01.md) |
| HC-04-02 | Contratos Zod y API de calendario semanal y sesión | completada | [HC-04-02](HC-04-02.md) |
| [HC-04-03](HC-04-03.md) | Home semanal, siete días, navegación, expansión independiente y estados de consulta | completada | [HC-04-03](HC-04-03.md) |
| [HC-04-04](HC-04-04.md) | Pantalla independiente de detalle de entrenamiento | completada | [HC-04-04](HC-04-04.md) |
| [HC-04-05](HC-04-05.md) | Acceso al importador desde Home semanal, navegación de retorno e invalidación de caché | completada | [HC-04-05](HC-04-05.md) |
| [HC-04-06](HC-04-06.md) | Auditoría integral, regresión importar JSON → Home semanal → detalle, accesibilidad y preparación para revisión de PR | completada | `pnpm check` y 21 escenarios en `trakia_test` satisfactorios; smoke tests declarados por el propietario. Acepta como no bloqueantes las comprobaciones manuales de teclado/lector y responsive no ejecutadas. CI remoto pendiente de publicación. |

El [diseño técnico](planificacion-semanal-diseno.md) registra las decisiones D1–D29 y T1–T7 aprobadas, las rutas acordadas y la evidencia del dominio y la arquitectura. HC-04-06 cierra con verificaciones locales satisfactorias y auditoría arquitectónica sin impacto; el propietario acepta como limitaciones no bloqueantes las comprobaciones manuales de accesibilidad y responsive que no se ejecutaron. La rama queda preparada localmente para publicación y PR, pendiente de autorización para operaciones remotas.
