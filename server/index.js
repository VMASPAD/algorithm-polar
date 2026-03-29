import 'dotenv/config';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { tokenize } from './tokenizer.js';
import { getEmbeddings } from './embeddings.js';
import { projectTo3D } from './pca.js';
import { computeSimilarity } from './similarity.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: Date.now() });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/**
 * Send a typed message to a WebSocket client.
 */
function send(ws, type, payload) {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

wss.on('connection', (ws) => {
  console.log('[WS] client connected');
  let aborted = false;

  ws.on('close', () => {
    aborted = true;
    console.log('[WS] client disconnected');
  });

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, 'ERROR', { message: 'Invalid JSON', code: 'PARSE_ERROR' });
      return;
    }

    if (msg.type !== 'TOKENIZE_REQUEST') return;

    const text = (msg.payload?.text || '').trim();
    if (!text) {
      send(ws, 'ERROR', { message: 'Empty text', code: 'EMPTY_INPUT' });
      return;
    }

    aborted = false;

    try {
      // ── Step 1: Tokenize ────────────────────────────────────────────────
      const { tokens, truncated, originalCount } = tokenize(text);
      send(ws, 'TOKENIZE_RESULT', { tokens, truncated, originalCount });

      if (aborted) return;

      // ── Step 2: Embeddings ──────────────────────────────────────────────
      const embeddings = await getEmbeddings(tokens, (completed, total) => {
        if (!aborted) send(ws, 'EMBED_PROGRESS', { completed, total });
      });

      if (aborted) return;
      send(ws, 'EMBED_COMPLETE', { embeddings });

      // ── Step 3: PCA ─────────────────────────────────────────────────────
      const positions = projectTo3D(embeddings);
      send(ws, 'PCA_RESULT', { positions });

      if (aborted) return;

      // ── Step 4: Similarity ──────────────────────────────────────────────
      const { masses, similarityMatrix } = computeSimilarity(embeddings);
      send(ws, 'SIMILARITY_RESULT', { masses, similarityMatrix });
    } catch (err) {
      console.error('[pipeline error]', err);
      send(ws, 'ERROR', {
        message: err.message || 'Pipeline failed',
        code: 'PIPELINE_ERROR',
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[algorithm-polar] server listening on http://localhost:${PORT}`);
});
