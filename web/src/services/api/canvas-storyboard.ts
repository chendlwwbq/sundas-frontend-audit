import { apiRequest } from "./client";

export type StoryboardShot = {
    index: number;
    duration: number;
    shotSize: string;
    cameraMove: string;
    subject: string;
    action: string;
    lighting: string;
    prompt: string;
    videoPrompt: string;
    dialogue: string;
};

export type StoryboardResult = {
    title: string;
    style: string;
    logline: string;
    durationSeconds: number;
    shots: StoryboardShot[];
    scriptText: string;
    model: string;
    creditsCharged: number;
};

export type StoryboardRequest = {
    brief: string;
    duration: number;
    shotCount: number;
    style?: string;
    aspectRatio?: string;
    model: string;
};

export function generateStoryboard(input: StoryboardRequest) {
    return apiRequest<StoryboardResult>("/api/canvas/storyboard", {
        method: "POST",
        json: input,
    });
}
