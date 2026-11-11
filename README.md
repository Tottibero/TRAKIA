# TRAKIA

TRAKIA es una aplicación web personal para planificar, ejecutar y registrar entrenamientos de fuerza, resistencia y HYROX.

## Stack acordado

- Monorepo con pnpm workspaces.
- Frontend: Vue 3, TypeScript, Vite, Tailwind CSS, Pinia, Vue Router y TanStack Query.
- Backend: NestJS y TypeScript.
- Contratos compartidos: TypeScript y Zod.
- Persistencia futura: TypeORM y PostgreSQL.
- Infraestructura prevista: Railway Hobby.
- Experiencia móvil con PWA.

El stack describe la arquitectura acordada; esta fase solo prepara la estructura del repositorio.

## Estructura del workspace

```text
apps/web/                 Aplicación frontend Vue 3
apps/api/                 API NestJS
packages/contracts/       Esquemas y tipos compartidos
docs/architecture/        Documentación de arquitectura
docs/decisions/           Registro de decisiones (ADR)
docs/contracts/           Documentación de contratos
docs/progress.md          Seguimiento de tareas
```

`@trakia/web` y `@trakia/api` dependen de `@trakia/contracts`; no existe una dependencia directa entre frontend y backend.

## Requisitos

- Node.js 26.13.0 LTS (versión fijada en `.nvmrc`).
- pnpm 12.19.0 (fijado en `package.json`).

## Instalación y desarrollo

Activa Node.js 26.13.0 en la raíz del repositorio y comprueba pnpm 12.19.0:

```sh
nvm use
pnpm --version
pnpm install
```

Arranca cada aplicación en una terminal distinta:

```sh
pnpm dev:api
pnpm dev:web
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:3033>
- Salud técnica: <http://localhost:3033/api/health>

`PORT` cambia el puerto del API; si no se define, se usa `3033`. Un valor inválido detiene el arranque con un error explícito. `CORS_ORIGINS` acepta una lista separada por comas y por defecto permite `http://localhost:5173`.

Vite conserva el prefijo `/api` y reenvía las peticiones a `http://localhost:3033`. Por ejemplo, `http://localhost:5173/api/health` llega al endpoint del backend.

Los comandos raíz compilan contracts antes de compilar o iniciar las aplicaciones:

```sh
pnpm build
pnpm typecheck
pnpm test
```

Durante el desarrollo, `pnpm dev:web` y `pnpm dev:api` compilan contracts al arrancar. Después de modificar `packages/contracts/src`, recompílalo con `pnpm --filter @trakia/contracts build`; Vite y Nest consumirán los artefactos actualizados de `dist`.

## Estado de esta fase

HC-01-01 preparó el workspace y su documentación. HC-01-02 inicializa las aplicaciones web y API, el contrato técnico de salud y sus herramientas de compilación. No implementa funcionalidades deportivas, autenticación, persistencia, PWA instalable, Docker, Railway ni CI/CD.
