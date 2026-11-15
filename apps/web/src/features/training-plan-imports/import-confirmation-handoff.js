import { getConfirmedProposalStartDate } from './import-confirmation-policy.js'

export async function prepareConfirmedImportHandoff(proposal, confirmation, invalidateQueries) {
  const startDate = getConfirmedProposalStartDate(proposal, confirmation)
  if (!startDate) return undefined

  await invalidateQueries()
  return startDate
}
