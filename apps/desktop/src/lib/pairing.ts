// Pairing-code alphabet — must stay in sync with crates/network/src/pairing.rs
// Omits O, 0, I, 1, L to avoid visual ambiguity.
export const VALID_PAIRING_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function sanitizePairingCode(input: string, length: number = 4): string {
  return input
    .toUpperCase()
    .split("")
    .filter((c) => VALID_PAIRING_CHARS.includes(c))
    .join("")
    .slice(0, length);
}
