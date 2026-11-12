# Progreso

| Tarea | Estado | Alcance |
| --- | --- | --- |
| HC-00 | Cerrado a nivel de diseño | Arquitectura y decisiones aprobadas. |
| HC-01-01 | Cerrado | Inicialización del monorepo pnpm. |
| HC-01-02 | Implementada, pendiente de revisión | Inicialización de aplicaciones y contratos compartidos. |
| HC-01-02b | Cerrada | Instrucciones permanentes en `AGENTS.md` y publicación inicial del monorepo en `main` (`50d4ab30a63fb8755e5896af9c0b43cc99312ebe`). |
| HC-01-02c | Commit local verificado; revisión y aceptación pendientes | Simplificación del README e instrucciones locales en `docs/development.md` (commit `825c06e`). |
| HC-01-03a | Implementada y verificada localmente, pendiente de revisión | Entorno Docker Compose de desarrollo con web, API, contracts y PostgreSQL persistente. |
| HC-01-03b | Implementada y verificada localmente, pendiente de revisión | Integración PostgreSQL/TypeORM, configuración segura y migraciones explícitas versionadas. |
| HC-01-03c | Implementada y verificada localmente, pendiente de revisión | Skill `trakia-docker` para gestionar de forma segura el entorno TRAKIA. |
| HC-01-03d | Implementada localmente, pendiente de revisión | Skill `trakia-git` e instrucciones de GitHub Flow por bloques HC. |
| HC-01-03e | Implementada localmente, pendiente de revisión | ADR-015 y guía de arquitectura modular; los controles automáticos quedan para HC-01-04. |
| HC-01-03f | Implementada localmente, pendiente de revisión | Skills `trakia-task` y `trakia-architecture`, cheatsheet de comandos e integración en `AGENTS.md`. |
| [HC-01-03g](tasks/HC-01/HC-01-03g.md) | En revisión | Organización y gobernanza documental; sin cambios funcionales. |
| [HC-01-04](tasks/HC-01/HC-01-04.md) | En revisión | HC-01-04b completa límites de Domain y Presentation; fixtures, lint y `pnpm check` pasan. Actions pendiente. |
| [HC-01-05a](tasks/HC-01/HC-01-05a.md) | Completada | Usuarios y persistencia verificadas con `pnpm check` e integración en `trakia_test`; commit local registrado. |
| [HC-01-05b](tasks/HC-01/HC-01-05b.md) | Completada | Correctivo CLI probado; bootstrap y primer login real confirmados manualmente por el propietario. Commit correctivo separado del original. |
| [HC-01-05c](tasks/HC-01/HC-01-05c.md) | Completada | JWT y autenticación privada verificadas con `pnpm check` y runner HTTP en `trakia_test`; aprobación y revisión registradas. |
| [HC-01-05d](tasks/HC-01/HC-01-05d.md) | Completada | Seguridad HTTP validada con `pnpm check`, auditoría arquitectónica sin bloqueos y runner aislado en `trakia_test`. |
| [HC-01-05e](tasks/HC-01/HC-01-05e.md) | Completada | Ciclo `ARCH-ALL-001` corregido; `pnpm check`, auditoría limpia, Chrome/API mock y flujo manual real del propietario verificados. |
| [HC-01-06](tasks/HC-01/HC-01-06.md) | En revisión | Verificaciones locales pasan; el primer `quality` de la PR #1 falló por el orden de setup pnpm/Node. Corrección local pendiente de commit de verificación y nuevo check remoto. |

Este registro no anticipa detalles técnicos que todavía no se hayan definido.
