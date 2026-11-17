/** Additive execution capability; persisted message schema stays independently versioned. */
export const DIRECTOR_AGENT_CAPABILITY = 'director-sequence-v2';
export const AGENT_CAPABILITIES_HEADER = 'x-sundas-agent-capabilities';
export function supportsDirectorAgent(header: unknown): boolean {
    return typeof header === 'string' && header.split(',').map(value => value.trim()).includes(DIRECTOR_AGENT_CAPABILITY);
}
