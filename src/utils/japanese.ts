/**
 * ひらがな → カタカナ変換 (U+3041–U+3096 → U+30A1–U+30F6)
 * 例: "がぶりあす" → "ガブリアス"
 */
export function toKatakana(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, c =>
    String.fromCharCode(c.charCodeAt(0) + 0x60))
}

/**
 * カタカナ → ひらがな変換 (U+30A1–U+30F6 → U+3041–U+3096)
 * 例: "ガブリアス" → "がぶりあす"
 */
export function toHiragana(s: string): string {
  return s.replace(/[\u30A1-\u30F6]/g, c =>
    String.fromCharCode(c.charCodeAt(0) - 0x60))
}
