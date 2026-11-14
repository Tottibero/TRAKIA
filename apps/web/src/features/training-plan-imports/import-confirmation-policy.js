export function getConfirmedProposalStartDate(proposal, confirmation) {
  if (!proposal || !confirmation || !['confirmed', 'unchanged'].includes(confirmation.status))
    return undefined

  const matchingPlan = confirmation.changes.some(
    (change) => change.kind === 'plan' && change.key === proposal.key,
  )

  return matchingPlan ? proposal.startDate : undefined
}
