import { useRef, useEffect, useLayoutEffect } from 'react';
import gsap from 'gsap';

interface HUDProps {
  fps: number;
  tokenCount: number;
  edgeCount: number;
  collisions: number;
  useBarnesHut: boolean;
  stage: string;
}

export function HUD({ fps, tokenCount, edgeCount, collisions, useBarnesHut, stage }: HUDProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>([]);

  const hudRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!hudRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(hudRef.current, {
        autoAlpha: 0, x: -20, duration: 0.6, ease: 'power3.out', delay: 0.3,
      });
      gsap.from('.hud-row', {
        autoAlpha: 0, x: -10, stagger: 0.06, duration: 0.35, ease: 'power2.out', delay: 0.5,
      });
    }, hudRef);
    return () => ctx.revert();
  }, []);

  const fpsColor = fps > 50 ? '#4afa7c' : fps > 30 ? '#ffd84a' : '#ff5c5c';
  const complexity = useBarnesHut ? 'O(n log n)' : 'O(n²)';
  const complexityColor = useBarnesHut ? '#4afa7c' : '#ff9a4a';

  useEffect(() => {
    if (fps <= 0) return;
    const history = historyRef.current;
    history.push(fps);
    if (history.length > 60) history.shift();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = fpsColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const maxFps = Math.max(70, ...history);
    history.forEach((f, i) => {
      const x = (i / 59) * canvas.width;
      const y = canvas.height - (f / maxFps) * canvas.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }, [fps, fpsColor]);

  return (
    <div className="hud" ref={hudRef}>
      <div className="hud-row">
        <span className="hud-label">FPS</span>
        <span className="hud-value" style={{ color: fpsColor }}>
          {fps > 0 ? Math.round(fps) : '--'}
        </span>
      </div>
      <canvas ref={canvasRef} className="hud-chart" width={120} height={30} />
      <div className="hud-row">
        <span className="hud-label">Tokens</span>
        <span className="hud-value">{tokenCount}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">Edges</span>
        <span className="hud-value">{edgeCount}</span>
      </div>
      {collisions > 0 && (
        <div className="hud-row">
          <span className="hud-label">Collisions</span>
          <span className="hud-value" style={{ color: '#ff9a4a' }}>{collisions}</span>
        </div>
      )}
      <div className="hud-row">
        <span className="hud-label">Mode</span>
        <span className="hud-value" style={{ color: complexityColor, fontSize: '0.7rem' }}>
          {complexity}
        </span>
      </div>
      {stage !== 'idle' && stage !== 'done' && (
        <div className="hud-stage">{stage}</div>
      )}
    </div>
  );
}
