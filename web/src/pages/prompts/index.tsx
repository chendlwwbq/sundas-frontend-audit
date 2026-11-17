import { FolderPlus, Search } from "lucide-react";
import { type ReactNode, type UIEvent, useEffect, useState } from "react";
import { App, Button, Empty, Spin, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { PromptCard } from "@/components/prompts/prompt-card";
import { usePromptList } from "@/components/prompts/use-prompt-list";
import { PromptDetailDialog } from "@/components/prompts/prompt-detail-dialog";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { useAssetStore } from "@/stores/use-asset-store";
import { promptImageUrl } from "@/lib/prompt-image";
import { ALL_PROMPTS_OPTION, type Prompt } from "@/services/api/prompts";

export default function PromptsPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const [titleKeyword, setTitleKeyword] = useState("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState(ALL_PROMPTS_OPTION);
    const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
    const addAsset = useAssetStore((state) => state.addAsset);
    const copyText = useCopyText();
    const { query, items: promptItems, tags: promptTags, categories: promptCategoryOptions, total: totalPrompts } = usePromptList({ keyword: titleKeyword, tags: selectedTags, category: selectedCategory });

    useEffect(() => {
        if (query.isError) message.error(query.error instanceof Error ? query.error.message : t("prompts.loadFailed"));
    }, [message, query.error, query.isError, t]);

    const toggleTag = (tag: string) => {
        if (tag === ALL_PROMPTS_OPTION) return setSelectedTags([]);
        setSelectedTags((items) => (items.includes(tag) ? items.filter((item) => item !== tag) : [...items, tag]));
    };

    const savePromptAsset = (item: Prompt) => {
        addAsset({ kind: "text", title: item.title, coverUrl: promptImageUrl(item.coverUrl), tags: item.tags, source: item.category, data: { content: item.prompt }, metadata: { source: "prompt-library", promptId: item.id, githubUrl: item.githubUrl } });
        message.success(t("common.addedToAssets"));
    };

    const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
        const target = event.currentTarget;
        if (query.hasNextPage && !query.isFetching && !query.isFetchNextPageError && target.scrollTop + target.clientHeight >= target.scrollHeight - 160) void query.fetchNextPage();
    };

    return (
        <div className="page-surface flex h-full flex-col overflow-hidden bg-background text-foreground dark:text-foreground">
            <main className="prompts-main jm-page" onScroll={handleListScroll}>
                <div className="prompts-band jm-page-inner">
                    <header className="jm-page-head">
                    <div className="min-w-0">
                        <h1 className="jm-page-title">{t("prompts.title")}</h1>
                        <p className="jm-page-desc">{t("prompts.total", { count: totalPrompts })}</p>
                    </div>
                    <label className="jm-search shrink-0">
                        <Search className="size-4 shrink-0" />
                        <input value={titleKeyword} placeholder={t("prompts.search")} onChange={(event) => setTitleKeyword(event.target.value)} />
                    </label>
                    </header>
                    <div className="prompts-layout mt-7 space-y-6">
                        <section aria-label="提示词筛选" className="space-y-3 border-b border-border pb-5">
                            <PromptFilter label={t("prompts.category")} options={promptCategoryOptions} selected={selectedCategory} onChange={setSelectedCategory} />
                            <div className="prompt-filter-row">
                                <div className="prompt-filter-label is-tags">{t("prompts.tags")}</div>
                                <div className="prompt-tag-scroll" role="group" aria-label={t("prompts.tags")}>
                                    {promptTags.map((tag) => {
                                        const active = tag === ALL_PROMPTS_OPTION ? selectedTags.length === 0 : selectedTags.includes(tag);
                                        return <Tag.CheckableTag key={tag} checked={active} className={cn("prompt-filter-tag", active && "is-active")} onChange={() => toggleTag(tag)}>{tag === ALL_PROMPTS_OPTION ? t("common.all") : tag}</Tag.CheckableTag>;
                                    })}
                                </div>
                            </div>
                        </section>
                        <section className="min-w-0">
                            {query.isLoading ? <div className="flex h-60 items-center justify-center"><Spin /></div> : null}
                            {!query.isLoading ? <div><PromptGrid items={promptItems} onOpen={setSelectedPrompt} renderActions={(item) => <Button type="text" size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => savePromptAsset(item)}>{t("common.addToAssets")}</Button>} onCopy={(item) => copyText(item.prompt, t("common.promptCopied"))} emptyText={t("prompts.empty")} /></div> : null}
                            <div className="mt-6 text-center text-xs text-muted-foreground">{query.hasNextPage ? <Button type="text" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchNextPageError ? t("canvas.sidePanel.loadFailedRetry") : t("prompts.loadMore")}</Button> : promptItems.length > 0 ? t("prompts.end") : null}</div>
                        </section>
                    </div>
                </div>
            </main>

            <PromptDetailDialog prompt={selectedPrompt} onClose={() => setSelectedPrompt(null)} onCopy={(prompt) => copyText(prompt, t("common.promptCopied"))} onSaveAsset={savePromptAsset} />
        </div>
    );
}

function PromptFilter({ label, options, selected, onChange }: { label: string; options: string[]; selected: string; onChange: (value: string) => void }) {
    const { t } = useTranslation();
    return <div className="prompt-filter-row"><div className="prompt-filter-label">{label}</div><div className="prompt-filter-options">{options.map((option) => <Tag.CheckableTag key={option} checked={selected === option} className={cn("prompt-filter-tag", selected === option && "is-active")} onChange={() => onChange(option)}>{option === ALL_PROMPTS_OPTION ? t("common.all") : option}</Tag.CheckableTag>)}</div></div>;
}

function PromptGrid({ items, onOpen, onCopy, renderActions, emptyText }: { items: Prompt[]; onOpen: (item: Prompt) => void; onCopy: (item: Prompt) => void; renderActions: (item: Prompt) => ReactNode; emptyText: string }) {
    return <div><div className="prompts-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.map((item) => <PromptCard key={`${item.sourceId}:${item.id}`} item={item} onOpen={() => onOpen(item)} onCopy={() => onCopy(item)} extraAction={renderActions(item)} />)}</div>{items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} className="!m-0 jm-card jm-empty min-h-[320px]" /> : null}</div>;
}
