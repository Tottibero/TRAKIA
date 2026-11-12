# Calidad y CI

Los comandos se ejecutan desde la raíz: `pnpm lint`, `pnpm format:check`, `pnpm format`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm architecture:check`, `pnpm build` y `pnpm check`. `check` no requiere PostgreSQL; `test` contiene solo las pruebas unitarias actuales. Prettier cubre fuentes y configuración y excluye documentación, lockfile, dependencias y artefactos generados.

## Integración PostgreSQL

`pnpm test:integration` acepta únicamente `TRAKIA_TEST_DATABASE_URL` hacia PostgreSQL local (`localhost`, loopback o el servicio `postgres`) y la base autorizada `trakia_test`. La URL determina el destino; se eliminan `POSTGRES_DB`, `PGDATABASE` y `TRAKIA_DB_DIST` heredadas del entorno de migraciones y HTTP. Antes de migrar, el mismo DataSource TypeORM comprueba su destino configurado y ejecuta `SELECT current_database()`; una discrepancia detiene el runner. Migraciones y prueba HTTP reciben el mismo entorno saneado. El comando compila contracts/API, aplica migraciones con `synchronize` y `dropSchema` desactivados y ejecuta la prueba HTTP. No crea ni elimina bases, esquemas o volúmenes. El llamador provisiona la base aislada; CI usa un servicio PostgreSQL efímero. La prueba falla si falta URL, conexión o migraciones.

## Cobertura arquitectónica

Reglas de [ADR-015](decisions/ADR-015-arquitectura-modular.md) y [convenciones modulares](architecture/module-conventions.md). «Humana» señala reglas cuyo significado requiere juicio y no se atribuye a los analizadores estáticos.

| Regla | Verificación | Herramienta | Límite |
| --- | --- | --- | --- |
| ARCH-API-001 | Automática | ESLint `no-restricted-imports`/`no-restricted-globals` y dependency-cruiser | ESLint bloquea NestJS, imports HTTP (`node:http`, `node:https`, `node:http2`, Express/Fastify y clientes HTTP) y el global `fetch`; dependency-cruiser refuerza imports resueltos. Fixtures de regresión. |
| ARCH-API-002 | Automática | ESLint `no-restricted-imports` + dependency-cruiser | Bloquea TypeORM en domain; las fixtures verifican imports prohibidos. |
| ARCH-API-003 | Automática | ESLint boundaries | Impide dependencias domain hacia otras capas. |
| ARCH-API-004 | Automática | `architecture-check.mjs` sobre grafo dependency-cruiser | Imports entre módulos solo pueden apuntar a `<módulo>.module.ts`; selección deliberada de providers sigue siendo humana. |
| ARCH-API-005 | Automática | dependency-cruiser | Detecta ciclos en el grafo fuente analizado. |
| ARCH-API-006 | Mixta | ESLint boundaries, `no-restricted-imports`, dependency-cruiser y fixtures | Impide application→presentation y presentation/controller→persistencia (infraestructura, TypeORM, entidades y repositorios); la delegación y responsabilidad del controller siguen siendo humanas. |
| ARCH-WEB-001 | Automática | ESLint boundaries | shared no depende de features. |
| ARCH-WEB-002 | Automática | `architecture-check.mjs` sobre grafo dependency-cruiser | Imports entre features solo pueden apuntar a `features/<nombre>/index.ts`. |
| ARCH-WEB-003 | Parcial | Revisión humana | Crear clientes HTTP ad hoc requiere criterio contextual. |
| ARCH-WEB-004 | Automática | ESLint + dependency-cruiser | La web no importa fuentes API/entidades. |
| ARCH-CON-001 | Automática | ESLint | Contracts no depende de NestJS/TypeORM. |
| ARCH-CON-002 | Automática | ESLint + dependency-cruiser | Contracts no importa fuentes de apps. |
| ARCH-CON-003 | Mixta | ESLint + revisión humana | Imports prohibidos automáticos; semántica del modelo humana. |
| ARCH-ALL-001 | Automática | dependency-cruiser | Detecta ciclos entre capas/workspaces dentro del grafo. |
| ARCH-ALL-002 | Mixta | ESLint + dependency-cruiser + `architecture-check.mjs` | Límites de imports y workspaces comprobados; nombres/rutas coherentes requieren revisión. |
| ARCH-API-007 | Humana | Revisión de código | Lógica deportiva y acceso disperso no se deducen de forma fiable por imports. |
| ARCH-ALL-003 | Humana | Revisión de código | El valor de abstracciones/capas depende de la necesidad funcional. |

Los controles automáticos son reglas de imports, no pruebas de comportamiento ni de propiedad funcional. CI define el check requerido `quality`; la protección remota de `main` y la ejecución real en GitHub quedan pendientes de publicación autorizada.
