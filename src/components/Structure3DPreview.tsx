import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { X, Box, Info } from 'lucide-react';
import type { CandidateInterventionType, RankedCandidate } from '../types';

interface Structure3DPreviewProps {
  results: RankedCandidate[]; // all 5, sorted — lets the user switch between them
  slopeCategory: 'Flat' | 'Gentle' | 'Moderate' | 'Steep';
  onClose: () => void;
}

const SLOPE_TILT: Record<string, number> = {
  Flat: 0.02,
  Gentle: 0.10,
  Moderate: 0.22,
  Steep: 0.38,
};

const EARTH_COLOR = 0x9a7a54;
const WATER_COLOR = 0x2c6e8e;
const EARTHWORK_COLOR = 0x6b8e4e;
const CONCRETE_COLOR = 0xb8b8b0;
const GRID_COLOR = 0x000000;

function groundHeight(x: number, z: number, tilt: number): number {
  return Math.sin(x * 0.55) * Math.cos(z * 0.45) * 0.1 + x * Math.tan(tilt);
}

function buildGround(scene: THREE.Scene, tilt: number): void {
  const groundGeo = new THREE.PlaneGeometry(22, 22, 40, 40);
  groundGeo.rotateX(-Math.PI / 2);
  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, groundHeight(x, z, tilt));
  }
  groundGeo.computeVertexNormals();
  const ground = new THREE.Mesh(
    groundGeo,
    new THREE.MeshStandardMaterial({ color: EARTH_COLOR, roughness: 0.92, metalness: 0 })
  );
  ground.receiveShadow = true;
  scene.add(ground);

  // Faint contour-style grid on top of the terrain for scale/orientation —
  // reads much better than a bare, featureless slab.
  const grid = new THREE.GridHelper(22, 22, GRID_COLOR, GRID_COLOR);
  const gridMat = grid.material as THREE.Material & { opacity: number; transparent: boolean };
  gridMat.opacity = 0.06;
  gridMat.transparent = true;
  grid.position.y = 0.01;
  scene.add(grid);

  // Drainage channel — a real recessed groove, not just a flat line
  const channelShape: THREE.Vector3[] = [];
  for (let z = -11; z <= 11; z += 0.5) {
    channelShape.push(new THREE.Vector3(0, groundHeight(0, z, tilt) - 0.06, z));
  }
  const channelCurve = new THREE.CatmullRomCurve3(channelShape);
  const channelGeo = new THREE.TubeGeometry(channelCurve, 40, 0.35, 6, false);
  const channel = new THREE.Mesh(channelGeo, new THREE.MeshStandardMaterial({ color: 0x3d6478, roughness: 0.4 }));
  scene.add(channel);
}

function buildStructure(scene: THREE.Scene, type: CandidateInterventionType, tilt: number): void {
  const waterMat = new THREE.MeshStandardMaterial({ color: WATER_COLOR, transparent: true, opacity: 0.8, roughness: 0.15, metalness: 0.1 });
  const earthworkMat = new THREE.MeshStandardMaterial({ color: EARTHWORK_COLOR, roughness: 0.88 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: CONCRETE_COLOR, roughness: 0.55 });
  const gY = (x: number, z: number) => groundHeight(x, z, tilt);

  if (type === 'Check Dam') {
    const wallY = gY(0, 0);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(7, 1.8, 0.8), concreteMat);
    wall.position.set(0, wallY + 0.9, 0);
    wall.castShadow = true;
    scene.add(wall);
    // Spillway notch cut visually via a smaller inset block on top-center
    const notch = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.9), concreteMat);
    notch.position.set(0, wallY + 1.55, 0);
    scene.add(notch);
    // Pooled reservoir upstream
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 5), waterMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, wallY + 0.75, -3);
    scene.add(pool);

  } else if (type === 'Farm Pond' || type === 'Percolation Tank') {
    const size = type === 'Farm Pond' ? 4.8 : 3.2;
    const depth = type === 'Farm Pond' ? 1.6 : 1.0;
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(size, size * 0.7, depth, 32, 1, true),
      earthworkMat
    );
    basin.position.set(0, gY(0, 0) - depth / 2, 0);
    basin.castShadow = true;
    scene.add(basin);
    // Raised earthen rim around the basin
    const rim = new THREE.Mesh(new THREE.TorusGeometry(size, 0.22, 10, 32), earthworkMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, gY(0, 0) + 0.05, 0);
    scene.add(rim);
    const water = new THREE.Mesh(new THREE.CircleGeometry(size * 0.9, 32), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, gY(0, 0) - depth * 0.25, 0);
    scene.add(water);

  } else if (type === 'Contour Bunding') {
    // Curved arcs that genuinely follow a contour line across the slope,
    // not straight slivers — spaced going up-slope, each thicker and more
    // visible than the original version.
    for (let i = -2; i <= 2; i++) {
      const z = i * 3.2;
      const curvePts: THREE.Vector3[] = [];
      for (let x = -4.5; x <= 4.5; x += 0.5) {
        const bow = Math.sin((x + 4.5) / 9 * Math.PI) * 0.6; // gentle arc bow
        curvePts.push(new THREE.Vector3(x, gY(x, z) + 0.35, z + bow));
      }
      const curve = new THREE.CatmullRomCurve3(curvePts);
      const ridgeGeo = new THREE.TubeGeometry(curve, 30, 0.28, 8, false);
      const ridge = new THREE.Mesh(ridgeGeo, earthworkMat);
      ridge.castShadow = true;
      scene.add(ridge);
    }

  } else { // Farm Bund
    // A proper trapezoidal embankment cross-section, swept along the
    // boundary line, instead of a plain rectangular box.
    const trapezoid = new THREE.Shape();
    trapezoid.moveTo(-0.9, 0);
    trapezoid.lineTo(-0.35, 0.65);
    trapezoid.lineTo(0.35, 0.65);
    trapezoid.lineTo(0.9, 0);
    trapezoid.closePath();
    const extrudeSettings = { steps: 1, depth: 9, bevelEnabled: false };
    const bundGeo = new THREE.ExtrudeGeometry(trapezoid, extrudeSettings);
    bundGeo.rotateY(Math.PI / 2);
    bundGeo.translate(4.5, 0, -0.5);
    const bund = new THREE.Mesh(bundGeo, earthworkMat);
    bund.position.set(0, gY(0, -6), -6);
    bund.castShadow = true;
    scene.add(bund);
  }
}

function buildScene(container: HTMLDivElement): {
  setType: (type: CandidateInterventionType, tilt: number) => void;
  cleanup: () => void;
} {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef1e8);
  scene.fog = new THREE.Fog(0xeef1e8, 18, 34);

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(11, 7.5, 13);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.1;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(9, 14, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12; sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
  scene.add(sun);

  const setType = (type: CandidateInterventionType, tilt: number) => {
    // Clear previous scene content except lights
    scene.children
      .filter(c => !(c instanceof THREE.Light))
      .forEach(c => scene.remove(c));

    buildGround(scene, tilt);
    buildStructure(scene, type, tilt);
  };

  let frameId: number;
  const animate = () => {
    frameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  const handleResize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', handleResize);

  const cleanup = () => {
    cancelAnimationFrame(frameId);
    window.removeEventListener('resize', handleResize);
    controls.dispose();
    renderer.dispose();
    container.removeChild(renderer.domElement);
  };

  return { setType, cleanup };
}

const Structure3DPreview: React.FC<Structure3DPreviewProps> = ({ results, slopeCategory, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneApiRef = useRef<{ setType: (t: CandidateInterventionType, tilt: number) => void; cleanup: () => void } | null>(null);
  const [activeType, setActiveType] = useState<CandidateInterventionType>(results[0].type);

  useEffect(() => {
    if (!containerRef.current) return;
    const api = buildScene(containerRef.current);
    sceneApiRef.current = api;
    api.setType(activeType, SLOPE_TILT[slopeCategory] ?? 0.1);
    return api.cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchType = useCallback((type: CandidateInterventionType) => {
    setActiveType(type);
    sceneApiRef.current?.setType(type, SLOPE_TILT[slopeCategory] ?? 0.1);
  }, [slopeCategory]);

  const activeResult = results.find(r => r.type === activeType) ?? results[0];

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-tertiary-100 flex items-center justify-center">
              <Box className="w-4 h-4 text-tertiary-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-dark">3D Site Explorer — {activeType}</h3>
              <p className="text-xs text-gray-500">Suitability score: {activeResult.total}/100 · Slope: {slopeCategory}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Type switcher — explore all 5 ranked options at this same location */}
        <div className="flex gap-1.5 px-5 py-2.5 border-b border-gray-100 overflow-x-auto">
          {results.map(r => (
            <button
              key={r.type}
              onClick={() => switchType(r.type)}
              className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                activeType === r.type
                  ? 'bg-tertiary-600 border-tertiary-600 text-white'
                  : 'border-gray-200 text-gray-600 hover:border-tertiary-300'
              }`}
            >
              {r.type} · {r.total}
            </button>
          ))}
        </div>

        <div ref={containerRef} className="w-full" style={{ height: '440px' }} />

        <div className="px-5 py-3 border-t border-gray-200 bg-surface-card flex gap-2 text-xs text-gray-500">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <p>
            Illustrative conceptual visualization — terrain tilt reflects the real SRTM-derived slope
            category at this location; structure dimensions are stylized, not an engineering-accurate
            model. Switch between options above, drag to rotate, scroll to zoom.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Structure3DPreview;
