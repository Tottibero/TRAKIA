# ADR-015: Arquitectura modular y convenciones estructurales

- **Estado:** Aprobada para HC-01-03e
- **Contexto:** ADR-001 aprobó un monolito modular, ADR-002 separó frontend, backend y contratos, ADR-011 fijó NestJS, TypeORM y PostgreSQL, ADR-012 acordó TypeScript y Zod, y ADR-014 asignó las entidades a módulos funcionales manteniendo la configuración transversal de persistencia. Faltaban convenciones concretas para organizar código y controlar dependencias sin imponer complejidad innecesaria.
- **Decisión:** organizar el backend como monolito modular por funcionalidad y el frontend por features. Mantener contratos externos compartidos en `packages/contracts`, independientes de persistencia y de las aplicaciones. Aplicar separación ligera de responsabilidades: las capas internas se crean cuando el código las justifique, no como requisito uniforme.

## Arquitectura backend

La referencia de evolución para `apps/api/src` es `config/`, `database/`, `modules/<funcionalidad>/`, `app.module.ts` y `main.ts`. Actualmente existen `config/`, `database/`, `modules/health/`, `app.module.ts` y `main.ts`; `health` permanece pequeño y no se reorganiza. `exercises`, `training-plans`, `workouts` y `measurements` son ejemplos futuros, no directorios que deban crearse ahora.

Cada módulo es propietario de sus reglas, operaciones y datos, y expone únicamente proveedores seleccionados por su módulo NestJS. Para módulos que lo necesiten, `domain` contiene reglas e invariantes sin dependencias de NestJS, TypeORM, HTTP o infraestructura; `application` coordina casos de uso; `infrastructure` implementa persistencia e integraciones; `presentation` adapta HTTP y contratos externos a operaciones internas. Ninguna de estas carpetas es obligatoria por sí sola.

`database/` conserva la configuración transversal de PostgreSQL/TypeORM y las migraciones existentes. No es propietaria de entidades funcionales: conforme a ADR-014, las entidades pertenecen a los módulos funcionales y se registran mediante la integración ya establecida. Esta ADR no modifica `DatabaseModule`, TypeORM ni migraciones.

## Arquitectura frontend

La dirección de evolución es una organización por features bajo `apps/web/src/features/`, con inicialización y configuración transversal en `app/`, y capacidades reutilizables en `shared/`. Las features deportivas del árbol de referencia son futuras y no se crean en HC-01-03e. La estructura existente —`app/`, `router/`, `services/`, `views/`, `components/`, `stores/`— se conserva; su evolución se hará dentro de tareas funcionales, sin renombres cosméticos.

TanStack Query administra datos remotos, consultas, mutaciones y caché; Pinia mantiene estado global de aplicación o interfaz que deba compartirse y persistir entre componentes; Vue local administra formularios e interacciones temporales. No se duplica innecesariamente en Pinia el estado remoto ni se exige un store por feature. El cliente HTTP común pertenece a infraestructura compartida; cada feature organiza sus operaciones API y puede encapsularlas en composables.

## Contratos compartidos

`packages/contracts` contiene contratos externos con esquemas Zod y tipos inferidos, por ejemplo peticiones, respuestas y documentos JSON de importación. Sus fuentes ESM no importan NestJS, TypeORM, ni código de `apps/api` o `apps/web`. Las entidades TypeORM y los modelos internos del dominio permanecen en sus módulos backend. Cuando la representación externa difiera de la interna, la conversión es explícita. Los contratos se versionan cuando exista una necesidad de compatibilidad evolutiva, sin fijar ahora un mecanismo adicional.

## Reglas de dependencias

- Domain no depende de Application, Infrastructure ni Presentation.
- Application puede depender de Domain; Presentation puede depender de Application y de contratos externos; Infrastructure puede depender de Domain y de interfaces del módulo.
- Application puede utilizar repositorios TypeORM del mismo módulo si la simplicidad lo justifica. Las interfaces de repositorio son una opción cuando el acoplamiento dificulte pruebas o evolución, no un requisito universal.
- Application no depende de Presentation; controladores no se importan desde servicios de aplicación.
- Un módulo consume capacidades exportadas deliberadamente por otro; no importa sus archivos privados ni comparte repositorios indiscriminadamente.
- No hay dependencias circulares entre módulos. `forwardRef()` no es mecanismo habitual de integración. No se añaden buses ni eventos para comunicaciones sencillas.
- En Vue, `shared` no importa features y una feature no consume detalles privados de otra. Las referencias entre features se hacen mediante una interfaz pública acordada o mediante una extracción a shared cuando el concepto sea realmente transversal.

Conceptualmente, `training-plans` define planificación y referencias a ejercicios; `exercises` es propietario del catálogo y puede ofrecer una consulta pública de sus datos; `workouts` es propietario de sesiones ejecutadas y puede consultar esa capacidad pública para resolver información de ejercicios. La sesión no pasa a ser propietaria del catálogo, ni accede habitualmente a sus tablas. Las referencias entre módulos identifican capacidades o recursos según contratos explícitos; los contratos Zod son el formato externo y los modelos internos siguen privados. No se implementan aquí estas relaciones ni sus modelos.

## Alternativas consideradas

- **Arquitectura por carpetas globales** (`controllers/`, `services/`, `entities/`): descartada porque dispersa una funcionalidad entre toda la aplicación y debilita su propiedad modular.
- **Arquitectura hexagonal estricta en cada módulo:** descartada por coste y abstracciones uniformes que no responden al tamaño actual del sistema.
- **CQRS, event sourcing o bus de eventos:** descartados porque no hay una necesidad funcional concreta que los justifique.
- **Compartir entidades/modelos entre backend y frontend:** descartado porque acopla la API externa a persistencia e implementación interna.

## Justificación

Esta decisión concreta los límites internos del monolito modular aprobado en ADR-001, respeta la separación de ADR-002, el stack y la propiedad de entidades fijados por ADR-011/014, y completa las convenciones pendientes de ADR-012. La estructura por funcionalidad facilita localizar cambios y permite reforzar límites mediante verificaciones graduales. Las capas opcionales conservan claridad sin crear ceremonias para módulos pequeños.

## Consecuencias y limitaciones

- Los módulos nuevos deben declarar su propietario y dependencias antes de implementación.
- La encapsulación depende inicialmente de convenciones y revisión; NestJS por sí solo no impide imports de rutas privadas.
- La arquitectura no prescribe todavía mecanismos de export público entre features Vue ni versionado de contratos más allá de su evolución cuando sea necesario.
- La separación de responsabilidad dentro de controladores y servicios requiere revisión contextual; una comprobación de imports no determina si hay lógica deportiva en un controlador.
- No se reestructura el `health` existente ni se altera el código de aplicación en esta tarea.

## Relación con HC-01-04

HC-01-04 evaluará controles automáticos mínimos para las reglas identificadas como verificables en `docs/architecture/module-conventions.md`: límites de imports entre capas, módulos, features, workspaces y contracts, y ciclos de dependencias. Elegirá si bastan ESLint, dependency-cruiser u otra solución, evitando instalar o configurar herramientas como parte de esta ADR. Las reglas semánticas que requieren juicio humano seguirán en revisión de código.
