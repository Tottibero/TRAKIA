export type ImportErrorKind =
  | 'validation'
  | 'authentication'
  | 'permission'
  | 'not-found'
  | 'conflict'
  | 'file-size'
  | 'server'
  | 'connection'
  | 'http'

export interface ImportErrorPresentation {
  kind: ImportErrorKind
  title: string
  message: string
  issues: unknown[]
}

export function getImportErrorPresentation(error: unknown): ImportErrorPresentation
