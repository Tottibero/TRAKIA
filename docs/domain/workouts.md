# Decisiones de negocio para ejecuciones de entrenamiento

Este documento es la fuente de verdad del dominio de ejecución. La planificación expresa lo previsto en [training-plans.md](training-plans.md); una ejecución conserva el trabajo realizado y sus correcciones. Los contratos externos Zod viven en `packages/contracts/src/workout-executions/`. Este documento no prescribe entidades de persistencia ni implementa operaciones.

## Entidades conceptuales y relaciones

- **WorkoutExecution** es una ocurrencia de una sesión planificada. En esta versión referencia un plan y una sesión mediante claves estables y conserva el snapshot de la sesión planificada y los datos de catálogo necesarios para interpretar sus ejercicios y métricas a lo largo del tiempo.
- **WorkoutPause** representa un intervalo temporal dentro de una ejecución. Puede estar abierto mientras la sesión está pausada; al cerrar la ejecución todos los intervalos deben tener fin.
- **WorkoutResult** representa el resultado deportivo de una unidad prevista: una serie, un ejercicio en una ronda o una ocurrencia de fase de intervalo. Tiene identidad propia, una referencia inequívoca al bloque y unidad, un estado y, si corresponde, métricas reales.
- **WorkoutCorrection** es una anotación auditable que apunta a un resultado existente y conserva los valores anterior y nuevo. No reemplaza el resultado ni vuelve a abrir la sesión.
- El snapshot enlaza apariciones planificadas a claves de ejercicio del catálogo. La ejecución conserva el ejercicio realmente utilizado y el conjunto permitido de principales y alternativas. `exercises` sigue siendo dueño del catálogo; `training-plans`, de la estructura prevista; `workouts`, de ejecuciones y resultados.

La identidad de una ejecución es su ID interno. La identidad de un resultado es su ID propio; la unidad planificada queda identificada por la combinación de clave de bloque, clave de aparición y su índice de serie, ronda o ciclo/fase. Una serie o ronda adicional tiene una clave de unidad propia. Los resultados adicionales no cambian el snapshot ni sus cantidades previstas.

## Decisiones aprobadas

1. **Pausas por intervalo.** Cada pausa registra inicio y fin; una única pausa puede estar abierta mientras la ejecución está pausada.
2. **Series adicionales.** Durante una ejecución se pueden registrar series adicionales con identidad propia, sin alterar las series planificadas.
3. **Ejercicio realmente utilizado.** Cada serie realizada registra el ejercicio elegido, que puede ser el principal o una alternativa prevista.
4. **Estado derivado de rondas.** El estado de una ronda se deriva de los resultados de sus ejercicios; no es una fuente de verdad persistida.
5. **Rondas adicionales y AMRAP.** Los circuitos de rondas fijas admiten rondas adicionales identificadas. AMRAP representa solo rondas realmente iniciadas, con índices positivos y posible última ronda parcial.
6. **Ventana y trabajo real.** En intervalos se distinguen el progreso temporal de la ventana y el tiempo efectivo de actividad. La duración asignada procede del snapshot.
7. **Temporizadores pausados.** Los temporizadores deportivos se congelan durante las pausas. No avanzan mientras el intervalo de ejecución está pausado.
8. **Omitido y no alcanzado.** `skipped` expresa una omisión explícita. `not_reached` se deriva, al cerrar, para unidades previstas sin resultado; no se persiste como resultado deportivo.
9. **Corrección del ejercicio.** Se permite corregir de forma auditable el ejercicio que se registró como utilizado.
10. **Valor vigente e historial.** Se conserva el resultado vigente junto con un historial inmutable de correcciones que identifica valores anteriores y nuevos.
11. **Resúmenes derivados.** Resúmenes, cumplimiento y rendimiento se calculan a partir de resultados y objetivos; no se almacenan como fuente de verdad en la ejecución.
12. **Revisión antes del cierre.** Antes del cierre definitivo se revisa el trabajo parcial. La sesión puede cerrarse aunque no se hayan completado todas las unidades previstas.
13. **Solo sesiones planificadas.** Esta versión permite ejecutar sesiones planificadas. Actividades voluntarias y sesiones espontáneas quedan fuera.
14. **Un resultado vigente por unidad.** Cada unidad planificada admite como máximo un resultado vigente. Los resultados de unidades adicionales tienen identidad propia.

## Invariantes y estados

- El inicio es obligatorio. Solo una ejecución `completed` tiene `finishedAt`, y no puede preceder al inicio. Una ejecución no cerrada no lleva fecha de cierre.
- Las pausas están ordenadas, no se solapan y no empiezan antes que la ejecución ni terminan después de ella. `paused` requiere exactamente una pausa abierta; `in_progress` y `completed` no admiten pausas abiertas.
- El tiempo pausado se obtiene sumando los intervalos de pausa; el tiempo activo excluye esas pausas. Estos valores no se almacenan ni calculan mediante los contratos. Al cerrar no queda pausa abierta.
- Las transiciones deportivas son: inicio en `in_progress`, pausa a `paused`, reanudación a `in_progress` y cierre a `completed`. `completed` es terminal; una corrección posterior no reabre la ejecución. Los contratos comprueban la forma de un estado, no ejecutan ni autorizan transiciones.
- Un resultado solo referencia bloques y unidades del snapshot. Las claves de resultado y de unidad deben ser únicas; una unidad prevista no tiene resultados vigentes duplicados.
- `performed` puede registrar métricas reales parciales o ninguna medición. `skipped` no lleva métricas ni afirma un ejercicio realizado. No se usa cero para representar una medición ausente.
- Las métricas reales son independientes de los objetivos, pueden quedar por debajo de ellos y no necesitan cubrir todas las métricas previstas. Se comprueban con la compatibilidad del ejercicio realmente usado cuando el snapshot contiene esa información.
- `reps`, `weightKg`, `durationSeconds`, `distanceMeters`, `rpe` y `calories` conservan las métricas canónicas de `ExerciseMetricSchema` y sus unidades: kg como carga externa total, segundos, metros y kcal; RPE no añade unidad. Las mediciones numéricas ausentes se omiten, no se sustituyen por cero.
- Los intervalos se identifican por clave de bloque, índice positivo de ciclo y clave de fase. La ocurrencia temporal no convierte su ventana en trabajo realizado. Puede haber trabajo parcial; la recuperación puede ser activa o pasiva según el snapshot.
- En AMRAP solo se representan rondas iniciadas; no se crean rondas ficticias no alcanzadas. Una ronda final puede tener resultados para solo parte de sus ejercicios. En circuitos fijos, las rondas adicionales se distinguen de las previstas.

## Correcciones

Una corrección refiere un resultado vigente y contiene al menos un cambio tipado: una métrica o `exerciseKey`. Para eliminar una medición errónea, el valor anterior se conserva y el nuevo valor es `null`; `null` no representa una cifra medida. Una corrección no puede cambiar identidades, índices, claves de fase, snapshot, planificación ni estado de cierre.

En la implementación funcional, las correcciones serán inmutables; el valor anterior deberá coincidir con el resultado vigente; el ejercicio nuevo deberá estar entre los previstos; y las métricas tendrán que ser compatibles con ese ejercicio. La modificación del resultado y la incorporación de su auditoría serán atómicas. Los contratos solo validan la estructura y la referencia al resultado existente; no aplican correcciones ni reconstruyen versiones.

## Reglas transversales de HC-02-01

- Planificación, ejecución, cumplimiento y rendimiento son conceptos separados. El resultado real se conserva aunque no cumpla el objetivo; una omisión no borra lo planificado.
- El cierre local es definitivo y no depende de la conectividad. Una sesión en curso permanece vinculada al dispositivo que la inició hasta su cierre y sincronización.
- El estado de sincronización pertenece al transporte, no al estado deportivo. Los datos sin sincronizar se conservan localmente; los fallos recuperables admiten reintentos idempotentes, sin duplicar ejecuciones, resultados o correcciones.
- La edición revisada de planificación solo afecta sesiones futuras no iniciadas y preserva ejecuciones y resultados históricos. Una ejecución iniciada interpreta su snapshot original.
- Las actividades retrospectivas voluntarias, su ventana local de siete fechas en `Europe/Madrid` y su relación con Constancia no forman parte de este contrato.

## Separación de responsabilidades y trabajo posterior

HC-02-04 define datos, tipos, esquemas Zod, validación estructural y documentación. No inicia, pausa, reanuda ni cierra ejecuciones; tampoco gestiona trabajo en curso, temporizadores, duración activa, estados derivados de ronda, `not_reached`, cumplimiento, rendimiento, aplicación de correcciones, persistencia/transacciones, sincronización, idempotencia HTTP, propietario del dispositivo ni exportación. Esas operaciones corresponden a tareas funcionales posteriores.

El contrato deportivo no incluye estados de sincronización. La sincronización es independiente del cierre local. La coherencia transaccional, los conflictos entre dispositivos y la compatibilidad con cambios futuros del catálogo requieren decisiones de implementación posteriores.
