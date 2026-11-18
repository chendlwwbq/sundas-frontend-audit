import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";
import { Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { parseVideoResolution, videoResolutionOptionsFromMap } from "@/lib/media-size";
import { modelOptionLabel, modelOptionName, selectableModelsByCapability, useConfigStore, type AiConfig, type ModelCapability, type ServerModelInfo } from "@/stores/use-config-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
    onRouteSelect?: (model: string, routeId: string) => void;
    triggerStyle?: CSSProperties;
};

type ModelGroup = { key: string; label: string; hint: string; models: string[] };

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder, onMissingConfig, onRouteSelect, triggerStyle }: ModelPickerProps) {
    const { t } = useTranslation();
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const serverModels = useConfigStore((state) => state.serverModels);
    const options = useMemo(() => {
        const candidates = [...(config.channelMode === "local" && !capability ? [value] : []), ...selectableModelsByCapability(config, capability)];
        return Array.from(new Set(candidates.filter((model): model is string => !!model && (!model.startsWith("server::") || serverModels.some(item => item.id === modelOptionName(model))))));
    }, [capability, config, value, serverModels]);
    const current = value && options.includes(value) ? value : "";
    const pickerPlaceholder = placeholder || t("settingsPanels.model.select");
    const serverInfo = useMemo(() => {
        const map = new Map(serverModels.map((model) => [model.id, model]));
        return (model: string) => map.get(modelOptionName(model));
    }, [serverModels]);
    const groups = useMemo(() => groupModels(config, options, serverInfo), [config, options, serverInfo]);
    const selected = serverInfo(current);
    const selectedRoute = capability === 'video' && onRouteSelect && config.videoRouteId ? selected?.routes.find((route) => route.id === config.videoRouteId) : undefined;
    const routeLabel = selectedRoute ? displayRouteName(selectedRoute.channelName) : (capability === 'video' && onRouteSelect && config.videoRouteId ? '所选线路已不可用，请重新选择' : capability === 'video' && onRouteSelect && selected?.routes.length ? '自动选择' : '');
    const routeValue = (model: string, routeId: string) => `__video_route__${encodeURIComponent(model)}|${routeId}`;
    const selectVideoRoute = (model: string, routeId: string) => {
        const info = serverInfo(model);
        const capabilities = routeId ? info?.routes.find(route => route.id === routeId)?.resolutionMultipliers : info?.resolutionMultipliers;
        const resolutions = videoResolutionOptionsFromMap(capabilities);
        if (!resolutions.some(option => option.value === parseVideoResolution(config.vquality))) {
            useConfigStore.getState().updateConfig("vquality", resolutions.find(option => option.value === "720")?.value ?? resolutions[0].value);
        }
        onRouteSelect?.(model, routeId);
    };

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    return (
        <Select
            open={open}
            value={selectedRoute ? routeValue(current, selectedRoute.id) : current}
            onOpenChange={(nextOpen) => {
                if (nextOpen && !options.length && config.channelMode === "local") onMissingConfig?.();
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={(next) => {
                if (next.startsWith('__video_route__') && onRouteSelect) {
                    const [encoded, routeId] = next.slice('__video_route__'.length).split('|');
                    selectVideoRoute(decodeURIComponent(encoded), routeId);
                } else if (capability === 'video' && onRouteSelect) selectVideoRoute(next, '');
                else onChange(next);
            }}
        >
            <SelectTrigger
                className={cn(
                    "canvas-composer-model-picker h-8 w-fit max-w-full gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors",
                    fullWidth ? "w-full min-w-0 justify-start" : "min-w-[9rem] justify-start",
                    "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                    className,
                )}
                style={triggerStyle}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={current ? `${selected?.name || modelOptionLabel(config, current)}${routeLabel ? ` · ${routeLabel}` : ''}` : pickerPlaceholder}
            >
                <ModelIcon model={current} icon={selected?.familyIcon} />
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{current ? `${selected?.name || modelOptionLabel(config, current)}${routeLabel ? ` · ${routeLabel}` : ''}` : pickerPlaceholder}</span>
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className={cn("z-[1200] max-w-[calc(100vw-24px)] rounded-xl border border-border/70 bg-popover p-1 shadow-lg [&_[data-position=popper]]:min-w-0 [&_[data-slot=select-item]>span:last-child]:min-w-0 [&_[data-slot=select-item]>span:last-child]:flex-1", options.length ? "w-[300px]" : "w-[240px]")}
                position="popper"
                align="start"
                side="bottom"
                sideOffset={6}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {groups.length ? (
                    groups.map((group) => (
                        <SelectGroup key={group.key}>
                            <SelectLabel className="flex items-center justify-between gap-2 px-2 py-1.5">
                                <span className="truncate font-medium text-foreground">{group.label}</span>
                                <span className="shrink-0 text-[10px] font-normal text-muted-foreground">{group.hint}</span>
                            </SelectLabel>
                            {group.models.map((model) => {
                                const info = serverInfo(model);
                                const hasVideoRoutes = capability === 'video' && onRouteSelect && Boolean(info?.routes.length);
                                if (!hasVideoRoutes || !info) return <SelectItem key={model} value={model} textValue={info?.name || modelOptionLabel(config, model)} disabled={Boolean(info && info.routeCount === 0 && model !== current)} className="items-start py-2">
                                    <ModelLabel config={config} model={model} info={info} />
                                </SelectItem>;
                                return <div key={model} className="mb-1 rounded-lg border border-border/50 p-1">
                                    <div className="px-2 py-1.5"><ModelLabel config={config} model={model} info={info} hideRoutes /></div>
                                    <SelectItem value={model} textValue={`${info.name} 自动选择`} className="my-0.5 py-2 pl-8 text-xs">
                                        <span className="flex w-full items-center justify-between gap-2"><span className="font-medium">自动选择</span><span className="text-muted-foreground">系统选择可用线路</span></span>
                                    </SelectItem>
                                    {info.routes.map((route) => {
                                        const keys = Object.keys(route.resolutionMultipliers ?? {});
                                        const paused = keys.length > 0 && !keys.some((key) => /^(480|720|1080|2k|4k)$/i.test(key));
                                        const resolution = parseVideoResolution(config.vquality);
                                        const multiplier = route.resolutionMultipliers?.[resolution];
                                        const unsupported = keys.length > 0 && multiplier === undefined;
                                        const name = displayRouteName(route.channelName);
                                        return <SelectItem key={route.id} value={routeValue(model, route.id)} textValue={`${info.name} ${name}`} disabled={paused} className="my-0.5 py-2 pl-8 text-xs">
                                            <span className="flex w-full items-center justify-between gap-2"><span className="font-medium">{name}</span><span className="shrink-0 text-muted-foreground">{paused ? '暂不可用' : unsupported ? '切换后调整清晰度' : `${formatCredits(route.baseCredits * (multiplier ?? 1), true)} 积分/${route.unit === 'second' ? '秒' : '次'}`}</span></span>
                                        </SelectItem>;
                                    })}
                                </div>;
                            })}
                        </SelectGroup>
                    ))
                ) : (
                    <SelectItem value="__empty__" disabled className="whitespace-normal py-2 text-xs leading-5">{emptyModelLabel(config, capability)}</SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

function groupModels(config: AiConfig, options: string[], infoOf: (model: string) => ServerModelInfo | undefined): ModelGroup[] {
    const groups = new Map<string, ModelGroup>();
    for (const model of options) {
        const info = infoOf(model);
        const channel = config.channels.find((item) => item.id === model.split("::")[0]);
        const key = info?.familyId || info?.familyName || channel?.id || "other";
        const existing = groups.get(key);
        if (existing) {
            existing.models.push(model);
            continue;
        }
        const label = info?.familyName || channel?.name || i18n.t("settingsPanels.model.select");
        const hint = info?.familyVendor || (info ? `${info.routeCount} 条线路` : channel?.baseUrl || "");
        groups.set(key, { key, label, hint, models: [model] });
    }
    return [...groups.values()];
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    if (capability === "video") return "暂无可用的视频模型，请联系管理员";
    const label = capability ? i18n.t(`settingsPanels.model.capabilities.${capability}`) : "";
    if (capability && config.models.length) return i18n.t("settingsPanels.model.assign", { capability: label });
    return config.models.length ? i18n.t("settingsPanels.model.noMatch", { capability: label }) : i18n.t("settingsPanels.model.addFirst");
}

function displayRouteName(name: string) {
    if (name.includes("稳定快速版")) return "稳定快速版";
    if (name.includes("按秒线路")) return "按秒线路";
    const backup = name.match(/备用线路\s*(\d+)/);
    return backup ? `标准线路 ${backup[1]}` : name;
}

function ModelLabel({ config, model, info, hideRoutes = false }: { config: AiConfig; model: string; info?: ServerModelInfo; hideRoutes?: boolean }) {
    if (!info) {
        return (
            <span className="flex min-w-0 items-center gap-2">
                <ModelIcon model={model} />
                <span className="truncate">{modelOptionLabel(config, model)}</span>
            </span>
        );
    }
    const min = formatCredits(info.minCredits, info.capability === "video");
    const max = formatCredits(info.maxCredits, info.capability === "video");
    const price = info.routeCount || info.minCredits > 0 ? `${min === max ? min : `${min}–${max}`} 积分${info.unit === "second" ? "/秒" : info.unit === "request" ? "/次" : ""}` : "价格待定";
    return (
        <span className="flex min-w-0 flex-1 items-start gap-2.5">
            <ModelIcon model={model} icon={info.familyIcon} />
            <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{info.name}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{price}</span>
                </span>
                {!hideRoutes && (info.description || info.routes.length > 0) && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{info.description || info.routes.map((route) => route.channelName).join(" / ")}</span>}
                {!hideRoutes && <span className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{info.routeCount ? `${info.routeCount} 条线路` : "即将上线"}</span>
                    <span className="flex items-center gap-1">
                        {info.routes.slice(0, 7).map((route) => (
                            <span key={route.id} title={route.channelName} className="size-1.5 rounded-full bg-green-500" />
                        ))}
                    </span>
                </span>}
            </span>
        </span>
    );
}

function formatCredits(value: number, integer = false) {
    if (integer) return `${Number.isInteger(value) ? "" : "约"}${Math.round(value)}`;
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function ModelIcon({ model, icon }: { model: string; icon?: string | null }) {
    const src = icon || resolveModelIcon(modelOptionName(model));
    return src ? <img src={src} alt="" className="mt-0.5 size-4 shrink-0 dark:invert" /> : <Cpu className="mt-0.5 size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm")) return "/icons/glm.svg";
    return "";
}
