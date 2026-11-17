import { useState, useMemo } from "react";
import { Search, SlidersHorizontal, CheckCircle2, AlertCircle, Clock, XCircle, ImageIcon, Clapperboard, FileText, Music } from "lucide-react";

import { SiteFooter } from "@/components/layout/site-footer";
import { useConfigStore, type ServerModelInfo } from "@/stores/use-config-store";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useUrlState } from "@/hooks/use-url-state";
import "./models.css";

type ChannelStatus = "available" | "limited" | "unknown" | "coming-soon" | "offline";

const CAPABILITY_OPTIONS = [
    { value: "image", label: "图像生成", icon: ImageIcon },
    { value: "video", label: "视频生成", icon: Clapperboard },
    { value: "text", label: "文本生成", icon: FileText },
    { value: "audio", label: "音频生成", icon: Music },
];

const STATUS_OPTIONS: { value: ChannelStatus; label: string; color: string }[] = [
    { value: "available", label: "可用", color: "green" },
    { value: "limited", label: "受限", color: "orange" },
    { value: "unknown", label: "待检测", color: "blue" },
    { value: "coming-soon", label: "即将上线", color: "blue" },
    { value: "offline", label: "离线", color: "red" },
];

function getModelStatus(model: ServerModelInfo): ChannelStatus {
    if (model.routeCount === 0) return "coming-soon";
    if (model.health === "healthy") return "available";
    if (model.health === "degraded") return "limited";
    if (model.routes.length && model.routes.every(route => route.health === "down")) return "offline";
    return "unknown";
}

function getProviderLogo(vendor: string): string {
    const name = vendor.toLowerCase();
    if (name.includes("anthropic") || name.includes("claude")) return "/icons/claude.svg";
    if (name.includes("openai") || name.includes("gpt")) return "/icons/openai.svg";
    if (name.includes("google") || name.includes("gemini")) return "/icons/gemini.svg";
    if (name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("zhipu") || name.includes("glm")) return "/icons/glm.svg";
    if (name.includes("xai") || name.includes("grok")) return "/icons/grok.svg";
    return "";
}

function StatusBadge({ status }: { status: ChannelStatus }) {
    const config = STATUS_OPTIONS.find(s => s.value === status);
    if (!config) return null;

    const icons = {
        available: CheckCircle2,
        limited: AlertCircle,
        unknown: Clock,
        "coming-soon": Clock,
        offline: XCircle,
    };
    const Icon = icons[status];

    return (
        <span className={`model-status-badge status-${config.color}`}>
            <Icon className="size-3" />
            {config.label}
        </span>
    );
}

export default function ModelsPage() {
    const serverModels = useConfigStore((state) => state.serverModels);

    const [urlFilters, setUrlFilters] = useUrlState({
        providers: [] as string[],
        capabilities: [] as string[],
        status: [] as string[],
    });

    const [searchInput, setSearchInput] = useState("");
    const [showFilters, setShowFilters] = useState(false);
    const debouncedSearch = useDebouncedValue(searchInput, 300);

    // 提取所有厂商
    const allProviders = useMemo(() => {
        const providers = new Set<string>();
        serverModels.forEach(model => {
            if (model.familyVendor) providers.add(model.familyVendor);
        });
        return Array.from(providers).sort();
    }, [serverModels]);

    // 筛选模型
    const filteredModels = useMemo(() => {
        return serverModels.filter(model => {
            // 搜索过滤
            if (debouncedSearch) {
                const search = debouncedSearch.toLowerCase();
                const matchName = model.name.toLowerCase().includes(search);
                const matchVendor = model.familyVendor?.toLowerCase().includes(search);
                const matchFamily = model.familyName?.toLowerCase().includes(search);
                if (!matchName && !matchVendor && !matchFamily) return false;
            }

            // 厂商过滤
            if (urlFilters.providers.length > 0) {
                if (!model.familyVendor || !urlFilters.providers.includes(model.familyVendor)) {
                    return false;
                }
            }

            // 能力过滤
            if (urlFilters.capabilities.length > 0) {
                if (!urlFilters.capabilities.includes(model.capability)) return false;
            }

            // 状态过滤
            if (urlFilters.status.length > 0) {
                const modelStatus = getModelStatus(model);
                if (!urlFilters.status.includes(modelStatus)) return false;
            }

            return true;
        });
    }, [serverModels, debouncedSearch, urlFilters]);

    // 按厂商分组
    const groupedModels = useMemo(() => {
        const groups = new Map<string, ServerModelInfo[]>();
        filteredModels.forEach(model => {
            const vendor = model.familyVendor || "其他";
            if (!groups.has(vendor)) {
                groups.set(vendor, []);
            }
            groups.get(vendor)!.push(model);
        });
        return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [filteredModels]);

    const toggleFilter = (type: keyof typeof urlFilters, value: string) => {
        const current = urlFilters[type] as string[];
        const next = current.includes(value)
            ? current.filter(v => v !== value)
            : [...current, value];
        setUrlFilters({ [type]: next });
    };

    return (
        <div className="models-page">
            <div className="models-content">
                {/* 头部 */}
                <header className="models-header">
                    <div className="models-header-content">
                        <div>
                            <h1 className="models-title">模型广场</h1>
                            <p className="models-subtitle">
                                探索 {serverModels.length} 个 AI 模型，涵盖图像、视频、文本和音频生成
                            </p>
                        </div>
                        <div className="models-stats">
                            <div className="models-stat-item">
                                <span className="models-stat-value">{allProviders.length}</span>
                                <span className="models-stat-label">厂商</span>
                            </div>
                            <div className="models-stat-item">
                                <span className="models-stat-value">{serverModels.length}</span>
                                <span className="models-stat-label">模型</span>
                            </div>
                            <div className="models-stat-item">
                                <span className="models-stat-value">
                                    {serverModels.filter(m => getModelStatus(m) === "available").length}
                                </span>
                                <span className="models-stat-label">可用</span>
                            </div>
                        </div>
                    </div>
                </header>

                {/* 筛选栏 */}
                <div className="models-filters-bar">
                    <div className="models-search-wrapper">
                        <Search className="models-search-icon" />
                        <input
                            type="text"
                            className="models-search-input"
                            placeholder="搜索模型、厂商..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                        />
                    </div>
                    <button
                        type="button"
                        className={`models-filter-toggle ${showFilters ? "is-active" : ""}`}
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <SlidersHorizontal className="size-4" />
                        筛选
                        {(urlFilters.providers.length + urlFilters.capabilities.length + urlFilters.status.length) > 0 && (
                            <span className="models-filter-count">
                                {urlFilters.providers.length + urlFilters.capabilities.length + urlFilters.status.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* 筛选面板 */}
                {showFilters && (
                    <div className="models-filters-panel">
                        {/* 厂商筛选 */}
                        <div className="models-filter-group">
                            <h3 className="models-filter-title">厂商</h3>
                            <div className="models-filter-options">
                                {allProviders.map(provider => (
                                    <button
                                        key={provider}
                                        type="button"
                                        className={`models-filter-chip ${
                                            urlFilters.providers.includes(provider) ? "is-selected" : ""
                                        }`}
                                        onClick={() => toggleFilter("providers", provider)}
                                    >
                                        {getProviderLogo(provider) && (
                                            <img
                                                src={getProviderLogo(provider)}
                                                alt={provider}
                                                className="models-filter-chip-logo"
                                            />
                                        )}
                                        {provider}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 能力筛选 */}
                        <div className="models-filter-group">
                            <h3 className="models-filter-title">能力</h3>
                            <div className="models-filter-options">
                                {CAPABILITY_OPTIONS.map(cap => (
                                    <button
                                        key={cap.value}
                                        type="button"
                                        className={`models-filter-chip ${
                                            urlFilters.capabilities.includes(cap.value) ? "is-selected" : ""
                                        }`}
                                        onClick={() => toggleFilter("capabilities", cap.value)}
                                    >
                                        <cap.icon className="size-3.5" aria-hidden="true" />
                                        {cap.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 状态筛选 */}
                        <div className="models-filter-group">
                            <h3 className="models-filter-title">渠道状态</h3>
                            <div className="models-filter-options">
                                {STATUS_OPTIONS.map(status => (
                                    <button
                                        key={status.value}
                                        type="button"
                                        className={`models-filter-chip ${
                                            urlFilters.status.includes(status.value) ? "is-selected" : ""
                                        }`}
                                        onClick={() => toggleFilter("status", status.value)}
                                    >
                                        {status.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 重置按钮 */}
                        {(urlFilters.providers.length + urlFilters.capabilities.length + urlFilters.status.length) > 0 && (
                            <button
                                type="button"
                                className="models-filter-reset"
                                onClick={() => setUrlFilters({ providers: [], capabilities: [], status: [] })}
                            >
                                重置筛选
                            </button>
                        )}
                    </div>
                )}

                {/* 模型列表 */}
                <div className="models-list">
                    {groupedModels.length > 0 ? (
                        groupedModels.map(([vendor, models]) => (
                            <div key={vendor} className="models-vendor-group">
                                <div className="models-vendor-header">
                                    {getProviderLogo(vendor) && (
                                        <img
                                            src={getProviderLogo(vendor)}
                                            alt={vendor}
                                            className="models-vendor-logo"
                                        />
                                    )}
                                    <h2 className="models-vendor-name">{vendor}</h2>
                                    <span className="models-vendor-count">{models.length} 个模型</span>
                                </div>
                                <div className="models-grid">
                                    {models.map(model => {
                                        const status = getModelStatus(model);
                                        const capability = CAPABILITY_OPTIONS.find(option => option.value === model.capability);
                                        const minCredits = Number.isInteger(model.minCredits)
                                            ? model.minCredits
                                            : Number(model.minCredits.toFixed(2));
                                        const maxCredits = Number.isInteger(model.maxCredits)
                                            ? model.maxCredits
                                            : Number(model.maxCredits.toFixed(2));
                                        const priceText = model.routeCount > 0 && model.minCredits > 0
                                            ? `${minCredits === maxCredits ? minCredits : `${minCredits}-${maxCredits}`} 积分${
                                                model.unit === "second" ? "/秒" :
                                                model.unit === "request" ? "/次" :
                                                model.unit === "image" ? "/张" : ""
                                            }`
                                            : "价格待定";

                                        return (
                                            <div key={model.id} className="model-card">
                                                <div className="model-card-header">
                                                    <div className="model-card-icon">
                                                        {model.familyIcon ? (
                                                            <img
                                                                src={model.familyIcon}
                                                                alt={model.name}
                                                                className="model-icon-img"
                                                            />
                                                        ) : (
                                                            <span className="model-icon-text">
                                                                {model.name.slice(0, 2).toUpperCase()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <StatusBadge status={status} />
                                                </div>

                                                <div className="model-card-body">
                                                    <h3 className="model-card-title">{model.name}</h3>
                                                    {model.description && (
                                                        <p className="model-card-description">{model.description}</p>
                                                    )}
                                                </div>

                                                <div className="model-card-footer">
                                                    <div className="model-card-capabilities">
                                                        {capability && (
                                                            <span className="model-capability-badge" aria-label={capability.label} title={capability.label}>
                                                                <capability.icon className="size-3.5" aria-hidden="true" />
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="model-card-meta">
                                                        <span className="model-card-price">{priceText}</span>
                                                        {model.routeCount > 0 && (
                                                            <div className="model-card-routes">
                                                                <span className="model-routes-count">{model.routeCount} 条线路</span>
                                                                <div className="model-routes-dots">
                                                                    {Array.from({ length: Math.min(model.routeCount, 5) }).map((_, i) => (
                                                                        <span key={i} className="model-route-dot" />
                                                                    ))}
                                                                    {model.routeCount > 5 && (
                                                                        <span className="model-routes-more">+{model.routeCount - 5}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="models-empty">
                            <p className="models-empty-text">没有找到匹配的模型</p>
                            <p className="models-empty-hint">尝试调整筛选条件或搜索关键词</p>
                        </div>
                    )}
                </div>
            </div>

            <SiteFooter />
        </div>
    );
}
