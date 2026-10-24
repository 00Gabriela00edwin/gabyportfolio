import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Plane,
  Raycaster,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';

function createWingGeometry(points, triangles) {
  const geometry = new BufferGeometry();
  const positions = [];
  const uvs = [];
  const xValues = points.map(([x]) => x);
  const yValues = points.map(([, y]) => y);
  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);

  triangles.forEach((triangle) => {
    triangle.forEach((pointIndex) => {
      const [x, y, z] = points[pointIndex];
      positions.push(x, y, z);
      uvs.push((x - minX) / (maxX - minX), (y - minY) / (maxY - minY));
    });
  });

  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function createCodeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('No se pudo crear el contexto 2D para la textura de código de la mariposa.');
  }

  const codeLines = [
    ['const', ' orbit = useFrame(() => {'],
    ['  ', 'wing.flap(Math.sin(time));'],
    ['  ', 'position.lerp(target, 0.08);'],
    ['  ', 'color: "firefly-orange";'],
    ['  ', 'className="glow-cyan";'],
    ['});', ''],
  ];
  const colors = ['#ffc46b', '#54e5ff', '#ff75cb', '#ffc46b', '#54e5ff', '#ff75cb'];

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '17px "JetBrains Mono", monospace';
  context.textBaseline = 'middle';
  context.shadowBlur = 8;
  context.shadowColor = '#ff7b26';

  codeLines.forEach(([keyword, rest], index) => {
    const y = 24 + index * 39;
    context.fillStyle = colors[index];
    context.fillText(keyword, 16, y);
    context.fillStyle = '#ffe9c8';
    context.fillText(rest, 16 + context.measureText(keyword).width, y);
  });

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const WING_POINTS = [
  [0, 0, 0],
  [0.16, 0.24, 0.025],
  [0.48, 0.52, -0.035],
  [0.94, 0.54, 0.02],
  [1.13, 0.27, 0.045],
  [0.87, -0.04, -0.035],
  [0.38, -0.1, 0.03],
];

const LOWER_WING_POINTS = [
  [0, 0, 0],
  [0.28, 0.12, 0.02],
  [0.57, -0.05, -0.025],
  [0.55, -0.49, 0.03],
  [0.3, -0.68, 0.045],
  [0.08, -0.43, -0.02],
];

const UPPER_WING_TRIANGLES = [
  [0, 1, 2],
  [0, 2, 6],
  [2, 3, 6],
  [3, 5, 6],
  [3, 4, 5],
];

const LOWER_WING_TRIANGLES = [
  [0, 1, 5],
  [1, 2, 5],
  [2, 4, 5],
  [2, 3, 4],
];

export default function Butterfly({
  isEntered,
  audioLevel = 0,
  onSecretClick,
  reducedMotion = false,
  exitToCamera = false,
  anchorPosition,
  cursorFollow = false,
  scaleMultiplier = 1,
  onPositionUpdate,
}) {
  const butterflyRef = useRef(null);
  const exitTweenRef = useRef(null);
  const hasStartedExitRef = useRef(false);
  const { camera } = useThree();
  const upperWingsRef = useRef([]);
  const lowerWingsRef = useRef([]);
  const upperMaterialsRef = useRef([]);
  const lowerMaterialsRef = useRef([]);
  const pointerRef = useRef({ x: 0, y: 0 });
  const targetPosition = useMemo(() => new Vector3(), []);
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  const up = useMemo(() => new Vector3(), []);
  const cursorRaycaster = useMemo(() => new Raycaster(), []);
  const cursorPlane = useMemo(() => new Plane(), []);
  const cursorPlanePoint = useMemo(() => new Vector3(), []);
  const cursorNdc = useMemo(() => new Vector2(), []);
  const worldPosition = useMemo(() => new Vector3(), []);
  const wingGeometries = useMemo(() => ({
    upper: createWingGeometry(WING_POINTS, UPPER_WING_TRIANGLES),
    lower: createWingGeometry(LOWER_WING_POINTS, LOWER_WING_TRIANGLES),
  }), []);
  const codeTexture = useMemo(() => createCodeTexture(), []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      pointerRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = 1 - (event.clientY / window.innerHeight) * 2;
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', handlePointerMove);
  }, []);

  useEffect(() => () => {
    wingGeometries.upper.dispose();
    wingGeometries.lower.dispose();
    codeTexture.dispose();
  }, [codeTexture, wingGeometries]);

  useEffect(() => {
    if (!exitToCamera || hasStartedExitRef.current || !butterflyRef.current) return undefined;
    hasStartedExitRef.current = true;

    const destination = camera.position.clone();
    const cameraForward = new Vector3();
    camera.getWorldDirection(cameraForward);
    destination.addScaledVector(cameraForward, 2.2);

    exitTweenRef.current = gsap.timeline()
      .to(butterflyRef.current.position, {
        x: destination.x,
        y: destination.y,
        z: destination.z,
        duration: reducedMotion ? 0 : 1.55,
        ease: 'power2.inOut',
      }, 0)
      .to(butterflyRef.current.scale, {
        x: 1.8,
        y: 1.8,
        z: 1.8,
        duration: reducedMotion ? 0 : 1.55,
        ease: 'power2.in',
      }, 0);

    return () => exitTweenRef.current?.kill();
  }, [camera, exitToCamera, reducedMotion]);

  useFrame(({ camera, clock }, delta) => {
    if (exitToCamera) return;

    const elapsed = clock.elapsedTime;
    const pointer = pointerRef.current;
    const cameraQuaternion = camera.quaternion;
    forward.set(0, 0, -1).applyQuaternion(cameraQuaternion);
    right.set(1, 0, 0).applyQuaternion(cameraQuaternion);
    up.set(0, 1, 0).applyQuaternion(cameraQuaternion);

    if (anchorPosition) {
      if (cursorFollow) {
        cursorNdc.set(pointer.x, pointer.y);
        cursorRaycaster.setFromCamera(cursorNdc, camera);
        cursorPlanePoint.copy(camera.position).addScaledVector(forward, 22);
        cursorPlane.setFromNormalAndCoplanarPoint(forward, cursorPlanePoint);
        if (!cursorRaycaster.ray.intersectPlane(cursorPlane, targetPosition)) {
          targetPosition.set(...anchorPosition);
        }
      } else {
        targetPosition.set(...anchorPosition)
          .addScaledVector(right, reducedMotion ? 0 : Math.sin(elapsed * 0.78) * 0.28 + pointer.x * 0.28)
          .addScaledVector(up, reducedMotion ? 0 : Math.sin(elapsed * 1.07) * 0.14 + pointer.y * 0.16);
      }
    } else {
      targetPosition.copy(camera.position)
        .addScaledVector(forward, isEntered ? 5.5 : 3.2)
        .addScaledVector(right, (reducedMotion ? 0 : Math.sin(elapsed * 0.42) * 1.3) + (reducedMotion ? 0 : pointer.x * 2.2))
        .addScaledVector(up, (reducedMotion ? 0 : Math.cos(elapsed * 0.57) * 0.65) + (reducedMotion ? 0 : pointer.y * 1.25));
    }

    const butterfly = butterflyRef.current;
    if (!butterfly) return;

    const positionResponse = cursorFollow ? 7 : 1.8;
    butterfly.position.lerp(targetPosition, 1 - Math.exp(-delta * positionResponse));
    const targetScale = (isEntered ? 0.22 : 0.27) * scaleMultiplier;
    const scaleSmoothing = 1 - Math.exp(-delta * 1.5);
    const nextScale = butterfly.scale.x + (targetScale - butterfly.scale.x) * scaleSmoothing;
    butterfly.scale.setScalar(nextScale);
    butterfly.quaternion.slerp(cameraQuaternion, 1 - Math.exp(-delta * 2));
    const targetRotation = reducedMotion ? 0 : pointer.x * (cursorFollow ? -0.24 : -0.16);
    butterfly.rotation.z += (targetRotation - butterfly.rotation.z) * (1 - Math.exp(-delta * 1.5));
    if (onPositionUpdate) {
      butterfly.updateMatrixWorld(true);
      onPositionUpdate(butterfly.getWorldPosition(worldPosition));
    }

    const flap = reducedMotion ? 0 : Math.sin(elapsed * 15) * 0.58;
    const pulseFrequency = 3.2 + audioLevel * 1.4;
    const codePulse = reducedMotion
      ? 1.18 + audioLevel * 0.08
      : 0.7 + (Math.sin(elapsed * pulseFrequency) + 1) * (0.48 + audioLevel * 0.08);
    upperMaterialsRef.current.forEach((material) => {
      if (material) material.emissiveIntensity = codePulse;
    });
    lowerMaterialsRef.current.forEach((material) => {
      if (material) material.emissiveIntensity = codePulse * 0.88;
    });
    upperWingsRef.current.forEach((wing, index) => {
      if (wing) wing.rotation.y = (index === 0 ? -1 : 1) * flap;
    });
    lowerWingsRef.current.forEach((wing, index) => {
      if (wing) wing.rotation.y = (index === 0 ? -1 : 1) * flap * 0.78;
    });
  });

  return (
    <group
      ref={butterflyRef}
      scale={0.27}
      onClick={(event) => {
        event.stopPropagation();
        onSecretClick?.();
      }}
    >
      <mesh scale={[0.55, 1.7, 0.65]}>
        <icosahedronGeometry args={[0.11, 0]} />
        <meshPhysicalMaterial
          color="#ff9a36"
          emissive="#d94b08"
          emissiveIntensity={1.35}
          flatShading
          iridescence={0.8}
          iridescenceIOR={1.35}
          iridescenceThicknessRange={[120, 520]}
          roughness={0.38}
          metalness={0.25}
        />
      </mesh>
      {[0, 1].map((index) => (
        <group
          key={`upper-wing-${index}`}
          ref={(element) => { upperWingsRef.current[index] = element; }}
          position={[index === 0 ? -0.035 : 0.035, 0.035, 0]}
          scale={[index === 0 ? -1 : 1, 1, 1]}
        >
          <mesh geometry={wingGeometries.upper}>
            <meshPhysicalMaterial
              ref={(material) => { upperMaterialsRef.current[index] = material; }}
              color={index === 0 ? '#ff7518' : '#dd4cff'}
              emissive={index === 0 ? '#e84b08' : '#711ca0'}
              emissiveMap={codeTexture}
              emissiveIntensity={1.25}
              flatShading
              side={DoubleSide}
              iridescence={0.9}
              iridescenceIOR={1.4}
              iridescenceThicknessRange={[100, 640]}
              roughness={0.42}
              metalness={0.18}
            />
          </mesh>
          <mesh geometry={wingGeometries.upper} scale={[1, 1, 1.015]}>
            <meshBasicMaterial
              color={index === 0 ? '#ffd071' : '#42dfff'}
              wireframe
              transparent
              opacity={0.58}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
        </group>
      ))}
      {[0, 1].map((index) => (
        <group
          key={`lower-wing-${index}`}
          ref={(element) => { lowerWingsRef.current[index] = element; }}
          position={[index === 0 ? -0.025 : 0.025, -0.02, 0.015]}
          scale={[index === 0 ? -1 : 1, 1, 1]}
        >
          <mesh geometry={wingGeometries.lower}>
            <meshPhysicalMaterial
              ref={(material) => { lowerMaterialsRef.current[index] = material; }}
              color={index === 0 ? '#ffad42' : '#28bde8'}
              emissive={index === 0 ? '#d94b08' : '#075e9a'}
              emissiveMap={codeTexture}
              emissiveIntensity={1.15}
              flatShading
              side={DoubleSide}
              iridescence={0.88}
              iridescenceIOR={1.38}
              iridescenceThicknessRange={[140, 600]}
              roughness={0.48}
              metalness={0.12}
            />
          </mesh>
          <mesh geometry={wingGeometries.lower} scale={[1, 1, 1.015]}>
            <meshBasicMaterial
              color={index === 0 ? '#f0bc59' : '#5be8f4'}
              wireframe
              transparent
              opacity={0.5}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.13, 0.015]} rotation={[0, 0, 0.48]}>
        <cylinderGeometry args={[0.003, 0.008, 0.2, 5]} />
        <meshBasicMaterial color="#ffbd71" />
      </mesh>
      <mesh position={[0, 0.13, 0.015]} rotation={[0, 0, -0.48]}>
        <cylinderGeometry args={[0.003, 0.008, 0.2, 5]} />
        <meshBasicMaterial color="#ffbd71" />
      </mesh>
      <pointLight color="#ff6b18" intensity={0.7} distance={3.5} decay={2} />
    </group>
  );
}
