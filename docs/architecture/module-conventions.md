# Convenciones de arquitectura modular

Esta guía desarrolla [ADR-015](../decisions/ADR-015-arquitectura-modular.md). Se aplica al implementar funcionalidades nuevas y al ampliar módulos existentes. Los árboles marcados como referencia futura no describen todos los archivos presentes hoy ni autorizan crear módulos vacíos.

## Estado actual y dirección de evolución

- API: hay `config/`, `database/`, `modules/health/`, `app.module.ts` y `main.ts`. `health` contiene controller y module. `DatabaseModule` configura TypeORM; la entidad funcional que pueda añadirse en el futuro pertenecerá a su módulo.
- Web: existen `app/createTrakiaApp.ts`, `router/index.ts`, `services/health.ts`, `views/HomeView.vue`, `App.vue`, `main.ts`, además de directorios de soporte. Se conservan sus rutas actuales; nuevas capacidades se organizan por feature y la migración gradual se hace solo cuando una tarea funcional lo requiera.
- Contracts: `src/index.ts` es el punto de entrada público de `@trakia/contracts`; los contratos se organizan por dominio funcional, junto a sus pruebas. `src/health.ts` permanece como archivo independiente mientras su responsabilidad siga siendo pequeña. El paquete usa ESM y la compilación TypeScript produce `dist`.
- Los módulos y features deportivos que aparecen más abajo son ejemplos de organización futura. No se crean en HC-01-03e.

## Backend NestJS

La organización de referencia es:

```text
apps/api/src/
├── config/
├── database/
├── modules/
│   └── health/
├── app.module.ts
└── main.ts
```

Un módulo pequeño puede seguir el ejemplo real:

```text
health/
├── health.controller.ts
└── health.module.ts
```

No hay que añadir `domain/`, `application/`, `infrastructure/` o `presentation/` hasta que exista código que se beneficie de la separación. Un módulo de mayor complejidad puede usar:

```text
workouts/
├── domain/
├── application/
├── infrastructure/
├── presentation/
└── workouts.module.ts
```

Responsabilidades cuando se empleen:

- `domain/`: reglas, invariantes, estados y tipos internos independientes de framework y persistencia.
- `application/`: casos de uso y coordinación. Puede usar repositorios TypeORM del mismo módulo si es proporcionado; una interfaz se introduce cuando reduzca acoplamiento o facilite pruebas.
- `infrastructure/`: entidades TypeORM, persistencia, adaptadores y clientes externos.
- `presentation/`: controladores y traducción de HTTP/contratos a operaciones de aplicación.
- `*.module.ts`: composición NestJS y selección explícita de providers públicos.

Los controladores reciben y validan entradas, delegan la operación y preparan respuestas; las reglas deportivas y persistencia no deben dispersarse en ellos. Es un criterio de diseño revisado por personas, no algo que pueda probarse únicamente mediante análisis de imports.

### Imports y comunicación

Reglas obligatorias:

- Domain no importa Application, Infrastructure, Presentation, NestJS, TypeORM ni HTTP.
- Application puede importar Domain. No importa Presentation. La persistencia TypeORM del mismo módulo está permitida si la simplicidad lo justifica.
- Presentation importa Application y contratos externos. No contiene acceso de persistencia disperso.
- Infrastructure puede importar Domain y las interfaces definidas por el módulo.
- Un módulo importa otros módulos por sus providers exportados intencionalmente, nunca por rutas a archivos privados. No se comparte un repositorio TypeORM por conveniencia.
- No se consulta directamente como integración habitual la tabla propiedad de otro módulo. Se llama a su capacidad pública.
- Evitar ciclos. `forwardRef()` no es solución habitual; para interacciones sencillas no introducir buses ni eventos.

Ejemplo permitido: el módulo de workouts importa el módulo de catálogo si este exporta un servicio de consulta pública. Ejemplo que se evita: `workouts` importa `modules/exercises/infrastructure/exercise.repository.js` o registra directamente su repositorio.

Conceptualmente, training-plans conserva la planificación; exercises es dueño del catálogo; workouts conserva la ejecución y consulta, mediante una capacidad exportada, los datos públicos del ejercicio que necesita. Un identificador o referencia de módulo no convierte los modelos internos en contratos compartidos.

`config/` aloja configuración de aplicación. `database/` aloja integración transversal de TypeORM y migraciones versionadas. La propiedad de entidades sigue en el módulo funcional, como establece ADR-014. Esta guía no propone cambiar `DatabaseModule` ni el registro actual.

## Frontend Vue

Estructura objetivo orientativa:

```text
apps/web/src/
├── app/                 # inicialización, router y providers
├── features/            # capacidades de producto por funcionalidad
├── shared/              # infraestructura y UI verdaderamente transversal
└── main.ts
```

Cada feature puede contener sus vistas, componentes, composables, consultas, mutaciones y estado específico. No se exige un store Pinia por feature. En el estado actual, las rutas y el servicio de salud siguen en sus ubicaciones existentes; no se mueven por esta convención.

- `app/`: arranque de Vue, router, providers y configuración transversal.
- `features/<nombre>/`: implementación específica de esa funcionalidad.
- `shared/api/`: cliente HTTP común y comportamiento transversal de transporte.
- `shared/components/`, `shared/composables/`, `shared/utils/`: elementos independientes y reutilizables.

Mantén una capacidad dentro de su feature hasta que haya consumidores reales en más de una feature y su semántica sea general. Extrae a `shared` solo una responsabilidad independiente de la lógica de negocio de una feature. `shared` no importa implementaciones de features; una feature no accede a los detalles internos de otra.

TanStack Query es propietario del estado de datos remotos, consultas, mutaciones, caché e invalidaciones. Pinia guarda estado global de aplicación/interfaz que debe compartirse entre componentes. No dupliques allí datos que TanStack Query ya administra. Usa estado Vue local para formularios e interacciones temporales.

El cliente HTTP común está en infraestructura compartida; cada feature define sus llamadas a la API y puede exponer composables para encapsular queries/mutations. Los componentes no crean clientes HTTP propios. Valida con contratos Zod compartidos cuando corresponda. Centraliza errores transversales solo si aporta valor, manteniendo mensajes o decisiones propios de cada operación en su feature.

## Contratos Zod

Los contratos se agrupan por dominio funcional. Cada dominio contiene sus esquemas, tipos inferidos y pruebas relacionadas. Se crean archivos separados cuando exista una responsabilidad que lo justifique, sin carpetas vacías:

```text
packages/contracts/src/
├── auth/
│   └── auth.ts
├── exercises/
│   ├── exercise.ts
│   └── exercise.spec.ts
├── health.ts
└── index.ts
```

`src/index.ts` conserva las exportaciones públicas deliberadas y estables del paquete. No se crean barrels secundarios ni abstracciones preventivamente; cada dominio exporta al punto de entrada solo lo que forma parte de la API compartida.

Convenciones:

- Exporta un esquema Zod y, cuando resulte útil al consumidor, el tipo inferido (`z.infer<typeof SomeSchema>`).
- Agrupa contratos de petición, respuesta o importación JSON que pertenezcan a la misma capacidad; evita esquemas duplicados sin necesidad.
- El paquete es ESM. Conserva imports compatibles con NodeNext, incluidos sufijos `.js` en rutas relativas de fuentes TypeScript, y usa el paquete compilado `@trakia/contracts` desde las aplicaciones, nunca imports profundos desde `apps/api` o `apps/web`.
- Contracts no depende de NestJS, TypeORM, Vue, código de API/web ni modelos internos o de persistencia.
- Las entidades TypeORM y modelos internos permanecen en el backend. Convierte explícitamente entre representación interna y externa cuando difieran.
- Introduce versionado del contrato cuando exista necesidad de compatibilidad con documentos persistidos o consumidores desplegados; no crees versiones redundantes preventivamente.

## Nombres y exports

- NestJS: `*.module.ts`, `*.controller.ts`, `*.service.ts`; entidad TypeORM `*.entity.ts`.
- Pruebas: `*.spec.ts`, junto al código que prueban para pruebas unitarias. Integración y E2E se ubican en las áreas de pruebas del paquete, separadas de unitarias cuando necesiten infraestructura.
- Vue: componentes en PascalCase; composables con `useNombre.ts`, respetando la convención del área existente si ya se estableció otra.
- Archivos de dominio e infraestructura en kebab-case salvo convención exigida por framework.
- Los imports relativos del backend/contracts siguen ESM/NodeNext con extensión `.js` en el specifier cuando corresponda. La web usa las resoluciones declaradas por su configuración Bundler; no se inventan aliases que no estén configurados.
- Exporta desde el archivo de módulo o punto público deliberado lo que otros módulos necesiten. Un `index.ts` se permite como API pública pequeña y estable de un paquete o módulo. No crees barrels que reexporten indiscriminadamente internos; pueden ocultar ciclos y ampliar acoplamiento.
- No renombres los archivos actuales por estética.

## Estrategia de pruebas

- **Unitarias:** `*.spec.ts` junto al código; reglas de dominio y servicios, rápidas y deterministas. Usa mocks cuando el límite externo lo necesite, no por rutina.
- **Integración:** separadas de unitarias si requieren infraestructura real; PostgreSQL aislado y configuración de pruebas dedicada. No conectes a producción ni destruyas datos de desarrollo. Cubre integración NestJS/TypeORM y validación de contratos cuando aplique.
- **E2E:** API mediante escenarios completos de petición/respuesta; web mediante flujos importantes cuando existan. Prioriza los recorridos principales de TRAKIA.
- Los datos y migraciones de test deben estar aislados. La estrategia concreta de provisión del PostgreSQL de pruebas se decidirá al implementar esos tests.

## Catálogo para HC-01-04

Los identificadores son estables para discutir y automatizar las reglas. “Automática” indica que una herramienta puede detectar el patrón sintáctico; las verificaciones no prueban por sí mismas corrección funcional. “Humana” requiere revisar intención y responsabilidades. Los ejemplos son esquemáticos.

| ID | Regla y alcance | Permitido | Prohibido | Verificación posible | Fuerza |
| --- | --- | --- | --- | --- | --- |
| ARCH-API-001 | Domain no importa NestJS. `apps/api/src/modules/**/domain/**` | Función pura y tipos locales | Importar `@nestjs/common` | Imports/lint | Obligatoria; automática |
| ARCH-API-002 | Domain no importa TypeORM | Entidad TypeORM en infrastructure | `@Entity()` o `typeorm` en domain | Imports/lint | Obligatoria; automática |
| ARCH-API-003 | Domain no importa application, presentation ni infrastructure | Regla de dominio aislada | Importar `../application/...`, `../presentation/...` o `../infrastructure/...` | Grafo de imports | Obligatoria; automática |
| ARCH-API-004 | Un módulo no importa internos de otro módulo | Importar módulo/provider público exportado | Importar `modules/exercises/.../private-file` desde workouts | Regla de paths/ESLint o dependency-cruiser | Obligatoria; automática si se marca la convención pública |
| ARCH-API-005 | No hay ciclos de dependencia entre módulos | A depende de la API pública de B sin retorno | A→B→A | Analizador de grafo | Obligatoria; automática |
| ARCH-API-006 | Application no importa Presentation; controller delega al caso de uso | Controller llama servicio de aplicación | Servicio importa controller | Regla de grafo automática; comprobar contenido del controller requiere revisión humana | Import obligatorio automático; responsabilidad humana |
| ARCH-WEB-001 | shared no importa features | Feature importa cliente desde shared | `shared/api` importa `features/workouts` | Regla de paths/grafo | Obligatoria; automática |
| ARCH-WEB-002 | Una feature no importa internos de otra | Uso de API pública explícita acordada | `features/plans` importa `features/exercises/components/Private.vue` | Regla de paths/grafo | Obligatoria; automática al identificar exports públicos |
| ARCH-WEB-003 | Cliente HTTP común centralizado | Feature usa cliente compartido | Componente crea un cliente fetch/axios propio para la API | Búsqueda/lint puede detectar patrones; excepciones requieren revisión | Obligatoria; parcialmente automática |
| ARCH-WEB-004 | Vue no importa entidades TypeORM | Tipos externos desde contracts | Importar `apps/api/...entity` | Grafo/lint y límites de workspace | Obligatoria; automática |
| ARCH-CON-001 | Contracts no importa NestJS ni TypeORM | Zod, TypeScript y dependencias neutrales | Importar `@nestjs/common` o `typeorm` | Imports/lint | Obligatoria; automática |
| ARCH-CON-002 | Contracts no importa código de apps | Contrato definido dentro del paquete | Importar `../../apps/api/...` | Grafo/TypeScript | Obligatoria; automática |
| ARCH-CON-003 | Contracts no define modelos de persistencia | Schema de respuesta independiente | Entidad decorada con TypeORM | Import checks; semántica de modelo requiere revisión | Obligatoria; import automática, contenido humana |
| ARCH-ALL-001 | No crear ciclos entre capas/workspaces | Grafo dirigido acíclico | A importa B y B vuelve a importar A | Analizador de dependencias | Obligatoria; automática |
| ARCH-ALL-002 | Respetar límites de workspace y nombres/rutas coherentes | App consume contracts por `@trakia/contracts` | Import relativo profundo a fuentes de otro workspace | Package boundaries y lint; nombres vía convención | Obligatoria; imports automáticos, nombres parcialmente automáticos |
| ARCH-API-007 | Evitar lógica deportiva y persistencia dispersa en controllers | Controller traduce entrada y delega | Controller contiene reglas de sesión o consultas SQL | Revisión de código; no se afirma que imports lo demuestren | Obligatoria; humana |
| ARCH-ALL-003 | Crear capas/abstracciones solo cuando se justifiquen | Módulo pequeño con controller y module | Carpetas vacías, base service genérico preventivo | Revisión de código | Obligatoria; humana |

HC-01-04 decidirá si ESLint, dependency-cruiser u otra alternativa mínima satisface las reglas automáticas. No se instala ni configura ninguna herramienta en HC-01-03e. Los criterios semánticos (propiedad funcional, lógica de negocio, valor real de una abstracción) requieren revisión humana.
