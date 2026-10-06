/**
 * Axiom deep-link construction, isolated here so it's a one-line change if Axiom changes
 * its URLs.
 *
 * ⚠️ UNVERIFIED: Axiom doesn't publish a URL spec. What IS known is that Axiom identifies a
 * token by its *pair address* (its own API is `tokenInfo(pairAddress)`), not by the mint,
 * and its token pages are commonly shared as https://axiom.trade/meme/<pairAddress>.
 * That's the format used below. If the link ever lands on a 404, change AXIOM_TOKEN_PATH
 * or the body of axiomTokenUrl() — nothing else depends on it.
 *
 * Only Solana is linked deep. For other chains the exact Axiom path isn't known, so this
 * returns null and the UI hides the button rather than guessing a wrong URL.
 */
export const AXIOM_ORIGIN = "https://axiom.trade";
export const AXIOM_TOKEN_PATH = "/meme/";

export function axiomTokenUrl(token: { chainId: string; pairAddress?: string }): string | null {
  if (token.chainId !== "solana") return null;
  if (!token.pairAddress) return null;
  return `${AXIOM_ORIGIN}${AXIOM_TOKEN_PATH}${encodeURIComponent(token.pairAddress)}`;
}
