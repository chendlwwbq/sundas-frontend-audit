import { create } from "zustand";

type PromoContactState = {
    open: boolean;
    openDialog: () => void;
    closeDialog: () => void;
};

export const usePromoContactStore = create<PromoContactState>((set) => ({
    open: false,
    openDialog: () => set({ open: true }),
    closeDialog: () => set({ open: false }),
}));
