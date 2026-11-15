# HC-05 — Diseño del ejecutor de entrenamientos

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
4. **D4:** en series independientes, el descanso comienza al pulsar «Completar serie», a la vez que se registra el resultado.
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
18. **D18 (evolución aprobada en HC-05-02):** como máximo una ejecución deportiva abierta por cuenta, vinculada al dispositivo propietario donde se inició y sin transferencia. Sustituye la decisión original de HC-05-01, que limitaba la exclusión a cada dispositivo.
19. **D19:** inicio requiere conexión; continuación y cierre funcionan offline.
20. **D20:** borradores persistentes en IndexedDB, diferenciados de resultados confirmados.
21. **D21:** sincronización automática, ordenada e idempotente, sin bloquear la sesión deportiva.
22. **D22:** recuperación contextual de temporizadores sin fabricar resultados.

## Modelo de ejecución y navegación

Mantener separados cuatro estados:

- **Deportivo (fuente de verdad de dominio):** `in_progress | paused | completed`, resultados confirmados y pausas temporales. El cierre `completed` es terminal.
- **Navegación:** cursor a bloque/aparición/serie o ronda/ciclo/fase; es una proyección reconstruible de snapshot más resultados. No implica que una unidad se haya realizado.
- **Interfaz:** formulario enfocado, diálogo de confirmación, contador visible y controles. Volátil salvo borradores explícitos.
- **Transporte:** estado por operación (`pending`, `syncing`, `synced`, `conflict`, `rejected`). Nunca cambiar el estado deportivo por un fallo de red.

Una unidad planificada se resuelve con resultado `performed` o `skipped`. Un resultado adicional lleva identidad y clave de unidad propias, sin alterar snapshot/cantidades. Al cierre, unidades previstas sin resultado se interpretan como `not_reached` derivado; en AMRAP solo existen rondas iniciadas y la última puede ser parcial. No crear unidades ficticias para fases/unidades no alcanzadas.

### Transiciones guiadas

- **Fuerza / series:** cargar unidad prevista; editar borrador; completar confirma una sola unidad y, si aplica descanso independiente, inicia dicho descanso (D4); tras temporizador, avance manual (D6). Reintentar confirmación local no duplica la identidad.
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

## Desglose propuesto de HC-05

Los nombres de rutas son previsiones sujetas a convenciones del repositorio y auditoría de cada ficha; no autorizan crear módulos paralelos.

| ID | Objetivo y alcance | Exclusiones | Dependencias | Módulos/archivos previstos | Criterios de aceptación | Pruebas previstas |
| --- | --- | --- | --- | --- | --- | --- |
| HC-05-02 | Inicio online, snapshot, lock transaccional, sesión abierta e inicio idempotente; recuperación inicial. | Captura avanzada y sincronización de cierre. | HC-03-05/06, HC-02-04; HC-05-01. | `apps/api/src/modules/workouts`, contratos solo si endpoint autorizado; feature web de ejecución. | Una ejecución abierta por cuenta, propiedad del dispositivo de inicio; lock compartido adquirido en transacción; fallo/red ambiguos recuperables sin duplicar. | Contratos, unidad/API PostgreSQL, concurrencia entre dispositivos y cliente. |
| HC-05-03 | Navegación guiada de fuerza/apariciones y captura de resultados con borrador/persistencia local. | Intervalos y envío final. | HC-05-02, catálogo y plan. | `apps/web/src/features/workout-execution`; API si se requiere comando. | Principal/alternativas, métricas compatibles, sugerencias nunca auto-confirmadas, persistencia atómica. | Unitarias de transiciones, compatibilidad y IndexedDB; accesibilidad/responsive. |
| HC-05-04 | Circuitos por rondas, superseries representables, AMRAP, intervalos y pausa/temporizadores. | Tipos de bloque nuevos. | HC-05-03; contratos HC-02. | Feature de ejecución; contratos únicamente ante incompatibilidad demostrada. | Resultados por unidad; ronda derivada; pausa congela; HIIT y recuperación siguen snapshot. | Casos temporales con reloj controlado, recuperación foreground y navegador objetivo. |
| HC-05-05 | Omisiones, unidades pendientes, revisión y cierre local terminal accesible offline. | Sincronización y correcciones posteriores. | HC-05-03/04. | Feature web y almacén local. | Revisión siempre confirmada; cierre produce payload completo una vez; `not_reached` derivado. | Pruebas de cierre parcial/completo, caída/recuperación, atomicidad local. |
| HC-05-06 | Cola automática ordenada, reintentos, estado técnico e incidencias de sincronización. | Cambiar invariantes HC-02. | HC-05-05, HC-02-06, endpoint API. | Feature sincronización/workouts existentes, contratos solo si falta capacidad demostrada. | Idempotencia, causalidad, HTTP perdido, `already_applied`, retención en conflicto. | Integración API/DB y cliente con fallos de red, reinicios y concurrencia. |
| HC-05-07 | Correcciones auditables, resolución UX y verificación integral de ejecución/recuperación. | Edición retroactiva de snapshot. | HC-05-06, HC-02-04/06. | Workouts y feature de ejecución. | Corrección atómica/compatible, auditoría inmutable, sesión no reabierta; auditoría HC. | Integración de correcciones, regresión y smoke PWA en dispositivos/navegadores previstos. |

## Comprobación de coherencia y pendientes

No se observa incompatibilidad que requiera nuevo tipo de bloque: superseries se expresan como circuitos por rondas si el contrato de planificación lo permite; intervalos, AMRAP y circuitos ya tienen resultados tipados. Antes de tareas de implementación confirmar en esquemas actuales los campos exactos del snapshot, duraciones/descansos y capacidades de endpoint; este diseño no inventa payloads HTTP. Revisar además `docs/decisions/ADR-006` (autoguardado), ADR-007 (cortes de conexión), ADR-013 (experiencia móvil), ADR-015 y `docs/architecture/module-conventions.md`. Si una decisión de HC-05-01 contradice una invariante previa, elevarlo para resolución, no reinterpretarlo silenciosamente.
