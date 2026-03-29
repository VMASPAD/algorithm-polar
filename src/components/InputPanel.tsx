import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import gsap from 'gsap';
import type { Token, PipelineProgress } from '../types';
import { tokenColor } from '../types';
import { EduVisualizer } from './EduVisualizer';
import { EduModal } from './EduModal';
import { RealtimePipelineViz } from './RealtimePipelineViz';

interface InputPanelProps {
  onSubmit: (text: string) => void;
  tokens: Token[];
  progress: PipelineProgress;
  highlightedToken: number | null;
  selectedToken: number | null;
  onHoverToken: (idx: number | null) => void;
  onSelectToken: (idx: number | null) => void;
}

export function InputPanel({
  onSubmit,
  tokens,
  progress,
  highlightedToken,
  selectedToken,
  onHoverToken,
  onSelectToken,
}: InputPanelProps) {
  const [text, setText] = useState('');
  const [showEdu, setShowEdu] = useState(false);
  const [activeModalStep, setActiveModalStep] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isRunning = progress.stage !== 'idle' && progress.stage !== 'done' && progress.stage !== 'error';

  useLayoutEffect(() => {
    if (!panelRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('.logo', { autoAlpha: 0, y: -15, duration: 0.5, ease: 'power3.out' });
      gsap.from('.tagline', { autoAlpha: 0, y: -10, duration: 0.4, ease: 'power2.out', delay: 0.1 });
      gsap.from('.input-form', { autoAlpha: 0, y: 20, duration: 0.5, ease: 'power3.out', delay: 0.2 });
      gsap.from('.edu-section', { autoAlpha: 0, y: 15, duration: 0.4, ease: 'power2.out', delay: 0.35 });
    }, panelRef);
    return () => ctx.revert();
  }, []);

  // Animate token badges when they appear
  useEffect(() => {
    if (tokens.length === 0 || !panelRef.current) return;
    const badges = panelRef.current.querySelectorAll('.token-badge');
    if (badges.length === 0) return;
    gsap.from(badges, {
      autoAlpha: 0, scale: 0.7, y: 8,
      duration: 0.3, stagger: 0.02, ease: 'back.out(1.7)',
      overwrite: 'auto',
    });
  }, [tokens.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !isRunning) onSubmit(text.trim());
  };

  const stageLabel: Record<string, string> = {
    tokenizing: 'Tokenizing...',
    embedding: `Embedding ${progress.embeddingProgress?.completed ?? 0}/${progress.embeddingProgress?.total ?? '?'}`,
    pca: 'Running PCA...',
    similarity: 'Computing similarity...',
    done: 'Done',
    error: `Error: ${progress.error}`,
  };

  return (
    <div className="input-panel" ref={panelRef}>
      <h1 className="logo">algorithm-polar</h1>
      <p className="tagline">Text → Embeddings → 3D Galaxy</p>

      <form onSubmit={handleSubmit} className="input-form">
        <textarea
          className="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter any text to launch into the galaxy..."
          rows={5}
          disabled={isRunning}
        />
        <button
          type="submit"
          className="launch-btn"
          disabled={isRunning || !text.trim()}
        >
          {isRunning ? stageLabel[progress.stage] ?? 'Processing...' : 'Launch into Galaxy'}
        </button>
      </form>

      {isRunning && progress.stage === 'embedding' && progress.embeddingProgress && (
        <div className="progress-bar-wrap">
          <div
            className="progress-bar-fill"
            style={{
              width: `${(progress.embeddingProgress.completed / progress.embeddingProgress.total) * 100}%`,
            }}
          />
        </div>
      )}

      {progress.stage === 'error' && (
        <div className="error-msg">{progress.error}</div>
      )}

      {/* ── Real-time pipeline visualizer ─────────────────── */}
      {progress.stage !== 'idle' && (
        <RealtimePipelineViz
          progress={progress}
          tokens={tokens}
          inputText={text}
        />
      )}

      {/* Educational Section */}
      <div className="edu-section">
        <button 
          className="edu-toggle" 
          onClick={() => setShowEdu(!showEdu)}
          type="button"
        >
          {showEdu ? 'Ocultar Información' : '💡 ¿Qué significa esto?'}
        </button>
        {showEdu && (
          <div className="edu-content">
            <h4>1. Tokenización</h4>
            <p>El texto que ingresas se divide en <strong>tokens</strong> (fragmentos de palabras). Un modelo de lenguaje como ChatGPT lee así.</p>
            <div className="clickable-viz" onClick={() => setActiveModalStep('token')}>
                <EduVisualizer step="token" />
            </div>
            
            <h4>2. Embeddings</h4>
            <p>Cada token se convierte en un <strong>embedding</strong> (un vector matemático de cientos de dimensiones) que representa su significado o contexto.</p>
            <div className="clickable-viz" onClick={() => setActiveModalStep('embed')}>
                <EduVisualizer step="embed" />
            </div>
            
            <h4>3. PCA (Reducción de Dimensionalidad)</h4>
            <p>Como no podemos visualizar cientos de dimensiones, usamos <strong>PCA</strong> para proyectar estos datos en un espacio 3D (X, Y, Z), definiendo su posición inicial en la galaxia.</p>
            <div className="clickable-viz" onClick={() => setActiveModalStep('pca')}>
                <EduVisualizer step="pca" />
            </div>
            
            <h4>4. Masa y Similitud (Nodos)</h4>
            <p>El tamaño (masa) de cada planeta representa su "peso semántico" calculado mediante la <strong>similitud coseno</strong> con el resto de tokens. Cuanto más similitud tiene un nodo con los demás, mayor es su tamaño. Las líneas muestran un Árbol de Expansión Mínima (MST), conectando a los conceptos más similares entre sí atrayéndolos.</p>
            <div className="clickable-viz" onClick={() => setActiveModalStep('sim')}>
                <EduVisualizer step="sim" />
            </div>
          </div>
        )}
      </div>

      <EduModal step={activeModalStep} onClose={() => setActiveModalStep(null)} />

      {tokens.length > 0 && (
        <div className="token-list">
          <div className="token-list-header">
            {tokens.length} tokens
          </div>
          <div className="token-badges">
            {tokens.map((t, i) => (
              <span
                key={i}
                className={`token-badge${highlightedToken === i ? ' highlighted' : ''}${selectedToken === i ? ' selected' : ''}`}
                style={{ '--token-color': tokenColor(t.id) } as React.CSSProperties}
                onMouseEnter={() => onHoverToken(i)}
                onMouseLeave={() => onHoverToken(null)}
                onClick={() => onSelectToken(selectedToken === i ? null : i)}
                title={`ID: ${t.id} | mass: ${t.mass.toFixed(2)}`}
              >
                {t.text}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
