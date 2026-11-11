# Progreso

| Tarea | Estado | Alcance |
| --- | --- | --- |
| HC-00 | Cerrado a nivel de diseño | Arquitectura y decisiones aprobadas. |
| HC-01-01 | Cerrado | Inicialización del monorepo pnpm. |
| HC-01-02 | Implementada, pendiente de revisión | Inicialización de aplicaciones y contratos compartidos. |
| HC-01-02b | Cerrada | Instrucciones permanentes en `AGENTS.md` y publicación inicial del monorepo en `main` (`50d4ab30a63fb8755e5896af9c0b43cc99312ebe`). |
| HC-01-02c | Preparada localmente; publicación pendiente | Simplificación del README, instrucciones locales en `docs/development.md`, generalización de la referencia al alojamiento y configuración local de identidad Git. |
| HC-01-03a | Implementada y verificada localmente, pendiente de revisión | Entorno Docker Compose de desarrollo con web, API, contracts y PostgreSQL persistente. |
| HC-01-03b | Implementada y verificada localmente, pendiente de revisión | Integración PostgreSQL/TypeORM, configuración segura y migraciones explícitas versionadas. |
| HC-01-03c | Implementada y verificada localmente, pendiente de revisión | Skill `trakia-docker` para iniciar, detener, consultar estado y logs, reiniciar y reconstruir exclusivamente el proyecto local TRAKIA. Compose, estado saludable de los cuatro servicios, logs limitados de API y volúmenes persistentes consultados; no se ejecutaron operaciones de ciclo de vida porque el entorno ya estaba activo. |
| HC-01-03d | Implementada localmente, pendiente de revisión | Skill `trakia-git` e instrucciones de GitHub Flow por bloques HC. |
| HC-01-03e | Implementada localmente, pendiente de revisión | ADR-015 y guía de arquitectura modular para backend, frontend, contratos, pruebas y reglas verificables. Las comprobaciones automáticas de límites quedan para HC-01-04. Verificaciones realizadas: revisión de ADR y estructura existente, coherencia documental y `git diff --check`; sin builds ni tests de aplicación por tratarse de documentación. |
| Tareas posteriores | Pendientes | Implementación según el diseño aprobado. |

Este registro no anticipa detalles técnicos que todavía no se hayan definido.
