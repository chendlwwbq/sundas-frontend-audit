import { Button } from "@astryxdesign/core/Button";
import { App, Dropdown } from "antd";
import { FolderOpen, ImagePlus, Video, MessageSquare, Plus, SlidersHorizontal, BookOpen, Paperclip, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useAuthStore } from "@/stores/use-auth-store";
import { useCreationChat } from "@/pages/chat/chat-store";

export function CreationToolbar({ mode, busy, referencesOpen, onSettings, onUpload, onReferences, onPrompts, onAssets, modelPicker, onChat }: {
    mode: "image" | "video"; busy: boolean; referencesOpen: boolean;
    onSettings: () => void; onUpload: () => void; onReferences: () => void; onPrompts: () => void; onAssets: () => void;
    modelPicker?: ReactNode; onChat?: () => Promise<string | undefined>;
}) {
    return <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="创作工具">
        <CreationModeSwitch mode={mode} busy={busy} onChat={onChat} />
        {modelPicker}
        <Button label="创作设置" size="sm" variant="ghost" icon={<SlidersHorizontal className="size-3.5" />} onClick={onSettings} />
        <Dropdown trigger={["click"]} menu={{ items: [
            { key: "upload", label: "上传参考素材", icon: <Plus className="size-4" />, onClick: onUpload, disabled: busy },
            { key: "assets", label: "从素材库选择", icon: <FolderOpen className="size-4" />, onClick: onAssets, disabled: busy },
            { type: "divider" },
            { key: "prompts", label: "提示词库", icon: <BookOpen className="size-4" />, onClick: onPrompts },
        ] }}><button type="button" className="creation-tool-button" aria-label="添加素材或提示词"><Plus className="size-4" />添加</button></Dropdown>
        <button type="button" className="creation-tool-button" aria-pressed={referencesOpen} onClick={onReferences}><Paperclip className="size-3.5" />参考素材</button>
    </div>;
}

export type CreationModeOption = { value: string; label: string; icon?: LucideIcon };

export const CREATION_MODES: readonly CreationModeOption[] = [
    { value: "image", label: "图片", icon: ImagePlus },
    { value: "video", label: "视频", icon: Video },
    { value: "chat", label: "对话", icon: MessageSquare },
];

type CreationMode = "image" | "video" | "chat";

/**
 * 图片/视频/对话各自是独立页面（/create?mode=…），切换会重新挂载整页。
 * 这里记住上一页的选中项与轨道横坐标，新页面挂载时先画在旧位置再滑到新位置，
 * 视觉上就是一个框里的滑块在移动，而不是整块控件跳一下。
 */
let lastSwitchMemory: { mode: string; left: number } | null = null;

/** 一整条描边轨道，选中项是轨道内的一块滑块；只暴露 value / onChange，交互与图标都在内部。 */
export function CreationModeTrack({ value, options, onChange, disabled = false, busy = false, handoff = false }: {
    value: string; options: readonly CreationModeOption[]; onChange: (value: string) => void;
    disabled?: boolean; busy?: boolean; handoff?: boolean;
}) {
    const trackRef = useRef<HTMLDivElement | null>(null);
    const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
    // 跨页面接力动画还在等第一帧时，不要被 ResizeObserver 直接拉到终点
    const handoffPendingRef = useRef(false);

    useLayoutEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        const current = track.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]');
        if (!current) return;
        const trackRect = track.getBoundingClientRect();
        const rect = current.getBoundingClientRect();
        const target = { left: rect.left - trackRect.left - track.clientLeft, width: rect.width };
        const previous = lastSwitchMemory;
        lastSwitchMemory = { mode: value, left: trackRect.left };
        const previousButton = handoff && previous && previous.mode !== value
            ? track.querySelector<HTMLButtonElement>(`[role="radio"][data-mode-value="${previous.mode}"]`)
            : null;
        // 只有轨道位置基本一致时才做跨页面接力，否则（例如对话页输入框更窄）直接从目标位置开始。
        if (previousButton && Math.abs(previous!.left - trackRect.left) < 24) {
            const from = previousButton.getBoundingClientRect();
            setBar({ left: from.left - trackRect.left - track.clientLeft, width: from.width });
            handoffPendingRef.current = true;
            const timer = window.setTimeout(() => {
                handoffPendingRef.current = false;
                setBar(target);
            }, 30);
            return () => {
                window.clearTimeout(timer);
                handoffPendingRef.current = false;
            };
        }
        setBar(target);
    }, [handoff, value]);

    // 容器尺寸变化时重新量一次，避免滑块和文字错位
    useEffect(() => {
        const track = trackRef.current;
        if (!track) return;
        const observer = new ResizeObserver(() => {
            if (handoffPendingRef.current) return;
            const current = track.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]');
            if (!current) return;
            const trackRect = track.getBoundingClientRect();
            const rect = current.getBoundingClientRect();
            setBar({ left: rect.left - trackRect.left - track.clientLeft, width: rect.width });
        });
        observer.observe(track);
        return () => observer.disconnect();
    }, []);

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const index = options.findIndex(item => item.value === value);
        if (index < 0) return;
        let next = index;
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
        else if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % options.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = options.length - 1;
        else return;
        event.preventDefault();
        if (next === index) return;
        trackRef.current?.querySelector<HTMLButtonElement>(`[data-mode-value="${options[next].value}"]`)?.focus();
        onChange(options[next].value);
    }

    return (
        <div
            ref={trackRef}
            className="creation-mode-switch"
            role="radiogroup"
            aria-label="生成类型"
            aria-busy={busy || disabled || undefined}
            data-busy={busy || undefined}
            data-count={options.length}
            onKeyDown={handleKeyDown}
        >
            <span className="creation-mode-switch-bar" aria-hidden="true" style={bar ? { left: bar.left, width: bar.width } : { opacity: 0 }} />
            {options.map(item => {
                const active = item.value === value;
                const Icon = item.icon;
                return (
                    <button
                        key={item.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        data-mode-value={item.value}
                        tabIndex={active ? 0 : -1}
                        disabled={disabled}
                        title={disabled && !busy ? "处理中，请稍候" : undefined}
                        className="creation-mode-switch-item"
                        onClick={() => { if (!active) onChange(item.value); }}
                    >
                        {Icon ? <Icon className="size-3.5" aria-hidden="true" /> : null}
                        <span>{item.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

export function CreationModeSwitch({ mode, busy = false, onChat }: { mode: CreationMode; busy?: boolean; onChat?: () => Promise<string | undefined> }) {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const [switching, setSwitching] = useState(false);

    const switchMode = useCallback(async (value: string) => {
        if (value === mode || switching) return;
        setSwitching(true);
        try {
            const id = value === "chat" ? await onChat?.() : undefined;
            const store = useCreationChat.getState();
            const threadId = id || (store.owner === useAuthStore.getState().user?.id ? store.activeId : "");
            navigate(`/create?mode=${value}${threadId ? `&thread=${encodeURIComponent(threadId)}` : ""}`);
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setSwitching(false); }
    }, [message, mode, navigate, onChat, switching]);

    return <CreationModeTrack value={mode} options={CREATION_MODES} onChange={value => void switchMode(value)} disabled={busy || switching} busy={busy} handoff />;
}
