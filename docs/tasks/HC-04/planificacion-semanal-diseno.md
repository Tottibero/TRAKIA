# Diseño técnico de planificación semanal

## Propósito y límites

HC-04 propone una Home de consulta semanal que reúne las sesiones y descansos de todos los planes importados, más una pantalla propia para cada sesión. La semana consta de fechas civiles de lunes a domingo. La implementación futura consume la planificación existente; no edita planes ni inicia ejecuciones.

El propietario aprobó expresamente D1–D29 y T1–T7. Son decisiones normativas para la implementación de HC-04. El desglose posterior sigue siendo planificación; no se crean fichas ni se inicia HC-04-02.

## Decisiones aprobadas

### D1–D29: funcionales

- **D1–D4:** semana de lunes a domingo; apertura en la semana actual; hoy destacado y expandido; demás días consultables mediante expansión.
- **D5–D8:** varias sesiones por día; descanso explícito distinto de día sin planificación; calendario mensual aplazado; Home de consulta, sin ejecución.
- **D9–D11:** expansiones de días independientes; resumen de bloques y ejercicios; conservación de semana y expansiones al regresar del detalle y semana actual en una apertura en frío.
- **D12–D15:** preparar identidad/navegación para estados reales futuros sin implementarlos; pantalla y URL propia por sesión; unificar todos los planes importados; orden automático y determinista sin prioridad deportiva.
- **D16–D18:** mostrar los siete días y compactar descanso/día vacío; bienvenida e importador cuando no haya planes; tras confirmar, ofrecer «Ver planificación» en la primera semana resultante sin redirección automática.
- **D19–D21:** todos los bloques y objetivos en el detalle por defecto; alternativas desplegables con sus objetivos sin alterar la planificación; información complementaria, imágenes, vídeos y wger después del MVP.
- **D22–D23:** consultas online con TanStack Query y caché en memoria; persistencia offline aplazada a HC-05; invalidación tras confirmación y revalidación de datos obsoletos sin polling.
- **D24–D29:** móvil de una columna; cabeceras expandibles y navegación independiente a cada sesión; objetivos táctiles mínimos de 44 × 44 px, foco visible, teclado y estados no expresados solo por color; carga/error/reintento con caché cuando proceda; cambio de día civil en `Europe/Madrid`; exclusión de edición, drag-and-drop, estadísticas, vídeos y resultados.

### T1–T7: técnicas

- **T1:** las rutas HTTP de plan y sesión usan sus UUID internos persistidos. El detalle verifica que la sesión pertenece al plan. La identidad de dominio para importación/comparación conserva `(origin, planKey)` y la clave de sesión; `planKey` sin `origin` no se usa como identidad global.
- **T2:** consulta semanal inclusiva de siete fechas civiles con las entradas de todos los planes importados, descansos explícitos e `hasImportedPlans`.
- **T3:** detalle mediante consulta específica por sesión, sin cargar el historial completo del plan.
- **T4:** resolver ejercicios con una capability pública agrupada de `ExerciseCatalogService`, evitando consultas individuales por aparición y cualquier lectura del catálogo desde tablas privadas.
- **T5:** no elegir arbitrariamente una clave de catálogo ante una referencia histórica ambigua ni publicar identificadores ficticios. Separar el ID interno del ejercicio de sus claves descriptivas; mostrar la información resoluble y comunicar con claridad la referencia no disponible.
- **T6:** identificar sesiones con el nombre del plan y, cuando haga falta, la clave estable de sesión. No inventar títulos deportivos ni modificar JSON v1.
- **T7:** tras confirmar, ofrecer «Ver planificación» solo si la propuesta revisada coincide con el plan confirmado; abrir la semana que contiene `proposal.startDate`, sin redirección automática. La Home abierta sin contexto inicia en la semana actual.

## Evidencia del sistema actual

- `packages/contracts/src/training-plans/training-plan.ts` define fechas reales `YYYY-MM-DD`, planes con entradas `session` y `rest`, varias sesiones en una fecha, claves estables y bloques `sets`, `circuit` e `intervals`. El circuito diferencia `mode: rounds` con `rounds` de `mode: amrap` con `maxDurationSeconds`. Conserva fases, objetivos generales, alternativas y ajustes indexados por serie/ronda. No hay un título de sesión independiente.
- `packages/contracts/src/exercises/exercise.ts` define el catálogo y las métricas compatibles. Los objetivos de una alternativa pueden diferir de los del ejercicio principal.
- `apps/api/src/modules/training-plans/` es dueño de entidades y persistencia de planes. Los planes y entradas tienen UUID persistidos; las claves estables y el origen identifican el dominio de importación. `TrainingPlanService.findForImport` reconstruye el agregado para la revisión de importación; todavía no hay controller ni endpoint de lectura de calendario o sesión.
- `TrainingPlanAppearance` persiste `exercise_id` y conserva `exercise_key` nullable. El lector de importación `TrainingPlanService.findForImport` actualmente consulta `exercise_catalog_keys` para reconstruir referencias históricas; esa ruta existente no es una integración pública que deba copiar el calendario. La lógica nueva no debe leer directamente esa ni otras tablas de `exercises`.
- `ExerciseCatalogService.findByKey` es una capability actualmente exportada por `ExercisesModule`; su lectura es por clave. Para resolver en lote las referencias persistidas por identidad de catálogo, el diseño recomienda añadir una capability pública pequeña que devuelva resúmenes por IDs únicos. El provider debe leer sus propias tablas y devolver datos de contrato, no entidades TypeORM.
- `apps/api/src/modules/workouts/` solo exporta hoy `WorkoutExecutionProtectionService`; no hay una capability pública de consulta de estado para esta Home. Los contratos de ejecución ya distinguen `in_progress`, `paused` y `completed`, pero HC-04 no crea ni simula estados.
- La API instala `AuthGuard` como `APP_GUARD` y usa el prefijo `/api`. La autenticación aprobada es privada y de usuario único (ADR-008).
- `HomeView.vue` es actualmente una portada con estado de salud e importación. El router protege `/` y `/training-plans/import`. TanStack Query administra la caché en memoria; `queryClient` no configura persistencia offline ni polling. El cliente HTTP común está en `shared/api/http.ts`.
- La feature del importador obtiene una `TrainingPlanDefinition` combinada en `review.proposal`. La confirmación devuelve estado y cambios, pero no fechas. Al confirmar no invalida consultas ni ofrece un CTA de planificación.

## Modelo funcional de la Home

1. La ruta `/` abre la semana civil actual en `Europe/Madrid`. La vista presenta siempre siete cabeceras ordenadas de lunes a domingo. Hoy se destaca con texto/semántica además de color y aparece expandido inicialmente.
2. Cada cabecera es un control de expansión independiente. Pueden permanecer expandidos varios días. Descanso explícito y día sin entradas son conceptos distintos; ambos se presentan compactos. Si hay una o más sesiones, se muestran todas en orden determinista.
3. El orden entre entradas del mismo día es ordinal por `plan.origin`, `plan.key` y la clave estable de entrada. `(origin, key)` es la identidad de dominio del plan; el UUID persistido identifica el recurso HTTP. No se ordena por fuerza, modalidad ni prioridad deportiva. Los bloques, fases y apariciones mantienen el orden persistido (`position`/arrays).
4. La tarjeta de sesión puede identificarla como **«Sesión · {plan.name} · {session.key}»**. El nombre del plan y la clave de sesión son datos existentes; no se inventa un título deportivo ni se modifica JSON v1. La clave estable resuelve homónimos y sesiones del mismo plan/fecha.
5. Al expandir un día se ofrece un resumen de bloques y nombres de ejercicios, manteniendo separados los enlaces a cada detalle. El resumen no transforma una ausencia de planificación en descanso.
6. Un indicador de existencia de planes se obtiene por separado de las entradas del rango: sin ningún plan importado se presenta bienvenida y acceso al importador; si existen planes pero la semana no contiene entradas, se presentan los siete días vacíos compactos y una explicación distinta.
7. La Home sigue siendo de consulta. No hay edición manual, calendario mensual, drag-and-drop, estadísticas ni controles de ejecución.

## API y contratos propuestos

### Consulta semanal

La ruta aprobada es `GET /api/training-plans/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`. `from` y `to` son fechas civiles inclusivas y delimitan exactamente un lunes y su domingo, según `Europe/Madrid`. El controller valida la entrada con un esquema Zod de contrato; fechas inválidas o rangos distintos de siete días devuelven un error HTTP de petición inválida. La respuesta contiene exclusivamente esas siete fechas y sus entradas de todos los planes importados.

La respuesta Zod debe ser una proyección externa, sin entidades ni columnas internas, por ejemplo:

```ts
{
  from: PlanDate,
  to: PlanDate,
  hasImportedPlans: boolean,
  days: Array<{
    date: PlanDate,
    entries: Array<
      | { type: 'rest'; planId: string; origin: string; planKey: string; planName: string; key: string }
      | {
          type: 'session'; planId: string; origin: string; planKey: string; planName: string;
          sessionId: string; sessionKey: string; blocks: SessionBlockSummary[]
        }
    >
  }>
}
```

`days` siempre contiene exclusivamente los siete días solicitados. `hasImportedPlans: false` comunica que no existe ningún plan importado; `true` con las siete listas `entries` vacías comunica una semana sin planificación. La existencia se consulta aparte de las filas del rango. Actualmente el importador usa el origen `trakia-json-v1`; la consulta semanal incluye todos los orígenes de planes importados, sin usar `planKey` aislado como identidad.

`SessionBlockSummary` contiene solo lo que requiere la Home: clave, modalidad, subtipo cuando aplique, conteos pertinentes y referencias de ejercicios con nombre del catálogo. En `intervals` conserva el orden de fases y distingue fases sin ejercicio (recuperación pasiva) de fase con ejercicio (recuperación activa); no recalcula resultados. Los objetivos completos pertenecen al endpoint de detalle.

### Detalle de sesión

La ruta aprobada es `GET /api/training-plans/:planId/sessions/:sessionId`, donde ambos parámetros son UUID internos persistidos. La consulta debe verificar en el mismo acceso que `sessionId` identifica una entrada de tipo `session` cuyo `plan_id` coincide con `planId`; un ID inexistente, de descanso o perteneciente a otro plan responde 404. Así, una clave de dominio no se confunde con la identidad de un recurso HTTP.

La consulta de detalle es específica a esa sesión: no carga ni reconstruye el historial completo del plan. La respuesta Zod incluye plan (`id`, `origin`, `key`, `name`), sesión (`id`, `key`, fecha civil) y todos sus bloques, fases, ejercicios, objetivos, descansos y alternativas. Un DTO de lectura conserva la estructura y los objetivos del plan, y enriquece cada aparición con su identidad real de ejercicio y los datos descriptivos resolubles. No devuelve entidades TypeORM. La ausencia de plan o sesión produce 404; el no tener planes en Home es un estado 200 de calendario, no un 404.

Los esquemas pueden vivir en `packages/contracts/src/training-plans/training-plan-read-http.ts`, con exportaciones deliberadas desde `packages/contracts/src/index.ts`. La controller propuesta es `apps/api/src/modules/training-plans/training-plans.controller.ts`; `TrainingPlanReadService` se registra en `training-plans.module.ts`. HC-04-02 deberá añadir pruebas de contrato, pertenencia de IDs, mapping y HTTP para estas decisiones.

### Propiedad modular y autenticación

- Añadir en la raíz de `modules/training-plans/` un provider de lectura de propósito concreto (`TrainingPlanReadService`), con `findCalendar(from, to)` y `findSession(planId, sessionId)`. El módulo lo registra y su controller delega en él; no se añade un repositorio genérico ni se mueven las capas existentes. El provider consulta exclusivamente tablas de planificación (`training_plans`, entradas, bloques, fases y apariciones) y convierte el resultado a los DTO Zod.
- `training-plans` resuelve nombres mediante una capability pública de `ExercisesModule` y pasa únicamente identidades de catálogo necesarias. No importa archivos internos de `exercises`, consulta sus tablas ni comparte repositorios TypeORM.
- La capability agrupada sugerida recibe IDs de ejercicio únicos y devuelve identidad interna, claves de catálogo disponibles, nombre y métricas soportadas. Es una extensión concreta a `ExerciseCatalogService`, justificada por `exercise_id` persistido y por evitar una consulta por aparición. Solo se expone desde el módulo de catálogo y no accede a tablas desde `training-plans`.
- La identidad interna `exercise_id` se mantiene separada de `exercise_key` (clave estable de catálogo TRAKIA) y de `externalReferences` (por ejemplo, wger o YouTube). Si la clave histórica está persistida se conserva; si falta y existe una sola clave de catálogo, puede resolverse sin ambigüedad. Si hay varias, ninguna se elige: el DTO mantiene la identidad interna y, si existe, el nombre real del catálogo, deja la clave descriptiva ausente y la interfaz comunica que no pudo determinarse. No publica `unresolved-*` ni muestra el UUID como nombre. Si tampoco puede obtenerse el nombre, presenta un estado explícito de nombre no disponible y conserva intactos bloques y objetivos.
- Las rutas no se marcan públicas: quedan detrás del `AuthGuard` global existente. Se aplican las respuestas HTTP de auth usadas en la API. No se introduce un nuevo modelo de propietario ni una segunda autenticación.
- `workouts` no participa en estos endpoints. No se consulta su tabla ni se muestra un estado ficticio. Una capacidad real de estado se integrará en una tarea posterior que la autorice.

### Orden, límites y ausencia

La semana acota la consulta a siete fechas civiles y el detalle a una sesión. Se ordenan planes/entradas mediante comparación ordinal determinista de `origin`, `planKey` y clave de entrada; dentro de cada sesión se conserva el orden del plan. No hay prioridad deportiva, colación dependiente del idioma ni deduplicación de entradas entre planes. Restricciones sesión/descanso y claves se evalúan dentro de cada plan; por ello, un descanso de un plan puede coexistir en la respuesta con una sesión de otro.

Los UUID `planId` y `sessionId` se usan para rutas y cachés HTTP. La identidad de dominio de importación y comparación continúa siendo `(origin, planKey)`; las claves estables de sesión continúan dentro de ese ámbito. La base actual también declara un índice único global sobre `planKey`, además del índice `(origin, key)`. HC-04 no cambia ese esquema: el índice existente no convierte `planKey` aislado en identidad HTTP ni sustituye el ámbito de dominio aprobado.

No se propone paginación para siete fechas ni límites artificiales que el contrato no define. El DTO de calendario incluye solo resúmenes y el detalle obtiene una sesión; los datos de importación existentes ya se limitan a 1 MiB en HTTP. Si el volumen real justifica límites adicionales, se decidirán con métricas y compatibilidad de contrato.

## Frontend y navegación

- Crear la feature `training-plan-calendar` con API propia, query composables y vistas, y exportaciones deliberadas. Mantener `/` como Home semanal y añadir la ruta protegida `/training-plans/:planId/sessions/:sessionId`. El cliente HTTP sigue en `shared/api/http.ts`.
- La query de calendario usa `['training-plans', 'calendar', from, to]`; el detalle usa `['training-plans', 'session', planId, sessionId]`. Los IDs forman parte de la URL y de su caché; las claves de dominio y el origen siguen disponibles para identificación/comparación de importación. TanStack Query es dueño de los datos remotos y de la caché en memoria; no se crea Pinia ni se duplica el estado remoto.
- La semana seleccionada y las fechas expandidas se serializan en query params de `/` (por ejemplo `week=<lunes>&expanded=<fechas>`). Los enlaces a detalle conservan ese contexto para volver a la misma semana y expansiones; el path de detalle sigue identificando el mismo recurso. Si se abre `/` sin parámetros, se inicializa la semana actual y solo hoy expandido. No se persiste selección entre aperturas en frío.
- Para no confundir datos de semanas, el estado de carga se refiere al rango elegido. Si falla una revalidación y hay datos cacheados de ese mismo rango, se conserva el contenido y se muestra error no bloqueante con reintento; sin datos se muestra error con acción de reintentar. La ausencia de planes y la semana vacía solo se derivan de una respuesta satisfactoria.
- Antes de confirmar, conservar la propuesta confirmable (`proposal.key`, `proposal.startDate`) y el recibo asociados a la solicitud. Tras una respuesta correcta (`confirmed` o `unchanged`), comprobar que `confirmation.changes` contiene `kind: 'plan'` y la misma `key` de la propuesta, bajo el origen de importación asociado al recibo. Solo entonces invalidar el prefijo de consultas de planificación y mostrar **«Ver planificación»**, sin navegación automática, hacia la semana que contiene ese `proposal.startDate`, anclada al lunes en `Europe/Madrid`. Si no coincide, no generar el enlace. No se modifica JSON v1 ni la respuesta de confirmación.
- Se conservan los valores predeterminados actuales de TanStack Query, incluida la revalidación de datos obsoletos; no se añade polling ni persistencia offline. HC-05 decide persistencia offline. Si una política común de reintentos cambia antes de HC-04, las queries seguirán esa política y ofrecerán reintento manual.

## Detalle deportivo y presentación

El detalle muestra todos los bloques en su orden y todos los objetivos disponibles de forma abierta por defecto. `sets` presenta series y ajustes por serie; circuitos fijos presentan rondas y ajustes indexados, mientras que AMRAP presenta su duración máxima sin atribuirle rondas prescritas; `intervals` presenta ciclos, fases ordenadas y ventanas. Se conservan descansos orientativos y objetivos opcionales cuando existen.

Cada alternativa se muestra en una sección desplegable accesible, con su nombre de catálogo, métricas compatibles y sus propios `targetOverrides`. Se respetan herencia, sobrescritura, eliminación con `null` y ajustes por índice descritos en HC-02; puede reutilizarse `resolveExerciseTargets` de `@trakia/contracts` para resolver objetivos generales. No se cambia la alternativa ni la planificación al desplegarla. No se interpretan datos ausentes como cero ni como objetivos inferidos. Si varias claves de catálogo pudieran corresponder a una identidad interna sin clave histórica, no se elige una: se muestra el nombre descriptivo resuelto y un estado explícito de clave no disponible. Si tampoco hay nombre, el estado no disponible se comunica sin mostrar el UUID como descripción ni inventar título.

Información complementaria, imágenes, vídeos, wger y edición quedan después del MVP. No se muestran resultados o estadísticas.

## Accesibilidad, adaptación y cambio civil

- En móvil se usa una sola columna vertical, sin dependencia de scroll horizontal.
- Cabeceras de día son botones nativos con `aria-expanded` y destino asociado. Cada sesión ofrece un enlace separado al detalle; el control de expansión no sustituye la navegación.
- Controles táctiles y enlaces tienen un área de al menos 44 × 44 px; foco visible, orden de tabulación lógico, operación completa por teclado y `<details>/<summary>` o controles equivalentes semánticos.
- Hoy, descanso, día sin planificación, sesión, carga y error se comunican con texto/semántica además del color. Mensajes de consulta se anuncian de forma adecuada y el reintento tiene nombre accesible.
- La fecha de hoy se obtiene de una fecha civil explícita en `Europe/Madrid`, no de la zona horaria local del dispositivo. Un temporizador al siguiente cambio civil y revalidación al recuperar foco/visibilidad actualizan hoy y, si la semana no fue elegida manualmente, la semana actual sin reiniciar la aplicación. Este reloj local no son consultas periódicas a la API.

## Caché y actualización de datos

TanStack Query mantiene consultas en memoria. No hay IndexedDB, localStorage, service worker ni estrategia offline de planificación en HC-04. Al confirmar importación se invalidan calendarios y detalles bajo el prefijo de planificación; no se invalidan en errores o cancelaciones. Al regresar del detalle, se reutiliza la caché de la semana y se revalida según las opciones existentes. No hay polling. Un cambio civil de día actualiza el resaltado/semana y solo consulta al servidor si la query queda obsoleta por la política normal.

## Desglose propuesto

Las siguientes tareas son una propuesta; esta tarea no las crea ni autoriza su implementación:

| Tarea | Propuesta de alcance | Dependencia principal |
| --- | --- | --- |
| HC-04-02 | Contratos Zod, consulta semanal multi-plan, detalle HTTP autenticado y capability pública de resumen de ejercicios | HC-04-01 aprobado; HC-02 y HC-03 disponibles |
| HC-04-03 | Home semanal, siete días, navegación, expansión independiente y estados vacíos/consulta | HC-04-02 |
| HC-04-04 | Ruta y pantalla de detalle de sesión, bloques, objetivos y alternativas | HC-04-02 |
| HC-04-05 | CTA desde importación, invalidación de caché, persistencia del contexto de navegación y refinamiento UX/accesibilidad | HC-04-03 y HC-04-04 |
| HC-04-06 | Verificación integral de API/UI, contratos, responsive, teclado, fechas, importación y regresión | HC-04-02–HC-04-05 |

La ejecución real queda fuera de este bloque; HC-05 decide su incorporación. Los estados no se simulan para reservar espacio visual.

## Compatibilidad pendiente de implementación

- El índice global existente sobre `planKey` es una restricción de persistencia más estricta que la identidad de dominio `(origin, planKey)`. No se modifica en HC-04-01; cualquier cambio requiere una tarea de esquema independiente y aprobada.
- `ExerciseCatalogService` aún no ofrece la consulta agrupada por ID. HC-04-02 debe añadirla de forma pública dentro de `exercises` y cubrir claves ambiguas y nombres no disponibles en el DTO de lectura.
- `workouts` no ofrece una lectura pública de estado para la Home. D12 queda preparado por las identidades de recurso y navegación; los estados reales se mostrarán cuando otra tarea autorice y exponga esa capacidad. HC-04 no añade placeholders.

## Referencias

- [ADR-014](../../decisions/ADR-014-integracion-postgresql-typeorm.md) y [ADR-015](../../decisions/ADR-015-arquitectura-modular.md).
- [Convenciones modulares](../../architecture/module-conventions.md), [planificación](../../domain/training-plans.md), [importación](../../domain/training-plan-imports.md) y [ejecución](../../domain/workouts.md).
- [HC-02-03](../HC-02/HC-02-03.md), [HC-02-05](../HC-02/HC-02-05.md), [HC-03-01](../HC-03/HC-03-01.md), [HC-03-07](../HC-03/HC-03-07.md) y [HC-03-08](../HC-03/HC-03-08.md).
