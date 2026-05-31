// Web stub — no-op DAOs for browser.
import { ChatMessage } from '../../types';

export async function getMessagesByStage(_stageId: string): Promise<ChatMessage[]> { return []; }
export async function getMessagesByBranch(_branchId: string): Promise<ChatMessage[]> { return []; }
export async function createMessage(_msg: ChatMessage): Promise<void> { console.warn('[DAO] createMessage unavailable on web'); }
export async function deleteAllMessages(_stageId: string): Promise<void> { console.warn('[DAO] deleteAllMessages unavailable on web'); }
export async function deleteMessagesByBranch(_branchId: string): Promise<void> { console.warn('[DAO] deleteMessagesByBranch unavailable on web'); }
