export function blindCandidateIdentity<T extends { name: string; email: string }>(
  candidate: T,
  revealed: boolean
): { name: string | null; email: string | null } {
  return revealed
    ? { name: candidate.name, email: candidate.email }
    : { name: null, email: null };
}
