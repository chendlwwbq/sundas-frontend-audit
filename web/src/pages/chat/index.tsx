import { buildCreationChatInput, latestThreadImage } from "./chat-context";
import { useEffect, useRef, useState } from "react";
import { Input } from "antd";
import { MessageSquare, Plus, Send, Square } from "lucide-react";
import { ChatComposer } from "@astryxdesign/core/Chat";
import { Button } from "@astryxdesign/core/Button";
import { CreationStream } from "@/components/creation/creation-stream";
import { CreationModeSwitch } from "@/components/creation/creation-toolbar";
import { ModelPicker } from "@/components/model-picker";
import { useAuthStore } from "@/stores/use-auth-store";
import { modelOptionName, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useCreditEstimate } from "@/hooks/use-credit-estimate";
import { apiRequest } from "@/services/api/client";
import { useSearchParams } from "react-router-dom";
import { requestImageQuestion } from "@/services/api/image";
import { imageToDataUrl, resolveImageUrl } from "@/services/image-storage";
import { useCreationChat, ensureCreationThread, loadCreationChats, newCreationThread, openCreationThread, patchCreationThread, type ChatEntry } from "./chat-store";
import "@/styles/creation-redesign.css";

export default function ChatPage() {
    const user = useAuthStore(state => state.user);
    const epoch = useAuthStore(state => state.sessionEpoch);
    const session = `${user?.id}:${epoch}`;
    const [params, setParams] = useSearchParams();
    const config = useEffectiveConfig();
    const updateConfig = useConfigStore(state => state.updateConfig);
    const models = useConfigStore(state => state.serverModels);
    const state = useCreationChat();
    const thread = state.owner === user?.id ? state.threads.find(t => t.id === state.activeId) : undefined;
    const messages = thread?.messages ?? [];
    const draft = thread?.draft ?? "";
    const [vision, setVision] = useState<{ enabled: boolean; modelId: string }>();
    const [loadError, setLoadError] = useState("");
    const { image: latestImage } = latestThreadImage(thread);
    const [imagePreview, setImagePreview] = useState("");
    const [imagePreviewError, setImagePreviewError] = useState("");
    const [busy, setBusy] = useState(false);
    const controller = useRef<AbortController | null>(null);
    const end = useRef<HTMLDivElement>(null);
    const model = latestImage ? (vision?.enabled && vision.modelId ? `server::${vision.modelId}` : "") : config.textModel;
    const modelReady = models.some(item => item.id === modelOptionName(model) && item.capability === "text");
    const quote = useCreditEstimate(modelReady ? modelOptionName(model) : "", "text", 1, "", session);
    const current = () => useAuthStore.getState().user?.id === user?.id && useAuthStore.getState().sessionEpoch === epoch;
    const patch = (value: Partial<NonNullable<typeof thread>>) => { if (current() && user && thread) patchCreationThread(user.id, thread.id, value); };

    useEffect(() => {
        let active = true;
        setLoadError("");
        if (!user) return;
        void loadCreationChats(user.id).then(async () => {
            if (!active) return;
            const id = params.get("thread");
            if (id && !openCreationThread(user.id, id)) { setLoadError("该对话不在此浏览器中，可能已清理或来自其他设备。"); return; }
            if (!id) await ensureCreationThread(user.id);
        });
        void apiRequest<{ enabled: boolean; modelId: string }>("/api/creation-chat/config").then(value => { if (active) setVision(value); }).catch(() => { if (active) setLoadError("看图模型配置读取失败，请刷新重试。"); });
        return () => { active = false; controller.current?.abort(); };
    }, [user?.id, epoch, params.get("thread")]);
    useEffect(() => {
        let active = true;
        setImagePreview(""); setImagePreviewError("");
        if (latestImage) void resolveImageUrl(latestImage.storageKey, latestImage.dataUrl || latestImage.url || "")
            .then(url => { if (active) { setImagePreview(url); if (!url) setImagePreviewError("图片暂时无法读取，原记录仍保留。"); } })
            .catch(() => { if (active) setImagePreviewError("图片暂时无法读取，原记录仍保留。"); });
        return () => { active = false; };
    }, [latestImage, user?.id, epoch]);
    useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [messages.length, messages.at(-1)?.text]);
    function updateMessage(threadId: string, id: string, value: Partial<ChatEntry>) {
        if (!current() || !user) return;
        const target = useCreationChat.getState().threads.find(t => t.id === threadId);
        if (target) patchCreationThread(user.id, threadId, { messages: target.messages.map(item => item.id === id ? { ...item, ...value } : item) }, !!value.complete || !!value.error);
    }
    async function send() {
        if (!draft.trim() || !modelReady || controller.current || !user || !thread || loadError) return;
        const threadId = thread.id;
        const abort = new AbortController(); controller.current = abort; setBusy(true);
        const request: ChatEntry = { id: crypto.randomUUID(), role: "user", text: draft.trim() };
        const answer: ChatEntry = { id: crypto.randomUUID(), role: "assistant", text: "" };
        const history = [...messages, request];
        patch({ messages: [...history, answer], draft: "", ...(thread.title === "新对话" ? { title: request.text.slice(0, 40) } : {}) });
        try {
            const input = await buildCreationChatInput({ ...thread, messages: history }, image => imageToDataUrl(image, { expectedOwner: user.id, signal: abort.signal }));
            const text = await requestImageQuestion({ ...config, model }, input, text => updateMessage(threadId, answer.id, { text }), { signal: abort.signal, expectedUserId: user.id, surface: "workbench", creationChat: true });
            updateMessage(threadId, answer.id, { text, complete: true });
        } catch (error) {
            updateMessage(threadId, answer.id, { error: abort.signal.aborted ? "已停止回复，可继续提问。" : error instanceof Error ? error.message : String(error) });
        } finally { controller.current = null; if (current()) setBusy(false); }
    }
    const cost = quote.data ? `预计 ${quote.data.minCredits === quote.data.maxCredits ? quote.data.minCredits : `${quote.data.minCredits}–${quote.data.maxCredits}`} 积分 / 次` : modelReady ? "暂无法估算积分" : "请选择语言模型";
    return <div className="flex h-full min-h-0 flex-col">
        <div className="creation-top-actions flex items-center justify-between px-5 py-3">
            <button type="button" disabled={busy} className="flex items-center gap-2 text-sm disabled:opacity-40" onClick={() => { if (user) { const id = newCreationThread(user.id); setLoadError(""); setParams({ mode: "chat", thread: id }); } }}><Plus className="size-4" />新建对话</button>
            <span className="text-xs text-muted-foreground">创作交流 · 看图建议</span>
        </div>
        {(loadError || state.error) && <p role="alert" className="px-5 py-2 text-sm text-red-400">{loadError || state.error}</p>}
        <CreationStream composer={<div className="creation-composer mx-auto w-full max-w-[960px]">
            <ChatComposer value={draft} onSubmit={() => void send()} elevation="none"
                input={<div>
                    <Input.TextArea className="creation-chat-input" value={draft} onChange={e => patch({ draft: e.target.value })} autoSize={{ minRows: 2, maxRows: 5 }} placeholder="直接提问，自动结合当前创作内容和全部对话…" />
                </div>}
                footerActions={<div className="creation-actions flex w-full flex-wrap items-center gap-2"><CreationModeSwitch mode="chat" busy={busy} />{latestImage ? <span className="text-xs text-muted-foreground">看图模型：{models.find(m => m.id === vision?.modelId)?.name ?? "后台暂未配置"} · 自动附带最近一张图片</span> : <ModelPicker config={config} value={model} capability="text" placeholder="选择语言模型" onChange={value => updateConfig("textModel", value)} />}</div>}
                sendActions={<div className="creation-costs"><span className="text-xs text-muted-foreground" title="沿用文本模型计费，实际积分以服务端结算为准">{cost}</span></div>}
                sendButton={busy ? <Button label="停止" size="lg" variant="ghost" icon={<Square className="size-4" />} onClick={() => controller.current?.abort()} /> : <Button label="发送" size="lg" variant="primary" icon={<Send className="size-4" />} isDisabled={!draft.trim() || !modelReady || !thread || !!loadError} onClick={() => void send()} />}
            />
        </div>}>
            {latestImage && <div className="mx-auto mb-6 w-full max-w-[620px] rounded-2xl border border-border bg-card/30 p-4"><p className="mb-3 text-xs text-muted-foreground">当前图片 · 对话将自动分析这张图</p>{imagePreview ? <img src={imagePreview} alt="本次对话的最近一张图片" className="max-h-[40vh] w-full rounded-xl object-contain" onError={() => setImagePreviewError("图片暂时无法读取，原记录仍保留。")} /> : null}{imagePreviewError ? <p role="alert" className="text-xs text-red-400">{imagePreviewError}</p> : !imagePreview ? <p className="text-xs text-muted-foreground">正在读取图片…</p> : null}</div>}
            {!messages.length && !latestImage && <div className="creation-empty"><div className="creation-empty-icon"><MessageSquare className="size-7" /></div><h2>聊聊你的创作想法</h2><p>仅使用本次对话的内容和最近一张图片。<br />对话保存在当前浏览器，支持从最近作品继续。</p><button type="button" className="creation-tool-button mt-4" onClick={() => patch({ draft: "请分析刚刚生成的图片，并提出具体的改进建议。" })}>分析图片并给建议</button></div>}
            {messages.map(item => <div key={item.id} className={`mb-5 flex ${item.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-7 ${item.role === "user" ? "bg-muted rounded-br-sm" : "bg-muted/30 rounded-bl-sm"}`}>
                <p className="whitespace-pre-wrap break-words">{item.text || (!item.error && !item.complete ? "正在回复…" : "")}</p>{item.error && <p role="alert" className="mt-2 text-xs text-red-400">{item.error}</p>}
            </div></div>)}<div ref={end} />
        </CreationStream>
    </div>;
}
