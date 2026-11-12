# ADR-014: Integración PostgreSQL y TypeORM

- **Estado:** Aprobada para HC-01-03b
- **Contexto:** TRAKIA necesita conectar NestJS a PostgreSQL manteniendo el esquema bajo control explícito y dejando las migraciones ejecutables también antes de un despliegue.
- **Decisión:** PostgreSQL es la base relacional y TypeORM la capa de persistencia integrada mediante `@nestjs/typeorm`. Los módulos funcionales son propietarios de sus entidades; la infraestructura registra TypeORM y descubre las entidades compiladas y las registradas por Nest.
- **Migraciones:** Las migraciones versionadas se guardan en `apps/api/src/database/migrations`. Se ejecutan explícitamente mediante la CLI de TypeORM; la aplicación no las ejecuta al arrancar.
- **Seguridad del esquema:** `synchronize`, `migrationsRun` y `dropSchema` permanecen desactivados. La evolución del esquema ocurre únicamente mediante migraciones revisables.
- **Configuración:** La URL PostgreSQL se proporciona en `DATABASE_URL`, independientemente del entorno. `DATABASE_SSL` controla TLS y, cuando se activa, se conserva la validación de certificados.
- **Despliegue:** El comando de migración consume el JavaScript compilado y las variables del entorno, no inicia el servidor Nest ni requiere Compose. Puede ejecutarse como paso previo al arranque de una versión.
- **Consecuencias:** Desarrollo, pruebas aisladas y despliegues deben ejecutar las migraciones de forma explícita. Las credenciales no se incluyen en código ni en los registros.
