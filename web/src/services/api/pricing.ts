import { apiRequest } from './client';

export type CreditEstimate = { minCredits: number; maxCredits: number; member: boolean };
export function fetchCreditEstimate(params: { model: string; mode: 'image' | 'video' | 'text' | 'audio'; seconds: string; resolution: string; inputLength?: string; routeId?: string }, signal: AbortSignal) {
    return apiRequest<CreditEstimate>(`/api/pricing/estimate?${new URLSearchParams(params)}`, { signal });
}
