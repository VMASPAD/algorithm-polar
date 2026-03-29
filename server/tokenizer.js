import { get_encoding } from 'tiktoken';

let enc = null;

function getEncoder() {
  if (!enc) {
    enc = get_encoding('gpt2');
  }
  return enc;
}

const MAX_TOKENS = 200;

/**
 * Tokenize text using GPT-2 BPE tokenizer.
 * Returns array of { id: number, text: string }
 */
export function tokenize(text) {
  const encoder = getEncoder();
  const ids = encoder.encode(text);

  const sliced = ids.length > MAX_TOKENS ? ids.slice(0, MAX_TOKENS) : ids;

  const tokens = Array.from(sliced).map((id) => {
    const bytes = encoder.decode(new Uint32Array([id]));
    let text = '';
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      text = `[${id}]`;
    }
    return { id, text };
  });

  return {
    tokens,
    truncated: ids.length > MAX_TOKENS,
    originalCount: ids.length,
  };
}
