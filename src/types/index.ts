export interface Character {
  id: string;
  name: string;
  avatar: string; // emoji or uploaded image URI
  coreSetting: string; // personality, catchphrase, goals, etc.
  activityLevel: number;
  ambientColor: string;
}

export interface LoreEntry {
  id: string;
  isGlobal: boolean;
  keywords: string[];
  content: string;
}

export interface World {
  id: string;
  name: string;
  emoji: string;
  lore: string;
  ambientColor: string;
  loreEntries?: LoreEntry[];
}

export interface Stage {
  id: string;
  name: string;
  worldIds: string[];
  characterIds: string[];
  systemPrompt: string | null;
  /** Snapshot of characters at stage creation time. Used as fallback when archive characters are deleted. */
  characterSnapshots: Record<string, { name: string; avatar: string; coreSetting: string; activityLevel: number; ambientColor: string }> | null;
  openingScene?: string;
  characterStatuses?: Record<string, string>;
  stageSummary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  stageId: string;
  senderType: 'character' | 'narrator' | 'user' | 'guest';
  senderName: string;
  senderAvatar: string;
  senderId: string | null;
  content: string;
  branchId: string;
  isSelected: boolean;
  timestamp: number;
}

export type IdentityMode = 'narrator' | 'takeover' | 'guest';

export type RootTabParamList = {
  Archive: undefined;
  Stage: undefined;
  Chronicles: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  CreateCharacter: undefined;
  CreateWorld: undefined;
  CharacterDetail: { characterId: string };
  WorldDetail: { worldId: string };
  StageSetup: { stageId?: string };
  PromptBlueprint: undefined;
};
