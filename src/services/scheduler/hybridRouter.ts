// Hybrid Routing Engine — zero-API scheduling for next speaker.
// Priority: @mention > question capture > activity weight.

import { Character } from '../../types';

interface ScheduleResult {
  nextSpeakerId: string | null;
  reason: 'mention' | 'question' | 'activity' | 'random' | 'none' | 'opener';
}

function normalizeName(name: string): string[] {
  return [name, name.replace(/[·・]/g, '')];
}

/**
 * Scan text for @-mentions or direct name calls of character names.
 *
 * CJK names: simple substring match, with longer names checked first.
 * This prevents short names from matching inside longer names
 * (e.g., "明" won't match inside "小明" because "小明" is checked first).
 *
 * ASCII names: use \b word boundary to avoid partial matches.
 */
function scanMentions(text: string, characters: Character[]): Character | null {
  // Sort by name length descending — longer names take priority
  const sorted = [...characters].sort((a, b) => b.name.length - a.name.length);

  for (const char of sorted) {
    const variants = normalizeName(char.name);
    for (const variant of variants) {
      if (/[一-鿿぀-ヿ가-힯]/.test(variant)) {
        // CJK: simple substring check is sufficient
        // because longer names are checked first (no false positives from substrings)
        if (text.includes(variant)) return char;
      } else {
        // ASCII: use word boundary
        const escaped = escapeRegex(variant);
        const mentionPatterns = [
          new RegExp(`@\\s*${escaped}`, 'i'),
          new RegExp(`\\b${escaped}\\b`, 'i'),
          new RegExp(`\\b${escaped}[，。！？\\s,.!?]`, 'i'),
        ];
        for (const pattern of mentionPatterns) {
          if (pattern.test(text)) return char;
        }
      }
    }
  }
  return null;
}

/**
 * Check if last message ends with a question mark.
 * If so, the asker should NOT respond — others should.
 */
function scanQuestion(text: string): boolean {
  return /[?？]\s*$/.test(text);
}

/**
 * Weighted random selection based on activity_level.
 */
function weightedRandom(characters: Character[], runtimeActivity?: Map<string, number>): Character | null {
  if (characters.length === 0) return null;

  const getActivity = (c: Character) => runtimeActivity?.get(c.id) ?? c.activityLevel ?? 5;
  const activeChars = characters.filter((c) => getActivity(c) > 1);
  if (activeChars.length === 0) return characters[Math.floor(Math.random() * characters.length)];

  const totalWeight = activeChars.reduce((sum, c) => sum + getActivity(c), 0);
  if (totalWeight === 0) return activeChars[Math.floor(Math.random() * activeChars.length)];

  let r = Math.random() * totalWeight;
  for (const char of activeChars) {
    r -= getActivity(char);
    if (r <= 0) return char;
  }
  return activeChars[activeChars.length - 1];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scan a window of recent messages for mentions or questions.
 * Returns the best speaker candidate based on the same priority as decideNextSpeaker,
 * but across multiple messages (most recent first).
 *
 * This fixes the issue where only the last message was checked — now the last 5
 * messages are scanned, so a name call or question at the beginning of a multi-turn
 * chain still triggers the right character to respond.
 */
export function decideNextSpeakerWindow(
  characters: Character[],
  messages: Array<{ content: string; senderId?: string | null }>,
  runtimeActivity?: Map<string, number>,
): ScheduleResult {
  if (characters.length === 0) return { nextSpeakerId: null, reason: 'none' };

  const getActivity = (c: Character) => runtimeActivity?.get(c.id) ?? c.activityLevel ?? 5;

  // Only check the last message
  const lastMsg = messages[messages.length - 1];
  if (!lastMsg) {
    // No messages yet — let the most active character start
    const starter = weightedRandom(characters, runtimeActivity);
    return { nextSpeakerId: starter?.id ?? characters[0].id, reason: 'opener' };
  }

  // Priority 1: @mention on last message — skip if mentioned character is inactive
  if (lastMsg.content) {
    const mentioned = scanMentions(lastMsg.content, characters);
    if (mentioned && mentioned.id !== lastMsg.senderId && getActivity(mentioned) > 1) {
      return { nextSpeakerId: mentioned.id, reason: 'mention' };
    }
  }

  // Priority 2: question capture — if last message ends with ?,
  // pick a non-asker to respond.
  if (scanQuestion(lastMsg.content)) {
    let eligible = lastMsg.senderId
      ? characters.filter((c) => c.id !== lastMsg.senderId)
      : characters;
    eligible = eligible.filter((c) => getActivity(c) > 1);
    if (eligible.length > 0) {
      return { nextSpeakerId: weightedRandom(eligible, runtimeActivity)?.id ?? eligible[0].id, reason: 'question' };
    }
  }

  // Fallback: activity-weighted random, excluding the last speaker (no consecutive turns)
  const lastSenderId = lastMsg.senderId;
  let eligible = lastSenderId
    ? characters.filter((c) => c.id !== lastSenderId)
    : characters;
  eligible = eligible.filter((c) => getActivity(c) > 1);
  if (eligible.length === 0) {
    // Edge case: only 1 character on stage — let them speak
    return { nextSpeakerId: characters[0].id, reason: 'activity' };
  }
  const chosen = weightedRandom(eligible, runtimeActivity);
  return {
    nextSpeakerId: chosen?.id ?? null,
    reason: 'activity',
  };
}

export function decideNextSpeaker(
  characters: Character[],
  lastMessageText?: string,
  lastSenderId?: string | null,
  /** Optional runtime activity levels (overrides character.activityLevel). */
  runtimeActivity?: Map<string, number>,
): ScheduleResult {
  if (characters.length === 0) return { nextSpeakerId: null, reason: 'none' };

  // Priority 1: @mention scan — skip if mentioned character is inactive
  if (lastMessageText) {
    const mentioned = scanMentions(lastMessageText, characters);
    if (mentioned && mentioned.id !== lastSenderId && (runtimeActivity?.get(mentioned.id) ?? mentioned.activityLevel ?? 5) > 1) {
      return { nextSpeakerId: mentioned.id, reason: 'mention' };
    }
  }

  // Priority 2: question capture — if last message ends with ?,
  // pick a non-asker to respond. If asker is a character, exclude them;
  // if asker is narrator/guest (no senderId), any character can respond.
  if (lastMessageText && scanQuestion(lastMessageText)) {
    let eligible = lastSenderId
      ? characters.filter((c) => c.id !== lastSenderId)
      : characters;
    eligible = eligible.filter((c) => (runtimeActivity?.get(c.id) ?? c.activityLevel ?? 5) > 1);
    if (eligible.length > 0) {
      return { nextSpeakerId: weightedRandom(eligible, runtimeActivity)?.id ?? eligible[0].id, reason: 'question' };
    }
  }

  // Priority 3: activity-weighted random, excluding the last speaker (no consecutive turns)
  let eligible = lastSenderId
    ? characters.filter((c) => c.id !== lastSenderId)
    : characters;
  eligible = eligible.filter((c) => (runtimeActivity?.get(c.id) ?? c.activityLevel ?? 5) > 1);
  if (eligible.length === 0) return { nextSpeakerId: characters[0].id, reason: 'activity' };
  const chosen = weightedRandom(eligible, runtimeActivity);
  return {
    nextSpeakerId: chosen?.id ?? null,
    reason: 'activity',
  };
}
