# Decisiones de sincronización de ejecuciones deportivas

Este documento define el contrato de sincronización de ejecuciones cerradas y sus correcciones posteriores. Las formas externas Zod viven en `packages/contracts/src/workout-sync/`.

## Decisiones aprobadas

1. **Cierre y correcciones independientes.** Al cerrar localmente una ejecución se genera una operación completa con la ejecución cerrada y su snapshot de planificación. Cada corrección posterior es una operación separada que reutiliza el contrato `WorkoutCorrection` de HC-02-04.
2. **Estado técnico separado.** Una operación puede estar `pending`, `syncing`, `synced`, `conflict` o `rejected`. Estos estados describen transporte y no forman parte de `WorkoutExecution`.
3. **Identidad e inmutabilidad lógica.** `operationId` es un UUID estable. La identidad, secuencia y contenido de negocio de una operación no cambian entre reintentos. El cliente no necesita proporcionar un hash y el payload no incluye intentos HTTP.
4. **Secuencia por ejecución.** El cierre usa secuencia 1. Cada corrección posterior usa la secuencia consecutiva que le corresponde; ejecuciones distintas tienen secuencias independientes.
5. **Dependencias previas.** Una operación cuya dependencia todavía no está confirmada puede recibir `dependency_pending`, con una secuencia previa cuando el servidor pueda identificarla.

## Invariantes estructurales

- `close_execution` debe tener secuencia 1, una ejecución con estado `completed` y el mismo ID en el sobre y en la ejecución. No contiene correcciones posteriores.
- `correct_result` debe tener secuencia positiva mayor que 1 y un payload estructurado como corrección HC-02-04. Ese payload contiene `resultId`, pero no contiene la lista de resultados de la ejecución; el contrato por sí solo no puede probar que ese resultado pertenece al `executionId` de la operación.
- Las operaciones discriminan por `operationType`. El sobre valida la forma y los IDs, pero no conoce el estado remoto ni valida huecos de secuencia.
- `applied` y `already_applied` son respuestas sin incidencia; `conflict` y `rejected` requieren una incidencia con código estable y mensaje. `dependency_pending` permite `requiredSequence`, que debe ser anterior a la operación.
- `already_applied` corresponde al mismo `operationId` y contenido lógico que ya procesó el servidor. El mismo ID con contenido distinto es conflicto.
- `pending` puede reintentarse tras fallos recuperables. `syncing` es transitorio y debe recuperarse tras reinicios; `conflict` y `rejected` paran reintentos automáticos hasta resolver su causa.
- Una ejecución cerrada permanece cerrada aunque la sincronización esté pendiente. El dispositivo de origen mantiene el control de la ejecución hasta el cierre y la sincronización.
- No se puede aplicar una corrección N antes de confirmar las operaciones anteriores de esa ejecución. Ejecuciones diferentes se sincronizan independientemente.

## Incidencias

El catálogo inicial contempla `OPERATION_CONTENT_MISMATCH`, `DEPENDENCY_PENDING`, `EXECUTION_CONFLICT`, `INVALID_OPERATION` y `RESULT_NOT_FOUND`. No es un sistema genérico de errores de aplicación ni depende de los códigos de importación de planes.

## Pendiente de implementación

HC-05-06 implementa el cierre de secuencia 1 mediante `POST /workouts/executions/:executionId/close`. El sobre aceptado se conserva en `workout_executions.close_operation`; no hay tabla ni motor remoto genérico. El backend bloquea la fila, verifica cuenta/dispositivo/snapshot, une resultados por ID con comparación exacta, rechaza colisiones de identidad o unidad, valida el conjunto completo y guarda cierre/resultados/estado en una transacción. Un cierre idéntico devuelve `already_applied`; uno contradictorio devuelve conflicto. La transición a `completed` libera la reserva parcial por cuenta.

La web reutiliza el registro de cierre existente en IndexedDB y reintenta al cargar la PWA, al abrir la vista cerrada y al recuperar conexión. Solo una respuesta `applied` o `already_applied` marca el cierre y sus resultados como sincronizados y elimina `activeExecution`; el cierre local permanece disponible. Los fallos recuperables conservan la operación y los conflictos no reescriben resultados.

## Correcciones posteriores al cierre

HC-05-07 implementa `POST /workouts/executions/:executionId/corrections` para una operación `correct_result`. El servicio de `workouts` bloquea la ejecución, comprueba cuenta, dispositivo original, estado completado, resultado, secuencia consecutiva y valores `before`; aplica la corrección al resultado efectivo y valida la ejecución completa contra el snapshot antes de persistir.

La migración `AddWorkoutExecutionCorrectionOperations1795305600000` añade `correction_operations jsonb NOT NULL DEFAULT []`. La columna conserva el sobre completo de cada operación, incluido `operationId`, secuencia y `WorkoutCorrection`. Resultado e historial se escriben de forma atómica. Un retry idéntico devuelve `already_applied`; conflictos de identidad, contenido o valores vigentes no reescriben datos. La transición de estado, `finishedAt`, `close_operation` y la reserva global no se modifican.

La PWA solo permite enviar correcciones online desde el dispositivo asociado a la ejecución. La vista espera respuesta aceptada antes de actualizar el resultado mostrado y persiste localmente la corrección confirmada. Un error conserva el formulario y la identidad en la vista para reintentar; no hay cola offline. Cambios en `activeSeconds` y `windowProgressSeconds` siguen fuera de alcance porque el contrato `WorkoutCorrectionChange` no los representa.
