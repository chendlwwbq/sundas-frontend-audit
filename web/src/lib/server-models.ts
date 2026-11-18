import { encodeChannelModel, modelOptionName, useConfigStore, type ModelCapability } from "@/stores/use-config-store";

export type ServerModelRoute = {
    id: string;
    channelName: string;
    unit: string;
    baseCredits: number;
    resolutionMultipliers?: Record<string, number>;
    health?: string;
    latencyMs?: number | null;
    checkedAt?: string | null;
};

export type ServerModel = {
    id: string;
    name: string;
    upstreamName?: string;
    capability: ModelCapability;
    unit?: string;
    baseCredits?: number;
    minCredits?: number;
    maxCredits?: number;
    routeCount?: number;
    health?: string;
    familyId?: string | null;
    familyName?: string | null;
    familyVendor?: string | null;
    familyIcon?: string | null;
    description?: string;
    metadata?: Record<string, unknown>;
    routes?: ServerModelRoute[];
    resolutionMultipliers?: Record<string, number>;
};

const CHANNEL_ID = "server";

export function applyServerModels(models: ServerModel[]) {
    const baseUrl = `${window.location.origin}/api`;
    const channel = {
        id: CHANNEL_ID,
        name: "sundas",
        baseUrl,
        apiKey: "server",
        apiFormat: "openai" as const,
        models: models.map((model) => ({ name: model.id, capability: model.capability })),
    };
    const options = models.map((model) => encodeChannelModel(CHANNEL_ID, model.id));

    const pick = (value: string, capability: ModelCapability) => {
        const current = modelOptionName(value);
        const matched = models.find((model) => model.id === current && model.capability === capability)
            ?? models.find((model) => (model.name === current || model.upstreamName === current) && model.capability === capability);
        if (matched) return encodeChannelModel(CHANNEL_ID, matched.id);
        const first = (capability === 'video' ? models.find((model) => model.capability === 'video' && (model.routes?.length || model.routeCount) && /seedance[\s._-]*2[\s._-]*0(?!\d)/i.test(`${model.name} ${model.upstreamName ?? ''}`)) : undefined)
            ?? models.find((model) => model.capability === capability);
        return first ? encodeChannelModel(CHANNEL_ID, first.id) : "";
    };

    useConfigStore.setState((state) => ({
        serverModels: models.map((model) => {
            const routes = model.routes ?? [];
            const resolutionMultipliers = routes.length
                ? Object.assign({}, ...routes.map((route) => route.resolutionMultipliers ?? {}))
                : model.resolutionMultipliers ?? {};
            const prices = routes.length ? routes.map((route) => Number(route.baseCredits) || 0) : [Number(model.baseCredits) || 0];
            return {
                id: model.id,
                name: model.name,
                upstreamName: model.upstreamName,
                capability: model.capability,
                familyId: model.familyId,
                familyName: model.familyName,
                familyVendor: model.familyVendor,
                familyIcon: model.familyIcon,
                description: model.description,
                metadata: model.metadata,
                routes: routes.map((route, index) => ({
                    id: route.id,
                    channelName: `${index === 0 ? "默认线路" : `备用线路 ${index}`}${route.channelName?.endsWith(" · 稳定快速版（支持参考图、参考视频、参考音频）") ? " · 稳定快速版（支持参考图、参考视频、参考音频）" : route.channelName?.endsWith(" · 按秒线路") ? " · 按秒线路" : ""}`,
                    unit: route.unit,
                    baseCredits: Number(route.baseCredits) || 0,
                    resolutionMultipliers: route.resolutionMultipliers ?? {},
                    health: route.health ?? "unknown",
                    latencyMs: route.latencyMs,
                    checkedAt: route.checkedAt,
                })),
                routeCount: routes.length || model.routeCount || 0,
                minCredits: model.minCredits ?? Math.min(...prices),
                maxCredits: model.maxCredits ?? Math.max(...prices),
                health: model.health ?? "unknown",
                unit: model.unit ?? routes[0]?.unit ?? null,
                resolutionMultipliers,
            };
        }),
        config: {
            ...state.config,
            channelMode: "remote",
            proxyEnabled: false,
            baseUrl,
            apiKey: "server",
            channels: [channel],
            models: options,
            model: pick(state.config.model, "image"),
            imageModel: pick(state.config.imageModel, "image"),
            videoModel: pick(state.config.videoModel, "video"),
            videoRouteId: models.find(model => model.id === modelOptionName(pick(state.config.videoModel, "video")))?.routes?.some(route => route.id === state.config.videoRouteId) ? state.config.videoRouteId : "",
            textModel: pick(state.config.textModel, "text"),
            audioModel: pick(state.config.audioModel, "audio"),
        },
    }));
}
