/**
 * Local ambient color extraction — zero LLM calls.
 *
 * 1. Emoji → deterministic HSL hue derived from Unicode code point,
 *    with muted saturation/lightness for a soft card background.
 * 2. Image URI → average color via pixel sampling (RN canvas fallback).
 *    Not available on native yet; emoji-based derivation is the primary path.
 */

/**
 * Derive a muted, aesthetically pleasing background color from an emoji string.
 * Uses the Unicode code point as a seed for hue generation.
 * Returns a hex color like "#E8D5D0".
 */
export function deriveColorFromEmoji(emoji: string): string {
  if (!emoji) return '#F7F7F5';

  // Get the primary code point
  const code = emoji.codePointAt(0) || 0;
  // Map to 0-360 hue range
  const hue = code % 360;
  // Fixed muted saturation and lightness for card-friendly tones
  const saturation = 30 + (code % 20); // 30-50%
  const lightness = 85 + (code % 10);  // 85-94%

  return hslToHex(hue, saturation, lightness);
}

/**
 * Derive ambient color from a character's name hash.
 * Used as fallback when no emoji/avatar is available.
 */
export function deriveColorFromName(name: string): string {
  if (!name) return '#F7F7F5';

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }

  const hue = Math.abs(hash) % 360;
  const saturation = 25 + Math.abs(hash % 25); // 25-50%
  const lightness = 84 + Math.abs(hash % 10);  // 84-93%

  return hslToHex(hue, saturation, lightness);
}

/**
 * 6 preset ambient color swatches for manual selection.
 * Chosen for soft, readable backgrounds that work well with dark text.
 */
export const AMBIENT_SWATCHES = [
  '#F5E6E0', // warm rose
  '#E8F0E8', // sage green
  '#E8EDF5', // sky blue
  '#F5F0E0', // warm cream
  '#EDE8F5', // lavender
  '#F5E8ED', // soft pink
] as const;

// --- Internal helpers ---

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };

  return `#${f(0)}${f(8)}${f(4)}`;
}
