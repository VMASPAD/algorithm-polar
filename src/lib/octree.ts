import type { Token } from '../types';

export interface OctreeNode {
  // Bounding box
  cx: number;
  cy: number;
  cz: number;
  halfSize: number;

  // Mass aggregation for Barnes-Hut
  mass: number;
  comX: number; // center of mass X
  comY: number;
  comZ: number;

  // -1 = internal node (has children), >= 0 = leaf index into tokens array
  tokenIndex: number;

  // 8 children: indexed by octant (0b xyz)
  children: (OctreeNode | null)[];
}

function makeNode(cx: number, cy: number, cz: number, halfSize: number): OctreeNode {
  return {
    cx, cy, cz, halfSize,
    mass: 0, comX: 0, comY: 0, comZ: 0,
    tokenIndex: -1,
    children: [null, null, null, null, null, null, null, null],
  };
}

/**
 * Return the octant index (0-7) for a point relative to the node center.
 * Bit 0 = x>=cx, Bit 1 = y>=cy, Bit 2 = z>=cz
 */
function octantOf(node: OctreeNode, x: number, y: number, z: number): number {
  return (x >= node.cx ? 1 : 0) |
         (y >= node.cy ? 2 : 0) |
         (z >= node.cz ? 4 : 0);
}

function childCenter(node: OctreeNode, octant: number): [number, number, number] {
  const q = node.halfSize / 2;
  return [
    node.cx + ((octant & 1) ? q : -q),
    node.cy + ((octant & 2) ? q : -q),
    node.cz + ((octant & 4) ? q : -q),
  ];
}

/**
 * Insert a token into the octree, updating mass and center of mass.
 */
function insert(node: OctreeNode, tokens: Token[], idx: number, depth = 0): void {
  const t = tokens[idx];
  const [px, py, pz] = t.position;
  const m = t.mass;

  // Update this node's mass aggregate
  node.comX = (node.comX * node.mass + px * m) / (node.mass + m);
  node.comY = (node.comY * node.mass + py * m) / (node.mass + m);
  node.comZ = (node.comZ * node.mass + pz * m) / (node.mass + m);
  node.mass += m;

  if (node.tokenIndex === -1 && node.children.every((c) => c === null)) {
    // Empty node → become a leaf
    node.tokenIndex = idx;
    return;
  }

  if (node.tokenIndex >= 0) {
    // Was a leaf, must subdivide
    const existing = node.tokenIndex;
    node.tokenIndex = -1;

    const eOct = octantOf(node, tokens[existing].position[0], tokens[existing].position[1], tokens[existing].position[2]);
    const [ex, ey, ez] = childCenter(node, eOct);
    node.children[eOct] = makeNode(ex, ey, ez, node.halfSize / 2);
    insert(node.children[eOct]!, tokens, existing, depth + 1);
  }

  if (depth > 20) {
    // Guard against infinite recursion for identical positions
    node.tokenIndex = idx;
    return;
  }

  const oct = octantOf(node, px, py, pz);
  if (!node.children[oct]) {
    const [nx, ny, nz] = childCenter(node, oct);
    node.children[oct] = makeNode(nx, ny, nz, node.halfSize / 2);
  }
  insert(node.children[oct]!, tokens, idx, depth + 1);
}

/**
 * Build an Octree from an array of tokens.
 * The root node covers [-rootSize, rootSize]^3 in world space.
 */
export function buildOctree(tokens: Token[], rootSize = 120): OctreeNode {
  const root = makeNode(0, 0, 0, rootSize);
  for (let i = 0; i < tokens.length; i++) {
    insert(root, tokens, i);
  }
  return root;
}

/**
 * Collect all nodes for wireframe visualization (depth-limited).
 */
export function collectNodes(root: OctreeNode, maxDepth = 4): OctreeNode[] {
  const result: OctreeNode[] = [];
  function traverse(node: OctreeNode, depth: number) {
    result.push(node);
    if (depth >= maxDepth) return;
    for (const child of node.children) {
      if (child) traverse(child, depth + 1);
    }
  }
  traverse(root, 0);
  return result;
}
