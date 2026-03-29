/**
 * PCA via NIPALS (Nonlinear Iterative Partial Least Squares).
 *
 * This is implemented from scratch without any linear algebra library.
 * NIPALS extracts one principal component at a time using power iteration,
 * which avoids materializing the full D×D covariance matrix.
 *
 * Input:  X  — N×D matrix (array of N arrays, each of length D)
 * Output: N×3 matrix (array of N [x,y,z] triples)
 */

const MAX_ITER = 500;
const TOL = 1e-9;
const OUTPUT_DIM = 3;
const SCALE = 50; // world units: output fits in [-SCALE, SCALE]^3

/**
 * Mean-center each column of X in-place.
 */
function meanCenter(X) {
  const N = X.length;
  const D = X[0].length;
  const means = new Float64Array(D);

  for (let n = 0; n < N; n++) {
    for (let d = 0; d < D; d++) {
      means[d] += X[n][d];
    }
  }
  for (let d = 0; d < D; d++) means[d] /= N;

  for (let n = 0; n < N; n++) {
    for (let d = 0; d < D; d++) {
      X[n][d] -= means[d];
    }
  }

  return means;
}

/**
 * Compute the L2 norm of a vector.
 */
function norm(v) {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

/**
 * Extract one principal component from X using NIPALS.
 * Returns { scores: Float64Array(N), loadings: Float64Array(D) }
 * and deflates X in-place.
 */
function nipalsComponent(X) {
  const N = X.length;
  const D = X[0].length;

  // Initialize t as the column with greatest variance
  let t = new Float64Array(N);
  for (let n = 0; n < N; n++) t[n] = X[n][0];

  let p = new Float64Array(D);

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // p = X^T t / (t^T t)
    const tDotT = t.reduce((s, v) => s + v * v, 0);
    if (tDotT < 1e-30) break;

    p.fill(0);
    for (let n = 0; n < N; n++) {
      const tn = t[n];
      if (Math.abs(tn) < 1e-15) continue;
      for (let d = 0; d < D; d++) {
        p[d] += X[n][d] * tn;
      }
    }
    for (let d = 0; d < D; d++) p[d] /= tDotT;

    // Normalize p
    const pNorm = norm(p);
    if (pNorm < 1e-15) break;
    for (let d = 0; d < D; d++) p[d] /= pNorm;

    // t_new = X p
    const tNew = new Float64Array(N);
    for (let n = 0; n < N; n++) {
      let dot = 0;
      for (let d = 0; d < D; d++) dot += X[n][d] * p[d];
      tNew[n] = dot;
    }

    // Check convergence
    let diff = 0;
    for (let n = 0; n < N; n++) {
      const d = tNew[n] - t[n];
      diff += d * d;
    }
    t = tNew;
    if (Math.sqrt(diff) < TOL) break;
  }

  // Deflate: X = X - t * p^T
  for (let n = 0; n < N; n++) {
    const tn = t[n];
    for (let d = 0; d < D; d++) {
      X[n][d] -= tn * p[d];
    }
  }

  return { scores: t, loadings: p };
}

/**
 * Project N×D embeddings to N×3 using NIPALS PCA.
 * Returns array of [x, y, z] triples scaled to [-SCALE, SCALE].
 */
export function projectTo3D(embeddings) {
  if (!embeddings || embeddings.length === 0) return [];

  const N = embeddings.length;

  // Edge case: single token
  if (N === 1) return [[0, 0, 0]];

  // Copy to mutable Float64 matrix
  const D = embeddings[0].length;
  const X = Array.from({ length: N }, (_, n) => {
    const row = new Float64Array(D);
    for (let d = 0; d < D; d++) row[d] = embeddings[n][d];
    return row;
  });

  meanCenter(X);

  const components = Math.min(OUTPUT_DIM, N - 1);
  const scoreMatrix = [];

  for (let k = 0; k < components; k++) {
    const { scores } = nipalsComponent(X);
    scoreMatrix.push(scores);
  }

  // Pad missing components with zeros if N < 3
  while (scoreMatrix.length < OUTPUT_DIM) {
    scoreMatrix.push(new Float64Array(N));
  }

  // Find max absolute value for scaling
  let maxAbs = 0;
  for (let k = 0; k < OUTPUT_DIM; k++) {
    for (let n = 0; n < N; n++) {
      const abs = Math.abs(scoreMatrix[k][n]);
      if (abs > maxAbs) maxAbs = abs;
    }
  }
  if (maxAbs < 1e-15) maxAbs = 1;

  // Build output
  return Array.from({ length: N }, (_, n) => [
    (scoreMatrix[0][n] / maxAbs) * SCALE,
    (scoreMatrix[1][n] / maxAbs) * SCALE,
    (scoreMatrix[2][n] / maxAbs) * SCALE,
  ]);
}
