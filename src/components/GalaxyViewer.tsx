import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Token, MSTEdge } from '../types';
import { tokenColor, hslToHex } from '../types';
import { buildOctree, collectNodes } from '../lib/octree';

const MAX_TOKENS = 200;

export interface GalaxyViewerHandle {
  updateTokens: (
    tokens: Token[],
    edges: MSTEdge[],
    showOctree: boolean,
    selectedIndex: number | null,
  ) => void;
}

interface GalaxyViewerProps {
  highlightedToken: number | null;
  selectedToken: number | null;
  showLabels: boolean;
  onTokenSelect: (index: number | null) => void;
}

// ── Shaders ────────────────────────────────────────────────────────────────────
const VERT = `
attribute float size;
attribute vec3 color;
attribute float selected;
varying vec3 vColor;
varying float vSelected;
void main() {
  vColor = color;
  vSelected = selected;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAG = `
varying vec3 vColor;
varying float vSelected;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;

  // Sphere normal reconstruction
  float rSq = dot(uv, uv);
  float z = sqrt(max(0.0, 0.25 - rSq));
  vec3 N = normalize(vec3(uv.x * 2.0, uv.y * 2.0, z * 2.0));
  vec3 V = vec3(0.0, 0.0, 1.0);

  // Key light (upper-right)
  vec3 L1 = normalize(vec3(0.55, 0.72, 0.9));
  float diff = max(dot(N, L1), 0.0);

  // Fill light (opposite, dimmer)
  float fill = max(dot(N, normalize(vec3(-0.3, -0.4, 0.6))), 0.0) * 0.22;

  // Blinn-Phong specular
  vec3 H = normalize(L1 + V);
  float spec = pow(max(dot(N, H), 0.0), 90.0) * 0.75;

  // Atmospheric rim
  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.5) * 0.55;

  // Procedural surface bands (gas-giant stripes)
  float band = sin(N.y * 11.0) * 0.065 + sin(N.y * 4.0 + 0.8) * 0.04;

  // Combine
  vec3 col = vColor * (0.12 + 0.88 * (diff + fill))
           + vColor * band
           + vec3(1.0) * spec
           + mix(vColor, vec3(0.45, 0.7, 1.0), 0.55) * rim;

  // Sharp edge (no blur)
  float alpha = 1.0 - smoothstep(0.465, 0.5, d);

  // Selected: golden ring + subtle inner glow
  if (vSelected > 0.5) {
    float ring = smoothstep(0.38, 0.42, d) - smoothstep(0.45, 0.49, d);
    col = mix(col, vec3(1.0, 0.92, 0.15), ring * 0.95);
    float innerGlow = (0.5 - d) * 2.0 * 0.18;
    col += vec3(0.9, 0.75, 0.1) * max(0.0, innerGlow);
  }

  gl_FragColor = vec4(col, alpha);
}
`;

export const GalaxyViewer = forwardRef<GalaxyViewerHandle, GalaxyViewerProps>(
  function GalaxyViewer({ highlightedToken, selectedToken: _selectedToken, showLabels, onTokenSelect }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const onSelectRef = useRef(onTokenSelect);
    const tokenCountRef = useRef(0);

    useEffect(() => { onSelectRef.current = onTokenSelect; });

    const stateRef = useRef<{
      renderer: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      controls: OrbitControls;
      tokenGeo: THREE.BufferGeometry;
      lineGeo: THREE.BufferGeometry;
      selLineGeo: THREE.BufferGeometry;
      labelGroup: THREE.Group;
      octreeGroup: THREE.Group;
      posArray: Float32Array;
      colorArray: Float32Array;
      sizeArray: Float32Array;
      selectedArray: Float32Array;
      rafId: number;
    } | null>(null);

    useImperativeHandle(ref, () => ({
      updateTokens(tokens, edges, showOctree, selectedIndex) {
        const s = stateRef.current;
        if (!s) return;
        const N = tokens.length;
        tokenCountRef.current = N;

        for (let i = 0; i < MAX_TOKENS; i++) {
          if (i < N) {
            const t = tokens[i];
            s.posArray[i * 3]     = t.position[0];
            s.posArray[i * 3 + 1] = t.position[1];
            s.posArray[i * 3 + 2] = t.position[2];
            const hex = hslToHex(tokenColor(t.id));
            s.colorArray[i * 3]     = ((hex >> 16) & 0xff) / 255;
            s.colorArray[i * 3 + 1] = ((hex >>  8) & 0xff) / 255;
            s.colorArray[i * 3 + 2] = ( hex        & 0xff) / 255;
            // Size: base on mass, boost if highlighted
            const base = Math.max(5, Math.min(14, 4 + t.mass * 0.9));
            s.sizeArray[i] = i === highlightedToken ? base + 4 : base;
            s.selectedArray[i] = i === selectedIndex ? 1 : 0;
          } else {
            s.posArray[i * 3 + 2] = -99999;
            s.sizeArray[i] = 0;
            s.selectedArray[i] = 0;
          }
        }

        s.tokenGeo.setDrawRange(0, N);
        (s.tokenGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (s.tokenGeo.attributes.color    as THREE.BufferAttribute).needsUpdate = true;
        (s.tokenGeo.attributes.size     as THREE.BufferAttribute).needsUpdate = true;
        (s.tokenGeo.attributes.selected as THREE.BufferAttribute).needsUpdate = true;

        // ── Normal MST lines ────────────────────────────────────────────────
        const normalEdges = selectedIndex === null
          ? edges
          : edges.filter(e => e.from !== selectedIndex && e.to !== selectedIndex);
        const selEdges = selectedIndex === null
          ? []
          : edges.filter(e => e.from === selectedIndex || e.to === selectedIndex);

        const lineBuf = new Float32Array(normalEdges.length * 6);
        for (let i = 0; i < normalEdges.length; i++) {
          const { from, to } = normalEdges[i];
          if (from >= N || to >= N) continue;
          lineBuf.set(tokens[from].position, i * 6);
          lineBuf.set(tokens[to].position,   i * 6 + 3);
        }
        s.lineGeo.setAttribute('position', new THREE.BufferAttribute(lineBuf, 3));
        s.lineGeo.setDrawRange(0, normalEdges.length * 2);

        // ── Selected-token highlight edges ─────────────────────────────────
        const selBuf = new Float32Array(selEdges.length * 6);
        for (let i = 0; i < selEdges.length; i++) {
          const { from, to } = selEdges[i];
          if (from >= N || to >= N) continue;
          selBuf.set(tokens[from].position, i * 6);
          selBuf.set(tokens[to].position,   i * 6 + 3);
        }
        s.selLineGeo.setAttribute('position', new THREE.BufferAttribute(selBuf, 3));
        s.selLineGeo.setDrawRange(0, selEdges.length * 2);

        // ── Labels ─────────────────────────────────────────────────────────
        while (s.labelGroup.children.length) {
          const c = s.labelGroup.children[0] as THREE.Sprite;
          (c.material as THREE.SpriteMaterial).map?.dispose();
          (c.material as THREE.SpriteMaterial).dispose();
          s.labelGroup.remove(c);
        }
        for (let i = 0; i < N; i++) {
          const t = tokens[i];
          const sprite = makeLabel(t.text, tokenColor(t.id), i === selectedIndex);
          sprite.position.set(t.position[0], t.position[1] + t.radius + 2, t.position[2]);
          s.labelGroup.add(sprite);
        }
        s.labelGroup.visible = showLabels;

        // ── Octree wireframes ───────────────────────────────────────────────
        while (s.octreeGroup.children.length) s.octreeGroup.children[0].removeFromParent();
        if (showOctree && N > 0) {
          const root = buildOctree(tokens);
          const depthColors = [0x00ff88, 0xffdd00, 0xff6600, 0xff2200];
          for (const node of collectNodes(root, 3)) {
            const depth = Math.floor(Math.log2(120 / Math.max(node.halfSize, 0.1)));
            const box = new THREE.Box3(
              new THREE.Vector3(node.cx - node.halfSize, node.cy - node.halfSize, node.cz - node.halfSize),
              new THREE.Vector3(node.cx + node.halfSize, node.cy + node.halfSize, node.cz + node.halfSize),
            );
            const helper = new THREE.Box3Helper(box, new THREE.Color(depthColors[Math.min(depth, 3)]));
            (helper.material as THREE.LineBasicMaterial).opacity = 0.25;
            (helper.material as THREE.LineBasicMaterial).transparent = true;
            s.octreeGroup.add(helper);
          }
        }
      },
    }));

    // Update labels visibility
    useEffect(() => {
      if (stateRef.current) stateRef.current.labelGroup.visible = showLabels;
    }, [showLabels]);

    // Highlight (hover) — just bump size
    useEffect(() => {
      const s = stateRef.current;
      if (!s) return;
      for (let i = 0; i < MAX_TOKENS; i++) {
        if (i < tokenCountRef.current) {
          const base = s.sizeArray[i] < 20 ? s.sizeArray[i] : 8;
          s.sizeArray[i] = i === highlightedToken ? Math.max(base, 14) : base;
        }
      }
      (s.tokenGeo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    }, [highlightedToken]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      // ── Renderer ──────────────────────────────────────────────────────────
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setClearColor(0x030308);
      container.appendChild(renderer.domElement);

      // ── Camera & controls ─────────────────────────────────────────────────
      const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 10000);
      camera.position.set(0, 0, 180);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.rotateSpeed = 0.5;

      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 0.3));

      // ── Star field ────────────────────────────────────────────────────────
      const starPos = new Float32Array(3000 * 3);
      for (let i = 0; i < 3000; i++) {
        const phi   = Math.acos(2 * Math.random() - 1);
        const theta = 2 * Math.PI * Math.random();
        const r     = 280 + Math.random() * 120;
        starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        starPos[i * 3 + 2] = r * Math.cos(phi);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.55, color: 0xaab8dd, sizeAttenuation: true })));

      // ── Token points ──────────────────────────────────────────────────────
      const posArray      = new Float32Array(MAX_TOKENS * 3);
      const colorArray    = new Float32Array(MAX_TOKENS * 3).fill(1);
      const sizeArray     = new Float32Array(MAX_TOKENS).fill(0);
      const selectedArray = new Float32Array(MAX_TOKENS).fill(0);

      const tokenGeo = new THREE.BufferGeometry();
      tokenGeo.setAttribute('position', new THREE.BufferAttribute(posArray,      3));
      tokenGeo.setAttribute('color',    new THREE.BufferAttribute(colorArray,    3));
      tokenGeo.setAttribute('size',     new THREE.BufferAttribute(sizeArray,     1));
      tokenGeo.setAttribute('selected', new THREE.BufferAttribute(selectedArray, 1));
      tokenGeo.setDrawRange(0, 0);

      const tokenMat = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: true,
        depthTest: true,
      });
      scene.add(new THREE.Points(tokenGeo, tokenMat));

      // ── Constellation lines ────────────────────────────────────────────────
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
      scene.add(new THREE.LineSegments(
        lineGeo,
        new THREE.LineBasicMaterial({ color: 0x3355bb, transparent: true, opacity: 0.35 }),
      ));

      // Selected-token highlight edges (brighter)
      const selLineGeo = new THREE.BufferGeometry();
      selLineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
      scene.add(new THREE.LineSegments(
        selLineGeo,
        new THREE.LineBasicMaterial({ color: 0xffdd44, transparent: true, opacity: 0.85 }),
      ));

      const labelGroup = new THREE.Group();
      labelGroup.visible = false;
      scene.add(labelGroup);

      const octreeGroup = new THREE.Group();
      scene.add(octreeGroup);

      // ── Render loop ────────────────────────────────────────────────────────
      let rafId = 0;
      const animate = () => {
        rafId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      // ── Click selection via screen-space projection ────────────────────────
      const onClick = (e: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        const N = tokenCountRef.current;
        if (N === 0) return;

        const tempV = new THREE.Vector3();
        let nearest = -1;
        let nearestDist = 18; // pixel threshold

        for (let i = 0; i < N; i++) {
          tempV.set(posArray[i * 3], posArray[i * 3 + 1], posArray[i * 3 + 2]);
          tempV.project(camera);
          const sx = ((tempV.x + 1) / 2) * rect.width;
          const sy = ((1 - tempV.y) / 2) * rect.height;
          const dist = Math.hypot(e.clientX - rect.left - sx, e.clientY - rect.top - sy);
          if (dist < nearestDist) { nearest = i; nearestDist = dist; }
        }
        onSelectRef.current(nearest === -1 ? null : nearest);
      };
      renderer.domElement.addEventListener('click', onClick);

      // ── Resize ────────────────────────────────────────────────────────────
      const observer = new ResizeObserver(() => {
        const w = container.clientWidth, h = container.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      observer.observe(container);

      stateRef.current = {
        renderer, scene, camera, controls,
        tokenGeo, lineGeo, selLineGeo,
        labelGroup, octreeGroup,
        posArray, colorArray, sizeArray, selectedArray,
        rafId,
      };

      return () => {
        observer.disconnect();
        renderer.domElement.removeEventListener('click', onClick);
        cancelAnimationFrame(rafId);
        renderer.dispose();
        container.removeChild(renderer.domElement);
        stateRef.current = null;
      };
    }, []);

    return <div ref={containerRef} className="galaxy-viewer" />;
  },
);

function makeLabel(text: string, color: string, selected: boolean): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 36;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 160, 36);
  ctx.font = `${selected ? 'bold' : 'normal'} 14px monospace`;
  ctx.fillStyle = selected ? '#ffdd44' : color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.trim().slice(0, 14), 80, 18);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(12, 3, 1);
  return sprite;
}
