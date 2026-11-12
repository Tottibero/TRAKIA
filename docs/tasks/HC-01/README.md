# HC-01 — Infraestructura

**Objetivo:** establecer la infraestructura base y las convenciones necesarias para desarrollar TRAKIA.

**Alcance general:** monorepo, aplicaciones y contratos compartidos, entorno de desarrollo, integración de persistencia, flujo de trabajo y documentación técnica. El historial detallado de tareas anteriores se conserva en [progreso](../../progress.md).

| Identificador | Título | Estado | Especificación |
| --- | --- | --- | --- |
| HC-01-03g | Organización y gobernanza documental | en revisión | [HC-01-03g.md](HC-01-03g.md) |
| HC-01-04 | Calidad, pruebas arquitectónicas y CI | en revisión | [HC-01-04.md](HC-01-04.md) |
| HC-01-05a | Usuarios y persistencia | completada | [HC-01-05a.md](HC-01-05a.md) |
| HC-01-05b | Comandos administrativos de autenticación | completada | [HC-01-05b.md](HC-01-05b.md) |
| HC-01-05c | Autenticación JWT y API | completada | [HC-01-05c.md](HC-01-05c.md) |
| HC-01-05d | Seguridad HTTP | completada | [HC-01-05d.md](HC-01-05d.md) |
| HC-01-05e | Autenticación frontend | completada | [HC-01-05e.md](HC-01-05e.md) |
| HC-01-06 | Verificación integral y cierre del bloque de infraestructura de TRAKIA | en revisión | [HC-01-06.md](HC-01-06.md) |

**Orden de autenticación:** HC-01-05a → HC-01-05b → HC-01-05c → HC-01-05d → HC-01-05e. El bloque solo se cierra cuando todas sus tareas están verificadas y aceptadas; la implementación por sí sola no basta. Aplican [ADR-014](../../decisions/ADR-014-integracion-postgresql-typeorm.md), [ADR-015](../../decisions/ADR-015-arquitectura-modular.md) y sus [convenciones](../../architecture/module-conventions.md).

HC-01-06 consolida la verificación local de infraestructura, autenticación y calidad. La PR #1 está abierta; su primer check `quality` falló por el orden de inicialización de pnpm y `setup-node`. El commit de verificación ya está creado localmente; su publicación y una nueva ejecución remota satisfactoria siguen pendientes antes del cierre.
