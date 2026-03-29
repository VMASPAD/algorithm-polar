<div align="center">

# 🌌 algorithm-polar

### **Text → Embeddings → 3D Semantic Galaxy**

An interactive educational tool that transforms any text into a live, physics-simulated 3D galaxy — revealing how AI language models "understand" words through mathematics.

[![Demo](https://img.shields.io/badge/🚀_Live_Demo-CubePath-00C853?style=for-the-badge)](https://algorithm-polar.cubepath.app)
[![Hackaton](https://img.shields.io/badge/Hackatón-CubePath_2026-FF6B6B?style=for-the-badge&logo=cloud&logoColor=white)](https://midu.link/cubepath)
[![Tech](https://img.shields.io/badge/Stack-React_+_Three.js_+_GSAP-61DAFB?style=for-the-badge&logo=react&logoColor=white)](#-tech-stack)

</div>

---

## ✨ ¿Qué es algorithm-polar?

**algorithm-polar** es una herramienta educativa que hace visible lo invisible: el proceso matemático interno con el que los modelos de inteligencia artificial como GPT leen y entienden el texto.

Escribe cualquier frase → observa en tiempo real cómo se tokeniza, convierte a vectores de 1 536 dimensiones, reduce a 3D mediante PCA y finalmente se convierte en una **galaxia semántica viva** donde los tokens gravitan entre sí según su similitud de significado.

> **Objetivo educativo:** Que cualquier persona, incluso sin conocimientos técnicos, pueda entender visualmente cómo funciona la IA por dentro.

---

## 🎬 Demo

![Demo animation](./public/demo.gif)

> **🚀 Live demo:** [algorithm-polar.cubepath.app](https://algorithm-polar.cubepath.app)

---

## 🧠 El Pipeline Completo (paso a paso)

```
Tu texto → Tokenización BPE → Embeddings 1536-d → PCA 3D → Simulación N-Body → Galaxia
```

| Paso | Tecnología | Qué ves |
|---|---|---|
| **01 Tokenizar** | Byte-Pair Encoding | El texto se divide en sub-palabras, cada una recibe un ID entero |
| **02 Embeber** | OpenAI text-embedding-3-small | Cada token se convierte en un vector de 1 536 dimensiones vía WebSocket |
| **03 Reducir** | PCA (NIPALS iterativo) + Similitud Coseno | 1 536-d → 3 coordenadas (X, Y, Z); se calcula la masa semántica y el MST |
| **04 Simular** | Motor de física N-Body propio | Barnes-Hut O(n log n), resortes Hooke, repulsión, colisiones elásticas |

Cada paso se visualiza en tiempo real con animaciones Canvas 2D + GSAP. Al hacer clic en cualquier etapa completada se despliega su descripción matemática detallada.

---

## 🛠️ Tech Stack

### Frontend
- **React 19** + TypeScript + Vite
- **Three.js** — renderizado WebGL 3D de la galaxia de tokens
- **GSAP 3** — animaciones fluidas del pipeline y transiciones de UI
- **Canvas 2D** — visualizaciones matemáticas en tiempo real por etapa
- **Monaco Editor** — visualización de los algoritmos de física (Kruskal, Barnes-Hut)

### Backend
- **Node.js** + WebSocket (`ws`) — comunicación en tiempo real con el cliente
- **OpenAI API** — generación de embeddings (`text-embedding-3-small`)
- **PCA customizado** — implementación NIPALS propia en JavaScript
- **Algoritmo de Kruskal** — MST propio para construir el grafo semántico

### Infraestructura
- **CubePath** — despliegue del frontend (Vite build estático) y el servidor WebSocket Node.js

---

## 🚀 Cómo se usa CubePath

El proyecto se despliega en **dos instancias CubePath**:

1. **Frontend** (`nano` server) — el build estático de Vite servido con `serve`
2. **Backend WebSocket** (`nano` server) — el servidor Node.js que conecta con OpenAI y ejecuta PCA/Kruskal

```bash
# Frontend
npm run build
serve dist/ -p 80

# Backend WebSocket
node server/index.js
```

Ambos servidores permanecen activos gracias a **PM2** (`ecosystem.config.cjs`). La comunicación entre frontend y backend se realiza mediante WebSocket en tiempo real, enviando tokens para su embedding y recibiendo resultados de forma progresiva.

> **CubePath** fue la opción perfecta porque: sin configuración de DNS compleja, acceso inmediato, $15 de crédito suficiente para 2 servidores nano durante el mes del hackathon, y despliegue en segundos.

---

## 📸 Capturas

| Vista Galaxy 3D | Pipeline en Tiempo Real | Etapa Expandida |
|:---:|:---:|:---:|
| *(tokens como planetas gravitando)* | *(4 etapas con canvas animados)* | *(matemáticas de cada paso)* |

---

## 🚀 Ejecutar localmente

### Requisitos
- Node.js 18+
- Clave API de OpenAI

### Pasos

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/algorithm-polar.git
cd algorithm-polar

# Instalar dependencias del frontend
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env y añadir tu OPENAI_API_KEY

# Instalar dependencias del servidor
cd server && npm install && cd ..

# Iniciar el servidor WebSocket (en una terminal)
cd server && node index.js

# Iniciar el frontend (en otra terminal)
npm run dev
```

Abre `http://localhost:5173` y escribe cualquier texto para lanzarlo a la galaxia.



## 📁 Estructura del proyecto

```
algorithm-polar/
├── src/
│   ├── components/
│   │   ├── GalaxyViewer.tsx      # Renderizado Three.js de la galaxia
│   │   ├── InputPanel.tsx         # Panel de entrada con visualizador RT
│   │   ├── RealtimePipelineViz.tsx # Visualizador paso a paso en tiempo real
│   │   ├── TokenPipelineViz.tsx   # Visualización interactiva del pipeline
│   │   ├── AlgorithmPanel.tsx     # Panel de algoritmos con Monaco Editor
│   │   ├── EduVisualizer.tsx      # Mini-visualizaciones educativas
│   │   └── EduModal.tsx           # Modal educativo expandido
│   ├── lib/
│   │   ├── kruskal.ts             # Algoritmo MST propio
│   │   └── physics.ts             # Motor de física Barnes-Hut + N-Body
│   └── hooks/
│       └── useWebSocket.ts        # Hook de comunicación WebSocket
├── server/
│   └── index.js                   # Servidor WebSocket + OpenAI + PCA
├── ecosystem.config.cjs           # Configuración PM2 para CubePath
└── README.md
```

---

<div align="center">

Hecho con ❤️ para la **Hackatón CubePath 2026**

Aprende cómo los modelos de IA entienden el lenguaje — una galaxia a la vez 🌌

</div>
