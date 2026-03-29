import { useState } from 'react';
import { EduVisualizer } from './EduVisualizer';

interface EduModalProps {
  step: string | null;
  onClose: () => void;
}

export function EduModal({ step, onClose }: EduModalProps) {
  const [subStep, setSubStep] = useState(0);

  // If we closed the modal, reset substep next time we open
  const handleClose = () => {
    onClose();
    setTimeout(() => setSubStep(0), 200);
  };

  if (!step) return null;

  let title = '';
  let stepsContent: { title: string; desc: string; interact?: React.ReactNode }[] = [];

  if (step === 'token') {
    title = 'Tokenización - Paso a Paso';
    stepsContent = [
      { title: 'El Texto Crudo', desc: 'Empezamos con una cadena de texto continua provista por el usuario. Las IAs no leen texto igual que nosotros, necesitan números.' },
      { title: 'Fragmentación (BPE)', desc: 'Usando un algoritmo como Byte-Pair Encoding (BPE), dividimos el texto en "tokens" (palabras o sílabas). Por ejemplo: "Hola mundo" -> ["Hola", " world"].' },
      { title: 'IDs Numéricos', desc: 'Cada token se mapea a un número entero único en un diccionario predefinido (el vocabulario del modelo). Ej: "Hola" -> 2341, " mundo" -> 9812.' }
    ];
  } else if (step === 'embed') {
    title = 'Embeddings - Paso a Paso';
    stepsContent = [
      { title: 'Del ID al Vector', desc: 'Tomamos el ID del token y buscamos su representación en una matriz enorme de pesos.' },
      { title: 'Espacio Latente', desc: 'La representación o "embedding" es una lista de números (ej. 1536 dimensiones). Cada dimensión captura un aspecto diminuto del significado de esa palabra (género, pluralidad, connotación, etc.).' },
      { title: 'Normalización', desc: 'Ajustamos la longitud del vector a 1 (lo normalizamos). Esto permite comparar vectores más adelante calculando el ángulo entre ellos.' }
    ];
  } else if (step === 'pca') {
    title = 'PCA (Reducción) - Paso a Paso';
    stepsContent = [
      { title: 'La Maldición de las Dimensiones', desc: 'Los humanos no podemos visualizar o navegar un espacio de 1536 dimensiones.' },
      { title: 'Análisis de Componentes', desc: 'Buscamos matemáticamente las 3 direcciones (ejes) en ese espacio gigante que tengan la mayor variación de datos.' },
      { title: 'Proyección 3D', desc: 'Aplastamos o "proyectamos" los 1536 números en solo 3 números (X, Y, Z). Al hacer esto, perdemos poca información fundamental pero ganamos la capacidad de representarlo espacialmente.' }
    ];
  } else if (step === 'sim') {
    title = 'Similitud y Grafo - Paso a Paso';
    stepsContent = [
      { title: 'Similitud Coseno', desc: 'Comparamos cada token con los demás calculando el coseno del ángulo entre sus vectores originales.' },
      { title: 'Masa (Peso Semántico)', desc: 'Si un token es muy similar a muchos otros de la misma frase, acumula "masa". Tokens centrales o repetidos acaban siendo planetas más grandes.' },
      { title: 'Árbol de Expansión Mínima', desc: 'Formamos conexiones (aristas) entre los tokens más afines para asegurar que todos estén vinculados en una constelación sin formar ciclos.' }
    ];
  }

  return (
    <div className="edu-modal-overlay" onClick={handleClose}>
      <div className="edu-modal-content" onClick={e => e.stopPropagation()}>
        <button className="edu-modal-close" onClick={handleClose}>&times;</button>
        <h2>{title}</h2>
        <div className="edu-modal-vis">
          <EduVisualizer step={step as any} interactiveSubStep={subStep} />
        </div>
        
        <div className="edu-modal-steps">
          <div className="edu-modal-step-info">
             <h3>Paso {subStep + 1}: {stepsContent[subStep]?.title}</h3>
             <p>{stepsContent[subStep]?.desc}</p>
          </div>
          <div className="edu-modal-controls">
             <button disabled={subStep === 0} onClick={() => setSubStep(s => s - 1)}>Anterior</button>
             <button disabled={subStep === stepsContent.length - 1} onClick={() => setSubStep(s => s + 1)}>Siguiente</button>
          </div>
          <div className="edu-modal-progress">
             {stepsContent.map((_, i) => (
               <span key={i} className={`edu-dot ${i === subStep ? 'active' : ''}`} onClick={() => setSubStep(i)} />
             ))}
          </div>
        </div>
      </div>
    </div>
  );
}
