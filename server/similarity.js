/**
 * Cosine similarity and semantic mass computation.
 *
 * Assumes embeddings are already unit-normalized (done in embeddings.js).
 * For unit vectors: cosine_similarity(a, b) = dot(a, b)
 */

const MIN_MASS = 0.5;
const MAX_MASS = 10.0;

/**
 * Dot product of two arrays.
 */
function dot(a, b) {
  let s = 0;
  const len = a.length;
  for (let i = 0; i < len; i++) s += a[i] * b[i];
  return s;
}

/**
 * Compute full similarity matrix and semantic mass for each token.
 *
 * @param {number[][]} embeddings - Array of unit-normalized embedding vectors
 * @returns {{ masses: number[], similarityMatrix: number[] }}
 *   - masses: semantic mass per token (float, clamped to [MIN_MASS, MAX_MASS])
 *   - similarityMatrix: upper-triangle flat array (index = i*(i-1)/2 + j for i>j)
 */
export function computeSimilarity(embeddings) {
  const N = embeddings.length;

  if (N === 0) return { masses: [], similarityMatrix: [] };
  if (N === 1) return { masses: [1.0], similarityMatrix: [] };

  // Upper triangle similarity: index(i,j) where i < j => i*N + j (full NxN flat)
  // We store full N*N for easy access from client
  const simFlat = new Float32Array(N * N);
  const masses = new Float64Array(N);

  for (let i = 0; i < N; i++) {
    simFlat[i * N + i] = 1.0;
    for (let j = i + 1; j < N; j++) {
      const sim = dot(embeddings[i], embeddings[j]);
      simFlat[i * N + j] = sim;
      simFlat[j * N + i] = sim;

      if (sim > 0) {
        masses[i] += sim;
        masses[j] += sim;
      }
    }
  }

  // Normalize and clamp masses
  let maxMass = 0;
  for (let i = 0; i < N; i++) if (masses[i] > maxMass) maxMass = masses[i];

  const normalizedMasses = Array.from({ length: N }, (_, i) => {
    if (maxMass < 1e-9) return MIN_MASS;
    const scaled = (masses[i] / maxMass) * MAX_MASS;
    return Math.max(MIN_MASS, Math.min(MAX_MASS, scaled));
  });

  return {
    masses: normalizedMasses,
    // Convert to regular array for JSON serialization
    similarityMatrix: Array.from(simFlat),
  };
}
