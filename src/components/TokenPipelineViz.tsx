import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';

/* ── Step content data ──────────────────────────────────────────────── */

interface StepData {
  id: string;
  num: string;
  label: string;
  badge: string;
  badgeType?: 'secondary';
  title: string;
  subtitle: string;
  desc: string;
  details: { icon: string; label: string; text: string }[];
  codeSnippet?: string;
}

const STEPS: StepData[] = [
  {
    id: 'generate',
    num: '01',
    label: 'Tokenizar',
    badge: 'Tokenización BPE',
    title: 'Texto → Tokens',
    subtitle: 'Byte-Pair Encoding',
    desc: 'El texto crudo se fragmenta en sub-palabras mediante BPE. El algoritmo busca iterativamente los pares de bytes más frecuentes y los fusiona, creando un vocabulario compacto. Cada fragmento resultante se mapea a un ID entero único dentro del vocabulario del modelo (~100k tokens).',
    details: [
      { icon: '✂', label: 'Fragmentación', text: '"Hola mundo" se divide en sub-palabras según frecuencia estadística' },
      { icon: '🔢', label: 'Mapeo a IDs', text: 'Cada token se busca en una tabla de ~100,000 entradas → ID entero' },
      { icon: '📊', label: 'Vocabulario', text: 'Construido offline sobre corpus masivos, balancea cobertura vs. eficiencia' },
      { icon: '⚡', label: 'Compresión', text: 'Palabras comunes = 1 token. Raras se descomponen en sub-tokens' },
    ],
    codeSnippet: 'encode("Hola mundo") → [2341, 9812]',
  },
  {
    id: 'send',
    num: '02',
    label: 'Embeber',
    badge: 'Embedding Model',
    title: 'Token ID → Vector 1536-d',
    subtitle: 'Representación Vectorial',
    desc: 'Los IDs se envían al modelo de embeddings (ej. text-embedding-3-small). Internamente, cada ID indexa una fila en una matriz de pesos entrenada. El resultado es un vector denso de 1536 dimensiones que codifica significado, contexto y relaciones semánticas.',
    details: [
      { icon: '📡', label: 'API Request', text: 'Batch de token IDs enviados al modelo via WebSocket' },
      { icon: '🧠', label: 'Lookup + Transform', text: 'El modelo busca el embedding base y lo contextualiza' },
      { icon: '📐', label: '1536 Dimensiones', text: 'Cada dim captura un aspecto: género, número, connotación...' },
      { icon: '📏', label: 'Normalización L2', text: 'Vector normalizado a longitud 1 para comparaciones angulares' },
    ],
    codeSnippet: 'ID:2341 → [0.021, -0.83, ..., 0.12]₁₅₃₆',
  },
  {
    id: 'process',
    num: '03',
    label: 'Reducir',
    badge: 'PCA + Similitud',
    badgeType: 'secondary',
    title: '1536-d → 3D + Grafo',
    subtitle: 'Proyección & Conexiones',
    desc: 'PCA (NIPALS) encuentra los 3 ejes de máxima varianza en el espacio de 1536 dimensiones y proyecta cada vector. Simultáneamente, la similitud coseno entre todos los pares genera una matriz N×N, de la cual se extraen masas semánticas y un MST via Kruskal.',
    details: [
      { icon: '📉', label: 'PCA Iterativo', text: 'NIPALS extrae componentes principales uno a uno' },
      { icon: '🎯', label: 'Proyección 3D', text: '1536 → 3 coordenadas (X, Y, Z) conservando varianza máxima' },
      { icon: '⚖', label: 'Masa Semántica', text: 'Σ similitudes de un token con todos los demás → peso/tamaño' },
      { icon: '🌳', label: 'MST (Kruskal)', text: 'Aristas de mínimo peso conectan tokens más afines sin ciclos' },
    ],
    codeSnippet: 'cos_sim(a, b) = a·b / (|a|·|b|)',
  },
  {
    id: 'logic',
    num: '04',
    label: 'Simular',
    badge: 'Física N-Body',
    badgeType: 'secondary',
    title: 'Galaxia Semántica',
    subtitle: 'Simulación Gravitacional',
    desc: 'Los tokens se convierten en cuerpos celestes con masa proporcional a su peso semántico. Un motor de física aplica gravedad (Barnes-Hut con Octree), fuerzas de resorte a lo largo del MST, repulsión de corto alcance, y colisiones elásticas. El resultado es una galaxia viva.',
    details: [
      { icon: '🌌', label: 'Barnes-Hut', text: 'Octree agrupa masas lejanas → O(n log n) vs O(n²)' },
      { icon: '🔗', label: 'Resortes MST', text: 'Ley de Hooke con K=0.12, reposo=16u a lo largo de aristas' },
      { icon: '⚡', label: 'Repulsión', text: 'Fuerza inversa-cuadrada < 20u evita colapso' },
      { icon: '💫', label: 'Colisiones', text: 'Respuesta elástica con restitución e=0.65' },
    ],
    codeSnippet: 'F = G·m₁·m₂/r² + K·(d-d₀) + ...',
  },
];

/* ── Component ──────────────────────────────────────────────────────── */

export function TokenPipelineViz({ onClose }: { onClose: () => void }) {
  const [activeStep, setActiveStep] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const stepInfoRefs = useRef<(HTMLDivElement | null)[]>([]);
  // alive flag per animation - solves the RAF cleanup race condition
  const aliveRef = useRef<{ value: boolean }>({ value: false });
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  // Entrance animation
  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.from('.pl-header', { y: -30, autoAlpha: 0, duration: 0.5, ease: 'power3.out' });
      tl.from('.pl-nav-item', {
        y: 20, autoAlpha: 0, duration: 0.35, stagger: 0.07, ease: 'back.out(1.4)',
      }, '-=0.2');
      tl.from('.pl-viewport', {
        scaleY: 0.92, autoAlpha: 0, duration: 0.5, ease: 'power3.out', transformOrigin: 'top center',
      }, '-=0.15');
    }, containerRef);
    return () => ctx.revert();
  }, []);

  // Step transitions — clean kill via alive flag
  useEffect(() => {
    // Kill previous
    aliveRef.current.value = false;
    tlRef.current?.kill();
    const alive = { value: true };
    aliveRef.current = alive;

    // Animate step info text
    const infoEl = stepInfoRefs.current[activeStep];
    if (infoEl) {
      gsap.fromTo(infoEl, { autoAlpha: 0, x: 30 }, {
        autoAlpha: 1, x: 0, duration: 0.5, ease: 'power3.out',
      });
      gsap.from(infoEl.querySelectorAll('.pl-detail-row'), {
        autoAlpha: 0, x: 15, duration: 0.3, stagger: 0.06, ease: 'power2.out', delay: 0.2,
      });
      gsap.from(infoEl.querySelectorAll('.pl-code-block'), {
        autoAlpha: 0, y: 10, duration: 0.35, ease: 'power2.out', delay: 0.5,
      });
    }

    // Animate canvas
    const canvas = canvasRefs.current[activeStep];
    if (canvas) {
      runCanvasAnimation(activeStep, canvas, alive, (tl) => { tlRef.current = tl; });
    }

    return () => { alive.value = false; tlRef.current?.kill(); };
  }, [activeStep]);

  return (
    <div className="pl-container" ref={containerRef}>
      {/* Background grain */}
      <div className="pl-grain" />

      <div className="pl-header">
        <div className="pl-header-left">
          <div className="pl-header-tag">Visualización Interactiva</div>
          <h2 className="pl-header-title">
            Pipeline de <span className="pl-gradient-text">Tokens</span>
          </h2>
        </div>
        <div className="pl-header-right">
          <div className="pl-step-counter">
            <span className="pl-counter-current">{String(activeStep + 1).padStart(2, '0')}</span>
            <span className="pl-counter-sep">/</span>
            <span className="pl-counter-total">{String(STEPS.length).padStart(2, '0')}</span>
          </div>
          <button className="pl-close" onClick={onClose} aria-label="Cerrar">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="pl-nav">
        {STEPS.map((step, i) => (
          <React.Fragment key={step.id}>
            {i > 0 && (
              <div className={`pl-connector${i <= activeStep ? ' active' : ''}`}>
                <div className="pl-connector-line">
                  <div className="pl-connector-fill" />
                </div>
              </div>
            )}
            <button
              className={`pl-nav-item${i === activeStep ? ' active' : ''}${i < activeStep ? ' done' : ''}`}
              onClick={() => setActiveStep(i)}
            >
              <span className="pl-nav-num">{i < activeStep ? '✓' : step.num}</span>
              <span className="pl-nav-label">{step.label}</span>
              {i === activeStep && <span className="pl-nav-indicator" />}
            </button>
          </React.Fragment>
        ))}
      </nav>

      {/* Viewport */}
      <div className="pl-viewport">
        {STEPS.map((step, i) => (
          <div
            key={step.id}
            className={`pl-step${i === activeStep ? ' active' : ''}`}
            style={{ visibility: i === activeStep ? 'visible' : 'hidden' }}
          >
            {/* Canvas visual */}
            <div className="pl-canvas-wrap">
              <canvas
                ref={(el) => { canvasRefs.current[i] = el; }}
                className="pl-canvas"
              />
              <div className="pl-canvas-label">{step.subtitle}</div>
            </div>

            {/* Info panel */}
            <div
              className="pl-info"
              ref={(el) => { stepInfoRefs.current[i] = el; }}
            >
              <div className={`pl-badge${step.badgeType === 'secondary' ? ' sec' : ''}`}>
                <span className="pl-badge-dot" />
                {step.badge}
              </div>

              <h3 className="pl-step-title">{step.title}</h3>
              <p className="pl-step-desc">{step.desc}</p>

              <div className="pl-details">
                {step.details.map((d, di) => (
                  <div key={di} className="pl-detail-row">
                    <div className="pl-detail-icon-wrap">
                      <span className="pl-detail-icon">{d.icon}</span>
                    </div>
                    <div className="pl-detail-content">
                      <span className="pl-detail-label">{d.label}</span>
                      <span className="pl-detail-text">{d.text}</span>
                    </div>
                  </div>
                ))}
              </div>

              {step.codeSnippet && (
                <div className="pl-code-block">
                  <code>{step.codeSnippet}</code>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom nav arrows */}
      <div className="pl-bottom-nav">
        <button
          className="pl-arrow-btn"
          disabled={activeStep === 0}
          onClick={() => setActiveStep(s => s - 1)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Anterior
        </button>
        <div className="pl-dots">
          {STEPS.map((_, i) => (
            <button
              key={i}
              className={`pl-dot${i === activeStep ? ' active' : ''}${i < activeStep ? ' done' : ''}`}
              onClick={() => setActiveStep(i)}
              aria-label={`Paso ${i + 1}`}
            />
          ))}
        </div>
        <button
          className="pl-arrow-btn"
          disabled={activeStep === STEPS.length - 1}
          onClick={() => setActiveStep(s => s + 1)}
        >
          Siguiente
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

/* ── Canvas animations ──────────────────────────────────────────────── */

function runCanvasAnimation(
  stepIdx: number,
  canvas: HTMLCanvasElement,
  alive: { value: boolean },
  registerTl: (tl: gsap.core.Timeline) => void,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const parent = canvas.parentElement;
  const rect = parent?.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 2;
  canvas.width = (rect?.width ?? 500) * dpr;
  canvas.height = (rect?.height ?? 250) * dpr;
  ctx.scale(dpr, dpr);
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;

  // Resolve CSS colors once
  const cs = getComputedStyle(document.documentElement);
  const col = {
    p3: cs.getPropertyValue('--primary-300').trim() || '#8dd4a8',
    p4: cs.getPropertyValue('--primary-400').trim() || '#5ab589',
    p5: cs.getPropertyValue('--primary-500').trim() || '#4a9a73',
    p7: cs.getPropertyValue('--primary-700').trim() || '#3a7a56',
    s3: cs.getPropertyValue('--secondary-300').trim() || '#c48ac4',
    s4: cs.getPropertyValue('--secondary-400').trim() || '#b570b5',
    b3: cs.getPropertyValue('--base-300').trim() || '#aaaacc',
    b4: cs.getPropertyValue('--base-400').trim() || '#8888aa',
    b5: cs.getPropertyValue('--base-500').trim() || '#7070a0',
    b7: cs.getPropertyValue('--base-700').trim() || '#444466',
    b8: cs.getPropertyValue('--base-800').trim() || '#2a2a44',
    b9: cs.getPropertyValue('--base-900').trim() || '#1a1a2e',
    tp: cs.getPropertyValue('--text-primary').trim() || '#eaeaf8',
    tm: cs.getPropertyValue('--text-muted').trim() || '#8888aa',
    warn: 'oklch(0.75 0.12 70)',
  };

  const animators = [animateTokenize, animateEmbed, animateProcess, animateSimulate];
  animators[stepIdx]?.(ctx, W, H, col, alive, registerTl);
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function drawArrow(c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, alpha = 1) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLen = 6;
  c.save();
  c.globalAlpha = alpha;
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  c.setLineDash([3, 3]);
  c.beginPath();
  c.moveTo(x1, y1);
  c.lineTo(x2, y2);
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(x2, y2);
  c.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
  c.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
  c.closePath();
  c.fill();
  c.restore();
}

type Colors = Record<string, string>;

/* ── Step 1: Tokenize ───────────────────────────────────────────────── */

function animateTokenize(
  c: CanvasRenderingContext2D, w: number, h: number,
  col: Colors, alive: { value: boolean }, registerTl: (tl: gsap.core.Timeline) => void,
) {
  const input = 'Hola mundo cruel';
  const chars = input.split('');
  const tokens = ['Hola', ' mundo', ' cruel'];
  const tokenColors = [col.p4, col.s4, col.p3];
  const tokenIds = [2341, 9812, 15403];

  // Animation state
  const a = { charReveal: 0, bpeScan: -1, split: 0, idFade: 0, tableFade: 0, glow: 0 };

  const tl = gsap.timeline({ repeat: -1, repeatDelay: 2 });
  tl.to(a, { charReveal: 1, duration: 0.8, ease: 'power1.out' });
  tl.to(a, { bpeScan: chars.length, duration: 1.4, ease: 'none' }, '+=0.3');
  tl.to(a, { split: 1, duration: 1, ease: 'power3.inOut' }, '+=0.2');
  tl.to(a, { idFade: 1, duration: 0.6, ease: 'power2.out' }, '+=0.2');
  tl.to(a, { tableFade: 1, duration: 0.5, ease: 'power2.out' }, '+=0.1');
  tl.to(a, { glow: 1, duration: 0.4, ease: 'power2.in' }, '+=0.1');
  tl.to(a, { glow: 0, duration: 0.4, ease: 'power2.out' });
  tl.to(a, { duration: 1.5 }); // hold
  tl.to(a, { charReveal: 0, bpeScan: -1, split: 0, idFade: 0, tableFade: 0, duration: 0.5 });
  registerTl(tl);

  function draw() {
    if (!alive.value) return;
    c.clearRect(0, 0, w, h);

    const cx = w / 2;
    const rowY = h * 0.15;

    // Phase 1: Character reveal
    c.font = '600 13px "JetBrains Mono", monospace';
    c.textAlign = 'center';
    const charW = 11;
    const totalCharsW = chars.length * charW;
    const charStartX = cx - totalCharsW / 2;

    chars.forEach((ch, i) => {
      const revealedCount = Math.floor(a.charReveal * chars.length);
      const charAlpha = i <= revealedCount ? 1 : 0;
      if (charAlpha <= 0) return;

      const x = charStartX + i * charW + charW / 2;
      const isScanned = a.bpeScan >= i && a.bpeScan >= 0;

      // Scan highlight
      if (isScanned && a.split < 0.5) {
        c.save();
        c.globalAlpha = 0.15;
        c.fillStyle = col.p4;
        c.fillRect(x - charW / 2, rowY - 12, charW, 18);
        c.restore();
      }

      // BPE scanner line
      if (a.bpeScan >= 0 && Math.abs(a.bpeScan - i) < 1 && a.split < 0.3) {
        c.save();
        c.strokeStyle = col.p4;
        c.lineWidth = 2;
        c.shadowColor = col.p4;
        c.shadowBlur = 6;
        c.beginPath();
        c.moveTo(x, rowY - 14);
        c.lineTo(x, rowY + 10);
        c.stroke();
        c.restore();
      }

      c.save();
      c.globalAlpha = charAlpha;
      c.fillStyle = isScanned && a.split < 0.5 ? col.p3 : col.tp;
      c.fillText(ch, x, rowY);
      c.restore();
    });

    // Label
    if (a.charReveal > 0.5 && a.bpeScan < 0) {
      c.save();
      c.globalAlpha = Math.min((a.charReveal - 0.5) * 4, 1) * 0.6;
      c.font = '500 9px "DM Sans", sans-serif';
      c.fillStyle = col.b5;
      c.textAlign = 'center';
      c.fillText('Texto crudo (string)', cx, rowY + 20);
      c.restore();
    }

    // BPE scanning label
    if (a.bpeScan >= 0 && a.split < 0.5) {
      c.save();
      c.globalAlpha = 0.7;
      c.font = '500 9px "DM Sans", sans-serif';
      c.fillStyle = col.p5;
      c.textAlign = 'center';
      c.fillText('⟳ Escaneando pares frecuentes (BPE merge)...', cx, rowY + 22);
      c.restore();
    }

    // Phase 2: Split into tokens
    if (a.split > 0) {
      const splitY = rowY + 52;
      drawArrow(c, cx, rowY + 12, cx, splitY - 16, col.b5, Math.min(a.split * 3, 1));

      c.font = '600 13px "JetBrains Mono", monospace';
      const tokenWidths = tokens.map(t => c.measureText(t).width + 28);
      const totalTokensW = tokenWidths.reduce((s, tw) => s + tw, 0) + (tokens.length - 1) * 10;
      let tokenX = cx - totalTokensW / 2;

      tokens.forEach((token, i) => {
        const tw = tokenWidths[i];
        const elAlpha = Math.min(a.split * 4 - i * 0.6, 1);
        if (elAlpha <= 0) { tokenX += tw + 10; return; }

        const bx = tokenX;
        const by = splitY;
        const tokenCx = bx + tw / 2;

        c.save();
        c.globalAlpha = Math.max(0, elAlpha);

        // Glow effect
        if (a.glow > 0) {
          c.shadowColor = tokenColors[i];
          c.shadowBlur = 12 * a.glow;
        }

        // Box
        c.fillStyle = col.b9;
        c.strokeStyle = tokenColors[i];
        c.lineWidth = 1.5;
        rr(c, bx, by - 15, tw, 30, 7);
        c.fill();
        c.stroke();

        // Color accent stripe top
        c.fillStyle = tokenColors[i];
        c.globalAlpha = Math.max(0, elAlpha) * 0.4;
        rr(c, bx, by - 15, tw, 3, 7);
        c.fill();
        c.globalAlpha = Math.max(0, elAlpha);

        // Token text
        c.shadowBlur = 0;
        c.font = '600 13px "JetBrains Mono", monospace';
        c.fillStyle = tokenColors[i];
        c.textAlign = 'center';
        c.fillText(token.trim() || '⎵' + token.slice(1), tokenCx, by + 4);

        // ID label
        if (a.idFade > 0) {
          const idAlpha = Math.min(a.idFade * 3 - i * 0.5, 1);
          if (idAlpha > 0) {
            c.globalAlpha = Math.max(0, idAlpha);
            c.font = '500 9px "JetBrains Mono", monospace';
            c.fillStyle = col.b4;
            c.fillText(`ID: ${tokenIds[i]}`, tokenCx, by + 26);

            // Arrow to vocab lookup
            if (a.tableFade > 0) {
              const lookupY = by + 54;
              c.globalAlpha = Math.max(0, idAlpha) * a.tableFade;
              drawArrow(c, tokenCx, by + 32, tokenCx, lookupY - 4, col.b7, a.tableFade);

              // Mini vocab box
              c.fillStyle = col.b9;
              c.strokeStyle = col.b7;
              c.lineWidth = 1;
              rr(c, tokenCx - 28, lookupY, 56, 20, 4);
              c.fill();
              c.stroke();
              c.font = '500 8px "JetBrains Mono", monospace';
              c.fillStyle = col.b4;
              c.textAlign = 'center';
              c.fillText(`vocab[${tokenIds[i]}]`, tokenCx, lookupY + 13);
            }
          }
        }

        c.restore();
        tokenX += tw + 10;
      });

      // BPE result label
      if (a.split > 0.8) {
        c.save();
        c.globalAlpha = (a.split - 0.8) * 5 * 0.5;
        c.font = '500 9px "DM Sans", sans-serif';
        c.fillStyle = col.b5;
        c.textAlign = 'center';
        c.fillText(`${tokens.length} tokens extraídos via BPE`, cx, splitY - 26);
        c.restore();
      }
    }

    requestAnimationFrame(draw);
  }
  draw();
}

/* ── Step 2: Embed ──────────────────────────────────────────────────── */

function animateEmbed(
  c: CanvasRenderingContext2D, w: number, h: number,
  col: Colors, alive: { value: boolean }, registerTl: (tl: gsap.core.Timeline) => void,
) {
  const tokens = [
    { text: 'Hola', id: 2341, color: col.p4 },
    { text: 'mundo', id: 9812, color: col.s4 },
    { text: 'cruel', id: 15403, color: col.p3 },
  ];

  const state = tokens.map(() => ({ packet: 0, processing: 0, vector: 0, norm: 0 }));

  const tl = gsap.timeline({ repeat: -1, repeatDelay: 2.5 });
  state.forEach((s, i) => {
    const offset = i * 0.6;
    tl.to(s, { packet: 1, duration: 0.5, ease: 'power2.in' }, offset);
    tl.to(s, { processing: 1, duration: 0.4, ease: 'power2.out' }, offset + 0.4);
    tl.to(s, { vector: 1, duration: 0.7, ease: 'power2.out' }, offset + 0.7);
    tl.to(s, { norm: 1, duration: 0.4, ease: 'power2.out' }, offset + 1.2);
  });
  tl.to({}, { duration: 2 });
  tl.call(() => state.forEach(s => { s.packet = 0; s.processing = 0; s.vector = 0; s.norm = 0; }));
  registerTl(tl);

  function draw() {
    if (!alive.value) return;
    c.clearRect(0, 0, w, h);

    const leftX = w * 0.12;
    const modelX = w * 0.38;
    const modelW = 60;
    const rightStartX = modelX + modelW / 2 + 20;
    const rowSpacing = Math.min(44, (h - 40) / 3);
    const baseY = (h - rowSpacing * 2) / 2;

    // Model block
    c.fillStyle = col.b9;
    c.strokeStyle = col.p7;
    c.lineWidth = 1.5;
    rr(c, modelX - modelW / 2, baseY - 24, modelW, rowSpacing * 2 + 48, 10);
    c.fill();
    c.stroke();

    // Model inner glow
    const anyProcessing = state.some(s => s.processing > 0 && s.vector < 1);
    if (anyProcessing) {
      c.save();
      c.globalAlpha = 0.08;
      const grad = c.createRadialGradient(modelX, h / 2, 0, modelX, h / 2, 40);
      grad.addColorStop(0, col.p4);
      grad.addColorStop(1, 'transparent');
      c.fillStyle = grad;
      c.fillRect(modelX - 40, baseY - 30, 80, rowSpacing * 2 + 60);
      c.restore();
    }

    c.font = '600 9px "DM Sans", sans-serif';
    c.fillStyle = col.p4;
    c.textAlign = 'center';
    c.fillText('EMBEDDING', modelX, baseY - 8);
    c.font = '500 8px "DM Sans", sans-serif';
    c.fillStyle = col.b5;
    c.fillText('MODEL', modelX, baseY + 4);

    tokens.forEach((tok, i) => {
      const y = baseY + i * rowSpacing;
      const s = state[i];

      // Source token chip
      c.save();
      c.font = '600 11px "JetBrains Mono", monospace';
      const tw = c.measureText(tok.text).width + 20;
      c.fillStyle = col.b9;
      c.strokeStyle = tok.color;
      c.lineWidth = 1;
      rr(c, leftX - tw / 2, y - 13, tw, 26, 6);
      c.fill();
      c.stroke();
      c.fillStyle = tok.color;
      c.textAlign = 'center';
      c.fillText(tok.text, leftX, y + 3);

      // ID underneath
      c.font = '500 8px "JetBrains Mono", monospace';
      c.fillStyle = col.b5;
      c.fillText(`#${tok.id}`, leftX, y + 16);
      c.restore();

      // Flying packet
      if (s.packet > 0 && s.packet < 1) {
        const startPx = leftX + tw / 2 + 6;
        const endPx = modelX - modelW / 2 - 4;
        const px = startPx + (endPx - startPx) * s.packet;

        c.save();
        c.fillStyle = tok.color;
        c.shadowColor = tok.color;
        c.shadowBlur = 10;
        c.beginPath();
        c.arc(px, y, 3.5, 0, Math.PI * 2);
        c.fill();

        // Trail
        c.globalAlpha = 0.3;
        c.shadowBlur = 0;
        c.beginPath();
        c.moveTo(px, y);
        c.lineTo(px - 15, y);
        c.strokeStyle = tok.color;
        c.lineWidth = 2;
        c.stroke();
        c.restore();
      }

      // Processing sparkle
      if (s.processing > 0 && s.vector < 0.5) {
        c.save();
        c.globalAlpha = 0.6 * (1 - s.vector * 2);
        const t = Date.now() / 200 + i;
        for (let sp = 0; sp < 4; sp++) {
          const sx = modelX + Math.cos(t + sp * 1.5) * 15;
          const sy = y + Math.sin(t + sp * 1.5) * 10;
          c.fillStyle = tok.color;
          c.beginPath();
          c.arc(sx, sy, 1.5, 0, Math.PI * 2);
          c.fill();
        }
        c.restore();
      }

      // Output vector bars
      if (s.vector > 0) {
        const barCount = 12;
        const barTotalW = Math.min(w * 0.42, w - rightStartX - 30);
        const barW = barTotalW / barCount;

        c.save();
        for (let b = 0; b < barCount; b++) {
          const barProg = Math.max(0, Math.min(1, s.vector * (barCount + 2) - b));
          if (barProg <= 0) continue;

          const bx = rightStartX + b * barW;
          const val = Math.sin(b * 1.1 + i * 2.3) * 0.8;
          const barH = Math.abs(val) * 12 + 2;
          const isNorm = s.norm > 0;

          c.globalAlpha = barProg * (isNorm ? 0.6 + s.norm * 0.4 : 0.7);
          c.fillStyle = val > 0 ? tok.color : col.s3;

          // Glow on normalize
          if (isNorm) {
            c.shadowColor = tok.color;
            c.shadowBlur = 4 * s.norm;
          }

          rr(c, bx + 1, y - barH / 2, barW - 2, barH, 2);
          c.fill();
          c.shadowBlur = 0;
        }

        // Dimension label
        c.globalAlpha = s.vector;
        c.font = '500 7px "JetBrains Mono", monospace';
        c.fillStyle = col.b5;
        c.textAlign = 'right';
        c.fillText('1536-d', w - 10, y + 3);

        // Norm label
        if (s.norm > 0.5) {
          c.globalAlpha = (s.norm - 0.5) * 2;
          c.fillStyle = col.p5;
          c.textAlign = 'right';
          c.fillText('‖v‖=1', w - 10, y + 13);
        }

        c.restore();
      }
    });

    requestAnimationFrame(draw);
  }
  draw();
}

/* ── Step 3: Process ────────────────────────────────────────────────── */

function animateProcess(
  c: CanvasRenderingContext2D, w: number, h: number,
  col: Colors, alive: { value: boolean }, registerTl: (tl: gsap.core.Timeline) => void,
) {
  const points = [
    { ox: 0.3, oy: 0.3, r: 8, c: col.p4 },
    { ox: 0.7, oy: 0.2, r: 12, c: col.s4 },
    { ox: 0.5, oy: 0.65, r: 6, c: col.p3 },
    { ox: 0.2, oy: 0.75, r: 10, c: col.s3 },
    { ox: 0.85, oy: 0.55, r: 7, c: col.p4 },
  ];
  const edges = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 3]];

  const a = { grid: 1, compress: 0, project: 0, rotate: 0, sim: 0, edgeDraw: 0 };

  const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });
  tl.to(a, { grid: 0, compress: 1, duration: 1.5, ease: 'power2.inOut' });
  tl.to(a, { project: 1, duration: 1.2, ease: 'power3.out' });
  tl.to(a, { rotate: Math.PI * 2, duration: 5, ease: 'none' }, '<');
  tl.to(a, { sim: 1, duration: 0.8, ease: 'power2.out' }, '-=4');
  tl.to(a, { edgeDraw: 1, duration: 1, ease: 'power2.out' }, '-=3');
  tl.to(a, { duration: 1.5 });
  tl.to(a, { grid: 1, compress: 0, project: 0, rotate: 0, sim: 0, edgeDraw: 0, duration: 0.6 });
  registerTl(tl);

  function draw() {
    if (!alive.value) return;
    c.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const spread = Math.min(w, h) * 0.32;

    // Grid phase
    if (a.grid > 0) {
      c.save();
      c.globalAlpha = a.grid * 0.2;
      c.strokeStyle = col.b7;
      c.lineWidth = 0.5;
      for (let i = 0; i < 10; i++) {
        const gy = h * 0.1 + (h * 0.8 / 10) * i;
        c.beginPath(); c.moveTo(w * 0.05, gy); c.lineTo(w * 0.95, gy); c.stroke();
      }
      for (let i = 0; i < 14; i++) {
        const gx = w * 0.05 + (w * 0.9 / 14) * i;
        c.beginPath(); c.moveTo(gx, h * 0.1); c.lineTo(gx, h * 0.9); c.stroke();
      }
      c.restore();

      // Grid label
      c.save();
      c.globalAlpha = a.grid * 0.5;
      c.font = '500 9px "DM Sans", sans-serif';
      c.fillStyle = col.b5;
      c.textAlign = 'center';
      c.fillText('Espacio 1536-dimensional', cx, h - 8);
      c.restore();
    }

    // Axes for 3D phase
    if (a.project > 0) {
      c.save();
      c.globalAlpha = a.project * 0.5;
      c.strokeStyle = col.b7;
      c.lineWidth = 1;
      // X
      c.beginPath(); c.moveTo(cx - spread, cy); c.lineTo(cx + spread, cy); c.stroke();
      // Y
      c.beginPath(); c.moveTo(cx, cy - spread); c.lineTo(cx, cy + spread); c.stroke();
      // Z (isometric)
      c.globalAlpha = a.project * 0.25;
      c.beginPath();
      c.moveTo(cx - spread * 0.5, cy + spread * 0.35);
      c.lineTo(cx + spread * 0.5, cy - spread * 0.35);
      c.stroke();

      c.globalAlpha = a.project * 0.5;
      c.font = '600 8px "JetBrains Mono", monospace';
      c.fillStyle = col.b5;
      c.textAlign = 'center';
      c.fillText('X', cx + spread + 10, cy + 4);
      c.fillText('Y', cx, cy - spread - 6);
      c.fillText('Z', cx + spread * 0.5 + 8, cy - spread * 0.35 - 4);

      c.fillText('PCA → 3D', cx, h - 8);
      c.restore();
    }

    // Compute positions
    const positions = points.map((p, i) => {
      if (a.project > 0) {
        const angle = (i / points.length) * Math.PI * 2 + a.rotate;
        const radius = spread * (0.25 + p.ox * 0.45);
        const zOff = Math.sin(angle) * spread * 0.25;
        const px = cx + Math.cos(angle) * radius * a.project;
        const py = cy + (p.oy - 0.5) * spread * a.project + zOff * 0.3 * a.project;
        return { x: px, y: py, z: zOff };
      }
      const gridX = w * 0.05 + p.ox * w * 0.9;
      const gridY = h * 0.1 + p.oy * h * 0.8;
      const compressT = a.compress;
      return {
        x: gridX + (cx - gridX) * compressT * 0.6,
        y: gridY + (cy - gridY) * compressT * 0.6,
        z: 0,
      };
    });

    // Sort by z for depth
    const sorted = positions.map((pos, i) => ({ ...pos, i })).sort((a, b) => a.z - b.z);

    // Draw edges
    if (a.edgeDraw > 0) {
      c.save();
      c.globalAlpha = a.edgeDraw * 0.45;
      c.lineWidth = 1;
      edges.forEach(([ai, bi], ei) => {
        const edgeProg = Math.min(a.edgeDraw * edges.length - ei, 1);
        if (edgeProg <= 0) return;
        c.globalAlpha = edgeProg * 0.45;
        c.strokeStyle = col.b5;
        const pa = positions[ai], pb = positions[bi];
        const ex = pa.x + (pb.x - pa.x) * edgeProg;
        const ey = pa.y + (pb.y - pa.y) * edgeProg;
        c.beginPath(); c.moveTo(pa.x, pa.y); c.lineTo(ex, ey); c.stroke();
      });
      c.restore();
    }

    // Draw points
    sorted.forEach(({ x, y, z, i }) => {
      const p = points[i];
      const depth = a.project > 0 ? (z + spread) / (spread * 2) : 0.5;
      const sizeM = a.project > 0 ? (0.55 + depth * 0.45) : (1 - a.compress * 0.3);
      const size = p.r * sizeM;

      c.save();
      c.globalAlpha = 0.6 + depth * 0.4;
      c.beginPath();
      c.arc(x, y, size, 0, Math.PI * 2);
      const grad = c.createRadialGradient(x - size * 0.3, y - size * 0.3, 0, x, y, size);
      grad.addColorStop(0, p.c);
      grad.addColorStop(1, col.b9);
      c.fillStyle = grad;
      c.shadowColor = p.c;
      c.shadowBlur = 8 + a.sim * 6;
      c.fill();

      // Mass label
      if (a.sim > 0.5) {
        c.shadowBlur = 0;
        c.globalAlpha = (a.sim - 0.5) * 2 * 0.6;
        c.font = '500 7px "JetBrains Mono", monospace';
        c.fillStyle = col.b4;
        c.textAlign = 'center';
        c.fillText(`m=${(p.r / 4).toFixed(1)}`, x, y + size + 10);
      }
      c.restore();
    });

    requestAnimationFrame(draw);
  }
  draw();
}

/* ── Step 4: Simulate ───────────────────────────────────────────────── */

function animateSimulate(
  c: CanvasRenderingContext2D, w: number, h: number,
  col: Colors, alive: { value: boolean }, registerTl: (tl: gsap.core.Timeline) => void,
) {
  const cx = w / 2, cy = h / 2;
  const bodies = Array.from({ length: 8 }, (_, i) => ({
    x: cx + (Math.random() - 0.5) * w * 0.6,
    y: cy + (Math.random() - 0.5) * h * 0.6,
    vx: 0, vy: 0,
    mass: 3 + Math.random() * 9,
    color: [col.p4, col.s4, col.p3, col.s3][i % 4],
    label: ['Hola', 'mundo', 'cruel', 'token', 'embed', 'PCA', 'sim', 'MST'][i],
  }));
  const mstE = [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[0,5],[2,6]];
  const f = { gravity: 0, springs: 0, repulsion: 0, octreeVis: 0 };

  const tl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
  tl.to(f, { gravity: 1, duration: 0.8, ease: 'power2.out' });
  tl.to(f, { springs: 1, duration: 0.7, ease: 'power2.out' }, '+=0.2');
  tl.to(f, { repulsion: 1, duration: 0.5, ease: 'power2.out' }, '+=0.2');
  tl.to(f, { octreeVis: 0.6, duration: 0.5, ease: 'power2.out' }, '+=0.5');
  tl.to(f, { duration: 5 });
  tl.to(f, { octreeVis: 0, duration: 0.3 });
  tl.to(f, { gravity: 0, springs: 0, repulsion: 0, duration: 0.4 });
  registerTl(tl);

  function draw() {
    if (!alive.value) return;
    c.clearRect(0, 0, w, h);

    // Physics tick
    bodies.forEach((b, i) => {
      if (f.gravity > 0) {
        const dx = cx - b.x, dy = cy - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 5;
        b.vx += (dx / dist) * 0.06 * f.gravity;
        b.vy += (dy / dist) * 0.06 * f.gravity;
      }
      if (f.springs > 0) {
        mstE.forEach(([a, bi]) => {
          if (a !== i && bi !== i) return;
          const o = bodies[a === i ? bi : a];
          const dx = o.x - b.x, dy = o.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 1;
          const k = 0.008 * f.springs;
          b.vx += (dx / dist) * (dist - 45) * k;
          b.vy += (dy / dist) * (dist - 45) * k;
        });
      }
      if (f.repulsion > 0) {
        bodies.forEach((o, j) => {
          if (i === j) return;
          const dx = b.x - o.x, dy = b.y - o.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 5;
          if (dist < 55) {
            const force = (55 - dist) * 0.015 * f.repulsion;
            b.vx += (dx / dist) * force;
            b.vy += (dy / dist) * force;
          }
        });
      }
      b.vx *= 0.965; b.vy *= 0.965;
      b.x += b.vx; b.y += b.vy;
      b.x = Math.max(15, Math.min(w - 15, b.x));
      b.y = Math.max(15, Math.min(h - 15, b.y));
    });

    // Octree visualization
    if (f.octreeVis > 0) {
      c.save();
      c.globalAlpha = f.octreeVis * 0.15;
      c.strokeStyle = col.p7;
      c.lineWidth = 0.5;
      // Simple quadtree-like subdivisions
      [0.5, 0.25, 0.75].forEach(fx => {
        c.beginPath(); c.moveTo(w * fx, 0); c.lineTo(w * fx, h); c.stroke();
      });
      [0.5, 0.25, 0.75].forEach(fy => {
        c.beginPath(); c.moveTo(0, h * fy); c.lineTo(w, h * fy); c.stroke();
      });
      c.restore();
    }

    // MST edges
    if (f.springs > 0) {
      c.save();
      mstE.forEach(([a, b]) => {
        c.globalAlpha = f.springs * 0.35;
        c.strokeStyle = col.b5;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(bodies[a].x, bodies[a].y);
        c.lineTo(bodies[b].x, bodies[b].y);
        c.stroke();

        // Spring visualization
        if (f.springs > 0.5) {
          const mx = (bodies[a].x + bodies[b].x) / 2;
          const my = (bodies[a].y + bodies[b].y) / 2;
          c.globalAlpha = (f.springs - 0.5) * 0.4;
          c.fillStyle = col.b5;
          c.beginPath();
          c.arc(mx, my, 1.5, 0, Math.PI * 2);
          c.fill();
        }
      });
      c.restore();
    }

    // Bodies
    bodies.forEach(b => {
      c.save();
      c.beginPath();
      c.arc(b.x, b.y, b.mass, 0, Math.PI * 2);
      const grad = c.createRadialGradient(
        b.x - b.mass * 0.3, b.y - b.mass * 0.3, 0, b.x, b.y, b.mass
      );
      grad.addColorStop(0, b.color);
      grad.addColorStop(1, col.b9);
      c.fillStyle = grad;
      c.shadowColor = b.color;
      c.shadowBlur = 10;
      c.fill();

      // Label
      c.shadowBlur = 0;
      c.globalAlpha = 0.5;
      c.font = '500 7px "DM Sans", sans-serif';
      c.fillStyle = col.b3;
      c.textAlign = 'center';
      c.fillText(b.label, b.x, b.y + b.mass + 10);
      c.restore();
    });

    // Force labels at bottom
    const lblY = h - 10;
    c.font = '600 8px "DM Sans", sans-serif';
    c.textAlign = 'center';
    const forces = [
      { label: 'Gravedad', val: f.gravity, color: col.p4, x: w * 0.18 },
      { label: 'Resortes', val: f.springs, color: col.b4, x: w * 0.38 },
      { label: 'Repulsión', val: f.repulsion, color: col.s4, x: w * 0.58 },
      { label: 'Octree', val: f.octreeVis, color: col.p7, x: w * 0.78 },
    ];
    forces.forEach(fl => {
      if (fl.val <= 0) return;
      c.save();
      c.globalAlpha = fl.val * 0.7;
      // Pill background
      const tw = c.measureText(fl.label).width + 14;
      c.fillStyle = col.b9;
      c.strokeStyle = fl.color;
      c.lineWidth = 0.8;
      rr(c, fl.x - tw / 2, lblY - 9, tw, 14, 7);
      c.fill();
      c.stroke();
      c.fillStyle = fl.color;
      c.fillText(fl.label, fl.x, lblY);
      c.restore();
    });

    requestAnimationFrame(draw);
  }
  draw();
}
