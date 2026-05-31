// Web stub — no-op DAOs for browser.
import { Stage } from '../../types';

export async function getAllStages(): Promise<Stage[]> { return []; }
export async function createStage(_stage: Stage): Promise<void> { console.warn('[DAO] createStage unavailable on web'); }
export async function updateStage(_id: string, _updates: Partial<Stage>): Promise<void> { console.warn('[DAO] updateStage unavailable on web'); }
export async function deleteStage(_id: string): Promise<void> { console.warn('[DAO] deleteStage unavailable on web'); }
