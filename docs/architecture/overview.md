# Visión general de arquitectura

## Principios aprobados

- **Monolito modular:** el producto se organiza como una aplicación personal con módulos delimitados; los límites internos concretos siguen pendientes.
- **Separación de responsabilidades:** frontend, backend y contratos compartidos viven en áreas separadas del monorepo.
- **Identidad de ejercicios:** TRAKIA asigna identificadores propios a los ejercicios. La forma de gestionarlos queda pendiente.
- **Referencias externas:** se permiten referencias opcionales a wger; el alcance de la integración queda pendiente.
- **Planificación y ejecución:** la planificación se mantiene diferenciada de la ejecución del entrenamiento; el modelo de datos concreto queda pendiente.
- **Continuidad de registro:** los resultados se guardan automáticamente y el sistema debe tolerar cortes de conexión. La estrategia de sincronización queda pendiente.
- **Acceso privado:** la autenticación es privada y está orientada a un único usuario. El mecanismo concreto queda pendiente.
- **Integraciones desacopladas:** las integraciones externas se mantienen desacopladas del núcleo. Los límites técnicos quedan pendientes.

## Stack acordado

Frontend Vue 3, TypeScript, Vite, Tailwind, Pinia y TanStack Query; backend NestJS, TypeORM y PostgreSQL; contratos compartidos TypeScript y Zod; despliegue futuro en alojamiento gestionado y PWA optimizada para móvil.

## Implementación base (HC-01-02)

- Workspace: `@trakia/web`, `@trakia/api` y `@trakia/contracts`.
- Frontend: Vue 3 con Router y Pinia; TanStack Query comparte un `QueryClient` de aplicación. Vite sirve en `5173` y reenvía `/api` a `http://localhost:3033` sin quitar el prefijo.
- Backend: NestJS organizado en módulos, con prefijo global `/api`; escucha en `PORT` o `3033` por defecto. `CORS_ORIGINS` es una lista separada por comas y su valor predeterminado es `http://localhost:5173`.
- Contratos: Zod define `HealthResponseSchema` (`status: "ok"`). El paquete ESM compila JavaScript y declaraciones TypeScript a `dist`; web y API lo importan por nombre de paquete y `workspace:*`.
- Salud técnica: `GET /api/health` valida su respuesta con el esquema compartido y no depende de almacenamiento ni servicios externos.

Los scripts raíz compilan contracts antes de las aplicaciones. Los comandos de desarrollo también hacen una compilación inicial del paquete compartido; tras cambiar sus fuentes, se vuelve a ejecutar `pnpm --filter @trakia/contracts build`.

Estos son detalles de inicialización; no añaden decisiones a HC-00 ni implementan persistencia, autenticación o funcionalidades deportivas.

## Pendientes de definición

Los detalles de módulos, entidades, interfaces, sincronización, autenticación, integración wger y despliegue se definirán en las tareas de diseño e implementación correspondientes. Este documento no prescribe decisiones adicionales.
