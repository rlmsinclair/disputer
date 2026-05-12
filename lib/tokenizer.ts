import { get_encoding } from "tiktoken";

const enc = get_encoding("cl100k_base");

export function countTokens(text: string): number {
  return enc.encode(text).length;
}
