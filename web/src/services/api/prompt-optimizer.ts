import { apiRequest } from "./client";

export type PromptOptimizerCapability = "image" | "video";

export type PromptOptimizerResult = {
    prompt: string;
    skill: { key: string; label: string };
    creditsCharged: number;
};

export function optimizePrompt(
    input: { prompt: string; model: string; capability: PromptOptimizerCapability },
    signal?: AbortSignal,
) {
    return apiRequest<PromptOptimizerResult>("/api/prompts/optimize", {
        method: "POST",
        json: input,
        signal,
    });
}

export function estimatePromptOptimization(model: string, capability: PromptOptimizerCapability, signal?: AbortSignal) {
    return apiRequest<{ credits: number }>(`/api/prompts/optimize/estimate?${new URLSearchParams({ model, capability })}`, { signal });
}
