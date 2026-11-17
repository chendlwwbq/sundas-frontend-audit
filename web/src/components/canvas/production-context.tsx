import { createContext, useContext } from 'react';
import type { ProductionDocument, ProductionMedia, ProductionOperation } from '../../../../shared/production';
import type { CanvasNodeData } from '@/types/canvas';
import type { ProductionRequest } from '@/services/api/canvas-production';
import { useProductionStore } from '@/stores/canvas/use-production-store';

export type ProductionPanelContext = {
    projectId: string; production: ProductionDocument; nodes: CanvasNodeData[]; busy: boolean;
    edit: (operation: ProductionOperation) => void;
    request: (input: Omit<ProductionRequest, 'expectedVersion'>) => Promise<void>;
    locate: (nodeId: string) => void;
    error: (message: string) => void;
};
export const ProductionContext = createContext<ProductionPanelContext | null>(null);
export function useProduction() { const value = useContext(ProductionContext); if (!value) throw new Error('制作面板未初始化'); return value; }
export function useProductionModels(kind: 'text' | 'image' | 'audio') { return useProductionStore(state => state.models).filter(model => model.capability === kind); }
export function nodeProductionMedia(node?: CanvasNodeData): ProductionMedia | undefined {
    if (!node || !['image', 'video', 'audio'].includes(node.type)) return undefined;
    const primary = node.metadata?.images?.find(item => item.id === node.metadata?.primaryImageId) || node.metadata?.images?.[0];
    const source = primary?.content || node.metadata?.content;
    const storageKey = primary?.storageKey || node.metadata?.storageKey;
    let url: string | undefined;
    if (source?.startsWith('/media/')) url = source;
    else if (source && typeof window !== 'undefined') { try { const parsed = new URL(source, window.location.origin); if (parsed.origin === window.location.origin && parsed.pathname.startsWith('/media/')) url = parsed.pathname; } catch { /* No stable remote identity. */ } }
    if (!url && !storageKey) return undefined;
    return { kind: node.type as ProductionMedia['kind'], ...(url ? { url } : {}), ...(storageKey ? { storageKey } : {}), ...(node.metadata?.durationMs ? { durationMs: node.metadata.durationMs } : {}) };
}
