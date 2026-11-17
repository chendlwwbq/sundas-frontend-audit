import { useState } from "react";
import type { Continuation } from "./creation-drafts";

const separator = "\n\n本次修改要求：\n";
export function continuationPrompt(prompt: string, continuation?: Continuation) {
    const instruction = prompt.trim();
    return instruction && continuation ? `原创作描述：\n${continuation.prompt}${separator}${instruction}\n请根据以上修改要求生成新版本，保留未要求改变的内容。` : instruction;
}

export function CreationRequest({ prompt }: { prompt: string }) {
    const [expanded, setExpanded] = useState(false);
    const instruction = prompt.includes(separator) ? prompt.slice(prompt.lastIndexOf(separator) + separator.length).replace(/\n请根据以上修改要求生成新版本，保留未要求改变的内容。$/, "") : prompt;
    const expandable = instruction.length > 240 || instruction.split("\n").length > 6;
    return <div className="mb-5 flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-muted px-4 py-3 text-sm leading-6" aria-label="你的创作要求"><p className={expandable && !expanded ? "line-clamp-6" : ""}>{instruction}</p>{expandable && <button type="button" className="mt-2 text-xs text-muted-foreground hover:text-foreground" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "收起描述" : "展开完整描述"}</button>}</div></div>;
}

export function ContinuationNotice({ value, mode, onCancel }: { value?: Continuation; mode: "image" | "video"; onCancel: () => void }) {
    if (!value) return null;
    return <div className="mb-2 flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-xs"><div className="min-w-0 flex-1"><p className="truncate font-medium">{mode === "image" ? "继续改图" : "调整后重新生成"} · {value.title}</p><p className="mt-1 text-muted-foreground">{mode === "image" ? "已引用选中图片，请输入修改要求" : "沿用原描述与参数，输入修改要求后生成新视频"}</p></div><button type="button" onClick={onCancel} className="shrink-0 text-muted-foreground hover:text-foreground">结束修改</button></div>;
}
