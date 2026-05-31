import { deriveColorFromEmoji, deriveColorFromName, AMBIENT_SWATCHES } from '../utils/ambientColor';

describe('deriveColorFromEmoji', () => {
  it('returns a hex color string', () => {
    const result = deriveColorFromEmoji('🦊');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns default for empty string', () => {
    expect(deriveColorFromEmoji('')).toBe('#F7F7F5');
  });

  it('returns deterministic output for same emoji', () => {
    const a = deriveColorFromEmoji('🔥');
    const b = deriveColorFromEmoji('🔥');
    expect(a).toBe(b);
  });

  it('returns different colors for different emojis', () => {
    const a = deriveColorFromEmoji('🦊');
    const b = deriveColorFromEmoji('🌙');
    expect(a).not.toBe(b);
  });

  it('produces muted colors (lightness 85-94%)', () => {
    const emojis = ['🦊', '🔥', '🌙', '🌍', '⭐', '🌸'];
    for (const emoji of emojis) {
      const hex = deriveColorFromEmoji(emoji);
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      // Lightness check: all channels should be relatively high (pastel)
      expect(Math.min(r, g, b)).toBeGreaterThan(180);
    }
  });
});

describe('deriveColorFromName', () => {
  it('returns a hex color string', () => {
    const result = deriveColorFromName('西尔维娅');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('returns default for empty string', () => {
    expect(deriveColorFromName('')).toBe('#F7F7F5');
  });

  it('returns deterministic output for same name', () => {
    const a = deriveColorFromName('迦尔纳');
    const b = deriveColorFromName('迦尔纳');
    expect(a).toBe(b);
  });

  it('returns different colors for different names', () => {
    const a = deriveColorFromName('西尔维娅');
    const b = deriveColorFromName('露娜');
    expect(a).not.toBe(b);
  });

  it('works with ASCII names', () => {
    const result = deriveColorFromName('Alice');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('produces muted pastel colors', () => {
    const names = ['西尔维娅', '迦尔纳', '露娜', 'Alice', 'Bob'];
    for (const name of names) {
      const hex = deriveColorFromName(name);
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      expect(Math.min(r, g, b)).toBeGreaterThan(170);
    }
  });
});

describe('AMBIENT_SWATCHES', () => {
  it('has 6 swatches', () => {
    expect(AMBIENT_SWATCHES).toHaveLength(6);
  });

  it('all swatches are valid hex colors', () => {
    for (const swatch of AMBIENT_SWATCHES) {
      expect(swatch).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('all swatches are unique', () => {
    const unique = new Set(AMBIENT_SWATCHES);
    expect(unique.size).toBe(AMBIENT_SWATCHES.length);
  });
});
