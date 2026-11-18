import type { AiTextMessage } from "@/services/api/image";
import type { CreationThread } from "./chat-store";
import type { CreationContextRecord } from "@/components/creation/creation-context";
type ContextImage = NonNullable<CreationContextRecord["images"]>[number];
export function latestThreadImage(thread?: CreationThread) {
    const record = [...(thread?.records ?? [])].reverse().find(item => item.images?.length || item.references?.length);
    return { record, image: record?.images?.at(-1) ?? record?.references?.at(-1) };
}
export async function buildCreationChatInput(thread: CreationThread, readImage: (image: ContextImage) => Promise<string>): Promise<AiTextMessage[]> {
    const input: AiTextMessage[] = [{ role: "system", content: "你是创作顾问。用中文与用户交流。只根据本次对话的内容回答。收到的图片是本次会话最近一张图片，可分析构图、光线、角色和细节并提出具体建议。历史文字描述不代表你看到了历史图片。你只提供建议，不执行生成。" }];
    for (const record of thread.records) input.push({ role: "user", content: `本次创作：${record.prompt}\n模型：${record.model}；状态：${record.status}\n生成参数：${JSON.stringify(record.config ?? {})}${record.video ? `\n视频链接：${record.video.url}（未读取视频画面）` : ""}` });
    const { record, image } = latestThreadImage(thread);
    if (image) input.push({ role: "user", content: [{ type: "text", text: `本次会话最近一张图片，对应描述：${record?.prompt ?? ""}` }, { type: "image_url", image_url: { url: await readImage(image) } }] });
    for (const item of thread.messages) if (item.text) input.push({ role: item.role, content: item.text });
    return input;
}
