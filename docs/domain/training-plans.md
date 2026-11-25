# Decisiones de negocio para planes de entrenamiento

Este documento conserva las decisiones aprobadas que gobiernan la planificación de entrenamientos. Describe la intención del plan; la ejecución, sus resultados y la persistencia quedan fuera de este modelo. Los contratos públicos relacionados están en `packages/contracts/src/training-plans/`.

## Decisiones aprobadas

1. **Identidad de planes y sesiones.** Cada plan y sesión tiene una clave estable, independiente de fechas y posiciones. Las claves de sesión son únicas dentro del plan.
2. **Unidad semanal flexible.** La semana natural de lunes a domingo (`Europe/Madrid`) es la unidad funcional de planificación. Los días asignados organizan visualmente las sesiones, pero son flexibles dentro de esa semana; mover una sesión no cambia su identidad ni su contenido.
3. **Superseries e hiperseries.** Se representan como circuitos; no introducen tipos de bloque adicionales.
4. **Modalidades de bloque.** Solo se admiten `sets`, `circuit` e `intervals`.
5. **Objetivos de series.** Un ejercicio planificado puede tener objetivos generales y ajustes específicos por serie. La serie se identifica con un índice positivo, comenzando en 1.
6. **Objetivos de rondas.** Los circuitos de rondas fijas admiten ajustes opcionales por ronda, con índices positivos comenzando en 1. AMRAP no admite ajustes por ronda numerada.
7. **Selección y precedencia.** Se elige primero el ejercicio principal o una alternativa. Después se filtran los objetivos heredados incompatibles, se aplican los ajustes de la alternativa y, por último, los ajustes específicos de serie o ronda.
8. **Herencia de objetivos.** Las métricas compatibles se heredan del ejercicio principal. En un ajuste, la propiedad ausente hereda, un número sobrescribe y `null` elimina el objetivo. Los objetivos efectivos no contienen `null`.
9. **Descanso entre bloques.** `restAfterSeconds` es opcional y expresa un descanso orientativo al terminar un bloque.
10. **Identidad de bloques y apariciones.** Cada bloque y aparición planificada de ejercicio tiene una clave estable independiente de su posición. El orden se obtiene de los arrays.
11. **Recuperación activa opcional.** Una fase `rest` puede incluir un ejercicio para representar recuperación activa; si se omite, representa recuperación pasiva.
12. **Fases de trabajo.** Una fase `work` requiere ejercicio y ventana temporal positiva. Sus objetivos deportivos son opcionales. La ventana no afirma cuánto trabajo se realizó. EMOM se expresa mediante intervalos con trabajo asignado.
13. **Días de descanso.** Un descanso es una entrada explícita con identidad propia; no se crea una sesión ejecutable vacía para representarlo.
14. **Calendario del plan.** Se permiten varias sesiones en una fecha. En un mismo plan, las sesiones y descansos comparten un espacio de claves únicas. Puede haber como máximo un descanso por fecha y un descanso programado no coexiste con sesiones en esa fecha.

La unicidad semanal es una regla funcional, no una restricción del modelo actual: `training_plans` garantiza unicidad de clave, y `training_plan_entries` garantiza la unicidad de la clave y de descansos por fecha dentro de cada plan, pero no limita a un plan por semana. Las operaciones que dependen de un destino semanal deben detectar entradas ajenas y proteger los datos sin reorganizar múltiples planes.

## Ciclos de intervalos

`cycles` es un contador positivo; el JSON no lleva claves individuales por ciclo. Cada ocurrencia se identifica conceptualmente mediante la combinación de la clave estable del bloque, el índice positivo del ciclo (desde 1) y la clave estable de la fase. El orden de fases se conserva en su array.

## Invariantes y validación

- Las fechas del plan usan `YYYY-MM-DD`, representan fechas reales y quedan dentro del periodo inclusivo del plan; `startDate` no supera `endDate`.
- Claves de sesiones son únicas dentro del plan, claves de bloques dentro de una sesión, claves de fases dentro de un bloque y claves de apariciones dentro de su bloque. Sesiones y descansos comparten el ámbito de claves del calendario.
- Cada sesión contiene al menos un bloque. Un descanso no contiene bloques.
- Las tres modalidades de bloque tienen ejercicios ordenados y cantidades positivas donde corresponda. `sets` requiere un número positivo de series por ejercicio; circuitos fijos requieren rondas positivas y AMRAP una duración máxima positiva. Descansos opcionales entre bloques o rondas son valores positivos.
- Un intervalo requiere ciclos positivos y una secuencia no vacía de fases. Cada ventana es positiva, las claves de fase son únicas y los índices de ajustes se mantienen en el rango existente. En fases `rest`, los objetivos solo pueden aparecer dentro de un ejercicio opcional.
- Una alternativa es distinta del ejercicio principal, las alternativas son distintas entre sí y no superan tres por aparición.
- Los objetivos usan las métricas y unidades canónicas aprobadas en HC-02-02: kg, segundos, metros y kcal cuando aplican; las métricas sin unidad física no reciben una unidad añadida. La comprobación de compatibilidad se realiza con las métricas disponibles para el ejercicio y no mediante una consulta de catálogo dentro de Zod.

La duración de una ventana de intervalo es una asignación temporal; no se convierte automáticamente en duración deportiva ejecutada. Validar referencias contra el catálogo y registrar actividad real pertenecen a capacidades posteriores.
