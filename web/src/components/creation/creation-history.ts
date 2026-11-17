import { create } from "zustand";

export type RecentCreation = { id: string; title: string; createdAt: number; mode: "image" | "video" };
type State = {
    session: string;
    image: RecentCreation[];
    video: RecentCreation[];
    update: (session: string, mode: "image" | "video", items: RecentCreation[]) => void;
};

export const useCreationHistory = create<State>((set) => ({
    session: "", image: [], video: [],
    update: (session, mode, items) => set((state) => ({
        ...(state.session === session ? {} : { image: [], video: [] }),
        session,
        [mode]: items,
    })),
}));
