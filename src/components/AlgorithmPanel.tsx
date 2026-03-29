import { useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { ALGORITHM_SOURCES } from '../lib/algorithmSources';

interface AlgorithmPanelProps {
  useBarnesHut: boolean;
  onToggleBarnesHut: (v: boolean) => void;
  showOctree: boolean;
  onToggleOctree: (v: boolean) => void;
  showLabels: boolean;
  onToggleLabels: (v: boolean) => void;
}

type AlgoKey = keyof typeof ALGORITHM_SOURCES;

export function AlgorithmPanel({
  useBarnesHut,
  onToggleBarnesHut,
  showOctree,
  onToggleOctree,
  showLabels,
  onToggleLabels,
}: AlgorithmPanelProps) {
  const [activeKey, setActiveKey] = useState<AlgoKey>('pca');
  const [workerLog, setWorkerLog] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const editorValueRef = useRef<string>(ALGORITHM_SOURCES[activeKey].code);
  const workerRef = useRef<Worker | null>(null);

  const algo = ALGORITHM_SOURCES[activeKey];

  const handleEditorChange = (value: string | undefined) => {
    editorValueRef.current = value ?? '';
  };

  const runWorker = () => {
    if (isRunning) {
      workerRef.current?.terminate();
      setIsRunning(false);
      setWorkerLog((prev) => [...prev, '[stopped]']);
      return;
    }

    setIsRunning(true);
    setWorkerLog(['[running user code...]']);

    const workerSrc = `
// ── Helpers provided to the sandbox ─────────────────────────────────────────
function makeNode(cx, cy, cz, halfSize) {
  return { cx, cy, cz, halfSize, mass: 0, comX: 0, comY: 0, comZ: 0,
           tokenIndex: -1, children: new Array(8).fill(null) };
}

function octantOf(node, x, y, z) {
  return (x >= node.cx ? 1 : 0) | (y >= node.cy ? 2 : 0) | (z >= node.cz ? 4 : 0);
}

function childCenter(node, octant) {
  const q = node.halfSize / 2;
  return [
    node.cx + ((octant & 1) ? q : -q),
    node.cy + ((octant & 2) ? q : -q),
    node.cz + ((octant & 4) ? q : -q),
  ];
}

// ── Test tokens ──────────────────────────────────────────────────────────────
const tokens = [
  { position: [10,  5, -3], mass: 2.5, velocity: [0,0,0] },
  { position: [-8, 12,  4], mass: 1.8, velocity: [0,0,0] },
  { position: [ 3, -7,  9], mass: 3.1, velocity: [0,0,0] },
  { position: [-5, -5, -5], mass: 2.0, velocity: [0,0,0] },
  { position: [15, -2,  7], mass: 1.5, velocity: [0,0,0] },
];

// ── User code ────────────────────────────────────────────────────────────────
try {
  ${editorValueRef.current}

  // ── Run test ──────────────────────────────────────────────────────────────
  if (typeof insert !== 'function') throw new Error('insert() function not defined');

  const root = makeNode(0, 0, 0, 64);
  for (let i = 0; i < tokens.length; i++) {
    insert(root, tokens, i);
  }

  const totalMass = tokens.reduce((s, t) => s + t.mass, 0);
  if (Math.abs(root.mass - totalMass) > 0.01) {
    self.postMessage({ type: 'log', msg: '[WARN] root.mass (' + root.mass.toFixed(2) + ') != expected (' + totalMass.toFixed(2) + ')' });
  } else {
    self.postMessage({ type: 'log', msg: '[OK] root.mass = ' + root.mass.toFixed(2) + ' (correct!)' });
  }

  const leafCount = (function countLeaves(n) {
    if (!n) return 0;
    if (n.tokenIndex >= 0) return 1;
    return n.children.reduce((s, c) => s + countLeaves(c), 0);
  })(root);
  self.postMessage({ type: 'log', msg: '[OK] leaves = ' + leafCount + ' / ' + tokens.length + ' tokens' });
  self.postMessage({ type: 'done' });
} catch(err) {
  self.postMessage({ type: 'error', msg: err.message });
}
    `;

    const blob = new Blob([workerSrc], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const worker = new Worker(url);
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent) => {
      const { type, msg } = e.data as { type: string; msg?: string };
      if (type === 'log') setWorkerLog((p) => [...p, msg ?? '']);
      if (type === 'error') {
        setWorkerLog((p) => [...p, `[ERROR] ${msg ?? ''}`]);
        setIsRunning(false);
      }
      if (type === 'done') {
        setWorkerLog((p) => [...p, '[completed successfully]']);
        setIsRunning(false);
      }
    };

    worker.onerror = (e) => {
      setWorkerLog((p) => [...p, `[WORKER ERROR] ${e.message}`]);
      setIsRunning(false);
    };

    URL.revokeObjectURL(url);
  };

  return (
    <div className="algo-panel">
      <div className="algo-tabs">
        {(Object.keys(ALGORITHM_SOURCES) as AlgoKey[]).map((key) => (
          <button
            key={key}
            className={`algo-tab${activeKey === key ? ' active' : ''}`}
            onClick={() => {
              setActiveKey(key);
              editorValueRef.current = ALGORITHM_SOURCES[key].code;
            }}
          >
            {ALGORITHM_SOURCES[key].label}
          </button>
        ))}
      </div>

      <div className="algo-body">
        <div className="algo-editor">
          <Editor
            height="220px"
            language={algo.language}
            defaultValue={algo.code}
            key={activeKey}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              theme: 'vs-dark',
              fontSize: 11,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              folding: false,
            }}
            loading={<div className="editor-loading">Loading editor...</div>}
          />
        </div>

        <div className="algo-sidebar">
          <div className="controls-section">
            <div className="control-row">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={useBarnesHut}
                  onChange={(e) => onToggleBarnesHut(e.target.checked)}
                />
                Barnes-Hut O(n log n)
              </label>
              {!useBarnesHut && <span className="complexity-warn">⚠ O(n²)</span>}
            </div>
            <div className="control-row">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showOctree}
                  onChange={(e) => onToggleOctree(e.target.checked)}
                />
                Show Octree
              </label>
            </div>
            <div className="control-row">
              <label className="toggle-label">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => onToggleLabels(e.target.checked)}
                />
                Token Labels
              </label>
            </div>
          </div>

          {activeKey === 'octree' && (
            <div className="run-section">
              <button
                className={`run-btn${isRunning ? ' running' : ''}`}
                onClick={runWorker}
              >
                {isRunning ? 'Stop' : 'Run in Sandbox'}
              </button>
              <div className="worker-log">
                {workerLog.slice(-8).map((line, i) => (
                  <div
                    key={i}
                    className={`log-line${line.startsWith('[ERROR]') || line.startsWith('[WORKER') ? ' error' : ''}`}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
