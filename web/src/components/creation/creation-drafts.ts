import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

export type Continuation = { title: string; prompt: string };

type Draft = { continuation?: Continuation; prompt: string; references: ReferenceImage[]; videos: ReferenceVideo[]; audios: ReferenceAudio[] };
let session = "";
const drafts: Partial<Record<"image" | "video", Draft>> = {};

function forSession(owner: string, epoch: number) {
    const current = `${owner}:${epoch}`;
    if (session !== current) {
        session = current;
        delete drafts.image;
        delete drafts.video;
    }
}

export function readCreationDraft(mode: "image" | "video", owner: string, epoch: number) {
    forSession(owner, epoch);
    return drafts[mode];
}

export function saveCreationDraft(mode: "image" | "video", owner: string, epoch: number, draft: Draft) {
    forSession(owner, epoch);
    drafts[mode] = draft;
}

export function clearCreationDrafts() { delete drafts.image; delete drafts.video; }
