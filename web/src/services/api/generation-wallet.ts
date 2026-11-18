import { useAuthStore } from "@/stores/use-auth-store";

export function refreshGenerationWallet(owner?: string) {
    const auth = useAuthStore.getState();
    if (owner && auth.ready && auth.user?.id === owner) {
        void auth.refreshWallet().catch(() => undefined);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sundas:generation-updated', { detail: { owner } }));
    }
}
