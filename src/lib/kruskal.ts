import type { MSTEdge } from '../types';

/**
 * Union-Find (Disjoint Set Union) with path compression and union by rank.
 */
class UnionFind {
  private parent: Int32Array;
  private rank: Uint8Array;

  constructor(n: number) {
    this.parent = new Int32Array(n);
    this.rank = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // path compression
    }
    return this.parent[x];
  }

  union(x: number, y: number): boolean {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return false; // same component = cycle

    // Union by rank
    if (this.rank[rx] < this.rank[ry]) {
      this.parent[rx] = ry;
    } else if (this.rank[rx] > this.rank[ry]) {
      this.parent[ry] = rx;
    } else {
      this.parent[ry] = rx;
      this.rank[rx]++;
    }
    return true;
  }
}

/**
 * Kruskal's Minimum Spanning Tree algorithm.
 *
 * @param n - Number of nodes
 * @param similarityMatrix - Flat N×N array, index [i*n+j] = sim(i,j)
 * @returns Array of exactly (n-1) MSTEdge objects
 */
export function kruskal(n: number, similarityMatrix: number[]): MSTEdge[] {
  if (n <= 1) return [];

  // Build all edges with weight = 1 - similarity (lower = more similar)
  const edges: MSTEdge[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = similarityMatrix[i * n + j];
      edges.push({ from: i, to: j, weight: 1 - sim });
    }
  }

  // Sort ascending by weight (greedy picks cheapest first)
  edges.sort((a, b) => a.weight - b.weight);

  const uf = new UnionFind(n);
  const mst: MSTEdge[] = [];

  for (const edge of edges) {
    if (mst.length === n - 1) break;
    if (uf.union(edge.from, edge.to)) {
      mst.push(edge);
    }
  }

  return mst;
}
