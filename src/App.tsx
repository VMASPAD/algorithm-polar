import { useState, useRef, useCallback, useEffect } from 'react';
import { GalaxyViewer, type GalaxyViewerHandle } from './components/GalaxyViewer';
import { InputPanel } from './components/InputPanel';
import { AlgorithmPanel } from './components/AlgorithmPanel';
import { HUD } from './components/HUD';
import { TokenPipelineViz } from './components/TokenPipelineViz';
import { useWebSocket } from './hooks/useWebSocket';
import { kruskal } from './lib/kruskal';
import { PhysicsSimulation } from './lib/physics';
import { tokenColor, massToRadius } from './types';
import type { Token, MSTEdge, PipelineProgress, RawToken } from './types';
import './App.css';

export default function App() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [edges, setEdges] = useState<MSTEdge[]>([]);
  const [fps, setFps] = useState(0);
  const [collisions, setCollisions] = useState(0);
  const [useBarnesHut, setUseBarnesHut] = useState(true);
  const [showOctree, setShowOctree] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [highlightedToken, setHighlightedToken] = useState<number | null>(null);
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [progress, setProgress] = useState<PipelineProgress>({ stage: 'idle' });
  const [showPipeline, setShowPipeline] = useState(false);

  const galaxyRef = useRef<GalaxyViewerHandle>(null);
  const physicsRef = useRef<PhysicsSimulation | null>(null);
  const simTokensRef = useRef<Token[]>([]);
  const simEdgesRef = useRef<MSTEdge[]>([]);
  const rawTokensRef = useRef<RawToken[]>([]);
  const showOctreeRef = useRef(showOctree);
  const selectedTokenRef = useRef(selectedToken);

  useEffect(() => { showOctreeRef.current = showOctree; }, [showOctree]);
  useEffect(() => { selectedTokenRef.current = selectedToken; }, [selectedToken]);

  // ── WebSocket pipeline ────────────────────────────────────────────────────
  const { send } = useWebSocket({
    TOKENIZE_RESULT: (payload) => {
      const { tokens: raw } = payload as { tokens: RawToken[] };
      rawTokensRef.current = raw;
      setProgress({ stage: 'embedding', embeddingProgress: { completed: 0, total: raw.length } });
    },
    EMBED_PROGRESS: (payload) => {
      const { completed, total } = payload as { completed: number; total: number };
      setProgress({ stage: 'embedding', embeddingProgress: { completed, total } });
    },
    EMBED_COMPLETE: () => { setProgress({ stage: 'pca' }); },
    PCA_RESULT: (payload) => {
      const { positions } = payload as { positions: [number, number, number][] };
      setProgress({ stage: 'similarity' });
      simTokensRef.current = rawTokensRef.current.map((rt, i) => ({
        id: rt.id,
        text: rt.text,
        position: (positions[i] ?? [0, 0, 0]) as [number, number, number],
        velocity: [0, 0, 0],
        mass: 1,
        radius: massToRadius(1),
        color: tokenColor(rt.id),
      }));
    },
    SIMILARITY_RESULT: (payload) => {
      const { masses, similarityMatrix } = payload as {
        masses: number[];
        similarityMatrix: number[];
      };
      const N = simTokensRef.current.length;
      const finalTokens: Token[] = simTokensRef.current.map((t, i) => ({
        ...t,
        mass:   masses[i] ?? 1,
        radius: massToRadius(masses[i] ?? 1),
      }));
      const mst = kruskal(N, similarityMatrix);

      setTokens(finalTokens);
      setEdges(mst);
      simTokensRef.current = finalTokens;
      simEdgesRef.current = mst;
      setProgress({ stage: 'done' });
      startPhysics(finalTokens, mst);
    },
    ERROR: (payload) => {
      const { message } = payload as { message: string };
      setProgress({ stage: 'error', error: message });
    },
  });

  // ── Physics ───────────────────────────────────────────────────────────────
  const startPhysics = useCallback((initialTokens: Token[], mst: MSTEdge[]) => {
    physicsRef.current?.stop();
    const sim = new PhysicsSimulation(initialTokens, mst, useBarnesHut);
    physicsRef.current = sim;
    simEdgesRef.current = mst;

    sim.start((updatedTokens, newFps, col) => {
      simTokensRef.current = updatedTokens;
      setFps(Math.round(newFps));
      setCollisions(col);
      galaxyRef.current?.updateTokens(
        updatedTokens,
        simEdgesRef.current,
        showOctreeRef.current,
        selectedTokenRef.current,
      );
    });
  }, [useBarnesHut]);

  useEffect(() => { physicsRef.current?.setBarnesHut(useBarnesHut); }, [useBarnesHut]);

  useEffect(() => {
    if (simTokensRef.current.length > 0) {
      galaxyRef.current?.updateTokens(
        simTokensRef.current,
        simEdgesRef.current,
        showOctree,
        selectedToken,
      );
    }
  }, [showOctree, selectedToken]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback((text: string) => {
    physicsRef.current?.stop();
    setTokens([]); setEdges([]); setFps(0);
    setSelectedToken(null);
    setProgress({ stage: 'tokenizing' });
    send({ type: 'TOKENIZE_REQUEST', payload: { text } });
  }, [send]);

  // ── Selected token connections ────────────────────────────────────────────
  const connectedTokens =
    selectedToken !== null
      ? edges
          .filter((e) => e.from === selectedToken || e.to === selectedToken)
          .map((e) => (e.from === selectedToken ? e.to : e.from))
      : [];

  return (
    <div className="app-grid">
      <div className="galaxy-wrap">
        <GalaxyViewer
          ref={galaxyRef}
          highlightedToken={highlightedToken}
          selectedToken={selectedToken}
          showLabels={showLabels}
          onTokenSelect={setSelectedToken}
        />
        <HUD
          fps={fps}
          tokenCount={tokens.length}
          edgeCount={edges.length}
          collisions={collisions}
          useBarnesHut={useBarnesHut}
          stage={progress.stage}
        />

        {/* ── Token info panel ─────────────────────────────────────────── */}
        {selectedToken !== null && tokens[selectedToken] && (
          <div className="token-info">
            <button className="info-close" onClick={() => setSelectedToken(null)}>×</button>
            <div
              className="info-planet-dot"
              style={{ background: tokenColor(tokens[selectedToken].id) }}
            />
            <h3 className="info-name">{tokens[selectedToken].text}</h3>
            <div className="info-rows">
              <div className="info-row">
                <span>Token ID</span>
                <span>{tokens[selectedToken].id}</span>
              </div>
              <div className="info-row">
                <span>Semantic mass</span>
                <span>{tokens[selectedToken].mass.toFixed(2)}</span>
              </div>
              <div className="info-row">
                <span>Radius</span>
                <span>{tokens[selectedToken].radius.toFixed(1)}</span>
              </div>
              <div className="info-row">
                <span>Position</span>
                <span className="info-pos">
                  {tokens[selectedToken].position.map((v) => v.toFixed(1)).join(' / ')}
                </span>
              </div>
            </div>
            {connectedTokens.length > 0 && (
              <div className="info-connections">
                <span className="info-connections-label">Connected</span>
                <div className="info-connected-list">
                  {connectedTokens.map((idx) => (
                    <button
                      key={idx}
                      className="info-connected-btn"
                      style={{ '--c': tokenColor(tokens[idx]?.id ?? 0) } as React.CSSProperties}
                      onClick={() => setSelectedToken(idx)}
                    >
                      {tokens[idx]?.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <InputPanel
        onSubmit={handleSubmit}
        tokens={tokens}
        progress={progress}
        highlightedToken={highlightedToken}
        selectedToken={selectedToken}
        onHoverToken={setHighlightedToken}
        onSelectToken={setSelectedToken}
      />

      {showPipeline ? (
        <div className="pipeline-section">
          <TokenPipelineViz onClose={() => setShowPipeline(false)} />
        </div>
      ) : (
        <button className="pipeline-open-btn" onClick={() => setShowPipeline(true)}>
          <span className="btn-icon">▶</span>
          Pipeline de Tokens
        </button>
      )}

      <AlgorithmPanel
        useBarnesHut={useBarnesHut}
        onToggleBarnesHut={setUseBarnesHut}
        showOctree={showOctree}
        onToggleOctree={setShowOctree}
        showLabels={showLabels}
        onToggleLabels={setShowLabels}
      />
    </div>
  );
}
