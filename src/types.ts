export interface RawToken {
  id: number;
  text: string;
}

export interface Token {
  id: number;
  text: string;
  position: [number, number, number];
  velocity: [number, number, number];
  mass: number;
  radius: number; // collision radius (proportional to mass)
  color: string;
}

export interface MSTEdge {
  from: number;
  to: number;
  weight: number; // 1 - cosine_similarity
}

export type WSMessageType =
  | 'TOKENIZE_REQUEST'
  | 'TOKENIZE_RESULT'
  | 'EMBED_PROGRESS'
  | 'EMBED_COMPLETE'
  | 'PCA_RESULT'
  | 'SIMILARITY_RESULT'
  | 'ERROR';

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
}

export interface PipelineProgress {
  stage: 'idle' | 'tokenizing' | 'embedding' | 'pca' | 'similarity' | 'done' | 'error';
  embeddingProgress?: { completed: number; total: number };
  error?: string;
}

export function tokenColor(id: number): string {
  const hue = (id * 137.508) % 360;
  return `hsl(${hue.toFixed(1)}, 80%, 65%)`;
}

export function hslToHex(hsl: string): number {
  const m = hsl.match(/hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)/);
  if (!m) return 0xffffff;
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const r = Math.round(hue2rgb(h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(h) * 255);
  const b = Math.round(hue2rgb(h - 1 / 3) * 255);
  return (r << 16) | (g << 8) | b;
}

/** Collision radius from semantic mass: heavier tokens are larger planets */
export function massToRadius(mass: number): number {
  return 2.5 + mass * 0.7;
}
