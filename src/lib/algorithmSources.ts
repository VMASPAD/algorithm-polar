/** Algorithm source code strings displayed in the Monaco editor. */

export const ALGORITHM_SOURCES: Record<string, { label: string; language: string; code: string }> = {
  pca: {
    label: 'PCA (NIPALS)',
    language: 'javascript',
    code: `/**
 * PCA via NIPALS — extracts 3 principal components
 * without materializing the full D×D covariance matrix.
 *
 * Input:  X — N×D matrix (here D=1536 embedding dimensions)
 * Output: N×3 positions scaled to [-50, 50]^3
 */

function nipalsComponent(X) {
  const N = X.length, D = X[0].length;

  // Initialize score vector t as first column
  let t = new Float64Array(N);
  for (let n = 0; n < N; n++) t[n] = X[n][0];

  let p = new Float64Array(D);
  const MAX_ITER = 500, TOL = 1e-9;

  for (let iter = 0; iter < MAX_ITER; iter++) {
    // p = X^T · t / (t · t)  →  loading vector
    const tDotT = t.reduce((s, v) => s + v * v, 0);
    p.fill(0);
    for (let n = 0; n < N; n++)
      for (let d = 0; d < D; d++)
        p[d] += X[n][d] * t[n];
    for (let d = 0; d < D; d++) p[d] /= tDotT;

    // Normalize p to unit length
    const pNorm = Math.sqrt(p.reduce((s, v) => s + v * v, 0));
    for (let d = 0; d < D; d++) p[d] /= pNorm;

    // t_new = X · p  →  score vector
    const tNew = new Float64Array(N);
    for (let n = 0; n < N; n++)
      for (let d = 0; d < D; d++)
        tNew[n] += X[n][d] * p[d];

    // Check convergence
    const diff = Math.sqrt(tNew.reduce((s, v, i) => s + (v - t[i]) ** 2, 0));
    t = tNew;
    if (diff < TOL) break;
  }

  // Deflate: X = X - t·p^T  (remove this component's variance)
  for (let n = 0; n < N; n++)
    for (let d = 0; d < D; d++)
      X[n][d] -= t[n] * p[d];

  return t; // scores = coordinates on this principal axis
}
`,
  },

  kruskal: {
    label: "Kruskal's MST",
    language: 'javascript',
    code: `/**
 * Kruskal's Minimum Spanning Tree
 * Connects semantically similar tokens as constellation lines.
 *
 * Edge weight = 1 - cosine_similarity
 * Lower weight → more similar → prioritized in the MST
 */

class UnionFind {
  constructor(n) {
    this.parent = new Int32Array(n);
    this.rank = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }

  find(x) {
    if (this.parent[x] !== x)
      this.parent[x] = this.find(this.parent[x]); // path compression
    return this.parent[x];
  }

  union(x, y) {
    const rx = this.find(x), ry = this.find(y);
    if (rx === ry) return false; // cycle → skip
    if (this.rank[rx] < this.rank[ry]) this.parent[rx] = ry;
    else if (this.rank[rx] > this.rank[ry]) this.parent[ry] = rx;
    else { this.parent[ry] = rx; this.rank[rx]++; }
    return true;
  }
}

function kruskal(n, similarityMatrix) {
  const edges = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      edges.push({ from: i, to: j, weight: 1 - similarityMatrix[i*n+j] });

  edges.sort((a, b) => a.weight - b.weight); // ascending

  const uf = new UnionFind(n);
  const mst = [];
  for (const e of edges) {
    if (mst.length === n - 1) break;
    if (uf.union(e.from, e.to)) mst.push(e);
  }
  return mst; // exactly n-1 edges
}
`,
  },

  octree: {
    label: 'Octree',
    language: 'javascript',
    code: `/**
 * Octree — spatial partitioning for O(n log n) force computation.
 *
 * The 3D space is recursively subdivided into 8 octants.
 * Each node stores mass and center-of-mass for Barnes-Hut.
 *
 * TODO: Complete the insert() function below!
 * Without a correct Octree, the simulation runs at O(n²) → low FPS.
 * With it, forces are approximated in O(n log n) → smooth 60 FPS.
 *
 * Node structure:
 *   { cx, cy, cz, halfSize,       // bounding cube
 *     mass, comX, comY, comZ,     // mass aggregate
 *     tokenIndex,                 // >=0 if leaf, -1 if internal
 *     children }                  // array of 8 child nodes
 *
 * Helpers available: makeNode(cx,cy,cz,halfSize), octantOf(node,x,y,z),
 *                    childCenter(node, octantIndex)
 * Test tokens:       tokens = [{position:[x,y,z], mass:m}, ...]
 */

function insert(node, tokens, idx, depth = 0) {
  const t = tokens[idx];
  const [px, py, pz] = t.position;
  const m = t.mass;

  // === YOUR CODE HERE ===
  // 1. Update node center-of-mass (weighted average) and node.mass
  // 2. If this node is empty (mass===0 before update) → make it a leaf
  // 3. If this node is a leaf → subdivide, relocate existing token, insert new
  // 4. If this node is internal → recurse into the correct octant
  // ======================
}
`,
  },

  barnesHut: {
    label: 'Barnes-Hut',
    language: 'javascript',
    code: `/**
 * Barnes-Hut Algorithm — O(n log n) force approximation.
 *
 * Key insight: a cluster of distant bodies can be approximated
 * as a single body at their center of mass.
 *
 * theta = 0.5: if (node_width / distance) < theta, use approximation.
 * Lower theta = more accurate but slower. theta=0 = exact O(n²).
 */

const THETA = 0.5;
const G = 150;      // large because PCA positions are in [-50, 50] world units
const EPSILON = 2.0; // softening — prevents infinite force when tokens overlap

function barnesHutForce(node, token, tokenIdx) {
  if (node.mass === 0) return [0, 0, 0];
  if (node.tokenIndex === tokenIdx) return [0, 0, 0]; // skip self

  const [tx, ty, tz] = token.position;
  const dx = node.comX - tx;
  const dy = node.comY - ty;
  const dz = node.comZ - tz;
  const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
  const s = node.halfSize * 2; // node width

  if (node.tokenIndex >= 0 || s / (d + 1e-10) < THETA) {
    // Far enough away OR leaf node → treat as point mass
    const d2 = d*d + EPSILON*EPSILON;
    const f = G * node.mass / d2;
    return [f*dx/d, f*dy/d, f*dz/d];
  }

  // Too close → recurse into children
  let fx = 0, fy = 0, fz = 0;
  for (const child of node.children) {
    if (!child) continue;
    const [cfx, cfy, cfz] = barnesHutForce(child, token, tokenIdx);
    fx += cfx; fy += cfy; fz += cfz;
  }
  return [fx, fy, fz];
}
`,
  },

  collision: {
    label: 'Collision',
    language: 'javascript',
    code: `/**
 * Elastic Collision Detection & Response
 *
 * Tokens are treated as rigid spheres.
 * When two spheres overlap (d < ra + rb), an impulse is applied
 * to their velocities — conserving momentum and kinetic energy.
 *
 *   impulse J = -(1 + e) · (v_rel · n̂) / (1/ma + 1/mb)
 *
 * where e = restitution coefficient (0=inelastic, 1=elastic),
 *       v_rel = relative velocity, n̂ = collision normal.
 *
 * After the impulse, a positional correction separates the spheres
 * proportionally to their masses.
 */

const RESTITUTION = 0.65;

function resolveCollisions(tokens) {
  const N = tokens.length;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = tokens[i], b = tokens[j];
      const dx = b.position[0] - a.position[0];
      const dy = b.position[1] - a.position[1];
      const dz = b.position[2] - a.position[2];
      const d2 = dx*dx + dy*dy + dz*dz;
      const minDist = a.radius + b.radius;

      if (d2 >= minDist * minDist || d2 < 0.001) continue;

      const d  = Math.sqrt(d2);
      const nx = dx/d, ny = dy/d, nz = dz/d;

      // Relative velocity along collision normal
      const rvn = (b.velocity[0]-a.velocity[0])*nx
                + (b.velocity[1]-a.velocity[1])*ny
                + (b.velocity[2]-a.velocity[2])*nz;

      if (rvn >= 0) continue; // already separating

      const invMa = 1/a.mass, invMb = 1/b.mass;
      const J = -(1 + RESTITUTION) * rvn / (invMa + invMb);

      a.velocity[0] -= J * invMa * nx;
      a.velocity[1] -= J * invMa * ny;
      a.velocity[2] -= J * invMa * nz;
      b.velocity[0] += J * invMb * nx;
      b.velocity[1] += J * invMb * ny;
      b.velocity[2] += J * invMb * nz;

      // Positional correction — push spheres apart
      const overlap = (minDist - d) * 0.5;
      const corrA = overlap * invMa / (invMa + invMb);
      const corrB = overlap * invMb / (invMa + invMb);
      a.position[0] -= corrA * nx; b.position[0] += corrB * nx;
      a.position[1] -= corrA * ny; b.position[1] += corrB * ny;
      a.position[2] -= corrA * nz; b.position[2] += corrB * nz;
    }
  }
}
`,
  },

  springs: {
    label: 'Spring Forces',
    language: 'javascript',
    code: `/**
 * Spring Forces along MST Edges (Hooke's Law)
 *
 * Semantically similar tokens are connected by MST edges.
 * A spring force keeps them at a comfortable rest distance,
 * preventing both collapse and excessive separation.
 *
 *   F = k · (d - L₀) · n̂
 *
 * where k  = spring constant (stiffness),
 *       L₀ = rest length,
 *       d  = current distance between token centers,
 *       n̂  = unit vector from a to b.
 *
 * The force is attractive when d > L₀ (stretched)
 * and repulsive when d < L₀ (compressed).
 */

const SPRING_K    = 0.12;  // stiffness
const SPRING_REST = 16;    // rest length in world units

function applySpringForces(tokens, edges, forces) {
  for (const edge of edges) {
    const a = tokens[edge.from];
    const b = tokens[edge.to];
    const dx = b.position[0] - a.position[0];
    const dy = b.position[1] - a.position[1];
    const dz = b.position[2] - a.position[2];
    const d  = Math.sqrt(dx*dx + dy*dy + dz*dz) + 1e-6;

    const stretch = d - SPRING_REST; // positive = stretched
    const f = SPRING_K * stretch;    // Hooke's law

    const nx = dx/d, ny = dy/d, nz = dz/d;

    // Push a toward b (or away, if compressed)
    forces[edge.from][0] += nx * f;
    forces[edge.from][1] += ny * f;
    forces[edge.from][2] += nz * f;

    // Equal and opposite force on b
    forces[edge.to][0] -= nx * f;
    forces[edge.to][1] -= ny * f;
    forces[edge.to][2] -= nz * f;
  }
}
`,
  },

  repulsion: {
    label: 'Repulsion',
    language: 'javascript',
    code: `/**
 * Short-Range Repulsion Force
 *
 * Prevents token overlap before elastic collision resolves it.
 * Modeled as an inverse-square repulsion active only within a cutoff.
 *
 *   F = K_rep / d²  (only when d < cutoff)
 *
 * Combined with gravity (attraction at long range) and collision
 * (hard contact at very short range), this creates a stable
 * 3-zone interaction:
 *
 *   Zone 1: d > cutoff     → pure Newtonian gravity (attraction)
 *   Zone 2: r < d < cutoff → repulsion overpowers gravity
 *   Zone 3: d < ra + rb    → rigid elastic collision
 *
 * This is analogous to Lennard-Jones potential in molecular dynamics.
 */

const REPULSION_K      = 120;
const REPULSION_CUTOFF = 20; // world units

function applyRepulsion(tokens, forces) {
  const N = tokens.length;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const a = tokens[i], b = tokens[j];
      const dx = b.position[0] - a.position[0];
      const dy = b.position[1] - a.position[1];
      const dz = b.position[2] - a.position[2];
      const d2 = dx*dx + dy*dy + dz*dz;

      if (d2 > REPULSION_CUTOFF * REPULSION_CUTOFF) continue;

      const d  = Math.sqrt(d2) + 0.5; // 0.5 prevents division by zero
      const f  = REPULSION_K / d2;    // inverse square
      const nx = dx/d, ny = dy/d, nz = dz/d;

      // Push apart (opposite signs)
      forces[i][0] -= nx*f; forces[j][0] += nx*f;
      forces[i][1] -= ny*f; forces[j][1] += ny*f;
      forces[i][2] -= nz*f; forces[j][2] += nz*f;
    }
  }
}
`,
  },

  physics: {
    label: 'Physics Sim',
    language: 'javascript',
    code: `/**
 * Newtonian Gravity Simulation
 *
 * Each token has:
 *   - position [x, y, z] — from PCA projection
 *   - mass — proportional to semantic similarity
 *   - velocity [vx, vy, vz] — updated each frame
 *
 * Force law: F = G · m₁ · m₂ / (d² + ε²) · direction
 * ε is a softening factor that prevents singularity when d → 0.
 *
 * Integration: semi-implicit Euler
 *   v += (F/m) · dt
 *   x += v · dt
 *   v *= damping  (0.97 per frame)
 */

function simulationStep(tokens, dt, useBarnesHut) {
  // computeForcesBH  → O(n log n) via octree traversal
  // computeForcesNaive → O(n²) pairwise, used for FPS demo
  const forces = useBarnesHut
    ? computeForcesBH(tokens, buildOctree(tokens))
    : computeForcesNaive(tokens);

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const [fx, fy, fz] = forces[i];
    const inv = 1 / t.mass;

    t.velocity[0] = (t.velocity[0] + fx * inv * dt) * 0.97;
    t.velocity[1] = (t.velocity[1] + fy * inv * dt) * 0.97;
    t.velocity[2] = (t.velocity[2] + fz * inv * dt) * 0.97;

    t.position[0] += t.velocity[0] * dt;
    t.position[1] += t.velocity[1] * dt;
    t.position[2] += t.velocity[2] * dt;
  }
}
`,
  },
};
