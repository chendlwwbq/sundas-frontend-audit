import { ArrowUpRight, Copy, FolderPlus } from "lucide-react";
import { Button, Modal, Space, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { PromptCover } from "@/components/prompts/prompt-cover";
import { promptImageUrl } from "@/lib/prompt-image";
import { formatPromptDate, type Prompt } from "@/services/api/prompts";

export function PromptDetailDialog({ prompt, onClose, onCopy, onUsePrompt, onSaveAsset }: { prompt: Prompt | null; onClose: () => void; onCopy: (prompt: string) => void; onUsePrompt?: (prompt: Prompt) => void; onSaveAsset?: (prompt: Prompt) => void }) {
    const { i18n, t } = useTranslation();

    return (
        <Modal title={prompt?.title} open={Boolean(prompt)} onCancel={onClose} footer={null} width={720} centered destroyOnHidden styles={{ body: { height: "calc(85vh - 55px)", overflow: "hidden" } }}>
            {prompt ? (
                <div className="flex h-full min-h-0 flex-col">
                    <div className="shrink-0 space-y-3 pb-4">
                        {prompt.previewVideoUrl ? (
                            // 视频条目只显示播放器（poster 走站内图片代理，失败时退到首帧），不再额外叠封面大图
                            <video
                                key={prompt.id}
                                src={prompt.previewVideoUrl}
                                poster={promptImageUrl(prompt.coverUrl) || undefined}
                                controls
                                playsInline
                                preload="metadata"
                                className="h-48 w-full rounded-lg bg-black object-contain sm:h-56"
                            />
                        ) : (
                            <PromptCover src={prompt.coverUrl} alt={prompt.title} className="h-48 w-full rounded-lg object-cover sm:h-56" />
                        )}
                        {prompt.referenceImageUrls.length > 1 ? <div className="grid grid-cols-6 gap-2">{prompt.referenceImageUrls.filter((url) => url !== prompt.coverUrl).slice(0, 6).map((url) => <PromptCover key={url} src={url} alt="" compact className="aspect-square w-full rounded-md object-cover" />)}</div> : null}
                    </div>
                    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto border-y border-border py-4 pr-2 dark:border-border">
                        <div className="flex flex-wrap gap-1.5">
                            {prompt.tags.map((tag) => (
                                <Tag key={tag} className="m-0">
                                    {tag}
                                </Tag>
                            ))}
                        </div>
                        {prompt.description ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{prompt.description}</p> : null}
                        {prompt.preview ? <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs leading-5 text-muted-foreground dark:bg-muted dark:text-foreground/80">{prompt.preview}</pre> : null}
                        <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-foreground dark:text-foreground/80">{prompt.prompt}</p>
                        {prompt.createdAt || prompt.updatedAt ? <div className="mt-4 text-xs text-muted-foreground">{prompt.createdAt ? t("common.created", { date: formatPromptDate(prompt.createdAt, i18n.resolvedLanguage) }) : null}{prompt.createdAt && prompt.updatedAt ? " · " : null}{prompt.updatedAt ? t("common.updated", { date: formatPromptDate(prompt.updatedAt, i18n.resolvedLanguage) }) : null}</div> : null}
                    </div>
                    <div className="shrink-0 pt-4">
                        <Space wrap>
                            {onUsePrompt ? (
                                <Button type="primary" icon={<ArrowUpRight className="size-4" />} onClick={() => onUsePrompt(prompt)}>
                                    {t("home.usePrompt")}
                                </Button>
                            ) : null}
                            <Button icon={<Copy className="size-4" />} onClick={() => onCopy(prompt.prompt)}>
                                {t("common.copyPrompt")}
                            </Button>
                            {onSaveAsset ? (
                                <Button icon={<FolderPlus className="size-4" />} onClick={() => onSaveAsset(prompt)}>
                                    {t("common.addToAssets")}
                                </Button>
                            ) : null}
                        </Space>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}
