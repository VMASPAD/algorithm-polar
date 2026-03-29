import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export type EduStep = 'token' | 'embed' | 'pca' | 'sim';

interface EduVisualizerProps {
  step: EduStep;
  interactiveSubStep?: number;
}

export function EduVisualizer({ step, interactiveSubStep }: EduVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    
    // Si estamos en un subpaso, queremos un alto mayor para el modal
    const height = interactiveSubStep !== undefined ? 300 : 150;
    
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(container.clientWidth, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / height, 0.1, 100);
    camera.position.z = 8;
    
    const scene = new THREE.Scene();
    const ambientInfo = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientInfo);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 5, 5);
    scene.add(dirLight);

    let rafId: number;
    const clock = new THREE.Clock();

    const group = new THREE.Group();
    scene.add(group);

    // Font loading for texts
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillStyle = '#ffffff';

    const createTextSprite = (msg: string, color: string = '#ffffff') => {
      ctx.clearRect(0,0,512,128);
      ctx.fillStyle = color;
      ctx.fillText(msg, 256, 64);
      const tex = new THREE.CanvasTexture(canvas);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex }));
      spr.scale.set(4, 1, 1);
      return spr;
    };

    if (step === 'token') {
      const g = new THREE.Group();
      group.add(g);
      
      const s1 = createTextSprite('Hola Mundo', '#aaffaa');
      const s2 = createTextSprite('Hola', '#ffaaaa');
      const s3 = createTextSprite(' mundo', '#aaaaff');
      const s4 = createTextSprite('ID: 2541', '#44ffaa');
      const s5 = createTextSprite('ID: 852', '#44aaff');

      g.add(s1, s2, s3, s4, s5);

      const animate = () => {
        const t = clock.getElapsedTime();
        const activeStep = interactiveSubStep !== undefined ? interactiveSubStep : (Math.floor(t) % 3);

        s1.visible = activeStep === 0;
        s2.visible = activeStep === 1;
        s3.visible = activeStep === 1;
        s4.visible = activeStep === 2;
        s5.visible = activeStep === 2;
        
        if (activeStep === 0) {
          s1.position.set(0, 0, 0);
        } else if (activeStep === 1 || activeStep === 2) {
          const spread = interactiveSubStep !== undefined ? 1.5 : (Math.sin(t*3) * 0.5 + 1.5);
          s2.position.set(-spread, 0, 0);
          s3.position.set(spread, 0, 0);
          s4.position.set(-spread, 0, 0);
          s5.position.set(spread, 0, 0);
        }
        
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      };
      animate();

    } else if (step === 'embed') {
      const geo = new THREE.BoxGeometry(0.25, 0.8, 0.25);
      const numCubes = 15;
      const cubes = Array.from({length: numCubes}).map((_, i) => {
        const mat = new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(i/numCubes, 1, 0.5) });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.x = (i - numCubes/2 + 0.5) * 0.35;
        group.add(mesh);
        return mesh;
      });

      const spr = createTextSprite('ID: 2541', '#ffffff');
      spr.position.y = 2;
      group.add(spr);

      const animate = () => {
        const t = clock.getElapsedTime();
        const activeStep = interactiveSubStep !== undefined ? interactiveSubStep : (Math.floor(t) % 3);
        
        spr.visible = activeStep === 0;
        cubes.forEach((c, i) => {
           c.visible = activeStep > 0;
           if (activeStep === 1) {
              c.scale.y = 1 + Math.sin(t * 5 + i) * 1.5;
           } else if (activeStep === 2) {
              c.scale.y = 1; // Normalized
           }
        });
        
        if (activeStep > 0) {
           group.rotation.x = Math.sin(t) * 0.2;
           group.rotation.y = Math.cos(t * 0.5) * 0.3;
        } else {
           group.rotation.set(0,0,0);
        }
        
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      };
      animate();

    } else if (step === 'pca') {
      const axesHelper = new THREE.AxesHelper(3);
      group.add(axesHelper);
      
      const geo = new THREE.SphereGeometry(0.15);
      const pts = Array.from({length: 30}).map((_, i) => {
        const m = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: new THREE.Color().setHSL(i/30, 0.8, 0.5) }));
        group.add(m);
        return m;
      });

      const spr = createTextSprite('Dim: 1536', '#ffffff');
      spr.position.y = 2;
      group.add(spr);

      const animate = () => {
        const t = clock.getElapsedTime();
        const activeStep = interactiveSubStep !== undefined ? interactiveSubStep : (Math.floor(t/2) % 3);

        spr.visible = activeStep === 0;
        axesHelper.visible = activeStep === 2;
        
        pts.forEach((p, i) => {
          if (activeStep === 0) { // All clumped together, unreadable
            p.position.set(0, 0, 0);
          } else if (activeStep === 1) { // High dimensional chaos
            p.position.set(
              Math.sin(i * 1.3 + t)*3, 
              Math.cos(i * 1.7 + t*1.5)*3, 
              Math.sin(i * 2.1 + t*0.5)*3
            );
          } else { // Clean 3D projection
            p.position.set(
              Math.sin(i * 3.1) * 2, 
              Math.cos(i * 4.3) * 2, 
              Math.sin(i * 5.5) * 2
            );
          }
        });

        group.rotation.y = t * 0.4;
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      }
      animate();

    } else if (step === 'sim') {
      const m1 = new THREE.Mesh(new THREE.SphereGeometry(0.8, 32, 32), new THREE.MeshPhongMaterial({ color: 0xffaa00 }));
      const m2 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 32), new THREE.MeshPhongMaterial({ color: 0xaa22ff }));
      group.add(m1, m2);
      
      const resSpr = createTextSprite('Sim: 0.95', '#ffffff');
      resSpr.position.y = 1.5;
      group.add(resSpr);

      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
      const line = new THREE.Line(lineGeo, lineMat);
      group.add(line);

      const animate = () => {
        const t = clock.getElapsedTime();
        const activeStep = interactiveSubStep !== undefined ? interactiveSubStep : (Math.floor(t/2) % 3);

        if (activeStep === 0) { // Distant, comparing
           m1.position.set(-2, 0, 0);
           m2.position.set(2, 0, 0);
           resSpr.visible = true;
           line.visible = false;
           m1.scale.setScalar(1);
        } else if (activeStep === 1) { // Acumulating mass
           m1.position.set(-2, 0, 0);
           m2.position.set(2, 0, 0);
           resSpr.visible = false;
           line.visible = false;
           m1.scale.setScalar(1 + Math.abs(Math.sin(t*5))*0.4);
        } else { // MST Connection
           const dist = 1.5;
           m1.position.x = -dist;
           m2.position.x = dist;
           m1.scale.setScalar(1.4);
           resSpr.visible = false;
           line.visible = true;
           
           const pos = line.geometry.attributes.position.array as Float32Array;
           pos[0] = m1.position.x; pos[1] = m1.position.y; pos[2] = m1.position.z;
           pos[3] = m2.position.x; pos[4] = m2.position.y; pos[5] = m2.position.z;
           line.geometry.attributes.position.needsUpdate = true;
        }

        group.rotation.y = t * 0.5;
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(animate);
      }
      animate();
    }

    // handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const c = containerRef.current;
      renderer.setSize(c.clientWidth, height);
      camera.aspect = c.clientWidth / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(rafId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [step, interactiveSubStep]);

  return <div ref={containerRef} style={{ width: '100%', height: interactiveSubStep !== undefined ? '300px' : '150px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', overflow: 'hidden', margin: '10px 0', cursor: interactiveSubStep === undefined ? 'pointer' : 'default' }} />;
}
