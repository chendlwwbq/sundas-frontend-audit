import { create } from 'zustand';
import type { CloudSaveStatus } from '@/lib/cloud-sync-status';

export const useCloudSyncStatus = create<{owner: string;session: number;projects: Record<string,CloudSaveStatus>;status: CloudSaveStatus;error: string}>(() => ({owner:'',session:0,projects:{},status:'reading',error:''}));
