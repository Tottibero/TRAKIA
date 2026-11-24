# HC-05-10 — Propuesta de rediseño integral UX/UI

- **Estado:** propuesta de fase A; dirección aprobada por el propietario, auditoría visual Chrome pendiente.
- **Alcance de este documento:** auditoría de solo lectura, dirección, pantallas y desglose inicial. No modifica la interfaz ni autoriza la implementación.

## Diagnóstico

La aplicación ya cubre las capacidades solicitadas y las organiza en features Vue: calendario y detalle (`training-plan-calendar`), cuatro recorridos online (`workout-execution`) e importación (`training-plan-imports`). El ejecutor tiene estados deportivos y de red explícitos, objetivos planificados, pausas, formularios de métricas, revisión y resumen. La propuesta debe mejorar su presentación sin reimplementar esas reglas.

La base visual actual ya es oscura y usa objetivos táctiles de al menos 44 px en varios controles. Sin embargo, el acento verde lima domina estados y acciones, los tokens conviven con colores Tailwind escritos directamente en las vistas, y la importación conserva una hoja de estilos separada. Home y detalle repiten cabecera y salida de sesión; las vistas deportivas repiten controles de temporizador y botones con tratamientos próximos, pero no forman un sistema común. El código da prioridad al nombre del ejercicio y la información planificada; durante la ejecución, el temporizador y la acción principal comparten el primer nivel visual. El resumen existente ofrece datos verdaderos de sesión y resultados omitidos/no alcanzados, que deben conservarse sin convertirlos en métricas promocionales.

La ruta raíz de Chrome registrada es `http://localhost:5173/` («TRAKIA — Entrenamiento personal»). La sesión de Chrome permitió identificar esa pestaña, pero fallaron sus operaciones de lectura de DOM y captura; no se obtuvieron capturas visuales ni se pudo confirmar el contenido realmente renderizado. Por ello, los hallazgos anteriores son una auditoría de código, no una evaluación visual certificada.

## Dirección visual propuesta

**Operar con calma y precisión:** interfaz dark minimalista de uso frecuente, con jerarquía tipográfica y espacial fuerte, superficies casi planas y componentes sobrios. Usar el PNG original como recurso oficial, conservando píxeles, transparencia, proporciones y márgenes; no redibujarlo ni reinterpretarlo.

- Fondo carbón `#0B0C0C`; superficie principal `#141616`; superficie elevada puntual `#1C1F1F`; borde `#303434`.
- Texto principal blanco cálido `#F4F1EB`; texto secundario `#B2B3AE`; texto terciario reservado para metadatos no esenciales.
- Rojo TRAKIA del PNG original (muestra modal `#FE271F`) para CTA primario, foco y una señal de estado puntual. No usarlo como relleno de toda superficie ni como único indicador de error.
- Estados semánticos diferenciados con texto e icono además del color. No codificar pausa, error, éxito o fase únicamente por color.
- Tipografía sans serif sobria ya disponible en el proyecto, con números tabulares para cronómetros y métricas. Evitar descargas de fuentes o nuevas dependencias hasta demostrar su necesidad.
- Escala de espaciado de 4/8 px; controles principales de 48–56 px, mínimo táctil de 44 px, foco visible y contraste AA. Respetar `safe-area-inset-*`, `100dvh`, zoom del sistema y `prefers-reduced-motion`.
- Bordes discretos, radios moderados, sin resplandor, blur decorativo, sombras pesadas, degradados, tarjetas anidadas o iconos sin función.

Los resultados genéricos de la búsqueda de diseño de la skill favorecieron una estética vibrante, tarjetas de showcase, naranja y verde. No se adoptan porque contradicen la referencia de marca y el uso de una herramienta operativa móvil descritos para TRAKIA.

## Sistema de diseño y navegación

Crear una capa transversal pequeña y deliberada sobre los tokens CSS existentes: color, tipo, espacios, radios, foco, capas y estados; controles comunes solo donde haya repetición real. La prioridad máxima es quitar identificadores internos y claves técnicas visibles, explicaciones redundantes, datos repetidos, tarjetas anidadas y decoración innecesaria. Mantener el texto necesario para operar. Las vistas conservan su ownership por feature; mover una pieza a `shared` solo si tiene consumidores reales en más de una feature. No introducir una librería UI ni un store global para estado de pantalla.

En Home y detalle, conservar el retorno explícito a la semana, la navegación de semanas y el acceso a importar. Reducir la cabecera repetida a marca y acciones necesarias, sin identificadores de cuenta que no ayuden a la tarea. No añadir navegación global inferior. Las acciones fijas solo se usarán si aportan comodidad real; reservarán su espacio y mantendrán visible el foco con el teclado abierto.

## Pantallas principales

| Pantalla | Jerarquía y comportamiento visual propuestos |
| --- | --- |
| Inicio y calendario semanal | Rango semanal con anterior/siguiente y acceso a semana actual; siete días compactos y seleccionables con fecha y estado textual; contenido del día actual/seleccionado debajo. Las sesiones, descansos, completadas y estados vacíos usan listas simples y datos existentes. Importar queda como acción secundaria fácil de encontrar. |
| Detalle de entrenamiento | Nombre, fecha y estado arriba; bloques en una lista con jerarquía ejercicio → objetivo → series/fases. Un CTA para iniciar, continuar o revisar, según el estado real, en posición estable al pie. |
| Ejecución de fuerza | Una serie y ejercicio enfocados, objetivo planificado y solo métricas aplicables. En trabajo domina el cronómetro o la acción de iniciar/terminar; los campos aparecen cuando corresponde. Guardar y continuar viven en la misma zona inferior estable. |
| Descansos y pausas | Tiempo restante como elemento principal, palabra «Descanso»/«Pausado», y una acción clara para reanudar o iniciar la siguiente unidad. Mantener accesible la pausa de la ejecución sin competir con el reloj. |
| Superseries, triseries y rondas con N ejercicios | Mantener visibles en todo momento los nombres de todos los ejercicios de la ronda y sus objetivos, junto con la ronda actual. Dar prioridad al ejercicio activo sin ocultar la secuencia completa. Conservar el flujo deportivo, orden, omisiones y descansos acordados. |
| HIIT | Fase actual y duración restante en primer nivel; trabajo/recuperación con etiquetas visibles; siguiente fase como contexto secundario. Pausar y finalizar anticipadamente permanecen claros, sin adelantarlos por diseño. |
| AMRAP | Mantener visibles cronómetro, contador de rondas, nombres y objetivos de todos los ejercicios de la ronda, más los botones «Ronda completada» y «Terminar AMRAP». Mantener el resultado parcial sin inferir trabajo no registrado. |
| Registro y revisión de resultados | Formularios con etiquetas persistentes, teclado numérico decimal adecuado, errores junto al campo y guardado inequívoco. Mostrar únicamente métricas compatibles y conservar los valores reales ante error o reintento. |
| Resumen de sesión | Estado final, duración/tiempo efectivo y resultados realmente registrados; ejercicios realizados, omitidos y no alcanzados agrupados con discreción. Sin anillos, puntuaciones ni métricas nuevas. CTA de vuelta al calendario. |
| Importación de planes | Flujo actual de tres pasos (archivo, revisión, confirmación) en una columna legible. Cambios, conflictos y elementos preservados se leen por grupos; confirmación separada del resumen y estados/error próximos al contenido afectado. Mantener la regla de no borrar elementos que no aparecen en el archivo. |

## Adaptación móvil y estados

Validar exactamente `375 × 812` y `390 × 844`, incluyendo teclado abierto en entrada de métricas, contenido largo, descripción de error, carga inicial, pérdida de conexión, recuperación, pausa, confirmación, resumen vacío/real y vuelta atrás. El ancho no debe producir desplazamiento horizontal. Usar una columna en teléfono y ampliar el ancho con moderación en escritorio. La acción principal debe quedar en la zona cómoda de una mano sin tapar contenido ni foco. Estados accesibles con roles/texto existentes, orden de encabezados correcto, navegación por teclado y `:focus-visible`; evitar anunciar cada tick del cronómetro al lector de pantalla.

La aplicación actual tiene meta viewport y `theme-color`, pero la búsqueda del workspace no encontró manifiesto web, service worker ni icono de marca en `apps/web`. Por tanto, la fase B debe incluir una comprobación explícita de instalación PWA (manifest, metadatos, iconos y comportamiento del navegador). No se presupone caché offline ni ejecución deportiva sin conexión; cualquier estrategia offline es una decisión separada.

## Desglose sugerido de HC-05-10

1. **HC-05-10-01 — Tokens, recurso de marca y shell visual:** centralizar tokens y estructura común; incorporar el PNG original sin alteraciones.
2. **HC-05-10-02 — Home y detalle de sesión:** calendario semanal, estados de sesiones, navegación, objetivos y CTA de inicio/continuación/resumen.
3. **HC-05-10-03 — Fuerza, descanso y pausa:** pantalla principal del ejecutor de fuerza, temporizador, formularios, acciones inferiores y recuperación/errores.
4. **HC-05-10-04 — Superseries y circuitos N:** progreso, todos los ejercicios y sus objetivos visibles, métricas por ejercicio, descanso y cierre de ronda.
5. **HC-05-10-05 — HIIT:** temporizador de fase, transiciones, pausa, finalización anticipada, métricas y estados de recuperación.
6. **HC-05-10-06 — AMRAP:** cronómetro, contador, todos los ejercicios y objetivos visibles, botones «Ronda completada»/«Terminar AMRAP» y resultado parcial.
7. **HC-05-10-07 — Revisión, correcciones y resumen:** revisión real de resultados, guardado/reintento, resumen final y acceso al calendario.
8. **HC-05-10-08 — Importación de planes:** archivo, revisión, conflictos, confirmación, errores y retorno a calendario.
9. **HC-05-10-09 — Instalabilidad PWA:** metadatos y manifest, validación de instalación. Si hacen falta iconos cuadrados, explicar tamaño y adaptación propuesta antes de generar derivados; no incorporar caché de ejecución offline.

Las comprobaciones responsive, accesibilidad y Chrome se incluyen en cada tarea de pantalla; no se reserva una tarea independiente de QA. Agrupar por flujo cuando mantenga claros los límites de regresión. Mantener intactos contratos, reglas deportivas, persistencia y API. No incluir métricas nuevas ni sincronización offline.

## Arquitectura y viabilidad

Viable con Vue 3 Composition API, Tailwind CSS 4 y CSS existente. `training-plan-calendar`, `workout-execution` y `training-plan-imports` siguen siendo propietarios de sus vistas y estado local. El shell y primitives transversales pueden quedar en `shared` solo donde haya reutilización efectiva; consultas, temporizadores, estado remoto y contratos no se duplican ni se trasladan por motivos visuales. Esto respeta ADR-015 y `module-conventions.md`.

La implementación se dividiría por flujo y mantendría propósitos de componentes acotados, `props`/eventos explícitos y estado derivado de la fuente actual. El pulido no debe cambiar transiciones ni introducir nuevas capacidades deportivas. No se justifica añadir una dependencia UI.

## Evidencia y decisiones pendientes

- Chrome: pestaña encontrada con título `TRAKIA — Entrenamiento personal` y URL `http://localhost:5173/`.
- Capturas de `375 × 812` y `390 × 844`: **no obtenidas**; Chrome rechazó las lecturas de DOM/captura durante esta auditoría. No se presentan capturas simuladas como evidencia.
- Código revisado: `apps/web/src/style.css`, `App.vue`, router, vistas del calendario/detalle/importación y los cuatro ejecutores, además del resumen de sesión.
- Activo oficial confirmado por el propietario: `/home/tottibero/Downloads/trackia.png`, PNG RGBA de 8 bits, `1536 × 1024`. Tiene 1.169.894 píxeles totalmente transparentes; caja alfa > 0: `(99,93)–(1515,999)`; contenido con alfa ≥ 64: `(252,120)–(1283,875)`. Se conservarán canvas completo y proporción 3:2; no se recortará ni reexportará para el shell.
- Si la instalación PWA requiere un icono cuadrado, la adaptación técnica a evaluar sería un canvas cuadrado transparente con el arte proporcionalmente contenido, sin redibujar, recolorear ni recortar detalles. Antes de generarlo se explicarán dimensiones, formato y motivo y se esperará aprobación. El PNG fuente permanece intacto.
- La dirección y la implementación de HC-05-10-01 fueron autorizadas por el propietario el 2026-11-19. La aceptación visual final queda pendiente.
- La validación manual global de HC-05-10 sigue pendiente; no se considera aceptado el bloque hasta revisar sus superficies en los viewports acordados.

## Aprobación registrada

El propietario aprueba la dirección carbón/blanco cálido/rojo y el objetivo integral, con las correcciones de ruido, visibilidad de ejercicios/objetivos, acciones fijas prudentes, agrupación y uso intacto del PNG original. El desglose inicial se reduce a nueve tareas. No se solicita otro recurso de marca. La auditoría visual Chrome a 375 × 812 y 390 × 844 sigue pendiente y no se presenta como comprobada.
