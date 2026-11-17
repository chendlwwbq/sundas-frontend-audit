import { apiRequest } from "./client";

export const ALL_PROMPTS_OPTION = "all";

export type Prompt = {
    id: string;
    sourceId: string;
    category: string;
    title: string;
    prompt: string;
    description: string;
    coverUrl: string;
    referenceImageUrls: string[];
    tags: string[];
    preview: string;
    previewVideoUrl?: string;
    githubUrl: string;
    createdAt: string;
    updatedAt: string;
};

export type PromptSourceInfo = {
    id: string;
    name: string;
    count: number;
};

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    total: number;
    page: number;
    pageSize: number;
    hasMore: boolean;
};

export async function fetchPrompts({
    keyword = "",
    tag = [],
    category = ALL_PROMPTS_OPTION,
    page = 1,
    pageSize = 20,
    metadata = true,
    sourceId,
    kind,
    signal,
}: {
    keyword?: string;
    tag?: string[];
    category?: string;
    page?: number;
    pageSize?: number;
    metadata?: boolean;
    sourceId?: string;
    kind?: 'image' | 'video';
    signal?: AbortSignal;
} = {}) {
    const params = new URLSearchParams();
    if (keyword.trim()) params.set("keyword", keyword.trim());
    if (tag.length) params.set("tags", tag.join(","));
    if (category && category !== ALL_PROMPTS_OPTION) params.set("category", category);
    if (!metadata) params.set("metadata", "false");
    if (sourceId) params.set("sourceId", sourceId);
    if (kind) params.set("kind", kind);
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    return apiRequest<PromptListResponse>(`/api/prompts?${params.toString()}`, { signal });
}

export async function fetchPromptSources() {
    const data = await apiRequest<{ sources: PromptSourceInfo[] }>("/api/prompts/sources");
    return data.sources;
}

export function formatPromptDate(value: string, locale?: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
