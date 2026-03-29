import { useRef, useEffect, useState, useCallback } from 'react';
import gsap from 'gsap';
import type { PipelineProgress, Token } from '../types';

/* ── Stage ordering ───────────────────────────────────────────── */
const STAGE_ORDER = ['tokenizing', 'embedding', 'pca', 'similarity', 'done'] as const;

function stageIndex(stage: string) {
  const i = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
  return i === -1 ? -1 : i;
}

interface StageConfig {
  id: string;
  num: string;
  label: string;
  subtitle: string;
  color: string; // CSS var name used for glow
}

const STAGES: StageConfig[] = [
  { id: 'tokenizing', num: '01', label: 'Tokenizar',  subtitle: 'BPE → IDs enteros',          color: 'var(--primary-400)' },
  { id: 'embedding',  num: '02', label: 'Embeber',    subtitle: 'IDs → vectores 1536-d',       color: 'var(--secondary-400)' },
  { id: 'pca',        num: '03', label: 'Reducir',    subtitle: 'PCA 1536-d → 3D',             color: 'var(--primary-300)' },
  { id: 'similarity', num: '04', label: 'Simular',    subtitle: 'Física N-body + MST Kruskal', color: 'var(--secondary-300)' },
];

/* ── Props ────────────────────────────────────────────────────── */
interface Props {
  progress: PipelineProgress;
  tokens: Token[];
  inputText: string;
}

const STAGE_DETAILS_STATIC: Record<string, { title: string; description: string }> = {
  tokenizing: {
    title: 'Byte-Pair Encoding (BPE)',
    description:
      'El texto crudo se fragmenta iterativamente en sub-palabras fusionando pares de bytes más frecuentes (~100 k vocab). Cada fragmento obtiene un ID entero único.',
  },
  embedding: {
    title: 'Vector Embedding 1536-d',
    description:
      'Cada ID indexa una fila en la matrix de pesos del modelo (text-embedding-3-small). Resultado: vector denso normalizado L2 que codifica significado y contexto.',
  },
  pca: {
    title: 'PCA — Reducción de Dimensiones',
    description:
      'PCA (NIPALS iterativo) proyecta el espacio 1536-d a 3 ejes de máxima varianza. La similitud coseno entre todos los pares genera la masa semántica y las aristas MST (Kruskal).',
  },
  similarity: {
    title: 'Simulación Física N-Body',
    description:
      'Tokens → cuerpos celestes. Motor físico propio: gravedad Barnes-Hut O(n log n), resortes Hooke sobre aristas MST (K=0.12, d₀=16u), repulsión corto alcance, colisiones elásticas (e=0.65).',
  },
};

/* ── Dynamic math lines per stage ───────────────────────────────
   Generates real numbers from the actual run data.
─────────────────────────────────────────────────────────────── */
function buildStageMath(
  stageId: string,
  inputText: string,
  tokens: Token[],
  progress: PipelineProgress,
): string {
  const words = inputText.trim().split(/\s+/).filter(Boolean);

  switch (stageId) {
    case 'tokenizing': {
      // Show first 5 words → fake BPE IDs (deterministic hash)
      const shown = words.slice(0, 5);
      const lines = shown.map((w, i) => {
        const fakeId = ((w.charCodeAt(0) * 97 + w.length * 1337 + i * 491) % 98000) + 1000;
        return `"${w}" → #${fakeId}`;
      });
      if (words.length > 5) lines.push(`… +${words.length - 5} más`);
      return lines.join('\n');
    }

    case 'embedding': {
      const total = progress.embeddingProgress?.total ?? words.length;
      const done  = progress.embeddingProgress?.completed ?? total;
      const pct   = total > 0 ? Math.round((done / total) * 100) : 100;
      // Show first token's fake vector head if we have tokens
      const firstTok = tokens[0];
      const vecHead = firstTok
        ? `[${Array.from({ length: 6 }, (_, i) =>
            (Math.sin(firstTok.id * 0.3 + i * 1.7) * 0.95).toFixed(3)
          ).join(', ')}, …]₁₅₃₆`
        : `[0.021, -0.830, 0.114, -0.272, 0.556, -0.043, …]₁₅₃₆`;
      return `${done}/${total} tokens (${pct}%)\n${firstTok ? `"${firstTok.text}"` : 'Token'} → ${vecHead}`;
    }

    case 'pca': {
      if (tokens.length === 0) {
        return 'cos_sim(a, b) = a·b / (|a|·|b|)\n1536-d → 3-d (X, Y, Z)';
      }
      // Show top-3 tokens with real 3D positions
      const shown = tokens.slice(0, 4);
      const lines = shown.map(t => {
        const [x, y, z] = t.position;
        return `"${t.text.slice(0, 8)}" → (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`;
      });
      if (tokens.length > 4) lines.push(`… +${tokens.length - 4} tokens`);
      return lines.join('\n');
    }

    case 'similarity': {
      const formula = 'F = G·m₁·m₂/r² + K·(d−d₀) − C/r²';
      if (tokens.length === 0) return formula;
      // Show top-3 by mass with real values
      const sorted = [...tokens].sort((a, b) => b.mass - a.mass).slice(0, 4);
      const lines  = sorted.map(t =>
        `"${t.text.slice(0, 8)}" m=${t.mass.toFixed(2)} r=${t.radius.toFixed(1)}`
      );
      return `${formula}\n\n${lines.join('\n')}`;
    }

    default:
      return '';
  }
}



/* ══════════════════════════════════════════════════════════════════
   Main component
══════════════════════════════════════════════════════════════════ */
export function RealtimePipelineViz({ progress, tokens, inputText }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  /* Entrance */
  useEffect(() => {
    if (!wrapRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('.rtpv-header', { autoAlpha: 0, y: -10, duration: 0.35, ease: 'power2.out' });
      gsap.from('.rtpv-stage', {
        autoAlpha: 0, y: 12, duration: 0.3, stagger: 0.06,
        ease: 'back.out(1.4)', delay: 0.1,
      });
    }, wrapRef);
    return () => ctx.revert();
  }, []);

  const currentIdx = stageIndex(progress.stage);
  const allDone = progress.stage === 'done';

  return (
    <div className={`rtpv-wrap${allDone ? ' all-done' : ''}`} ref={wrapRef}>
      <div className="rtpv-header">
        <span className="rtpv-header-tag">Procesamiento en Tiempo Real</span>
        <span className="rtpv-header-stage">
          {allDone ? '✓ Completado' :
           progress.stage === 'error' ? '✗ Error' :
           STAGES.find(s => s.id === progress.stage)?.label ?? ''}
        </span>
      </div>

      {STAGES.map((stage, i) => {
        const isDone      = currentIdx > i || allDone;
        const isActive    = progress.stage === stage.id;
        const isPending   = !isDone && !isActive;
        const isExpanded  = expanded.has(stage.id);

        return (
          <StageCard
            key={stage.id}
            stage={stage}
            isActive={isActive}
            isDone={isDone}
            isPending={isPending}
            isExpanded={isExpanded}
            onToggle={() => toggleExpand(stage.id)}
            progress={progress}
            tokens={tokens}
            inputText={inputText}
          />
        );
      })}

      {/* ── Stage 05: Generación de Respuesta ─────────────────── */}
      {allDone && (
        <GenerateCard tokens={tokens} inputText={inputText} />
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════════
   Stage Card
══════════════════════════════════════════════════════════════════ */
interface CardProps {
  stage: StageConfig;
  isActive: boolean;
  isDone: boolean;
  isPending: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  progress: PipelineProgress;
  tokens: Token[];
  inputText: string;
}

function StageCard({ stage, isActive, isDone, isPending, isExpanded, onToggle, progress, tokens, inputText }: CardProps) {
  const cardRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const aliveRef  = useRef({ value: false });
  const tlRef     = useRef<gsap.core.Timeline | null>(null);

  const showCanvas  = isActive || (isDone && isExpanded);
  const staticData  = STAGE_DETAILS_STATIC[stage.id];
  const mathLines   = buildStageMath(stage.id, inputText, tokens, progress);

  /* Canvas animation */
  useEffect(() => {
    aliveRef.current.value = false;
    tlRef.current?.kill();

    if (!canvasRef.current || !showCanvas) return;

    const alive = { value: true };
    aliveRef.current = alive;

    const canvas = canvasRef.current;
    runStageAnimation(stage.id, canvas, alive, progress, inputText, tokens, (tl) => {
      tlRef.current = tl;
    });

    if (isDone && !isActive) {
      setTimeout(() => { tlRef.current?.kill(); }, 500);
    }

    return () => {
      alive.value = false;
      tlRef.current?.kill();
    };
  }, [showCanvas, isActive, isDone, stage.id, progress, inputText, tokens]);

  /* Animate detail panel entrance */
  useEffect(() => {
    if (!detailRef.current) return;
    if (isExpanded || isActive) {
      gsap.fromTo(detailRef.current,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' },
      );
    }
  }, [isExpanded, isActive]);

  return (
    <div
      ref={cardRef}
      className={`rtpv-stage${isActive ? ' active' : ''}${isDone ? ' done' : ''}${isPending ? ' pending' : ''}${isExpanded ? ' expanded' : ''}`}
      style={{ '--stage-color': stage.color } as React.CSSProperties}
    >
      {/* ── Header row ─────────────────────────────── */}
      <div
        className={`rtpv-stage-row${isDone ? ' clickable' : ''}`}
        onClick={isDone ? onToggle : undefined}
        role={isDone ? 'button' : undefined}
        aria-expanded={isDone ? isExpanded : undefined}
      >
        <div className="rtpv-stage-num-wrap">
          {isDone
            ? <span className="rtpv-check">✓</span>
            : <span className="rtpv-num">{stage.num}</span>}
          {isActive && <span className="rtpv-pulse" />}
        </div>
        <div className="rtpv-stage-info">
          <span className="rtpv-stage-label">{stage.label}</span>
          <span className="rtpv-stage-sub">{stage.subtitle}</span>
        </div>
        {isActive && progress.stage === 'embedding' && progress.embeddingProgress && (
          <span className="rtpv-embed-pct">
            {Math.round((progress.embeddingProgress.completed / progress.embeddingProgress.total) * 100)}%
          </span>
        )}
        {isDone && (
          <span className={`rtpv-chevron${isExpanded ? ' open' : ''}`} aria-hidden="true">▾</span>
        )}
      </div>

      {/* ── Expandable detail (active or done+expanded) ── */}
      {(isActive || (isDone && isExpanded)) && (
        <div className="rtpv-detail" ref={detailRef}>
          {/* Canvas */}
          <div className="rtpv-canvas-wrap">
            <canvas ref={canvasRef} className="rtpv-canvas" />
            <div className="rtpv-canvas-label">{stage.subtitle}</div>
          </div>

          {/* Math + description */}
          {staticData && (
            <div className="rtpv-detail-body">
              <div className="rtpv-detail-title">{staticData.title}</div>
              {mathLines && (
                <div className="rtpv-code-block">
                  {mathLines.split('\n').map((line, i) => (
                    <div key={i} className={`rtpv-math-line${i === 0 ? ' formula' : ''}`}>
                      <code>{line}</code>
                    </div>
                  ))}
                </div>
              )}
              <p className="rtpv-detail-desc">{staticData.description}</p>
            </div>
          )}

          {/* Embed progress bar */}
          {isActive && progress.stage === 'embedding' && progress.embeddingProgress && (
            <div className="rtpv-embed-bar-wrap">
              <div
                className="rtpv-embed-bar-fill"
                style={{
                  width: `${(progress.embeddingProgress.completed / progress.embeddingProgress.total) * 100}%`,
                  background: `linear-gradient(90deg, ${stage.color}, var(--primary-300))`,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Canvas dispatcher
══════════════════════════════════════════════════════════════════ */
function runStageAnimation(
  stageId: string,
  canvas: HTMLCanvasElement,
  alive: { value: boolean },
  progress: PipelineProgress,
  inputText: string,
  tokens: Token[],
  registerTl: (tl: gsap.core.Timeline) => void,
) {
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;

  const parent = canvas.parentElement;
  const rect = parent?.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 2;
  canvas.width  = (rect?.width  ?? 280) * dpr;
  canvas.height = (rect?.height ?? 100) * dpr;
  ctx2d.scale(dpr, dpr);
  const W = canvas.width  / dpr;
  const H = canvas.height / dpr;

  const cs = getComputedStyle(document.documentElement);
  const col = {
    p3:  cs.getPropertyValue('--primary-300').trim()   || '#8dd4a8',
    p4:  cs.getPropertyValue('--primary-400').trim()   || '#5ab589',
    p5:  cs.getPropertyValue('--primary-500').trim()   || '#4a9a73',
    p7:  cs.getPropertyValue('--primary-700').trim()   || '#3a7a56',
    s3:  cs.getPropertyValue('--secondary-300').trim() || '#c48ac4',
    s4:  cs.getPropertyValue('--secondary-400').trim() || '#b570b5',
    b4:  cs.getPropertyValue('--base-400').trim()      || '#8888aa',
    b5:  cs.getPropertyValue('--base-500').trim()      || '#7070a0',
    b7:  cs.getPropertyValue('--base-700').trim()      || '#444466',
    b8:  cs.getPropertyValue('--base-800').trim()      || '#2a2a44',
    b9:  cs.getPropertyValue('--base-900').trim()      || '#1a1a2e',
    tp:  cs.getPropertyValue('--text-primary').trim()  || '#eaeaf8',
    tm:  cs.getPropertyValue('--text-muted').trim()    || '#8888aa',
  };

  switch (stageId) {
    case 'tokenizing':  animRTTokenize (ctx2d, W, H, col, alive, registerTl, inputText); break;
    case 'embedding':   animRTEmbed    (ctx2d, W, H, col, alive, registerTl, progress);  break;
    case 'pca':         animRTPCA      (ctx2d, W, H, col, alive, registerTl);            break;
    case 'similarity':  animRTSimulate (ctx2d, W, H, col, alive, registerTl, tokens);    break;
  }
}

/* ── Shared helpers ─────────────────────────────────────────── */
type C2D = CanvasRenderingContext2D;
type Cols = Record<string, string>;

function rr(c: C2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

/* ══════════════════════════════════════════════════════════════════
   Stage 01 — Tokenizar (real input text)
══════════════════════════════════════════════════════════════════ */
function animRTTokenize(
  c: C2D, W: number, H: number, col: Cols,
  alive: { value: boolean },
  registerTl: (tl: gsap.core.Timeline) => void,
  inputText: string,
) {
  const words = inputText.trim().split(/\s+/).slice(0, 10);
  const tokenColors = [col.p4, col.s4, col.p3, col.s3, col.p5, col.s4, col.p4, col.p3, col.s3, col.p5];
  const fakeIds = words.map((_, i) => 1000 + i * 1337 % 98000);

  const a = { scan: 0, split: 0, idFade: 0, glow: 0 };
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });
  tl.to(a, { scan: 1, duration: 0.9, ease: 'power1.inOut' });
  tl.to(a, { split: 1, duration: 0.8, ease: 'power3.inOut' }, '+=0.2');
  tl.to(a, { idFade: 1, duration: 0.5, ease: 'power2.out' }, '+=0.15');
  tl.to(a, { glow: 1, duration: 0.3 }, '+=0.1');
  tl.to(a, { glow: 0, duration: 0.3 });
  tl.to(a, { duration: 1 });
  tl.to(a, { scan: 0, split: 0, idFade: 0, duration: 0.4 });
  registerTl(tl);

  function draw() {
    if (!alive.value) return;
    c.clearRect(0, 0, W, H);

    const cx = W / 2;
    const inputY = H * 0.25;
    const textPreview = inputText.slice(0, 40) + (inputText.length > 40 ? '…' : '');

    // ── Raw text top ──
    c.save();
    c.font = '500 9px "JetBrains Mono", monospace';
    c.fillStyle = col.tp;
    c.globalAlpha = 0.7;
    c.textAlign = 'center';
    c.fillText(`"${textPreview}"`, cx, inputY);

    // BPE scan bar
    if (a.scan > 0 && a.split < 0.4) {
      const barX = W * 0.1;
      const barW = W * 0.8 * a.scan;
      c.globalAlpha = 0.18;
      c.fillStyle = col.p4;
      c.fillRect(barX, inputY - 11, barW, 14);
      c.globalAlpha = 0.9;
      c.strokeStyle = col.p4;
      c.lineWidth = 1.5;
      c.shadowColor = col.p4; c.shadowBlur = 6;
      c.beginPath();
      c.moveTo(barX + barW, inputY - 12);
      c.lineTo(barX + barW, inputY + 3);
      c.stroke();
      c.shadowBlur = 0;
    }
    c.restore();

    // ── BPE label ──
    if (a.scan > 0.1 && a.split < 0.4) {
      c.save();
      c.globalAlpha = a.scan * 0.7;
      c.font = '500 8px "DM Sans", sans-serif';
      c.fillStyle = col.p5;
      c.textAlign = 'center';
      c.fillText('⟳ BPE — fusionando pares frecuentes…', cx, inputY + 18);
      c.restore();
    }

    // ── Token chips ──
    if (a.split > 0) {
      const chipY = H * 0.65;
      c.font = '600 9px "JetBrains Mono", monospace';
      const chipW = Math.min((W - 16) / Math.max(words.length, 1), 52);
      const totalW = (chipW + 4) * words.length - 4;
      let cx2 = (W - totalW) / 2;

      words.forEach((word, i) => {
        const prog = Math.max(0, Math.min(1, a.split * (words.length + 1) - i));
        if (prog <= 0) { cx2 += chipW + 4; return; }

        const color = tokenColors[i % tokenColors.length];
        c.save();
        c.globalAlpha = prog;
        if (a.glow > 0) { c.shadowColor = color; c.shadowBlur = 8 * a.glow; }

        c.fillStyle = col.b9;
        c.strokeStyle = color;
        c.lineWidth = 1;
        rr(c, cx2, chipY - 11, chipW, 22, 5);
        c.fill(); c.stroke();

        // accent stripe
        c.fillStyle = color;
        c.globalAlpha = prog * 0.35;
        rr(c, cx2, chipY - 11, chipW, 3, 5);
        c.fill();

        c.globalAlpha = prog;
        c.shadowBlur = 0;
        c.font = '600 8px "JetBrains Mono", monospace';
        c.fillStyle = color;
        c.textAlign = 'center';
        const label = (word.length > 6 ? word.slice(0, 5) + '…' : word);
        c.fillText(label, cx2 + chipW / 2, chipY + 2);

        if (a.idFade > 0) {
          const idA = Math.max(0, Math.min(1, a.idFade * 2 - i * 0.3));
          c.globalAlpha = prog * idA;
          c.font = '500 7px "JetBrains Mono", monospace';
          c.fillStyle = col.b4;
          c.fillText(`#${fakeIds[i]}`, cx2 + chipW / 2, chipY + 14);
        }
        c.restore();
        cx2 += chipW + 4;
      });

      // Arrow
      if (a.split > 0.3) {
        c.save();
        c.globalAlpha = Math.min((a.split - 0.3) * 3, 1) * 0.6;
        c.font = '500 8px "DM Sans", sans-serif';
        c.fillStyle = col.b4;
        c.textAlign = 'center';
        c.fillText(`${words.length} tokens extraídos`, cx, chipY - 22);
        c.restore();
      }
    }

    requestAnimationFrame(draw);
  }
  draw();
}

/* ══════════════════════════════════════════════════════════════════
   Stage 02 — Embeber (real progress)
══════════════════════════════════════════════════════════════════ */
function animRTEmbed(
  c: C2D, W: number, H: number, col: Cols,
  alive: { value: boolean },
  registerTl: (tl: gsap.core.Timeline) => void,
  progress: PipelineProgress,
) {
  const a = { packet: 0, bars: 0, norm: 0 };
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });
  tl.to(a, { packet: 1, duration: 0.6, ease: 'power2.in' });
  tl.to(a, { bars: 1, duration: 0.8, ease: 'power2.out' }, '+=0.1');
  tl.to(a, { norm: 1, duration: 0.4, ease: 'power2.out' }, '+=0.2');
  tl.to(a, { duration: 1.2 });
  tl.to(a, { packet: 0, bars: 0, norm: 0, duration: 0.4 });
  registerTl(tl);

  // Real pct from progress
  const realPct = progress.stage === 'embedding' && progress.embeddingProgress
    ? progress.embeddingProgress.completed / progress.embeddingProgress.total
    : 0;

  function draw() {
    if (!alive.value) return;
    c.clearRect(0, 0, W, H);

    const cx = W / 2;
    const modelX = W * 0.42;
    const modelW = 48;
    const modelY = H / 2;

    // ── Model block ──
    c.fillStyle = col.b9;
    c.strokeStyle = col.p7;
    c.lineWidth = 1.2;
    rr(c, modelX - modelW / 2, modelY - 28, modelW, 56, 8);
    c.fill(); c.stroke();

    if (a.packet > 0 && a.bars < 0.5) {
      c.save();
      c.globalAlpha = 0.07;
      const g = c.createRadialGradient(modelX, modelY, 0, modelX, modelY, 36);
      g.addColorStop(0, col.p4); g.addColorStop(1, 'transparent');
      c.fillStyle = g;
      c.fillRect(modelX - 36, modelY - 36, 72, 72);
      c.restore();
    }

    c.save();
    c.font = '600 8px "DM Sans", sans-serif';
    c.fillStyle = col.p4;
    c.textAlign = 'center';
    c.fillText('EMBED', modelX, modelY - 8);
    c.font = '500 7px "DM Sans", sans-serif';
    c.fillStyle = col.b5;
    c.fillText('MODEL', modelX, modelY + 3);
    c.restore();

    // ── Packet flying in ──
    if (a.packet > 0 && a.packet < 1) {
      const srcX = W * 0.08;
      const px = srcX + (modelX - modelW / 2 - 6 - srcX) * a.packet;
      c.save();
      c.fillStyle = col.s4;
      c.shadowColor = col.s4; c.shadowBlur = 10;
      c.beginPath(); c.arc(px, modelY, 4, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.3; c.shadowBlur = 0;
      c.strokeStyle = col.s4; c.lineWidth = 2;
      c.beginPath(); c.moveTo(px, modelY); c.lineTo(Math.max(px - 14, srcX), modelY); c.stroke();
      c.restore();
    }

    // ── Token ID chip on left ──
    c.save();
    c.font = '500 8px "JetBrains Mono", monospace';
    const label = 'Token IDs';
    const tw = c.measureText(label).width + 16;
    c.fillStyle = col.b9; c.strokeStyle = col.s4; c.lineWidth = 1;
    rr(c, W * 0.08 - tw / 2, modelY - 12, tw, 24, 5);
    c.fill(); c.stroke();
    c.fillStyle = col.s4; c.textAlign = 'center';
    c.fillText(label, W * 0.08, modelY + 3);
    c.restore();

    // ── Output bars ──
    if (a.bars > 0) {
      const barCount = 16;
      const startX = modelX + modelW / 2 + 10;
      const availW = W - startX - 8;
      const bw = availW / barCount;

      c.save();
      for (let b = 0; b < barCount; b++) {
        const bp = Math.max(0, Math.min(1, a.bars * (barCount + 2) - b));
        if (bp <= 0) continue;
        const val = Math.sin(b * 1.3 + 1.7) * 0.8;
        const bh = Math.abs(val) * 14 + 2;
        c.globalAlpha = bp * (a.norm > 0 ? 0.5 + a.norm * 0.5 : 0.7);
        c.fillStyle = val > 0 ? col.p3 : col.s3;
        if (a.norm > 0) { c.shadowColor = col.p3; c.shadowBlur = 4 * a.norm; }
        rr(c, startX + b * bw + 1, modelY - bh / 2, bw - 2, bh, 2);
        c.fill(); c.shadowBlur = 0;
      }
      c.globalAlpha = a.bars;
      c.font = '500 7px "JetBrains Mono", monospace';
      c.fillStyle = col.b5; c.textAlign = 'right';
      c.fillText('1536-d', W - 4, modelY + 3);
      if (a.norm > 0.5) {
        c.globalAlpha = (a.norm - 0.5) * 2;
        c.fillStyle = col.p5;
        c.fillText('‖v‖=1', W - 4, modelY + 14);
      }
      c.restore();
    }

    // ── Real progress label ──
    if (realPct > 0) {
      c.save();
      c.font = '500 8px "DM Sans", sans-serif';
      c.fillStyle = col.p5;
      c.textAlign = 'center';
      c.globalAlpha = 0.85;
      c.fillText(`${Math.round(realPct * 100)}% completado`, cx, H - 6);
      c.restore();
    }

    requestAnimationFrame(draw);
  }
  draw();
}

/* ══════════════════════════════════════════════════════════════════
   Stage 03 — PCA / Reducir
══════════════════════════════════════════════════════════════════ */
function animRTPCA(
  c: C2D, W: number, H: number, col: Cols,
  alive: { value: boolean },
  registerTl: (tl: gsap.core.Timeline) => void,
) {
  const pts = [
    { ox: 0.25, oy: 0.3, r: 7, c: col.p4 },
    { ox: 0.75, oy: 0.25, r: 10, c: col.s4 },
    { ox: 0.5, oy: 0.7, r: 5, c: col.p3 },
    { ox: 0.15, oy: 0.75, r: 8, c: col.s3 },
    { ox: 0.85, oy: 0.6, r: 6, c: col.p4 },
  ];

  const a = { grid: 1, compress: 0, project: 0, rotate: 0 };
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });
  tl.to(a, { grid: 0, compress: 1, duration: 1.2, ease: 'power2.inOut' });
  tl.to(a, { project: 1, duration: 1, ease: 'power3.out' });
  tl.to(a, { rotate: Math.PI * 2, duration: 5, ease: 'none' }, '<');
  tl.to(a, { duration: 1 });
  tl.to(a, { grid: 1, compress: 0, project: 0, rotate: 0, duration: 0.5 });
  registerTl(tl);

  function draw() {
    if (!alive.value) return;
    c.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const spread = Math.min(W, H) * 0.35;

    // Grid
    if (a.grid > 0) {
      c.save(); c.globalAlpha = a.grid * 0.18;
      c.strokeStyle = col.b7; c.lineWidth = 0.5;
      for (let i = 0; i < 8; i++) {
        const gy = H * 0.08 + (H * 0.84 / 8) * i;
        c.beginPath(); c.moveTo(W * 0.04, gy); c.lineTo(W * 0.96, gy); c.stroke();
      }
      for (let i = 0; i < 12; i++) {
        const gx = W * 0.04 + (W * 0.92 / 12) * i;
        c.beginPath(); c.moveTo(gx, H * 0.08); c.lineTo(gx, H * 0.92); c.stroke();
      }
      c.globalAlpha = a.grid * 0.45;
      c.font = '500 8px "DM Sans", sans-serif';
      c.fillStyle = col.b5; c.textAlign = 'center';
      c.fillText('Espacio 1536-d', cx, H - 4);
      c.restore();
    }

    // 3D axes
    if (a.project > 0) {
      c.save(); c.globalAlpha = a.project * 0.45;
      c.strokeStyle = col.b7; c.lineWidth = 1;
      c.beginPath(); c.moveTo(cx - spread, cy); c.lineTo(cx + spread, cy); c.stroke();
      c.beginPath(); c.moveTo(cx, cy - spread); c.lineTo(cx, cy + spread); c.stroke();
      c.globalAlpha = a.project * 0.22;
      c.beginPath();
      c.moveTo(cx - spread * 0.5, cy + spread * 0.32);
      c.lineTo(cx + spread * 0.5, cy - spread * 0.32);
      c.stroke();
      c.globalAlpha = a.project * 0.5;
      c.font = '600 7px "JetBrains Mono", monospace';
      c.fillStyle = col.b5; c.textAlign = 'center';
      c.fillText('X', cx + spread + 8, cy + 4);
      c.fillText('Y', cx, cy - spread - 5);
      c.fillText('Z', cx + spread * 0.5 + 6, cy - spread * 0.32 - 4);
      c.fillText('PCA → 3D', cx, H - 4);
      c.restore();
    }

    // Points
    const positions = pts.map((p, i) => {
      if (a.project > 0) {
        const angle = (i / pts.length) * Math.PI * 2 + a.rotate;
        const radius = spread * (0.2 + p.ox * 0.5);
        const zOff = Math.sin(angle) * spread * 0.2;
        return {
          x: cx + Math.cos(angle) * radius * a.project,
          y: cy + (p.oy - 0.5) * spread * a.project + zOff * 0.28 * a.project,
          z: zOff,
        };
      }
      const gx = W * 0.04 + p.ox * W * 0.92;
      const gy = H * 0.08 + p.oy * H * 0.84;
      return { x: gx + (cx - gx) * a.compress * 0.6, y: gy + (cy - gy) * a.compress * 0.6, z: 0 };
    });

    positions.forEach(({ x, y, z }, i) => {
      const p = pts[i];
      const depth = a.project > 0 ? (z + spread) / (spread * 2) : 0.5;
      const size = p.r * (a.project > 0 ? 0.5 + depth * 0.5 : 1 - a.compress * 0.25);
      c.save();
      c.globalAlpha = 0.6 + depth * 0.4;
      c.beginPath(); c.arc(x, y, size, 0, Math.PI * 2);
      const g = c.createRadialGradient(x - size * 0.3, y - size * 0.3, 0, x, y, size);
      g.addColorStop(0, p.c); g.addColorStop(1, col.b9);
      c.fillStyle = g;
      c.shadowColor = p.c; c.shadowBlur = 7;
      c.fill();
      c.restore();
    });

    requestAnimationFrame(draw);
  }
  draw();
}

/* ══════════════════════════════════════════════════════════════════
   Stage 04 — Simular (N-body with actual token labels)
══════════════════════════════════════════════════════════════════ */
function animRTSimulate(
  c: C2D, W: number, H: number, col: Cols,
  alive: { value: boolean },
  registerTl: (tl: gsap.core.Timeline) => void,
  tokens: Token[],
) {
  const cx = W / 2, cy = H / 2;
  const bodyCount = Math.max(5, Math.min(tokens.length || 6, 10));
  const tokenColors = [col.p4, col.s4, col.p3, col.s3, col.p4, col.s4, col.p3, col.s3, col.p4, col.s4];
  const labels = tokens.length > 0
    ? tokens.slice(0, bodyCount).map(t => t.text.slice(0, 6))
    : ['Hola', 'mundo', 'token', 'embed', 'PCA', 'mass'];

  const bodies = Array.from({ length: bodyCount }, (_, i) => ({
    x: cx + (Math.random() - 0.5) * W * 0.55,
    y: cy + (Math.random() - 0.5) * H * 0.55,
    vx: 0, vy: 0,
    mass: (tokens[i]?.mass ?? (3 + Math.random() * 7)),
    color: tokenColors[i % tokenColors.length],
    label: labels[i] ?? `t${i}`,
  }));

  // Simple MST-like edges
  const edges: [number, number][] = [];
  for (let i = 0; i < bodyCount - 1; i++) edges.push([i, i + 1]);
  if (bodyCount > 3) edges.push([0, bodyCount - 1]);

  const f = { gravity: 0, springs: 0, repulsion: 0 };
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });
  tl.to(f, { gravity: 1, duration: 0.7, ease: 'power2.out' });
  tl.to(f, { springs: 1, duration: 0.6, ease: 'power2.out' }, '+=0.15');
  tl.to(f, { repulsion: 1, duration: 0.5, ease: 'power2.out' }, '+=0.15');
  tl.to(f, { duration: 4 });
  tl.to(f, { gravity: 0, springs: 0, repulsion: 0, duration: 0.3 });
  registerTl(tl);

  function draw() {
    if (!alive.value) return;
    c.clearRect(0, 0, W, H);

    // Physics tick
    bodies.forEach((b, i) => {
      if (f.gravity > 0) {
        const dx = cx - b.x, dy = cy - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 4;
        b.vx += (dx / dist) * 0.05 * f.gravity;
        b.vy += (dy / dist) * 0.05 * f.gravity;
      }
      if (f.springs > 0) {
        edges.forEach(([a2, b2]) => {
          if (a2 !== i && b2 !== i) return;
          const o = bodies[a2 === i ? b2 : a2];
          const dx = o.x - b.x, dy = o.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 1;
          const k = 0.007 * f.springs;
          b.vx += (dx / dist) * (dist - 38) * k;
          b.vy += (dy / dist) * (dist - 38) * k;
        });
      }
      if (f.repulsion > 0) {
        bodies.forEach((o, j) => {
          if (i === j) return;
          const dx = b.x - o.x, dy = b.y - o.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 4;
          if (dist < 45) {
            const frc = (45 - dist) * 0.012 * f.repulsion;
            b.vx += (dx / dist) * frc;
            b.vy += (dy / dist) * frc;
          }
        });
      }
      b.vx *= 0.97; b.vy *= 0.97;
      b.x = Math.max(12, Math.min(W - 12, b.x + b.vx));
      b.y = Math.max(12, Math.min(H - 12, b.y + b.vy));
    });

    // MST edges
    if (f.springs > 0) {
      c.save(); c.globalAlpha = f.springs * 0.3;
      c.strokeStyle = col.b5; c.lineWidth = 1;
      edges.forEach(([a2, b2]) => {
        c.beginPath();
        c.moveTo(bodies[a2].x, bodies[a2].y);
        c.lineTo(bodies[b2].x, bodies[b2].y);
        c.stroke();
      });
      c.restore();
    }

    // Bodies
    bodies.forEach(b => {
      const r = Math.max(4, Math.min(b.mass, 11));
      c.save();
      c.beginPath(); c.arc(b.x, b.y, r, 0, Math.PI * 2);
      const g = c.createRadialGradient(b.x - r * 0.3, b.y - r * 0.3, 0, b.x, b.y, r);
      g.addColorStop(0, b.color); g.addColorStop(1, col.b9);
      c.fillStyle = g;
      c.shadowColor = b.color; c.shadowBlur = 10;
      c.fill();

      c.shadowBlur = 0;
      c.globalAlpha = 0.55;
      c.font = '500 6px "DM Sans", sans-serif';
      c.fillStyle = col.b4; c.textAlign = 'center';
      c.fillText(b.label, b.x, b.y + r + 8);
      c.restore();
    });

    // Force labels
    const fLabels = [
      { label: 'Gravedad', val: f.gravity, color: col.p4, x: W * 0.2 },
      { label: 'MST',      val: f.springs, color: col.b4, x: W * 0.5 },
      { label: 'Repulsión',val: f.repulsion, color: col.s4, x: W * 0.8 },
    ];
    fLabels.forEach(fl => {
      if (fl.val <= 0) return;
      c.save();
      c.globalAlpha = fl.val * 0.65;
      c.font = '600 7px "DM Sans", sans-serif';
      c.textAlign = 'center';
      const tw = c.measureText(fl.label).width + 10;
      c.fillStyle = col.b9; c.strokeStyle = fl.color; c.lineWidth = 0.7;
      rr(c, fl.x - tw / 2, H - 13, tw, 12, 6);
      c.fill(); c.stroke();
      c.fillStyle = fl.color;
      c.fillText(fl.label, fl.x, H - 4);
      c.restore();
    });

    requestAnimationFrame(draw);
  }
  draw();
}

/* ══════════════════════════════════════════════════════════════════
   Stage 05 — GenerateCard (Transformer response decoding)
══════════════════════════════════════════════════════════════════ */
function GenerateCard({ tokens, inputText }: { tokens: Token[]; inputText: string }) {
  const cardRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aliveRef  = useRef({ value: false });
  const tlRef     = useRef<gsap.core.Timeline | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  /* Entrance animation */
  useEffect(() => {
    if (!cardRef.current) return;
    gsap.fromTo(cardRef.current,
      { autoAlpha: 0, y: 20, scale: 0.97 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.5)', delay: 0.15 },
    );
  }, []);

  /* Canvas */
  useEffect(() => {
    aliveRef.current.value = false;
    tlRef.current?.kill();
    if (!canvasRef.current || !isExpanded) return;
    const alive = { value: true };
    aliveRef.current = alive;
    animRTGenerate(canvasRef.current, alive, tokens, inputText, tl => { tlRef.current = tl; });
    return () => { alive.value = false; tlRef.current?.kill(); };
  }, [isExpanded, tokens, inputText]);

  return (
    <div
      ref={cardRef}
      className="rtpv-stage rtpv-gen-card"
      style={{ '--stage-color': 'oklch(0.78 0.18 72)' } as React.CSSProperties}
    >
      {/* Header */}
      <div
        className="rtpv-stage-row clickable"
        onClick={() => setIsExpanded(e => !e)}
        role="button"
        aria-expanded={isExpanded}
      >
        <div className="rtpv-stage-num-wrap">
          <span className="rtpv-num rtpv-gen-num">05</span>
          {isExpanded && <span className="rtpv-pulse" />}
        </div>
        <div className="rtpv-stage-info">
          <span className="rtpv-stage-label rtpv-gen-label">Generar Respuesta</span>
          <span className="rtpv-stage-sub">Decodificación Autoregresiva Transformer</span>
        </div>
        <span className={`rtpv-chevron${isExpanded ? ' open' : ''}`} aria-hidden="true">▾</span>
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="rtpv-detail">
          <div className="rtpv-canvas-wrap rtpv-gen-canvas-wrap">
            <canvas ref={canvasRef} className="rtpv-canvas" />
            <div className="rtpv-canvas-label">Atención · Logits · Decodificación</div>
          </div>
          <div className="rtpv-detail-body">
            <div className="rtpv-detail-title rtpv-gen-title">
              Transformer — Atención Multi-Cabeza
            </div>
            <div className="rtpv-code-block">
              <div className="rtpv-math-line formula">
                <code>Attention(Q,K,V) = softmax(QKᵀ / √dₖ) · V</code>
              </div>
              <div className="rtpv-math-line">
                <code>P(wₙ | w₁…wₙ₋₁) = softmax(Wₒ · hₙ)</code>
              </div>
              <div className="rtpv-math-line">
                <code>next = argmax(logits) | sample(T=0.8)</code>
              </div>
            </div>
            <p className="rtpv-detail-desc">
              El modelo calcula pesos de atención entre todos los tokens del contexto, procesa la representación con N capas Transformer y proyecta a logits sobre el vocabulario (~100k). Softmax convierte logits en probabilidades; el token con mayor P (o uno muestreado con temperatura T) se añade al contexto y el proceso se repite hasta generar la respuesta completa.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── animRTGenerate canvas ──────────────────────────────────────
   Phase 1: Attention heatmap NxN (real tokens)
   Phase 2: Logit bar chart 3D isometric perspective
   Phase 3: Autoregressive token generation
─────────────────────────────────────────────────────────────── */
function animRTGenerate(
  canvas: HTMLCanvasElement,
  alive: { value: boolean },
  tokens: Token[],
  _inputText: string,
  registerTl: (tl: gsap.core.Timeline) => void,
) {
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const c = canvas.getContext('2d')!;
  if (!c) return;



  const parent = canvas.parentElement;
  const rect   = parent?.getBoundingClientRect();
  const dpr    = window.devicePixelRatio || 2;
  canvas.width  = (rect?.width  ?? 300) * dpr;
  canvas.height = (rect?.height ?? 160) * dpr;
  c.scale(dpr, dpr);
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;

  const cs = getComputedStyle(document.documentElement);
  const col = {
    amber:  'oklch(0.8 0.19 72)',
    amberD: 'oklch(0.62 0.16 68)',
    amberL: 'oklch(0.92 0.14 80)',
    b9: cs.getPropertyValue('--base-900').trim() || '#1a1a2e',
    b8: cs.getPropertyValue('--base-800').trim() || '#2a2a44',
    b7: cs.getPropertyValue('--base-700').trim() || '#444466',
    b5: cs.getPropertyValue('--base-500').trim() || '#7070a0',
    b4: cs.getPropertyValue('--base-400').trim() || '#8888aa',
    p4: cs.getPropertyValue('--primary-400').trim() || '#5ab589',
    s4: cs.getPropertyValue('--secondary-400').trim() || '#b570b5',
  };

  const N = Math.min(tokens.length || 4, 6);
  const toks = tokens.length > 0 ? tokens.slice(0, N) : Array.from({ length: N }, (_, i) => ({
    id: i * 1337, text: ['token', 'embed', 'PCA', 'mass', 'sim', 'edge'][i],
    mass: 5 + i, radius: 8, position: [0,0,0] as [number,number,number], velocity: [0,0,0] as [number,number,number], color: '#5ab589',
  }));

  /* Attention matrix: softmax over sin-seeded scores */
  const rawAttn: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => {
      const v = (Math.sin(toks[i].id * 0.071 + toks[j].id * 0.139 + i * 0.4 + j * 0.3) + 1.2) / 2.2;
      return v;
    })
  );
  // Row-softmax
  rawAttn.forEach(row => {
    const expRow = row.map(v => Math.exp(v * 3));
    const sum = expRow.reduce((a, b) => a + b, 0);
    row.forEach((_, j) => { row[j] = expRow[j] / sum; });
  });

  /* Logit distribution (seeded from token data) */
  const logitCount = 8;
  const rawLogits = Array.from({ length: logitCount }, (_, i) => {
    const t = toks[i % N];
    return Math.abs(Math.sin(t.id * 0.23 + i * 0.71)) * (t.mass / 10 + 0.3);
  });
  const expL = rawLogits.map(v => Math.exp(v * 4));
  const sumL = expL.reduce((a, b) => a + b, 0);
  const probs = expL.map(v => v / sumL);
  const topI  = probs.indexOf(Math.max(...probs));

  /* Generated token sequence: top-k by mass */
  const genTokens = [...toks]
    .sort((a, b) => b.mass - a.mass)
    .slice(0, Math.min(5, N))
    .map(t => t.text.slice(0, 6));

  /* Animation state */
  const a = { attn: 0, scan: 0, logit: 0, gen: 0, blink: 0 };
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
  tl.to(a, { attn: 1, duration: 0.9, ease: 'power2.out' });
  tl.to(a, { scan: N, duration: 1.4, ease: 'none' }, '+=0.2');
  tl.to(a, { logit: 1, duration: 0.9, ease: 'power3.out' }, '+=0.3');
  genTokens.forEach((_, gi) => {
    tl.to(a, { gen: gi + 0.01, blink: 1, duration: 0.25, ease: 'power2.inOut' }, `+=0.${gi === 0 ? '2' : '38'}`);
    tl.to(a, { gen: gi + 1, blink: 0, duration: 0.18 });
  });
  tl.to(a, { duration: 1.2 });
  tl.call(() => { a.attn = 0; a.scan = 0; a.logit = 0; a.gen = 0; a.blink = 0; });
  registerTl(tl);

  /* Heat color mapping */
  function heat(v: number): string {
    const L = 0.22 + v * 0.6;
    const C = 0.05 + v * 0.2;
    const H2 = 270 - v * 200; // blue → amber
    return `oklch(${L.toFixed(2)} ${C.toFixed(2)} ${H2.toFixed(0)})`;
  }

  function draw() {
    if (!alive.value) return;
    c.clearRect(0, 0, W, H);

    /* ── Phase 1: Attention heatmap (left 44%) ── */
    const hmX = 18;
    const hmY = H * 0.06;
    const hmW = W * 0.41;
    const hmH = H * 0.7;
    const cw  = hmW / N;
    const ch  = hmH / N;

    if (a.attn > 0) {
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const prog = Math.min(a.attn * (N * N + 2) - (i * N + j) * 0.6, 1);
          if (prog <= 0) continue;
          const v = rawAttn[i][j];
          c.save();
          c.globalAlpha = prog * 0.92;
          c.fillStyle = heat(v);
          const scanHighlight = a.scan > 0 && Math.abs(a.scan - i) < 1;
          if (scanHighlight) { c.shadowColor = col.amberL; c.shadowBlur = 14; }
          rr(c, hmX + j * cw + 1, hmY + i * ch + 1, cw - 2, ch - 2, 2);
          c.fill();
          c.restore();
        }
      }

      /* Axis labels */
      c.save();
      c.globalAlpha = a.attn * 0.55;
      c.font = `500 ${Math.min(6.5, cw * 0.55)}px "JetBrains Mono", monospace`;
      c.fillStyle = col.b4;
      toks.forEach((t, i) => {
        const lbl = t.text.slice(0, 4);
        c.textAlign = 'right';
        c.fillText(lbl, hmX - 3, hmY + i * ch + ch * 0.68);
        c.textAlign = 'center';
        c.save();
        c.translate(hmX + i * cw + cw / 2, hmY - 3);
        c.rotate(-0.72);
        c.fillText(lbl, 0, 0);
        c.restore();
      });
      c.restore();

      /* Scanner query row */
      if (a.scan > 0 && a.scan < N) {
        const sy = hmY + a.scan * ch;
        c.save(); c.globalAlpha = 0.85;
        c.strokeStyle = col.amber; c.lineWidth = 1.5;
        c.shadowColor = col.amber; c.shadowBlur = 10;
        c.beginPath(); c.moveTo(hmX, sy); c.lineTo(hmX + hmW, sy); c.stroke();
        c.restore();
      }

      c.save(); c.globalAlpha = a.attn * 0.5;
      c.font = '500 7px "DM Sans", sans-serif';
      c.fillStyle = col.amberD; c.textAlign = 'center';
      c.fillText('Pesos de Atención', hmX + hmW / 2, hmY + hmH + 13);
      c.restore();
    }

    /* ── Phase 2: Logit bars 3D isometric (middle 36%) ── */
    const barAreaX = hmX + hmW + 14;
    const barAreaW = W * 0.35;
    const barAreaH = H * 0.62;
    const barAreaY = H * 0.06;
    const bw2 = barAreaW / logitCount;
    const perspD = 7;
    const perspA = 0.38;

    if (a.logit > 0) {
      c.save();
      for (let b = 0; b < logitCount; b++) {
        const prog = Math.max(0, Math.min(1, a.logit * (logitCount + 2) - b));
        if (prog <= 0) continue;
        const bh = probs[b] * barAreaH * prog;
        const bx = barAreaX + b * bw2;
        const by = barAreaY + barAreaH - bh;
        const isTop = b === topI;

        /* Front face */
        c.globalAlpha = isTop ? 0.92 : 0.55;
        c.fillStyle = isTop ? col.amber : col.b7;
        if (isTop) { c.shadowColor = col.amber; c.shadowBlur = 14 * a.logit; }
        rr(c, bx + 2, by, bw2 - 4, bh, 2);
        c.fill(); c.shadowBlur = 0;

        /* Side face (3D right) */
        if (bh > 5) {
          c.globalAlpha = isTop ? 0.5 : 0.3;
          c.fillStyle = isTop ? col.amberD : col.b8;
          c.beginPath();
          c.moveTo(bx + bw2 - 2, by);
          c.lineTo(bx + bw2 - 2 + perspD, by - perspD * perspA);
          c.lineTo(bx + bw2 - 2 + perspD, by - perspD * perspA + bh);
          c.lineTo(bx + bw2 - 2, by + bh);
          c.closePath(); c.fill();
        }

        /* Top face */
        if (bh > 3) {
          c.globalAlpha = isTop ? 0.75 : 0.38;
          c.fillStyle = isTop ? col.amberL : col.b5;
          c.beginPath();
          c.moveTo(bx + 2, by);
          c.lineTo(bx + 2 + perspD, by - perspD * perspA);
          c.lineTo(bx + bw2 - 2 + perspD, by - perspD * perspA);
          c.lineTo(bx + bw2 - 2, by);
          c.closePath(); c.fill();
        }

        /* Probability label */
        if (prog > 0.6) {
          c.globalAlpha = (prog - 0.6) * 2.5 * (isTop ? 1 : 0.7);
          c.font = `${isTop ? '700' : '500'} ${isTop ? 7 : 6}px "JetBrains Mono", monospace`;
          c.fillStyle = isTop ? col.amberL : col.b4;
          c.textAlign = 'center';
          c.shadowBlur = 0;
          c.fillText(`${Math.round(probs[b] * 100)}%`, bx + bw2 / 2, by - 5);
          const lbl = (toks[b % N]?.text ?? `t${b}`).slice(0, 3);
          c.globalAlpha = (prog - 0.6) * 2.5 * 0.5;
          c.font = `500 5px "JetBrains Mono", monospace`;
          c.fillStyle = col.b4;
          c.fillText(lbl, bx + bw2 / 2, barAreaY + barAreaH + 10);
        }
      }
      c.restore();
      // Label
      c.save(); c.globalAlpha = a.logit * 0.5;
      c.font = '500 7px "DM Sans", sans-serif';
      c.fillStyle = col.amberD; c.textAlign = 'center';
      c.fillText('Distribución Softmax', barAreaX + barAreaW / 2, barAreaY - 4);
      c.restore();
    }

    /* ── Phase 3: Generated tokens (bottom strip) ── */
    if (a.gen > 0) {
      const genY = H * 0.87;
      c.save();
      c.globalAlpha = Math.min(a.logit * 3, 1) * 0.5;
      c.font = '500 7px "DM Sans", sans-serif';
      c.fillStyle = col.b5; c.textAlign = 'left';
      c.fillText('► Respuesta generada:', 8, genY - 13);
      c.restore();

      const tokColors = [col.amber, col.p4, col.s4, col.amberD, col.amberL];
      let drawX = 8;
      const maxStep = Math.floor(a.gen);

      for (let gi = 0; gi < maxStep && gi < genTokens.length; gi++) {
        const tok = genTokens[gi];
        const clr = tokColors[gi % tokColors.length];
        c.save();
        c.font = '600 8px "JetBrains Mono", monospace';
        const tw2 = c.measureText(tok).width + 12;
        c.globalAlpha = 0.92;
        c.fillStyle = col.b9; c.strokeStyle = clr; c.lineWidth = 1;
        c.shadowColor = clr; c.shadowBlur = 5;
        rr(c, drawX, genY - 10, tw2, 18, 4);
        c.fill(); c.stroke(); c.shadowBlur = 0;
        c.fillStyle = clr; c.textAlign = 'left';
        c.fillText(tok, drawX + 6, genY + 2);
        c.restore();
        drawX += tw2 + 4;
      }

      /* Blinking next-token cursor */
      if (Math.floor(a.gen) < genTokens.length && a.blink > 0) {
        c.save();
        c.globalAlpha = a.blink * 0.85;
        c.fillStyle = col.amber; c.shadowColor = col.amber; c.shadowBlur = 16 * a.blink;
        rr(c, drawX, genY - 10, 14, 18, 4); c.fill();
        // Particle burst
        for (let p = 0; p < 5; p++) {
          const angle = (p / 5) * Math.PI * 2 + Date.now() * 0.003;
          const pr = 10 * a.blink;
          c.globalAlpha = a.blink * 0.4;
          c.beginPath();
          c.arc(drawX + 7 + Math.cos(angle) * pr, genY - 1 + Math.sin(angle) * pr * 0.5, 1.5, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      }
    }

    requestAnimationFrame(draw);
  }
  draw();
}

