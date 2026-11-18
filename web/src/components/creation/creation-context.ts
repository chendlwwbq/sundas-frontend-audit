export type CreationContextRecord = {
    id: string; createdAt: number; prompt: string; status: string; model: string;
    images?: { dataUrl?: string; url?: string; storageKey?: string }[];
    references?: { dataUrl?: string; url?: string; storageKey?: string }[];
    config?: object;
    video?: { url: string }; error?: string;
};
