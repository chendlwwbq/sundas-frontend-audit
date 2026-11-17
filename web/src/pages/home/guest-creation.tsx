import { ChatComposer } from "@astryxdesign/core/Chat";
import { ImagePlus, Sparkles, Video } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthDialogStore } from "@/stores/use-auth-dialog-store";

import { CreationStream } from "@/components/creation/creation-stream";
import { CreationModeTrack, type CreationModeOption } from "@/components/creation/creation-toolbar";
import { GUEST_DRAFT_KEY } from "@/lib/pending-prompt";

const GUEST_MODES: readonly CreationModeOption[] = [
    { value: "image", label: "图片", icon: ImagePlus },
    { value: "video", label: "视频", icon: Video },
];

export function GuestCreation() {
    const [mode, setMode] = useState<"image" | "video">("image");
    const [prompt, setPrompt] = useState("");
    const navigate = useNavigate();
    const openAuthDialog = useAuthDialogStore((state) => state.open);
    const login = () => {
        try { sessionStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({ mode, prompt })); } catch { /* login remains available if storage is blocked */ }
        openAuthDialog("login", { redirect: "/create", hint: "登录后立即为您继续生成刚才的创作" });
    };
    return <div className="creation-shell guest-creation flex h-full flex-col overflow-hidden bg-background text-foreground">
        <CreationStream composer={<div className="creation-composer mx-auto w-full"><ChatComposer
            value={prompt}
            onChange={setPrompt}
            onSubmit={login}
            elevation="none"
            placeholder="描述你的画面，开始创作…"
            footerActions={<div className="creation-actions flex min-w-0 flex-wrap items-center gap-1">
                <CreationModeTrack value={mode} options={GUEST_MODES} onChange={value => setMode(value as "image" | "video")} />
                <span className="text-xs text-muted-foreground">登录后选择模型与参考素材</span>
            </div>}
            sendButton={<button type="button" className="jm-btn jm-btn-primary h-9" onClick={login}>登录后继续</button>}
        /></div>}>
            <div className="creation-empty-wrap">
                <div className="creation-empty">
                    <span className="creation-empty-icon"><Sparkles /></span>
                    <h2>描述画面，登录后继续创作</h2>
                    <p>作品、素材与积分都归属同一个账号。<br />登录后即可选择模型、上传参考素材并开始生成。</p>
                </div>
            </div>
        </CreationStream>
    </div>;
}
