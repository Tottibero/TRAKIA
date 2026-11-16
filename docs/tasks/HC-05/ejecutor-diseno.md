# HC-05 — Diseño del ejecutor de entrenamientos

> **Estado de la decisión:** las secciones local-first conservan el historial HC-05-01–08. [HC-05-09-02](HC-05-09-02.md) completa y establece el modelo online; las reglas incompatibles quedan sustituidas. No aplicar los apartados históricos como arquitectura objetivo.

## Estado y fuentes

Este diseño traduce las decisiones de HC-05-01 en guía de implementación, sin alterar el modelo aprobado de [workouts](../../domain/workouts.md), [sincronización](../../domain/workout-synchronization.md) ni [planificación](../../domain/training-plans.md). Los esquemas de `packages/contracts/src/workout-executions/` tipan snapshots, pausas, resultados y correcciones; `workout-sync/` tipa operaciones de cierre/corrección y respuestas. No se añade discriminante: las unidades usan los resultados existentes `set`, `circuit` e `interval`.

### Clasificación de decisiones

- **Aprobadas en el alcance de HC-05-01:** D1–D10, D13, D17 y D19–D22. D18 fue aprobada originalmente en HC-05-01 y evolucionó por autorización del propietario en HC-05-02, como se registra abajo. D11–D12 son propuestas de diseño que deben validarse, no aprobaciones independientes.
- **Derivadas de contratos/decisiones HC-02:** identidad propia de ejecución/resultado/corrección; snapshot; resultados `performed`/`skipped`; unidad adicional identificada; `not_reached` derivado al cierre; correcciones auditables; cierre local definitivo; operaciones inmutables e idempotentes por `operationId`, cierre secuencia 1, correcciones consecutivas, causalidad por ejecución y estados técnicos separados. Son invariantes previas, no nuevas aprobaciones HC-05.
- **Propuestas técnicas por comprobar en implementación:** esquema concreto de IndexedDB, formato de borradores, reclamación de ejecución abierta, recuperación tras incertidumbre, interfaz de resolución de conflictos, política de retención/capacidad y detalles de orquestación del transporte. No se presentan como ratificados por separado.

## Decisiones de experiencia

1. **D1:** navegación guiada y secuencial por unidades previstas.
2. **D2:** cada aparición ofrece ejercicio principal y hasta tres alternativas predefinidas; cambiar ejercicio no reordena el entrenamiento.
3. **D3:** interfaz contextual a la modalidad deportiva y sus métricas.
4. **D4 (secuencia de captura concretada en HC-05-08):** al terminar físicamente una serie, «Completar serie e iniciar descanso» ancla el descanso de inmediato. A continuación se registran y guardan sus métricas en una acción separada; ese guardado confirma el resultado local junto con el avance del cursor y no reinicia el temporizador. Si falla, se conserva el formulario y el descanso ya persistido.
5. **D5:** intervalos avanzan automáticamente al terminar su ventana, con acción para finalizar anticipadamente una fase.
6. **D6:** en fuerza y superseries, avanzar tras descanso es manual; empezar antes o después del tiempo previsto es válido.
7. **D7:** terminar antes una fase de trabajo HIIT abre inmediatamente la recuperación prevista.
8. **D8:** superseries como circuitos por rondas, registrando cada ejercicio; descanso de acuerdo con el plan, normalmente tras la ronda.
9. **D9:** formulario solo muestra métricas compatibles con el ejercicio elegido; las opcionales ausentes no se convierten en cero.
10. **D10:** sugerir la última serie registrada del mismo ejercicio; si es la primera, sugerir objetivos planificados. Nunca confirmar automáticamente.
11–12. **Propuestas:** borradores guardados localmente y recuperación de ejecución abierta, pendientes de validación de diseño/plataforma.
13. **D13:** al recuperar, descanso según tiempo real transcurrido; ante incertidumbre sobre trabajo activo o HIIT se pide confirmación y no se inventa trabajo.
14–16. **Diseño técnico:** respetar el protocolo de HC-02 de cierre completo y correcciones como operaciones separadas, secuenciales, idempotentes y causales. Retención, presentación y resolución de incidencias se proponen aquí y requieren validación.
17. **D17:** cierre accesible siempre, sugerido al acabar la última unidad; siempre exige revisar y confirmar.
18. **D18 (historial HC-05-02; sustituida en HC-05-09-02):** HC-05-02 estableció como máximo una ejecución abierta por cuenta, vinculada al dispositivo propietario y sin transferencia; HC-05-01 había limitado la exclusión por dispositivo. El modelo vigente elimina esa vinculación y permite recuperar la ejecución abierta por usuario autenticado desde cualquier sesión.
19. **D19:** inicio requiere conexión; continuación y cierre funcionan offline.
20. **D20:** borradores persistentes en IndexedDB, diferenciados de resultados confirmados.
21. **D21 (evolución autorizada en HC-05-03 y concretada en HC-05-06):** cada resultado confirmado se persiste primero de forma atómica en IndexedDB y se envía de inmediato al backend, sin bloquear la sesión; los pendientes se reintentan con la misma identidad. El cierre completo consolida en PostgreSQL los resultados locales que aún falten, detecta contradicciones y confirma el estado terminal en una transacción. El cliente reintenta la misma operación de cierre y conserva su copia local tras sincronizar.
22. **D22:** recuperación contextual de temporizadores sin fabricar resultados.

## Modelo de ejecución y navegación

Mantener separados cuatro estados:

- **Deportivo (fuente de verdad de dominio):** `in_progress | paused | completed`, resultados confirmados y pausas temporales. El cierre `completed` es terminal.
- **Navegación:** cursor a bloque/aparición/serie o ronda/ciclo/fase; es una proyección reconstruible de snapshot más resultados. No implica que una unidad se haya realizado.
- **Interfaz:** formulario enfocado, diálogo de confirmación, contador visible y controles. Volátil salvo borradores explícitos.
- **Transporte:** estado por operación (`pending`, `syncing`, `synced`, `conflict`, `rejected`). Nunca cambiar el estado deportivo por un fallo de red.

Una unidad planificada se resuelve con resultado `performed` o `skipped`. Un resultado adicional lleva identidad y clave de unidad propias, sin alterar snapshot/cantidades. Al cierre, unidades previstas sin resultado se interpretan como `not_reached` derivado; en AMRAP solo existen rondas iniciadas y la última puede ser parcial. No crear unidades ficticias para fases/unidades no alcanzadas.

### Transiciones guiadas

- **Fuerza / series:** cargar unidad prevista; editar borrador; al terminar físicamente, iniciar el descanso previsto antes de introducir métricas (D4); después guardar métricas y resultado con el cursor en la misma transacción local; tras el descanso, avanzar manualmente (D6). Guardar métricas no reinicia ni duplica el descanso. Reintentar confirmación local no duplica la identidad.
- **Apariciones múltiples:** agotar las series planificadas de una aparición antes de ofrecer la siguiente. Seleccionar una alternativa afecta al ejercicio ejecutado de esa unidad, no al orden ni al snapshot. La siguiente sugerencia de carga busca la última serie confirmada con el mismo `exerciseKey`.
- **Superserie:** representar solo cuando el plan pueda expresarse como circuito por rondas. Registrar cada ejercicio individualmente; la ronda deriva de esos resultados. Al terminar ronda, descanso planificado (normalmente); reanudar/avanzar es acción manual. No crear un tipo `superset` externo.
- **Circuito fijo:** rondas previstas con resultado por ejercicio/ronda; rondas extra usan unidades adicionales. Solo rondas realmente iniciadas cuentan.
- **AMRAP:** ronda se crea al iniciarse; registrar cada aparición hecha y permitir ronda final parcial. Reloj delimita la ventana, no es prueba de trabajo.
- **Intervalos HIIT:** identificar ciclo y fase por claves del snapshot. Ventana y actividad efectiva son distintas. La fase cambia automáticamente al acabar el tiempo; finalizar antes trabajo inicia recuperación prevista (D7). Finalizar una recuperación anticipadamente permite avanzar a la fase siguiente con confirmación/acción explícita coherente con D5; no atribuir actividad no registrada. Las pausas congelan temporizadores deportivos.
- **Pausa general:** añade `WorkoutPause` con inicio/fin; excluye ese lapso de tiempo activo y congela temporizadores. Descanso entre unidades no es pausa general ni se acumula como tal.
- **Omisión:** acción explícita crea `skipped`, sin métricas; conserva posición planificada. Cierre sin resolver una unidad la deja sin resultado, por lo que será `not_reached` derivado.
- **Cierre anticipado:** disponible desde cualquier punto. Construir revisión de completados, omitidos, adicionales y previstos pendientes; confirmar cierra localmente y hace terminal la ejecución. Sugerir revisión al alcanzar el final, sin auto-cerrar.
- **Corrección:** operación posterior auditable contra resultado existente. Validar valores anteriores frente al vigente, ejercicio permitido y compatibilidad métrica; aplicar valor nuevo e historial en una transacción local. No reabrir ejecución ni alterar identidades, snapshot o planificación.

## Persistencia, inicio y sincronización

### Inicio online

El cliente solicita el inicio con IDs estables y snapshot que acuerde el endpoint; la respuesta del servidor es la autoridad para iniciar y entrega identidad de ejecución. La operación de escritura de API debe compartir transacción con `WorkoutExecutionProtectionService.acquireSessionLocks(manager, planKey, sessionKeys)` antes de insertar la fila en `workout_executions`, como requiere HC-03-06. Esto serializa el inicio frente a importaciones/cambios protegidos del plan; no sustituirlo por exclusión local. Si hay timeout de respuesta, consultar estado por clave de idempotencia/identidad de solicitud antes de reintentar para evitar sesiones duplicadas (mecanismo concreto por diseñar según API). Inicio online obligatorio; sin confirmación del servidor no habilitar la sesión.

D18 requiere exclusión global por cuenta en el servidor; el dispositivo propietario conserva la ejecución y la recuperación en otro dispositivo debe identificar el conflicto sin transferirla. La reserva usa coordinación transaccional por cuenta además del lock compartido de sesión con importación, y una restricción única parcial en PostgreSQL. IndexedDB conserva la identidad local y el snapshot autorizado; su bloqueo local no sustituye la garantía del servidor.

### Almacén local (propuesta)

IndexedDB guarda snapshot y datos de ejecución necesarios para recuperación; resultados confirmados; borradores separados; pausa abierta; metadatos mínimos de navegación; secuencia/cola de operaciones y su estado/incidencia; y versión de esquema local. No guardar secretos de autenticación en la cola. No usar `localStorage` como almacén de resultados. IndexedDB no equivale a copia de seguridad ni garantiza permanencia frente a limpieza, cuota o política del sistema.

Cada acción de confirmar resultado debe, en una transacción IndexedDB, insertar el resultado y su unidad estable, y actualizar/eliminar su borrador. Las operaciones pendientes que dependan de ese resultado se incorporan atómicamente cuando corresponda; al cierre, una transacción fija `completed` y crea una única operación `close_execution` secuencia 1 con snapshot/resultados. No hay resultados parcialmente confirmados visibles por caída entre escrituras. Generar UUIDs una sola vez y conservarlos: execution ID del servidor, result/correction IDs y operationId. El reintento no regenera IDs ni muta payload lógico.

Los borradores no son resultados deportivos: una recuperación los muestra para continuar editando y exige acción de confirmación. Recuperar un descanso recalcula lo restante con reloj monotónico durante vida activa y marcas de tiempo al reabrir; valores de reloj no confiables (cambio de hora, suspensión) se presentan como estimados. Para fase de trabajo/HIIT incierta, preguntar si terminó, continúa o debe descartarse/omitirse según dominio; no sintetizar resultado. Tras caída durante fase, reanudar sin marca fiable requiere confirmación.

### Cierre y protocolo de sincronización

El cierre local definitivo no espera red. En cola queda primero `close_execution` completo; cada corrección posterior es operación independiente con secuencia consecutiva. Ejecutar por ejecución en orden causal y permitir paralelismo entre ejecuciones. Reintentar errores recuperables con mismo `operationId`, secuencia y contenido; `already_applied` confirma éxito si es la misma operación. Recuperar `syncing` como `pending` tras reinicio. Consultar/reintentar después de respuesta HTTP perdida usando identidad persistida: la respuesta del servidor resuelve si ya fue aplicado; nunca inventar un operationId sustituto.

`dependency_pending` mantiene la operación esperando y no permite enviar una corrección antes de confirmar predecesoras. `conflict`/`rejected` detienen reintento automático, exponen incidencia y conservan datos locales y payload para resolver; no sobrescribir ni borrar resultados automáticamente. Un conflicto no debe abrir una segunda sesión local ni cambiar cierre. Política para editar/resincronizar una operación rechazada, exportar o eliminar datos se debe definir antes de implementar; cambios de contenido no conservan el mismo ID de operación. No se cambia el protocolo de HC-02.

Almacenamiento insuficiente, IndexedDB inaccesible o borrado por el usuario son fallos visibles; no confirmar resultado hasta poder persistirlo localmente. Recuperación ante cierre del navegador inspecciona registros persistidos y operaciones `syncing`. Si el navegador elimina datos, no existe garantía de recuperación local; comunicarlo con claridad cuando sea detectable.

## PWA: límites y mitigaciones

Los navegadores móviles pueden suspender o terminar JavaScript al ocultar la pestaña, bloquear la pantalla o ahorrar batería. Un `setInterval` no corre con precisión ni continuidad garantizada en segundo plano; Web Worker/service worker tampoco ofrece temporizador perpetuo. Notificaciones requieren permisos/soporte y entrega no exacta; no prometer alarma puntual. Al volver a primer plano recalcular duración desde timestamps y preguntar en casos ambiguos. Persistir al confirmar cada unidad y al cambiar de pausa/fase minimiza pérdida, pero no cubre borrado, corrupción, cuota llena, cierre abrupto antes de commit o desinstalación. Usar persistencia solicitada (`navigator.storage.persist`) solo como mejora si está disponible, sin asumir que concede o impide eliminación. Probar capacidades en navegadores objetivo durante tareas de implementación y definir UX degradada.

Riesgos proporcionados: desajuste temporal por suspensión/cambio de reloj, pérdida de IndexedDB, respuesta HTTP ambigua, conflicto remoto, pestañas/dispositivos concurrentes y snapshot incompatible con catálogo futuro. Mitigar con timestamps/confirmación contextual, IDs estables e idempotencia, cierre inmutable local, copia remota al sincronizar y validación del snapshot sin modificar historia.

## Aplicación aprobada en HC-05-04

- Las pausas y el cursor/temporizador contextual se guardan dentro del registro de progreso existente en `trakia-workout-execution`; las pausas permanecen locales hasta el cierre de HC-05-05. No se incorpora otro store, endpoint ni sincronizador.
- El reloj visible se deriva de marcas temporales y se refresca al volver a primer plano. Pausar acumula el segmento transcurrido y reanudar inicia otro segmento. Si se recupera trabajo interrumpido, se pide confirmación y una duración real antes de confirmar; no se genera resultado por el vencimiento del reloj.
- En fuerza, el temporizador de descanso se ancla al toque de «Completar serie» y se confirma junto con el resultado en IndexedDB. La edición de borrador no modifica ese ancla. La continuación entre series y rondas sigue siendo manual.
- Circuitos fijos recorren ejercicio y ronda; AMRAP mantiene cursor de ronda dinámica y conserva solo resultados individuales confirmados. Al vencer, no se crea unidad: se detiene el bloque y continúa el siguiente bloque previsto, si existe.
- Se reutiliza `WorkoutExecutionResultRequestSchema` y `POST /workouts/executions/:id/results` para los tres tipos de resultado. El backend valida la unidad específica y conserva la fila JSONB; el cambio no altera el esquema de almacenamiento y no añade migración ni ampliación contractual. La integración en PostgreSQL confirmó `current_database() = trakia_test`, no encontró migraciones pendientes y pasó el escenario de persistencia/recuperación de resultados de circuito e intervalos.

## Desglose propuesto de HC-05

Los nombres de rutas son previsiones sujetas a convenciones del repositorio y auditoría de cada ficha; no autorizan crear módulos paralelos.

| ID | Objetivo y alcance | Exclusiones | Dependencias | Módulos/archivos previstos | Criterios de aceptación | Pruebas previstas |
| --- | --- | --- | --- | --- | --- | --- |
| HC-05-02 | Inicio online, snapshot, lock transaccional, sesión abierta e inicio idempotente; recuperación inicial. | Captura avanzada y sincronización de cierre. | HC-03-05/06, HC-02-04; HC-05-01. | `apps/api/src/modules/workouts`, contratos solo si endpoint autorizado; feature web de ejecución. | Una ejecución abierta por cuenta, propiedad del dispositivo de inicio; lock compartido adquirido en transacción; fallo/red ambiguos recuperables sin duplicar. | Contratos, unidad/API PostgreSQL, concurrencia entre dispositivos y cliente. |
| HC-05-03 | Navegación guiada por series `sets`, captura contextual de resultados y borradores locales; persistencia remota por resultado durante ejecución abierta. | Circuitos, superseries, AMRAP, intervalos, temporizadores, pausa/reanudación, cierre definitivo y correcciones; sincronización/reconciliación completa del cierre. | HC-05-02, contratos HC-02-04/06, catálogo y plan. | `workouts` posee resultados PostgreSQL; la feature `workout-execution` usa su IndexedDB y API; contracts amplían el protocolo mínimo. | Principal/alternativas del snapshot; métricas compatibles; sugerencias nunca auto-confirmadas; commit local atómico antes de avanzar; POST inmediato idempotente; retry conserva IDs. | Contratos Zod, IndexedDB incluyendo upgrade, web de registro/recovery/retry, API idempotencia/validación e integración PostgreSQL aislada. |
| HC-05-04 | Circuitos por rondas, superseries representables, AMRAP, intervalos y pausa/temporizadores. | Tipos de bloque nuevos. | HC-05-03; contratos HC-02. | Feature de ejecución; contratos únicamente ante incompatibilidad demostrada. | Resultados por unidad; ronda derivada; pausa congela; HIIT y recuperación siguen snapshot. | Casos temporales con reloj controlado, recuperación foreground y navegador objetivo. |
| HC-05-05 | Omisiones, unidades pendientes, revisión y cierre local terminal accesible offline. | Sincronización y correcciones posteriores. | HC-05-03/04. | Feature web y almacén local. | Revisión siempre confirmada; cierre produce payload completo una vez; `not_reached` derivado. | Pruebas de cierre parcial/completo, caída/recuperación, atomicidad local. |
| HC-05-06 | Cola automática ordenada, reintentos, estado técnico e incidencias de sincronización. | Cambiar invariantes HC-02. | HC-05-05, HC-02-06, endpoint API. | Feature sincronización/workouts existentes, contratos solo si falta capacidad demostrada. | Idempotencia, causalidad, HTTP perdido, `already_applied`, retención en conflicto. | Integración API/DB y cliente con fallos de red, reinicios y concurrencia. |
| HC-05-07 | Correcciones auditables, resolución UX y verificación integral de ejecución/recuperación. | Edición retroactiva de snapshot. | HC-05-06, HC-02-04/06. | Workouts y feature de ejecución. | Corrección atómica/compatible, auditoría inmutable, sesión no reabierta; auditoría HC. | Integración de correcciones, regresión y smoke PWA en dispositivos/navegadores previstos. |

## Comprobación de coherencia y pendientes

No se observa incompatibilidad que requiera nuevo tipo de bloque: superseries se expresan como circuitos por rondas si el contrato de planificación lo permite; intervalos, AMRAP y circuitos ya tienen resultados tipados. Antes de tareas de implementación confirmar en esquemas actuales los campos exactos del snapshot, duraciones/descansos y capacidades de endpoint; este diseño no inventa payloads HTTP. Revisar además `docs/decisions/ADR-006` (autoguardado), ADR-007 (cortes de conexión), ADR-013 (experiencia móvil), ADR-015 y `docs/architecture/module-conventions.md`. Si una decisión de HC-05-01 contradice una invariante previa, elevarlo para resolución, no reinterpretarlo silenciosamente.

## Aplicación aprobada en HC-05-05

- La revisión resume resultados `performed`, omisiones explícitas `skipped` y unidades del snapshot sin resultado como `not_reached` derivado. No crea resultados para lo no realizado; en AMRAP solo muestra unidades de rondas iniciadas.
- `WorkoutExecutionSchema` admite opcionalmente `feeling`, `observations`, `completionType` y `closureReason`. Son opcionales para aceptar ejecuciones previas; al cerrar desde la PWA se registra el tipo `planned` o `early`. El motivo, opcional, solo se admite con `early`.
- Sensaciones usan cinco niveles (`muy_bien`, `bien`, `regular`, `mal`, `muy_mal`); observaciones limitadas a 1000 caracteres y motivo a 240.
- El dominio actual no define «escaqueo», penalización ni efecto en Constancia. No se infiere ni se crea ninguno; se conservan `skipped` y `not_reached` como conceptos diferenciados.
- El almacén IndexedDB existente conserva la ejecución terminal y una operación `close_execution` pendiente dentro del registro de progreso por ejecución. La transacción local no libera la reserva PostgreSQL; el transporte completo pertenece a HC-05-06.

## Aplicación aprobada en HC-05-07

- Las correcciones posteriores al cierre usan `CorrectResultOperation` consecutivas desde secuencia 2. Se aceptan solo online y desde el dispositivo original; no se añade cola offline.
- `workout_executions.correction_operations` conserva los sobres `correct_result` aceptados. Cada corrección actualiza el resultado efectivo y añade su historial en la misma transacción, bajo bloqueo de fila. El cierre y el estado `completed` permanecen intactos.
- El servidor exige que cada `before` coincida con el valor efectivo vigente y revalida el resultado y el historial completo contra el snapshot. La repetición idéntica devuelve `already_applied`; una operación contradictoria o desactualizada no escribe.
- La vista cerrada permite corregir métricas admitidas y el ejercicio realizado entre las opciones del snapshot. El resultado local cambia tras `applied`/`already_applied`; los errores conservan el formulario y la operación para reintentar. No se corrigen `activeSeconds` ni `windowProgressSeconds`, ausentes del contrato.

## Aplicación aprobada en HC-05-08

- Todas las escrituras al almacén IndexedDB existente normalizan el dato en `putJsonRecord`, en el límite de `IDBObjectStore.put`. Esto quita proxies Vue antes de structured clone; los contratos persistidos son datos JSON. El recuperador valida resultados con `WorkoutResultSchema` y valida el resto del progreso local antes de exponerlo. Ante datos inválidos, informa del registro dañado y conserva los datos almacenados para investigación; no los omite silenciosamente.
- Las transiciones temporales se muestran como guardadas solo después de confirmar la transacción local. Si pausa, reanudación, temporizador o avance falla, la pantalla conserva el estado anterior, mantiene el cambio pendiente y permite reintentar. El formulario permanece visible ante un fallo y el resultado/cursor se confirman juntos.
- En fuerza, el toque al terminar la serie inicia primero el descanso con su marca temporal; el formulario identifica esa serie y guarda las métricas después. El guardado conserva el temporizador activo, y la continuación a la siguiente serie sigue siendo manual.
- El vencimiento de AMRAP termina su ventana sin fabricar rondas/resultados. El vencimiento de recuperación HIIT avanza a la fase temporal siguiente incluso si la recuperación tenía ejercicio asociado; no crea resultado ni métricas. El vencimiento de trabajo mantiene la confirmación de duración real.
- La zona de entrenamiento omite nombre de sesión, clave y contadores administrativos. La jerarquía móvil prioriza actividad actual, objetivo, campos de registro y acción principal; persistencia/sincronización quedan en estado discreto y pausa/finalización/alternativas/omisión son secundarias.
- Circuitos y superseries presentan la secuencia ordenada con estados «Hecho», «Ahora» y «Pendiente». Al completar una ronda, el estado se separa de la siguiente ejecución: muestra el descanso, la secuencia pendiente y «Empezar siguiente ronda»; no activa antes el formulario del próximo ejercicio. El avance entre rondas sigue siendo manual.
- AMRAP presenta ronda parcial, secuencia de la ronda y cuenta atrás. HIIT destaca cuenta atrás, fase actual y siguiente fase. En fuerza se muestra ejercicio/serie y objetivo distinto del resultado; al terminar físicamente la serie empieza el descanso mientras el formulario sigue identificado con la serie completada. Tras guardar métricas aparece el descanso con continuación manual, sin mostrar el formulario siguiente.
- Las series extra se ofrecen junto al ejercicio correspondiente. Alternativas y omisión permanecen accesibles en controles secundarios.
- No se añadieron módulos, stores, rutas, servicios de persistencia, colas ni coordinación entre pestañas. El humo manual en móvil sigue pendiente.

## Arquitectura objetivo HC-05-09-02

PostgreSQL es la fuente única de verdad y NestJS confirma cada mutación deportiva. Vue deriva navegación, temporizadores visibles y formularios del estado confirmado y no avanza si la API no responde con éxito. La ejecución requiere conexión y se recupera por usuario autenticado. Se mantiene una única ejecución abierta por usuario, sin propiedad ni identidad de dispositivo.

**D18 objetivo:** como máximo una ejecución abierta por usuario autenticado, recuperable desde cualquier sesión autenticada. Reemplaza tanto la D18 original por dispositivo de HC-05-01 como la variante con dispositivo propietario adoptada por HC-05-02. `requestId` de inicio, IDs de resultado y de corrección se conservan para reintentos HTTP; no se añade ledger ni secuencia genérica.

Se sustituyen D19–D21: no hay continuación deportiva offline, IndexedDB para ejecución/resultados/borradores, cola ni reconciliación. La antigua D22 se conserva en su regla deportiva (no fabricar trabajo), usando timestamps confirmados por servidor. Snapshot, resultados reales y correcciones auditables se mantienen. El cursor normal se deriva de snapshot y resultados; solo se persiste el ancla actual de descanso/AMRAP/HIIT no reconstruible, sin ticks ni segundos restantes. Las métricas mantienen positividad finita y precisión decimal libre del contrato compartido. Resultado y métricas se confirman antes de iniciar el descanso; la transacción inicia el ancla cuando corresponde. El detalle y la secuencia de implementación están en HC-05-09-02.

HC-05-08 continúa como historial de cambios en revisión: se conservan mejoras de presentación y defensas que sigan válidas; la persistencia local, su estado de sincronización y la confirmación de avance anterior al servidor quedan reemplazadas al migrar cada flujo online. No borrar datos locales existentes ni retirar el store hasta detectar y resolver los resultados exclusivamente locales.
