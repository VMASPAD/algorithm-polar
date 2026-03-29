import type { Token } from '../types';
import type { OctreeNode } from './octree';

const G = 150; // Gravitational constant — PCA coords are in [-50,50], needs large G
const EPSILON = 2.0; // Softening factor — prevents singularity at close range
const THETA = 0.5; // Barnes-Hut accuracy parameter

/**
 * Compute the gravitational force on token `target` from a point mass
 * at (cx, cy, cz) with the given mass.
 * Returns [fx, fy, fz].
 */
function pointForce(
  tx: number, ty: number, tz: number,
  cx: number, cy: number, cz: number,
  mass: number,
): [number, number, number] {
  const dx = cx - tx;
  const dy = cy - ty;
  const dz = cz - tz;
  const d2 = dx * dx + dy * dy + dz * dz + EPSILON * EPSILON;
  const d = Math.sqrt(d2);
  const f = G * mass / d2;
  return [f * dx / d, f * dy / d, f * dz / d];
}

/**
 * Barnes-Hut force approximation.
 * Traverses the octree and uses the multipole approximation when s/d < THETA.
 */
function bhForce(
  node: OctreeNode,
  t: Token,
  tokenIdx: number,
): [number, number, number] {
  if (node.mass === 0) return [0, 0, 0];

  // Leaf node: skip if it's the same token
  if (node.tokenIndex === tokenIdx) return [0, 0, 0];

  const [tx, ty, tz] = t.position;
  const dx = node.comX - tx;
  const dy = node.comY - ty;
  const dz = node.comZ - tz;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const s = node.halfSize * 2;

  if (node.tokenIndex >= 0 || s / (d + 1e-10) < THETA) {
    // Treat this node as a single body
    return pointForce(tx, ty, tz, node.comX, node.comY, node.comZ, node.mass);
  }

  // Recurse into children
  let fx = 0, fy = 0, fz = 0;
  for (const child of node.children) {
    if (!child) continue;
    const [cfx, cfy, cfz] = bhForce(child, t, tokenIdx);
    fx += cfx;
    fy += cfy;
    fz += cfz;
  }
  return [fx, fy, fz];
}

/**
 * Compute forces on all tokens using Barnes-Hut O(n log n) approximation.
 */
export function computeForcesBH(
  tokens: Token[],
  root: OctreeNode,
): [number, number, number][] {
  return tokens.map((t, i) => bhForce(root, t, i));
}

/**
 * Compute forces on all tokens using naive O(n²) pairwise method.
 * Used for the educational FPS comparison demo.
 */
export function computeForcesNaive(tokens: Token[]): [number, number, number][] {
  const N = tokens.length;
  const forces: [number, number, number][] = Array.from({ length: N }, () => [0, 0, 0]);

  for (let i = 0; i < N; i++) {
    const [tx, ty, tz] = tokens[i].position;
    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const [fx, fy, fz] = pointForce(
        tx, ty, tz,
        tokens[j].position[0], tokens[j].position[1], tokens[j].position[2],
        tokens[j].mass,
      );
      forces[i][0] += fx;
      forces[i][1] += fy;
      forces[i][2] += fz;
    }
  }

  return forces;
}
