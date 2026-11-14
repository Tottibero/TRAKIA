/**
 * @typedef {'validation' | 'authentication' | 'permission' | 'not-found' | 'conflict' | 'file-size' | 'server' | 'connection' | 'http'} ImportErrorKind
 * @typedef {{kind: ImportErrorKind, title: string, message: string, issues: unknown[]}} ImportErrorPresentation
 */

/**
 * HTTP failures are classified by status before any response issues are shown.
 * Only 400 and 422 may contribute document-validation issues.
 * @param {unknown} error
 * @returns {ImportErrorPresentation}
 */
export function getImportErrorPresentation(error) {
  const value = error && typeof error === 'object' ? error : {}
  const status = 'status' in value && typeof value.status === 'number' ? value.status : undefined
  const code = 'code' in value && typeof value.code === 'string' ? value.code : undefined
  const issues =
    (status === 400 || status === 422) && 'issues' in value && Array.isArray(value.issues) ? value.issues : []

  if (status === 413 || code === 'BODY_TOO_LARGE')
    return {
      kind: 'file-size',
      title: 'El archivo supera el límite',
      message: 'Elige un archivo JSON de 1 MiB o menos.',
      issues: [],
    }
  if (status === 400 || status === 422) {
    return {
      kind: 'validation',
      title: issues.length ? 'Revisa estas incidencias del documento' : 'No se pudo validar el documento',
      message: issues.length
        ? 'Corrige las incidencias del archivo y selecciona la versión corregida.'
        : 'El servidor rechazó el documento. Comprueba el archivo y selecciona una versión corregida.',
      issues,
    }
  }
  if (status === 401)
    return {
      kind: 'authentication',
      title: 'Tu sesión ha caducado',
      message: 'Inicia sesión para continuar con la importación.',
      issues: [],
    }
  if (status === 403)
    return {
      kind: 'permission',
      title: 'No tienes permiso para importar',
      message:
        'Tu sesión no tiene acceso a esta acción. Vuelve al inicio o solicita acceso al administrador.',
      issues: [],
    }
  if (status === 404)
    return {
      kind: 'not-found',
      title: 'No se encontró el servicio de importación',
      message:
        'El endpoint o recurso necesario no está disponible. Inténtalo de nuevo; si persiste, contacta con soporte.',
      issues: [],
    }
  if (status === 409)
    return {
      kind: 'conflict',
      title: 'La importación entró en conflicto',
      message: 'El plan o la revisión cambió mientras trabajabas. Revísalo de nuevo antes de confirmar.',
      issues: [],
    }
  if (status !== undefined && status >= 500)
    return {
      kind: 'server',
      title: 'El servidor tuvo un problema',
      message: 'No se pudo completar la importación. Inténtalo de nuevo en unos momentos.',
      issues: [],
    }
  if (value instanceof Error && value.name === 'ApiNetworkError')
    return {
      kind: 'connection',
      title: 'No hay conexión con el servidor',
      message: 'Comprueba tu conexión e inténtalo de nuevo. El archivo sigue disponible en esta pantalla.',
      issues: [],
    }
  return {
    kind: 'http',
    title: 'No se pudo completar la solicitud',
    message: 'Inténtalo de nuevo. Si el problema continúa, contacta con soporte.',
    issues: [],
  }
}
