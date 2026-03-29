import OpenAI from 'openai';

const DIM = 1536;
const BATCH_SIZE = 20;

// DeepSeek-compatible OpenAI client
let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || 'mock-key',
      baseURL: 'https://api.deepseek.com/v1',
    });
  }
  return client;
}

/**
 * LCG pseudo-random number generator seeded by token ID.
 * Produces deterministic, reproducible embeddings for demo mode.
 */
function mockEmbedding(tokenId) {
  let seed = (tokenId * 1664525 + 1013904223) & 0x7fffffff;
  const vec = new Float64Array(DIM);
  let norm = 0;

  for (let i = 0; i < DIM; i++) {
    seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
    const val = (seed / 0x7fffffff) * 2 - 1;
    vec[i] = val;
    norm += val * val;
  }

  norm = Math.sqrt(norm);
  for (let i = 0; i < DIM; i++) {
    vec[i] /= norm;
  }

  return Array.from(vec);
}

/**
 * Get embeddings for an array of tokens.
 * onProgress(completed, total) is called after each batch.
 * Falls back to mock if no API key or FORCE_MOCK=true.
 */
export async function getEmbeddings(tokens, onProgress) {
  const useMock =
    !process.env.DEEPSEEK_API_KEY || process.env.FORCE_MOCK === 'true';

  if (useMock) {
    const embeddings = [];
    for (let i = 0; i < tokens.length; i++) {
      embeddings.push(mockEmbedding(tokens[i].id));
      if ((i + 1) % BATCH_SIZE === 0 || i === tokens.length - 1) {
        onProgress(i + 1, tokens.length);
        // yield to event loop
        await new Promise((r) => setImmediate(r));
      }
    }
    return embeddings;
  }

  // Real DeepSeek API
  const embeddings = [];
  const cl = getClient();

  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    const texts = batch.map((t) => t.text || `<${t.id}>`);

    try {
      const response = await cl.embeddings.create({
        model: 'deepseek-embedding',
        input: texts,
      });

      for (const item of response.data) {
        let vec = item.embedding;
        // Normalize to unit length
        let norm = 0;
        for (const v of vec) norm += v * v;
        norm = Math.sqrt(norm);
        vec = vec.map((v) => v / norm);
        embeddings.push(vec);
      }
    } catch (err) {
      console.warn(`Embedding batch failed, using mock: ${err.message}`);
      for (const t of batch) {
        embeddings.push(mockEmbedding(t.id));
      }
    }

    onProgress(Math.min(i + BATCH_SIZE, tokens.length), tokens.length);
  }

  return embeddings;
}
