# Propuesta de calendario semanal

**Estado:** composición aprobada como base; tratamiento visual de los estados de sesión pendiente de validación. No aprobada para implementación productiva.

La propuesta conserva el sistema aprobado de carbón, blanco cálido y rojo TRAKIA y usa el PNG oficial directamente. Se limita a calendario móvil; los datos son estáticos y la navegación semanal solo cambia el estado local de la maqueta. No hay llamadas a API, cambios de cuenta, estado deportivo ni conexión con el calendario productivo.

## Artefactos

- [Maqueta HTML aislada](calendar-proposal.html)
- Comparación entre las capturas de referencia, revisión 2 y esta revisión:

| Estado | Viewport | Referencia | Revisión 2 | Revisión 3 |
| --- | --- | --- | --- | --- |
| Día con sesiones | 390 × 844 | [PNG](evidence/calendar-sessions-390x844.png) | [PNG](evidence/revision-2/calendar-sessions-390x844.png) | [PNG](evidence/revision-3/calendar-sessions-390x844.png) |
| Día vacío | 390 × 844 | [PNG](evidence/calendar-empty-390x844.png) | [PNG](evidence/revision-2/calendar-empty-390x844.png) | [PNG](evidence/revision-3/calendar-empty-390x844.png) |
| Semana siguiente | 390 × 844 | [PNG](evidence/calendar-next-week-390x844.png) | [PNG](evidence/revision-2/calendar-next-week-390x844.png) | [PNG](evidence/revision-3/calendar-next-week-390x844.png) |
| Día con sesiones | 375 × 812 | [PNG](evidence/calendar-sessions-375x812.png) | [PNG](evidence/revision-2/calendar-sessions-375x812.png) | [PNG](evidence/revision-3/calendar-sessions-375x812.png) |
| Día vacío | 375 × 812 | [PNG](evidence/calendar-empty-375x812.png) | [PNG](evidence/revision-2/calendar-empty-375x812.png) | [PNG](evidence/revision-3/calendar-empty-375x812.png) |
| Semana siguiente | 375 × 812 | [PNG](evidence/calendar-next-week-375x812.png) | [PNG](evidence/revision-2/calendar-next-week-375x812.png) | [PNG](evidence/revision-3/calendar-next-week-375x812.png) |

- Capturas del ajuste de estados:

| Estado de muestra | 390 px | 375 px |
| --- | --- | --- |
| Pendiente + completada | [PNG](evidence/revision-4/calendar-statuses-390x844.png) | [PNG](evidence/revision-4/calendar-statuses-375x812.png) |
| En curso | [PNG](evidence/revision-4/calendar-in-progress-390x844.png) | [PNG](evidence/revision-4/calendar-in-progress-375x812.png) |

## Propuesta visual — revisión 3

- Marca PNG original intacta junto al wordmark TRAKIA en una sola palabra. Todas las letras comparten familia, tamaño (16 px), peso (700), altura de línea (1) y tracking uniforme compacto (-0.025em); solo IA cambia a rojo oficial y TRAK permanece en blanco cálido.
- La cabecera, separación respecto al logo y composición general aprobadas en la revisión 2 permanecen sin cambios.
- Rango de fechas como encabezado compacto, con las flechas anterior/siguiente alineadas en la misma fila; se elimina «Mi semana».
- Siete celdas de día de altura fija; «Hoy» ocupa una ranura reservada y no cambia la alineación. La selección usa un borde rojo; hoy, cuando no está seleccionado, usa un contorno blanco cálido y conserva su etiqueta. Cada día con una o más sesiones usa un único punto rojo; los días vacíos no muestran punto.
- Contenido del día en una única superficie elevada con espacio entre filas, sin tarjetas por sesión ni divisores entre ellas. Pendiente usa pill gris neutra; Completada usa verde apagado, check y texto; En curso usa ámbar cálido discreto y texto. Los tres estados son legibles sin depender del color.
- «Ver sesión» y «Resultados» son botones secundarios compactos con borde, fondo de superficie y flecha; son visuales e inertes en esta maqueta aislada.
- Cada fila mantiene el nombre deportivo legible, un único pill de estado y la acción correspondiente; no presenta IDs, un contador redundante ni datos de ejecución repetidos.
- El área de contenido reserva una altura mínima común para la lista y el vacío, para que cambiar de semana o seleccionar un día sin sesiones no desplace la navegación.
- Vacío breve: «Sin sesiones planificadas.»
- Navegación inferior con etiquetas visibles; el destino activo tiene contraste y una marca roja superior.
- Foco visible, objetivos de toque amplios, áreas seguras y soporte de movimiento reducido.

## Estados incluidos

1. Día con sesiones: miércoles 18 de noviembre de 2026, dos entradas de muestra.
2. Día vacío: jueves 19 de noviembre de 2026, marcado como hoy.
3. Otra semana: lunes 23 de noviembre de 2026, tras avanzar una semana.

Los nombres y estados son ejemplos visuales fijos. No representan datos reales ni disparan transiciones de entrenamiento.

## Comparación con la revisión anterior

| Área | Revisión 2 | Revisión 3 |
| --- | --- | --- |
| Wordmark | TRAK e IA en nodos tipográficos separados y tamaño/peso visual percibido desigual. | TRAKIA es un único flujo tipográfico; mismas métricas para las letras, con color como única diferencia. PNG sin cambios. |
| Selector | Punto gris en días con sesiones; contorno tenue y etiqueta para hoy. | Punto rojo únicamente en días con sesiones; hoy no seleccionado usa contorno blanco cálido y etiqueta «Hoy», frente al borde rojo de selección. |
| Composición | Selector #141616, grupo #1C1F1F, filas agrupadas, pills neutras, botones secundarios y navegación inferior. | Sin cambios; se conservan superficies, espaciados, acciones y navegación aprobados como base. |

No se añadió otro acento al contenido de las sesiones: los puntos rojos y los estados de selección dan la jerarquía cromática solicitada sin recargar las superficies aprobadas.

Los contornos de flechas, día seleccionado/hoy y botones de sesión se conservan porque identifican controles o selección, no como separadores de contenido.

## Revisión de presentación

La revisión 3 comparada con la revisión 2 conserva la composición y modifica solo wordmark y marcadores del calendario. Esta revisión 4 compara los estados en Chrome a `390 × 844` y `375 × 812`: las capturas pendientes/completadas muestran ambos pills juntos y las capturas adicionales comprueban En curso. El único cambio está en los pills, el check y su icono; nombres, botones, dimensiones, cabecera y navegación se conservan.

## Decisiones pendientes de aprobación

- Validar si el verde apagado y el check comunican Completada con claridad sin llamar demasiado la atención.
- Validar la diferenciación ámbar discreta de En curso frente al estado pendiente neutro.

La validación visual de los pills es el único paso pendiente antes de autorizar el traslado de la propuesta a Vue. Esta maqueta no autoriza por sí misma cambios a componentes productivos.
