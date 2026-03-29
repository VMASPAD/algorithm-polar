import type { Token, MSTEdge } from '../types';
import { buildOctree } from './octree';
import { computeForcesBH, computeForcesNaive } from './barnes-hut';

const DAMPING = 0.992;
const MAX_VELOCITY = 40;
const MAX_POSITION = 150;
const DT_CAP = 0.05;

// Spring forces along MST edges
const SPRING_K = 0.12;
const SPRING_REST = 16; // rest length in world units

// Short-range repulsion (prevents overlap before collision resolves)
const REPULSION_K = 120;
const REPULSION_CUTOFF = 20;

// Elastic collision restitution (1 = perfectly elastic)
const RESTITUTION = 0.65;

export class PhysicsSimulation {
  private tokens: Token[];
  private edges: MSTEdge[];
  private useBarnesHut: boolean;
  private rafId: number | null = null;
  private lastTime: number | null = null;
  private fpsBuffer: number[] = [];
  collisions = 0; // public counter for HUD

  constructor(tokens: Token[], edges: MSTEdge[], useBarnesHut: boolean) {
    this.tokens = tokens.map((t) => ({
      ...t,
      velocity: [0, 0, 0] as [number, number, number],
    }));
    this.edges = edges;
    this.useBarnesHut = useBarnesHut;
  }

  setBarnesHut(v: boolean) {
    this.useBarnesHut = v;
  }

  getTokens(): Token[] {
    return this.tokens;
  }

  // ── Spring forces along MST edges ─────────────────────────────────────────
  private applySpringForces(forces: [number, number, number][]): void {
    for (const edge of this.edges) {
      const a = this.tokens[edge.from];
      const b = this.tokens[edge.to];
      const dx = b.position[0] - a.position[0];
      const dy = b.position[1] - a.position[1];
      const dz = b.position[2] - a.position[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-6;
      const stretch = d - SPRING_REST;
      const f = SPRING_K * stretch;
      const nx = dx / d, ny = dy / d, nz = dz / d;
      forces[edge.from][0] += nx * f;
      forces[edge.from][1] += ny * f;
      forces[edge.from][2] += nz * f;
      forces[edge.to][0] -= nx * f;
      forces[edge.to][1] -= ny * f;
      forces[edge.to][2] -= nz * f;
    }
  }

  // ── Short-range repulsion (inverse square, cuts off at REPULSION_CUTOFF) ──
  private applyRepulsion(forces: [number, number, number][]): void {
    const N = this.tokens.length;
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = this.tokens[i];
        const b = this.tokens[j];
        let dx = b.position[0] - a.position[0];
        let dy = b.position[1] - a.position[1];
        let dz = b.position[2] - a.position[2];
        let d2 = dx * dx + dy * dy + dz * dz;

        // Prevent division by zero if particles are exactly at the same spot
        if (d2 < 0.000001) {
          dx = (Math.random() - 0.5) * 0.01;
          dy = (Math.random() - 0.5) * 0.01;
          dz = (Math.random() - 0.5) * 0.01;
          d2 = dx * dx + dy * dy + dz * dz;
        }

        if (d2 > REPULSION_CUTOFF * REPULSION_CUTOFF) continue;
        const d = Math.sqrt(d2) + 0.5;
        const f = REPULSION_K / (d2);
        const nx = dx / d, ny = dy / d, nz = dz / d;
        forces[i][0] -= nx * f;
        forces[i][1] -= ny * f;
        forces[i][2] -= nz * f;
        forces[j][0] += nx * f;
        forces[j][1] += ny * f;
        forces[j][2] += nz * f;
      }
    }
  }

  // ── Elastic collision detection & response ────────────────────────────────
  private resolveCollisions(): void {
    const tokens = this.tokens;
    const N = tokens.length;
    let collisionCount = 0;

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const a = tokens[i];
        const b = tokens[j];
        const dx = b.position[0] - a.position[0];
        const dy = b.position[1] - a.position[1];
        const dz = b.position[2] - a.position[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        const minDist = a.radius + b.radius;

        if (d2 >= minDist * minDist || d2 < 0.001) continue;

        collisionCount++;
        const d = Math.sqrt(d2);
        const nx = dx / d, ny = dy / d, nz = dz / d;

        // Relative velocity along collision normal
        const rvx = b.velocity[0] - a.velocity[0];
        const rvy = b.velocity[1] - a.velocity[1];
        const rvz = b.velocity[2] - a.velocity[2];
        const relVn = rvx * nx + rvy * ny + rvz * nz;

        if (relVn >= 0) continue; // separating already

        const invMa = 1 / a.mass, invMb = 1 / b.mass;
        const impulse = -(1 + RESTITUTION) * relVn / (invMa + invMb);

        a.velocity[0] -= impulse * invMa * nx;
        a.velocity[1] -= impulse * invMa * ny;
        a.velocity[2] -= impulse * invMa * nz;
        b.velocity[0] += impulse * invMb * nx;
        b.velocity[1] += impulse * invMb * ny;
        b.velocity[2] += impulse * invMb * nz;

        // Positional correction — push apart so they don't overlap
        const overlap = (minDist - d) * 0.5;
        const corrA = overlap * (invMa / (invMa + invMb));
        const corrB = overlap * (invMb / (invMa + invMb));
        a.position[0] -= corrA * nx;
        a.position[1] -= corrA * ny;
        a.position[2] -= corrA * nz;
        b.position[0] += corrB * nx;
        b.position[1] += corrB * ny;
        b.position[2] += corrB * nz;
      }
    }

    this.collisions = collisionCount;
  }

  private step(dt: number): void {
    const capped = Math.min(dt, DT_CAP);
    const tokens = this.tokens;
    const N = tokens.length;
    if (N === 0) return;

    // ── Gravitational forces ─────────────────────────────────────────────────
    let forces: [number, number, number][];
    if (this.useBarnesHut) {
      const root = buildOctree(tokens);
      forces = computeForcesBH(tokens, root);
    } else {
      forces = computeForcesNaive(tokens);
    }

    // ── Spring forces (along MST edges) ──────────────────────────────────────
    this.applySpringForces(forces);

    // ── Short-range repulsion ─────────────────────────────────────────────────
    this.applyRepulsion(forces);

    // ── Integrate ────────────────────────────────────────────────────────────
    for (let i = 0; i < N; i++) {
      const t = tokens[i];
      const [fx, fy, fz] = forces[i];
      const invMass = 1 / t.mass;

      t.velocity[0] = (t.velocity[0] + fx * invMass * capped) * DAMPING;
      t.velocity[1] = (t.velocity[1] + fy * invMass * capped) * DAMPING;
      t.velocity[2] = (t.velocity[2] + fz * invMass * capped) * DAMPING;

      const vLen = Math.sqrt(t.velocity[0] ** 2 + t.velocity[1] ** 2 + t.velocity[2] ** 2);
      if (vLen > MAX_VELOCITY) {
        const s = MAX_VELOCITY / vLen;
        t.velocity[0] *= s; t.velocity[1] *= s; t.velocity[2] *= s;
      }

      t.position[0] += t.velocity[0] * capped;
      t.position[1] += t.velocity[1] * capped;
      t.position[2] += t.velocity[2] * capped;

      t.position[0] = Math.max(-MAX_POSITION, Math.min(MAX_POSITION, t.position[0]));
      t.position[1] = Math.max(-MAX_POSITION, Math.min(MAX_POSITION, t.position[1]));
      t.position[2] = Math.max(-MAX_POSITION, Math.min(MAX_POSITION, t.position[2]));
    }

    // ── Collision resolution (after integration) ──────────────────────────────
    this.resolveCollisions();
  }

  start(onFrame: (tokens: Token[], fps: number, collisions: number) => void): void {
    if (this.rafId !== null) return;

    const loop = (now: number) => {
      const dt = this.lastTime !== null ? (now - this.lastTime) / 1000 : 0.016;
      this.lastTime = now;
      this.step(dt);

      this.fpsBuffer.push(dt > 0 ? 1 / dt : 60);
      if (this.fpsBuffer.length > 30) this.fpsBuffer.shift();
      const fps = this.fpsBuffer.reduce((a, b) => a + b, 0) / this.fpsBuffer.length;

      onFrame([...this.tokens], fps, this.collisions);
      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
      this.lastTime = null;
    }
  }
}
