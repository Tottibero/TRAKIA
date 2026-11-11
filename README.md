# TRAKIA

TRAKIA es una aplicación web personal para planificar, ejecutar y registrar entrenamientos de fuerza, resistencia y HYROX.

## Objetivo

Reunir en una sola aplicación la planificación del entrenamiento y el registro de cada sesión, con acceso privado para una persona y una experiencia cómoda en dispositivos móviles.

## Funcionalidades contempladas en el diseño

- Crear y organizar ejercicios con identificadores propios y referencias externas opcionales.
- Mantener los planes de entrenamiento separados de la ejecución de cada sesión.
- Registrar resultados con guardado automático y tolerancia a interrupciones de conexión.
- Mantener integraciones externas desacopladas del núcleo del producto.
- Ofrecer una experiencia optimizada para móvil mediante una PWA.

Estas capacidades describen el diseño del producto; su inclusión aquí no implica que ya estén implementadas.

## Stack tecnológico

- Monorepo con pnpm workspaces.
- Frontend: Vue 3, TypeScript, Vite, Tailwind CSS, Pinia, Vue Router y TanStack Query.
- Backend: NestJS y TypeScript.
- Persistencia diseñada: TypeORM y PostgreSQL.
- Contratos compartidos: TypeScript y Zod.

## Arquitectura

El repositorio organiza la aplicación como un monolito modular con responsabilidades separadas:

- `apps/web`: interfaz web.
- `apps/api`: API del producto.
- `packages/contracts`: esquemas y tipos compartidos entre aplicaciones.
- `docs`: arquitectura, contratos y decisiones técnicas.

La interfaz y la API consumen los contratos compartidos; no dependen directamente entre sí.

## Principios técnicos

- Mantener separados frontend, backend y contratos compartidos.
- Separar la planificación de la ejecución de los entrenamientos.
- Usar identificadores propios para los ejercicios y permitir referencias externas opcionales.
- Desacoplar las integraciones externas del núcleo.
- Diseñar el registro para guardar resultados automáticamente y tolerar cortes de conexión.
- Mantener el acceso privado y orientado a un único usuario.

## Documentación

- [Visión de arquitectura](docs/architecture/overview.md)
- [Decisiones de arquitectura](docs/decisions/)
- [Contratos](docs/contracts/)
- [Desarrollo local](docs/development.md)
