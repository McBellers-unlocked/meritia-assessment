/** Build candidate-owned lookup criteria without accepting a client-supplied owner ID. */
export function candidateOwnedRecordWhere(candidateId: string, recordId: string) {
  return { id: recordId, candidateId } as const;
}

export function candidateOwnedInteractionWhere(candidateId: string, interactionId: string) {
  return { id: interactionId, candidateId, actor: "ai" } as const;
}
