# HC-01 — Infraestructura

**Objetivo:** establecer la infraestructura base y las convenciones necesarias para desarrollar TRAKIA.

**Estado del bloque:** completado documentalmente; PR #1 lista para revisión final de integración.

**Alcance general:** monorepo, aplicaciones y contratos compartidos, entorno de desarrollo, integración de persistencia, flujo de trabajo y documentación técnica. El historial detallado de tareas anteriores se conserva en [progreso](../../progress.md).

| Identificador | Título | Estado | Especificación |
| --- | --- | --- | --- |
| HC-01-01 | Inicialización del monorepo pnpm | completada | Registro histórico en [progreso](../../progress.md) |
| HC-01-02 | Inicialización de aplicaciones y contratos compartidos | completada | Registro histórico en [progreso](../../progress.md) |
| HC-01-02b | Instrucciones permanentes y publicación inicial | completada | Registro histórico en [progreso](../../progress.md) |
| HC-01-02c | Simplificación documental e instrucciones locales | completada | Registro histórico en [progreso](../../progress.md) |
| HC-01-03a | Entorno Docker Compose | completada | Registro histórico en [progreso](../../progress.md) |
| HC-01-03b | PostgreSQL, TypeORM y migraciones | completada | Registro histórico en [progreso](../../progress.md) |
| HC-01-03c | Skill de gestión Docker | completada | Registro histórico en [progreso](../../progress.md) |
| HC-01-03d | Flujo Git y GitHub | completada | Registro histórico en [progreso](../../progress.md) |
| HC-01-03e | Arquitectura modular | completada | Registro histórico en [progreso](../../progress.md) |
| HC-01-03f | Skills de tarea y arquitectura | completada | Registro histórico en [progreso](../../progress.md) |
| HC-01-03g | Organización y gobernanza documental | completada | [HC-01-03g.md](HC-01-03g.md) |
| HC-01-04 | Calidad, pruebas arquitectónicas y CI | completada | [HC-01-04.md](HC-01-04.md) |
| HC-01-05a | Usuarios y persistencia | completada | [HC-01-05a.md](HC-01-05a.md) |
| HC-01-05b | Comandos administrativos de autenticación | completada | [HC-01-05b.md](HC-01-05b.md) |
| HC-01-05c | Autenticación JWT y API | completada | [HC-01-05c.md](HC-01-05c.md) |
| HC-01-05d | Seguridad HTTP | completada | [HC-01-05d.md](HC-01-05d.md) |
| HC-01-05e | Autenticación frontend | completada | [HC-01-05e.md](HC-01-05e.md) |
| HC-01-06 | Verificación integral y cierre del bloque de infraestructura de TRAKIA | completada | [HC-01-06.md](HC-01-06.md) |

**Orden de autenticación:** HC-01-05a → HC-01-05b → HC-01-05c → HC-01-05d → HC-01-05e. El bloque solo se cierra cuando todas sus tareas están verificadas y aceptadas; la implementación por sí sola no basta. Aplican [ADR-014](../../decisions/ADR-014-integracion-postgresql-typeorm.md), [ADR-015](../../decisions/ADR-015-arquitectura-modular.md) y sus [convenciones](../../architecture/module-conventions.md).

HC-01-06 consolidó la verificación local de infraestructura, autenticación y calidad. En PR #1, `quality` falló históricamente por el orden de pnpm y `setup-node`, y después por typecheck de web sin `contracts/dist`; ambos defectos se corrigieron. El check `quality` pasó en el run [43136334983](https://github.com/Tottibero/TRAKIA/actions/runs/43136334983) para el commit `c625e088d333e99131562ebba91e0bb802f7011a`. La integración aislada pasó en `trakia_test`. Las aceptaciones regularizadas se detallan en [progreso](../../progress.md).
