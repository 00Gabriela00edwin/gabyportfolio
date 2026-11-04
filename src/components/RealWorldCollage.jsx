import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import * as THREE from 'three';
import ButterflyGuide from './ButterflyGuide';
import { useAppAudio } from '../audio/AudioContext';

const TERRAIN_WIDTH = 34;
const TERRAIN_DEPTH = 50;
const TERRAIN_SEGMENTS_X = 190;
const TERRAIN_SEGMENTS_Z = 210;
const GRASS_TUFT_COUNT = 48000;

function createTerrainMaps() {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorContext = colorCanvas.getContext('2d');
  const image = colorContext.createImageData(size, size);
  let seed = 78317;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const heights = new Float32Array(size * size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const broadGrain = Math.sin(x * 0.038 + Math.sin(y * 0.014) * 3.1)
        * Math.cos(y * 0.032 + x * 0.009);
      const fineGrain = (random() - 0.5) * 0.16;
      const crackField = Math.abs(Math.sin(x * 0.031 + Math.sin(y * 0.013) * 2.8)
        * Math.cos(y * 0.026 + Math.sin(x * 0.01) * 2.4));
      const crack = crackField < 0.027 ? -0.24 : 0;
      const height = THREE.MathUtils.clamp(0.56 + broadGrain * 0.12 + fineGrain + crack, 0.08, 0.94);
      heights[index] = height;
      const tone = 224 + Math.round((height - 0.5) * 32);
      const pixel = index * 4;
      image.data[pixel] = tone;
      image.data[pixel + 1] = tone;
      image.data[pixel + 2] = tone;
      image.data[pixel + 3] = 255;
    }
  }
  colorContext.putImageData(image, 0, 0);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalContext = normalCanvas.getContext('2d');
  const normalImage = normalContext.createImageData(size, size);
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpContext = bumpCanvas.getContext('2d');
  const bumpImage = bumpContext.createImageData(size, size);
  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = size;
  roughnessCanvas.height = size;
  const roughnessContext = roughnessCanvas.getContext('2d');
  const roughnessImage = roughnessContext.createImageData(size, size);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      const left = heights[y * size + Math.max(0, x - 1)];
      const right = heights[y * size + Math.min(size - 1, x + 1)];
      const up = heights[Math.max(0, y - 1) * size + x];
      const down = heights[Math.min(size - 1, y + 1) * size + x];
      const nx = (left - right) * 2.6;
      const ny = (up - down) * 2.6;
      const inverseLength = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const pixel = index * 4;
      normalImage.data[pixel] = Math.round((nx * inverseLength * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 1] = Math.round((ny * inverseLength * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 2] = Math.round((inverseLength * 0.5 + 0.5) * 255);
      normalImage.data[pixel + 3] = 255;

      const height = heights[index];
      const bumpTone = Math.round(height * 255);
      bumpImage.data[pixel] = bumpTone;
      bumpImage.data[pixel + 1] = bumpTone;
      bumpImage.data[pixel + 2] = bumpTone;
      bumpImage.data[pixel + 3] = 255;

      const roughness = height < 0.2 ? 245 : 190 + Math.round(height * 45);
      roughnessImage.data[pixel] = roughness;
      roughnessImage.data[pixel + 1] = roughness;
      roughnessImage.data[pixel + 2] = roughness;
      roughnessImage.data[pixel + 3] = 255;
    }
  }
  normalContext.putImageData(normalImage, 0, 0);
  bumpContext.putImageData(bumpImage, 0, 0);
  roughnessContext.putImageData(roughnessImage, 0, 0);

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
  [colorMap, normalMap, bumpMap, roughnessMap].forEach((texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 7);
    texture.anisotropy = 4;
  });
  return { colorMap, normalMap, bumpMap, roughnessMap };
}

function pathCenter(z) {
  return Math.sin(z * 0.16) * 0.58 + Math.sin(z * 0.047) * 0.55;
}

function branchTrailCenterX(z) {
  const progress = THREE.MathUtils.smoothstep(z, -10.1, 2.4);
  const start = pathCenter(2.4) - 0.85;
  return THREE.MathUtils.lerp(-8.35, start, progress) + Math.sin(progress * Math.PI) * 0.32;
}

function cabinTrailCenterX(z) {
  const progress = THREE.MathUtils.smoothstep(z, -8.4, 2.4);
  const approach = THREE.MathUtils.lerp(11.1, pathCenter(2.4) + 0.4, progress)
    + Math.sin(progress * Math.PI) * 0.32;
  if (z >= -8.4) return approach;
  if (z < -15.5) {
    const ascent = THREE.MathUtils.clamp((-z - 15.5) / 8.1, 0, 1);
    return 12.4 - ascent * 2.3 + Math.sin(ascent * Math.PI * 2) * 0.72;
  }
  const forestProgress = THREE.MathUtils.smoothstep(z, -15.5, -8.4);
  return THREE.MathUtils.lerp(12.4, 11.1, forestProgress)
    + Math.sin(forestProgress * Math.PI) * 1.28;
}

const READER_LOCAL_Z = -9.2;
const READER_POSITION = {
  x: -9.45,
  z: READER_LOCAL_Z + 1,
};
const RIVERSIDE_TREE_POSITION = { x: -12.1, z: -10.7 };
const MOUNTAIN_SUMMIT = { x: 10.1, z: -23.2 };

function mountainLiftAt(x, z) {
  const horizontal = (x - MOUNTAIN_SUMMIT.x) / 6.1;
  const depth = (z - MOUNTAIN_SUMMIT.z) / 7.4;
  const ridge = Math.sin(x * 0.62 + z * 0.24) * 0.13
    + Math.cos(z * 0.78 - x * 0.19) * 0.1;
  const ridgeMask = Math.exp(-((horizontal * horizontal + depth * depth) * 0.72));
  return Math.max(0, 5.8 * Math.exp(-((horizontal * horizontal + depth * depth) * 0.78))
    + ridge * ridgeMask);
}

function streamCenterZ(x) {
  return -8.25 + Math.sin((x + 10) * 0.72) * 0.22
    + Math.sin((x + 10) * 1.6) * 0.08;
}

function terrainHeight(x, z) {
  const distanceFromPath = Math.abs(x - pathCenter(z));
  const bank = Math.exp(-1 * (((distanceFromPath - 1.85) / 0.7) ** 2)) * 0.78;
  const pathCut = Math.exp(-((distanceFromPath / 1.05) ** 4)) * 0.28;
  const branchDistance = Math.abs(x - branchTrailCenterX(z));
  const branchGate = THREE.MathUtils.smoothstep(z, -10.6, -9.8)
    * (1 - THREE.MathUtils.smoothstep(z, 2.05, 2.7));
  const branchCut = Math.exp(-((branchDistance / 0.9) ** 4)) * branchGate * 0.12;
  const cabinDistance = Math.abs(x - cabinTrailCenterX(z));
  const cabinGate = THREE.MathUtils.smoothstep(z, -24.2, -23.4)
    * (1 - THREE.MathUtils.smoothstep(z, 2.05, 2.7));
  const cabinCut = Math.exp(-((cabinDistance / 0.9) ** 4)) * cabinGate * 0.12;
  const creekDistance = Math.abs(z - streamCenterZ(x));
  const mountainLift = mountainLiftAt(x, z);
  const creekGate = THREE.MathUtils.smoothstep(x, -15, -13.5)
    * (1 - THREE.MathUtils.smoothstep(x, -7.7, -5.8));
  const creekCut = Math.exp(-((creekDistance / 0.52) ** 2)) * creekGate * 0.5;
  const creekBank = Math.exp(-(((creekDistance - 0.82) / 0.28) ** 2)) * creekGate * 0.19;
  const furrows = Math.sin(x * 1.85 + z * 0.45 + Math.sin(z * 0.18) * 0.7)
    * Math.cos(z * 1.2 - x * 0.3) * 0.055;
  const rollingGround = Math.sin(x * 0.42 + z * 0.26 + Math.sin(z * 0.13) * 1.1) * 0.22
    + Math.cos(z * 0.38 + Math.sin(x * 0.2)) * 0.18
    + Math.sin(x * 1.2 + z * 0.72) * Math.cos(z * 0.94 - x * 0.36) * 0.11
    + Math.sin(x * 3.7 + z * 2.8) * 0.035;
  const wheelRuts = Math.exp(-(((distanceFromPath - 0.34) / 0.1) ** 2)) * 0.035;
  return -1.35 - z * 0.023 + bank - pathCut - branchCut - cabinCut - creekCut
    + creekBank - wheelRuts + furrows + rollingGround + mountainLift;
}

function createTerrainGeometry() {
  const geometry = new THREE.BufferGeometry();
  const count = (TERRAIN_SEGMENTS_X + 1) * (TERRAIN_SEGMENTS_Z + 1);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices = [];
  const soil = new THREE.Color('#874629');
  const drySoil = new THREE.Color('#a96138');
  const field = new THREE.Color('#71804b');
  const fieldLight = new THREE.Color('#929565');

  for (let row = 0; row <= TERRAIN_SEGMENTS_Z; row += 1) {
    const z = (row / TERRAIN_SEGMENTS_Z - 0.5) * TERRAIN_DEPTH;
    for (let column = 0; column <= TERRAIN_SEGMENTS_X; column += 1) {
      const x = (column / TERRAIN_SEGMENTS_X - 0.5) * TERRAIN_WIDTH;
      const index = row * (TERRAIN_SEGMENTS_X + 1) + column;
      const distanceFromPath = Math.abs(x - pathCenter(z));
      const edgeBreakup = Math.sin(z * 2.1 + x * 1.3 + Math.sin(x * 0.8) * 0.8) * 0.14
        + Math.sin(z * 5.7 - x * 1.9) * 0.055;
      const pathBlend = 1 - THREE.MathUtils.smoothstep(distanceFromPath, 0.78 + edgeBreakup, 1.65 + edgeBreakup);
      const branchDistance = Math.abs(x - branchTrailCenterX(z));
      const branchGate = THREE.MathUtils.smoothstep(z, -10.6, -9.8)
        * (1 - THREE.MathUtils.smoothstep(z, 2.05, 2.7));
      const branchBlend = (1 - THREE.MathUtils.smoothstep(branchDistance, 0.58, 1.02)) * branchGate;
      const cabinDistance = Math.abs(x - cabinTrailCenterX(z));
      const cabinGate = THREE.MathUtils.smoothstep(z, -24.2, -23.4)
        * (1 - THREE.MathUtils.smoothstep(z, 2.05, 2.7));
      const cabinBlend = (1 - THREE.MathUtils.smoothstep(cabinDistance, 0.58, 1.02)) * cabinGate;
      const creekDistance = Math.abs(z - streamCenterZ(x));
      const creekGate = THREE.MathUtils.smoothstep(x, -15, -13.5)
        * (1 - THREE.MathUtils.smoothstep(x, -7.7, -5.8));
      const creekBlend = (1 - THREE.MathUtils.smoothstep(creekDistance, 0.42, 0.96)) * creekGate;
      const variation = (
        Math.sin(x * 0.78 + Math.sin(z * 0.33) * 2.1) * Math.cos(z * 0.62 + Math.sin(x * 0.41) * 1.4) * 0.72
        + Math.sin(x * 2.8 + z * 1.9) * Math.cos(z * 2.4 - x * 0.7) * 0.34
        + Math.sin(x * 8.7 + z * 6.3) * 0.12
      ) * 0.52;
      const groundColor = variation > 0
        ? field.clone().lerp(fieldLight, variation * 0.3)
        : field.clone().lerp(new THREE.Color('#526744'), -variation * 0.22);
      const pathColor = soil.clone().lerp(drySoil, (variation + 1) * 0.16);
      const branchColor = soil.clone().lerp(new THREE.Color('#783b27'), (variation + 1) * 0.13);
      const cabinColor = soil.clone().lerp(new THREE.Color('#783b27'), (variation + 1) * 0.13);
      const creekBankColor = new THREE.Color('#654f3d').lerp(field, THREE.MathUtils.clamp((variation + 1) * 0.12, 0, 0.3));
      const mountainLift = mountainLiftAt(x, z);
      const mountainBlend = THREE.MathUtils.smoothstep(mountainLift, 1.1, 4.8);
      const mountainColor = new THREE.Color('#796557').lerp(
        new THREE.Color('#a78670'),
        THREE.MathUtils.clamp((variation + 1) * 0.28, 0, 0.56),
      );
      const color = groundColor
        .lerp(mountainColor, mountainBlend)
        .lerp(pathColor, pathBlend)
        .lerp(branchColor, branchBlend)
        .lerp(cabinColor, cabinBlend)
        .lerp(creekBankColor, creekBlend);

      positions[index * 3] = x;
      positions[index * 3 + 1] = terrainHeight(x, z);
      positions[index * 3 + 2] = z;
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
      uvs[index * 2] = column / TERRAIN_SEGMENTS_X;
      uvs[index * 2 + 1] = row / TERRAIN_SEGMENTS_Z;

      if (row < TERRAIN_SEGMENTS_Z && column < TERRAIN_SEGMENTS_X) {
        const nextRow = index + TERRAIN_SEGMENTS_X + 1;
        indices.push(index, nextRow, index + 1, index + 1, nextRow, nextRow + 1);
      }
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function createTrailGeometry(centerAt, startZ, endZ, width = 1.12) {
  const segments = 160;
  const widthSegments = 8;
  const reverseWinding = centerAt(endZ) > centerAt(startZ);
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row <= segments; row += 1) {
    const progress = row / segments;
    const z = THREE.MathUtils.lerp(startZ, endZ, progress);
    const centerX = centerAt(z);
    const rowWidth = width + Math.sin(progress * Math.PI * 8) * 0.035;
    for (let column = 0; column <= widthSegments; column += 1) {
      const across = column / widthSegments;
      const x = centerX + (across - 0.5) * rowWidth * 2;
      positions.push(x, terrainHeight(x, z) + 0.055, z);
      uvs.push(across, progress * 7);
      if (row < segments && column < widthSegments) {
        const current = row * (widthSegments + 1) + column;
        const nextRow = current + widthSegments + 1;
        if (reverseWinding) {
          indices.push(current, current + 1, nextRow, current + 1, nextRow + 1, nextRow);
        } else {
          indices.push(current, nextRow, current + 1, current + 1, nextRow, nextRow + 1);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function createBranchTrailGeometry() {
  return createTrailGeometry(branchTrailCenterX, 2.4, -10.1);
}

function createCabinTrailGeometry() {
  return createTrailGeometry(cabinTrailCenterX, 2.4, -23.8, 1.08);
}

function createCreekGeometry() {
  const segments = 112;
  const widthSegments = 10;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row <= segments; row += 1) {
    const progress = row / segments;
    const x = THREE.MathUtils.lerp(-14.6, -6.1, progress);
    const centerZ = streamCenterZ(x);
    for (let column = 0; column <= widthSegments; column += 1) {
      const across = column / widthSegments;
      const endTaper = THREE.MathUtils.smoothstep(progress, 0, 0.08)
        * (1 - THREE.MathUtils.smoothstep(progress, 0.92, 1));
      const z = centerZ + (across - 0.5) * 1.06 * (0.55 + endTaper * 0.45);
      positions.push(x, terrainHeight(x, z) + 0.205, z);
      uvs.push(progress * 7, across);
      if (row < segments && column < widthSegments) {
        const current = row * (widthSegments + 1) + column;
        const nextRow = current + widthSegments + 1;
        indices.push(current, nextRow, current + 1, current + 1, nextRow, nextRow + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function SkyDome({ reducedMotion }) {
  const material = useRef(null);
  const shader = useMemo(() => ({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;

      float hash(vec2 point) {
        return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        return mix(
          mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
          mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x),
          local.y
        );
      }

      float cloudNoise(vec2 point) {
        float result = 0.0;
        float amplitude = 0.5;
        for (int octave = 0; octave < 5; octave++) {
          result += noise(point) * amplitude;
          point *= 2.03;
          amplitude *= 0.5;
        }
        return result;
      }

      void main() {
        float height = smoothstep(0.03, 0.92, vUv.y);
        vec3 horizon = vec3(1.0, 0.55, 0.24);
        vec3 sunsetBand = vec3(0.71, 0.35, 0.43);
        vec3 zenith = vec3(0.19, 0.22, 0.48);
        vec3 sky = mix(horizon, sunsetBand, smoothstep(0.02, 0.42, height));
        sky = mix(sky, zenith, smoothstep(0.38, 0.96, height));
        float horizonGlow = exp(-pow((vUv.y - 0.16) * 9.0, 2.0));
        sky += vec3(0.2, 0.055, 0.012) * horizonGlow;
        vec2 cloudUv = vec2(vUv.x * 8.0 + uTime * 0.003, vUv.y * 5.0 + uTime * 0.001);
        float clouds = cloudNoise(cloudUv);
        float cloudMask = smoothstep(0.58, 0.84, clouds) * (1.0 - smoothstep(0.78, 0.98, vUv.y));
        float cloudLight = smoothstep(0.05, 0.4, vUv.y);
        vec3 cloudColor = mix(vec3(0.93, 0.39, 0.2), vec3(0.94, 0.72, 0.73), cloudLight);
        cloudColor = mix(cloudColor, vec3(1.0, 0.86, 0.62), horizonGlow * 0.55);
        gl_FragColor = vec4(mix(sky, cloudColor, cloudMask * 0.72), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  useFrame(({ clock }) => {
    if (material.current && !reducedMotion) material.current.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <mesh>
      <sphereGeometry args={[90, 48, 32]} />
      <shaderMaterial ref={material} args={[shader]} side={THREE.BackSide} />
    </mesh>
  );
}

function createRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function createBarkMaps() {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughnessCanvas = document.createElement('canvas');
  [colorCanvas, normalCanvas, roughnessCanvas].forEach((canvas) => {
    canvas.width = size;
    canvas.height = size;
  });
  const colorContext = colorCanvas.getContext('2d');
  const normalContext = normalCanvas.getContext('2d');
  const roughnessContext = roughnessCanvas.getContext('2d');
  colorContext.fillStyle = '#806043';
  colorContext.fillRect(0, 0, size, size);
  normalContext.fillStyle = 'rgb(128, 128, 255)';
  normalContext.fillRect(0, 0, size, size);
  roughnessContext.fillStyle = '#d0d0d0';
  roughnessContext.fillRect(0, 0, size, size);
  const random = createRandom(3419);

  for (let index = 0; index < 170; index += 1) {
    const x = random() * size;
    const width = 1 + random() * 5;
    const tone = Math.floor(72 + random() * 75);
    colorContext.strokeStyle = `rgba(${tone}, ${Math.floor(tone * 0.72)}, ${Math.floor(tone * 0.48)}, ${0.12 + random() * 0.35})`;
    colorContext.lineWidth = width;
    colorContext.beginPath();
    colorContext.moveTo(x, 0);
    colorContext.bezierCurveTo(
      x + (random() - 0.5) * 18,
      size * 0.33,
      x + (random() - 0.5) * 16,
      size * 0.66,
      x + (random() - 0.5) * 12,
      size,
    );
    colorContext.stroke();

    normalContext.strokeStyle = random() > 0.5 ? 'rgb(142, 128, 247)' : 'rgb(113, 128, 249)';
    normalContext.lineWidth = Math.max(1, width * 0.55);
    normalContext.beginPath();
    normalContext.moveTo(x, 0);
    normalContext.lineTo(x + (random() - 0.5) * 8, size);
    normalContext.stroke();

    const roughness = Math.floor(145 + random() * 100);
    roughnessContext.strokeStyle = `rgb(${roughness}, ${roughness}, ${roughness})`;
    roughnessContext.lineWidth = width;
    roughnessContext.beginPath();
    roughnessContext.moveTo(x, 0);
    roughnessContext.lineTo(x + (random() - 0.5) * 14, size);
    roughnessContext.stroke();
  }

  const colorMap = new THREE.CanvasTexture(colorCanvas);
  colorMap.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  const roughnessMap = new THREE.CanvasTexture(roughnessCanvas);
  [colorMap, normalMap, roughnessMap].forEach((texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.4, 1);
    texture.anisotropy = 4;
  });
  return { colorMap, normalMap, roughnessMap };
}

function addWindToMaterial(material, amplitude, perInstanceWind = false) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = { value: 0 };
    const windAttribute = perInstanceWind ? '\nattribute float instanceWind;' : '';
    const instanceStrength = perInstanceWind ? ' * instanceWind' : '';
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\nuniform float uWindTime;${windAttribute}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float windPhase = uWindTime * 1.15 + instanceMatrix[3].x * 0.61 + instanceMatrix[3].z * 0.47;
      transformed.x += sin(windPhase + position.y * 2.6) * position.y * ${amplitude.toFixed(4)}${instanceStrength};`,
    );
    material.userData.windShader = shader;
  };
  material.customProgramCacheKey = () => `meadow-wind-${amplitude}-${perInstanceWind}`;
}

function createGrassGeometry() {
  const geometry = new THREE.BufferGeometry();
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = 2;

  for (let plane = 0; plane < 3; plane += 1) {
    const angle = (plane * Math.PI * 2) / 3;
    const offset = positions.length / 3;
    for (let segment = 0; segment <= segments; segment += 1) {
      const height = segment / segments;
      const halfWidth = 0.08 * (1 - height) ** 1.2 + 0.002;
      const y = height * 0.72 * (0.86 + plane * 0.07);
      const lean = height * (plane - 1) * 0.018;
      const dx = Math.cos(angle) * halfWidth;
      const dz = Math.sin(angle) * halfWidth;
      const centerX = Math.cos(angle) * lean;
      const centerZ = Math.sin(angle) * lean;
      positions.push(centerX - dx, y, centerZ - dz, centerX + dx, y, centerZ + dz);
      uvs.push(0, height, 1, height);
      if (segment < segments) {
        const current = offset + segment * 2;
        indices.push(current, current + 1, current + 2, current + 1, current + 3, current + 2);
      }
    }
  }

  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function MeadowGrass({ reducedMotion }) {
  const grassRef = useRef(null);
  const grassGeometry = useMemo(() => createGrassGeometry(), []);
  const windValues = useMemo(() => {
    const random = createRandom(22561);
    return new Float32Array(GRASS_TUFT_COUNT).map(() => (random() < 0.38 ? 0.35 + random() * 0.65 : 0));
  }, []);
  const grassMaterial = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      side: THREE.DoubleSide,
    });
    addWindToMaterial(material, 0.22, true);
    return material;
  }, []);
  const grass = useMemo(() => {
    const nextRandom = createRandom(79231);
    const blades = [];
    const targetCount = GRASS_TUFT_COUNT;
    let attempts = 0;
    while (blades.length < targetCount && attempts < targetCount * 4) {
      attempts += 1;
      const x = -16.4 + nextRandom() * 32.8;
      const z = -18.2 + nextRandom() * 36.4;
      const mainPathDistance = Math.abs(x - pathCenter(z));
      const branchActive = z >= -10.5 && z <= 2.7;
      const branchDistance = Math.abs(x - branchTrailCenterX(z));
      const cabinTrailActive = z >= -23.8 && z <= 2.7;
      const cabinTrailDistance = Math.abs(x - cabinTrailCenterX(z));
      const creekDistance = Math.abs(z - streamCenterZ(x));
      const mountainLift = mountainLiftAt(x, z);
      const nearCreek = x >= -15 && x <= -5.8;
      if (
        mainPathDistance < 1.72
        || (branchActive && branchDistance < 1.34)
        || (cabinTrailActive && cabinTrailDistance < 1.34)
        || (nearCreek && creekDistance < 0.95)
        || mountainLift > 1.15
      ) continue;

      const edgeColor = ['#536f43', '#66804a', '#7d8e50', '#98a061'];
      blades.push({
        x,
        y: terrainHeight(x, z) + 0.018,
        z,
        height: 0.17 + nextRandom() * 0.2,
        rotation: nextRandom() * Math.PI * 2,
        color: new THREE.Color(edgeColor[Math.floor(nextRandom() * edgeColor.length)]),
      });
    }
    return blades;
  }, []);
  const scratch = useMemo(() => ({
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    matrix: new THREE.Matrix4(),
  }), []);

  useLayoutEffect(() => {
    const grassMesh = grassRef.current;
    if (!grassMesh) return;
    grassGeometry.setAttribute('instanceWind', new THREE.InstancedBufferAttribute(windValues, 1));
    const { position, scale, rotation, matrix } = scratch;
    grass.forEach((blade, index) => {
      position.set(blade.x, blade.y, blade.z);
      scale.setScalar(blade.height);
      rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, blade.rotation);
      matrix.compose(position, rotation, scale);
      grassMesh.setMatrixAt(index, matrix);
      grassMesh.setColorAt(index, blade.color);
    });
    grassMesh.instanceMatrix.needsUpdate = true;
    if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
  }, [grass, grassGeometry, scratch, windValues]);

  useFrame(({ clock }) => {
    if (!reducedMotion && grassRef.current?.material.userData.windShader) {
      grassRef.current.material.userData.windShader.uniforms.uWindTime.value = clock.elapsedTime;
    }
  });

  useEffect(() => () => {
    grassGeometry.dispose();
    grassMaterial.dispose();
  }, [grassGeometry, grassMaterial]);

  return (
    <instancedMesh
      ref={grassRef}
      args={[grassGeometry, grassMaterial, grass.length]}
      frustumCulled={false}
    />
  );
}

function Forest() {
  const instanceRefs = useRef([]);
  const windMaterialRefs = useRef([]);
  const branchGeometry = useMemo(() => new THREE.CylinderGeometry(0.025, 0.075, 1, 7, 2), []);
  const trunkGeometry = useMemo(() => {
    const geometry = new THREE.CylinderGeometry(0.11, 0.2, 1, 9, 8);
    const positions = geometry.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const heightWeight = (y + 0.5);
      const irregularity = Math.sin(y * 13 + Math.atan2(z, x) * 3) * 0.025
        + Math.sin(y * 27 + Math.atan2(z, x) * 6) * 0.012;
      positions.setX(index, x + x * irregularity + Math.sin(y * 5) * heightWeight * 0.035);
      positions.setZ(index, z + z * irregularity + Math.cos(y * 4) * heightWeight * 0.025);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  const crownGeometries = useMemo(() => {
    const broadleaf = new THREE.SphereGeometry(1, 14, 10);
    const positions = broadleaf.attributes.position;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const z = positions.getZ(index);
      const variation = 1
        + Math.sin(x * 5.2 + z * 3.1) * 0.062
        + Math.sin(y * 7.3 - z * 4.4) * 0.045;
      positions.setXYZ(index, x * variation, y * variation, z * variation);
    }
    broadleaf.computeVertexNormals();
    const understory = broadleaf.clone();
    understory.scale(0.86, 0.78, 0.9);
    understory.computeVertexNormals();
    return [
      new THREE.ConeGeometry(1, 1, 9, 3),
      broadleaf,
      understory,
    ];
  }, []);
  const barkMaps = useMemo(() => createBarkMaps(), []);
  const trunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: barkMaps.colorMap,
    normalMap: barkMaps.normalMap,
    normalScale: new THREE.Vector2(0.52, 0.68),
    roughnessMap: barkMaps.roughnessMap,
    roughness: 0.96,
  }), [barkMaps]);
  const foliageMaterials = useMemo(() => Array.from({ length: 3 }, (_, layer) => {
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.91 - layer * 0.035,
    });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTreeWindTime = { value: 0 };
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        '#include <common>\nuniform float uTreeWindTime;',
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float canopyHeight = smoothstep(-0.15, 0.85, position.y);
        float canopyPhase = uTreeWindTime * 0.42 + instanceMatrix[3].x * 0.28 + instanceMatrix[3].z * 0.23;
        transformed.x += sin(canopyPhase + position.y * 2.1) * canopyHeight * 0.055;
        transformed.z += cos(canopyPhase * 0.83 + position.y * 1.7) * canopyHeight * 0.035;`,
      );
      material.userData.windShader = shader;
    };
    material.customProgramCacheKey = () => `tree-canopy-wind-layer-${layer}`;
    return material;
  }), []);
  const trees = useMemo(() => {
    const groups = [[], [], []];
    const greens = [
      [
        ['#405e42', '#4d7049', '#5b784b'],
        ['#52754b', '#638350', '#748d58'],
        ['#6e8754', '#829660', '#94a06b'],
      ],
      [
        ['#496749', '#58764f', '#688454'],
        ['#5b7d50', '#6e8b58', '#81965f'],
        ['#78905e', '#8b9c69', '#a0a675'],
      ],
      [
        ['#58704a', '#6b8051', '#7b8d58'],
        ['#708650', '#829359', '#919e63'],
        ['#8a9a5e', '#99a46a', '#acac79'],
      ],
    ];
    const nextRandom = createRandom(91273);

    const treeCount = 120;
    const treesPerSide = treeCount / 2;
    for (let index = 0; index < treeCount; index += 1) {
      const type = index % 3;
      const row = Math.floor(index / 2);
      const lane = row % 4;
      const z = 15
        - (row / (treesPerSide - 1)) * 32
        + (nextRandom() - 0.5) * 0.34;
      const side = index % 2 === 0 ? -1 : 1;
      let x = pathCenter(z) + side * (4.5 + lane * 1.9 + nextRandom() * 1.2);
      const branchActive = z >= -10.5 && z <= 2.7;
      const nearCreek = x >= -15 && x <= -5.8 && Math.abs(z - streamCenterZ(x)) < 1.7;
      if (nearCreek) {
        x = Math.min(-5.4, x + (side < 0 ? -2.4 : 2.4));
      }
      if (Math.abs(x - pathCenter(z)) < 3.2) continue;
      if (branchActive && Math.abs(x - branchTrailCenterX(z)) < 3.2) continue;
      if (Math.hypot(x - READER_POSITION.x, z - (READER_POSITION.z - 1)) < 9.5) continue;
      if (mountainLiftAt(x, z) > 1.4) continue;
      if (x > 7 && Math.abs(z + 8.4) < 5.2) continue;
      if (z >= -23.8 && z <= 2.7 && Math.abs(x - cabinTrailCenterX(z)) < 3.2) continue;
      const height = type === 2 ? 0.55 + nextRandom() * 0.55 : 2.5 + nextRandom() * 2.8;
      const treeScale = 0.82 + nextRandom() * 0.42;
      const crownScale = type === 0
        ? [0.62 + nextRandom() * 0.34, height * 0.48, 0.62 + nextRandom() * 0.34]
        : type === 1
          ? [0.95 + nextRandom() * 0.5, height * 0.34, 0.9 + nextRandom() * 0.45]
          : [0.55 + nextRandom() * 0.35, height * 0.42, 0.55 + nextRandom() * 0.35];
      groups[type].push({
        x,
        y: terrainHeight(x, z),
        z,
        height,
        treeScale,
        crownScale,
        rotation: new THREE.Euler(
          (nextRandom() - 0.5) * 0.11,
          nextRandom() * Math.PI * 2,
          (nextRandom() - 0.5) * 0.11,
        ),
        trunkColor: new THREE.Color().setHSL(0.075, 0.38, 0.48 + nextRandom() * 0.1),
        crownColors: greens[type].map((palette) => new THREE.Color(palette[Math.floor(nextRandom() * palette.length)])),
        branchSeed: nextRandom(),
      });
    }
    return groups;
  }, []);
  useEffect(() => {
    windMaterialRefs.current = foliageMaterials;
  }, [foliageMaterials]);
  const matrices = useMemo(() => ({
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    matrix: new THREE.Matrix4(),
  }), []);

  useLayoutEffect(() => {
    const { position, scale, rotation, matrix } = matrices;
    const localPosition = new THREE.Vector3();
    const rootPosition = new THREE.Vector3();
    const rootQuaternion = new THREE.Quaternion();
    const rootScale = new THREE.Vector3();
    const branchStart = new THREE.Vector3();
    const branchEnd = new THREE.Vector3();
    const branchDirection = new THREE.Vector3();
    const branchQuaternion = new THREE.Quaternion();
    const branchUp = new THREE.Vector3(0, 1, 0);
    const branchPosition = new THREE.Vector3();
    const branchScale = new THREE.Vector3();
    const layers = [
      { height: 0.42, scale: 0.78, offset: [-0.12, 0.02, 0.08] },
      { height: 0.62, scale: 0.68, offset: [0.1, 0.03, -0.08] },
      { height: 0.8, scale: 0.55, offset: [-0.04, 0.05, 0.06] },
    ];
    trees.forEach((group, type) => {
      const trunks = instanceRefs.current[type * 5];
      if (!trunks) return;
      group.forEach((tree, index) => {
        rootQuaternion.setFromEuler(tree.rotation);
        rootPosition.set(tree.x, tree.y, tree.z);
        rootScale.setScalar(tree.treeScale);
        localPosition.set(0, tree.height * 0.23, 0).multiplyScalar(tree.treeScale).applyQuaternion(rootQuaternion);
        position.copy(rootPosition).add(localPosition);
        scale.set(0.78 * tree.treeScale, tree.height * 0.46 * tree.treeScale, 0.78 * tree.treeScale);
        rotation.copy(rootQuaternion);
        matrix.compose(position, rotation, scale);
        trunks.setMatrixAt(index, matrix);
        trunks.setColorAt(index, tree.trunkColor);

        layers.forEach((layer, layerIndex) => {
          const crowns = instanceRefs.current[type * 5 + layerIndex + 1];
          if (!crowns) return;
          const broadleaf = type === 1;
          const canopyHeight = broadleaf
            ? [0.56, 0.59, 0.55][layerIndex]
            : type === 2
              ? [0.48, 0.56, 0.53][layerIndex]
              : layer.height;
          const canopyOffsetX = broadleaf
            ? [0, -0.16, 0.16][layerIndex] * tree.crownScale[0]
            : layer.offset[0] * tree.crownScale[0];
          const canopyOffsetZ = broadleaf
            ? [-0.04, 0.08, -0.09][layerIndex] * tree.crownScale[2]
            : layer.offset[2] * tree.crownScale[2];
          localPosition.set(
            canopyOffsetX,
            tree.height * canopyHeight,
            canopyOffsetZ,
          ).multiplyScalar(tree.treeScale).applyQuaternion(rootQuaternion);
          position.copy(rootPosition).add(localPosition);
          scale.set(
            tree.crownScale[0] * (broadleaf ? 0.82 : layer.scale) * tree.treeScale,
            tree.crownScale[1] * (broadleaf ? 0.72 : layerIndex === 0 ? 0.78 : 0.58) * tree.treeScale,
            tree.crownScale[2] * (broadleaf ? 0.82 : layer.scale) * tree.treeScale,
          );
          matrix.compose(position, rotation, scale);
          crowns.setMatrixAt(index, matrix);
          crowns.setColorAt(index, tree.crownColors[layerIndex]);
        });
        const branches = instanceRefs.current[type * 5 + 4];
        if (branches) {
          for (let branchIndex = 0; branchIndex < 4; branchIndex += 1) {
            const branchInstance = index * 4 + branchIndex;
            if (type !== 1) {
              matrix.makeScale(0, 0, 0);
              branches.setMatrixAt(branchInstance, matrix);
              continue;
            }
            const side = branchIndex % 2 === 0 ? -1 : 1;
            const row = Math.floor(branchIndex / 2);
            branchStart.set(
              0,
              tree.height * (0.29 + row * 0.12),
              (branchIndex < 2 ? -1 : 1) * tree.crownScale[2] * 0.04,
            ).multiplyScalar(tree.treeScale).applyQuaternion(rootQuaternion).add(rootPosition);
            branchEnd.set(
              side * tree.crownScale[0] * (0.48 + tree.branchSeed * 0.12),
              tree.height * (0.49 + row * 0.13),
              (branchIndex < 2 ? -1 : 1) * tree.crownScale[2] * 0.3,
            ).multiplyScalar(tree.treeScale).applyQuaternion(rootQuaternion).add(rootPosition);
            branchDirection.subVectors(branchEnd, branchStart);
            branchPosition.addVectors(branchStart, branchEnd).multiplyScalar(0.5);
            branchQuaternion.setFromUnitVectors(branchUp, branchDirection.clone().normalize());
            branchScale.set(1, branchDirection.length(), 1);
            matrix.compose(branchPosition, branchQuaternion, branchScale);
            branches.setMatrixAt(branchInstance, matrix);
            branches.setColorAt(branchInstance, tree.trunkColor);
          }
        }
      });
      trunks.instanceMatrix.needsUpdate = true;
      if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
      for (let layerIndex = 0; layerIndex < 3; layerIndex += 1) {
        const crowns = instanceRefs.current[type * 5 + layerIndex + 1];
        if (!crowns) continue;
        crowns.instanceMatrix.needsUpdate = true;
        if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      }
      const branches = instanceRefs.current[type * 5 + 4];
      if (branches) {
        branches.instanceMatrix.needsUpdate = true;
        if (branches.instanceColor) branches.instanceColor.needsUpdate = true;
      }
    });
  }, [matrices, trees]);

  useFrame(({ clock }) => {
    if (!windMaterialRefs.current[0]) return;
    windMaterialRefs.current.forEach((material) => {
      if (material?.userData.windShader) {
        material.userData.windShader.uniforms.uTreeWindTime.value = clock.elapsedTime;
      }
    });
  });

  useEffect(() => () => {
    trunkGeometry.dispose();
    branchGeometry.dispose();
    crownGeometries.forEach((geometry) => geometry.dispose());
    trunkMaterial.dispose();
    foliageMaterials.forEach((material) => material.dispose());
    barkMaps.colorMap.dispose();
    barkMaps.normalMap.dispose();
    barkMaps.roughnessMap.dispose();
  }, [barkMaps, branchGeometry, crownGeometries, foliageMaterials, trunkGeometry, trunkMaterial]);

  return trees.map((group, type) => (
    <group key={type}>
      <instancedMesh
        ref={(mesh) => { instanceRefs.current[type * 5] = mesh; }}
        args={[trunkGeometry, trunkMaterial, group.length]}
        castShadow
        receiveShadow
      />
      {crownGeometries.map((geometry, layerIndex) => {
        const refIndex = type * 5 + layerIndex + 1;
        return (
          <instancedMesh
            key={layerIndex}
            ref={(mesh) => {
              instanceRefs.current[refIndex] = mesh;
            }}
            args={[geometry, foliageMaterials[layerIndex], group.length]}
            castShadow
            receiveShadow
          />
        );
      })}
      <instancedMesh
        ref={(mesh) => {
          instanceRefs.current[type * 5 + 4] = mesh;
        }}
        args={[branchGeometry, trunkMaterial, group.length * 4]}
        castShadow
        receiveShadow
      />
    </group>
  ));
}

function Wildflowers({ reducedMotion }) {
  const petalRef = useRef(null);
  const centerRef = useRef(null);
  const stemRef = useRef(null);
  const flowers = useMemo(() => {
    const nextRandom = createRandom(54109);
    const blooms = [];
    let attempts = 0;
    while (blooms.length < 860 && attempts < 4000) {
      attempts += 1;
      let x;
      let z;
      if (attempts <= 300) {
        z = -17 + nextRandom() * 34;
        const side = nextRandom() < 0.5 ? -1 : 1;
        x = pathCenter(z) + side * (1.28 + nextRandom() * 0.76);
      } else if (attempts <= 450) {
        z = 2.35 - nextRandom() * 12.45;
        const side = nextRandom() < 0.5 ? -1 : 1;
        x = branchTrailCenterX(z) + side * (1.24 + nextRandom() * 0.7);
      } else if (attempts <= 600) {
        z = 2.35 - nextRandom() * 4.45;
        const side = nextRandom() < 0.5 ? -1 : 1;
        x = cabinTrailCenterX(z) + side * (1.22 + nextRandom() * 0.7);
      } else if (attempts <= 760) {
        z = -2.4 - nextRandom() * 12.4;
        const side = nextRandom() < 0.5 ? -1 : 1;
        x = cabinTrailCenterX(z) + side * (1.24 + nextRandom() * 0.7);
      } else {
        x = -16 + nextRandom() * 32;
        z = -18 + nextRandom() * 36;
      }
      const mainDistance = Math.abs(x - pathCenter(z));
      const branchDistance = Math.abs(x - branchTrailCenterX(z));
      const cabinDistance = Math.abs(x - cabinTrailCenterX(z));
      const creekDistance = Math.abs(z - streamCenterZ(x));
      const mountainLift = mountainLiftAt(x, z);
      const branchActive = z >= -10.5 && z <= 2.7;
      const cabinTrailActive = z >= -23.8 && z <= 2.7;
      if (
        mainDistance < 1.2
        || (branchActive && branchDistance < 1.2)
        || (cabinTrailActive && cabinDistance < 1.2)
        || (x >= -15 && x <= -5.8 && creekDistance < 1.1)
        || mountainLift > 1.2
      ) continue;
      const colors = ['#fffaf0', '#f9f4df', '#fffdf5', '#fff7e8', '#e7a5a0', '#e9c56f', '#b9addd'];
      blooms.push({
        x,
        y: terrainHeight(x, z),
        z,
        scale: 0.48 + nextRandom() * 0.78,
        openness: 0.78 + nextRandom() * 0.3,
        color: new THREE.Color(colors[Math.floor(nextRandom() * colors.length)]),
        rotation: nextRandom() * Math.PI * 2,
      });
    }
    return blooms;
  }, []);
  const petalGeometry = useMemo(() => new THREE.SphereGeometry(1, 7, 5), []);
  const centerGeometry = useMemo(() => new THREE.SphereGeometry(0.045, 7, 5), []);
  const stemGeometry = useMemo(() => new THREE.CylinderGeometry(0.012, 0.02, 1, 5), []);
  const petalMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86 });
    addWindToMaterial(material, 0.14);
    return material;
  }, []);
  const centerMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color: '#f4c84e', roughness: 0.78 });
    addWindToMaterial(material, 0.14);
    return material;
  }, []);
  const stemMaterial = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color: '#71824f', roughness: 0.96 });
    addWindToMaterial(material, 0.14);
    return material;
  }, []);
  const scratch = useMemo(() => ({
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    matrix: new THREE.Matrix4(),
  }), []);

  useLayoutEffect(() => {
    const { position, scale, rotation, matrix } = scratch;
    flowers.forEach((flower, index) => {
      position.set(flower.x, flower.y + 0.2 * flower.scale, flower.z);
      scale.set(0.042 * flower.scale, 0.019 * flower.scale, 0.09 * flower.scale);
      for (let petal = 0; petal < 8; petal += 1) {
        const angle = flower.rotation + (petal / 8) * Math.PI * 2;
        position.x = flower.x + Math.sin(angle) * 0.064 * flower.scale * flower.openness;
        position.z = flower.z + Math.cos(angle) * 0.064 * flower.scale * flower.openness;
        rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
        matrix.compose(position, rotation, scale);
        petalRef.current?.setMatrixAt(index * 8 + petal, matrix);
        petalRef.current?.setColorAt(index * 8 + petal, flower.color);
      }

      position.set(flower.x, flower.y + 0.27 * flower.scale, flower.z);
      scale.setScalar(1);
      matrix.compose(position, rotation, scale);
      centerRef.current?.setMatrixAt(index, matrix);

      position.set(flower.x, flower.y + 0.12 * flower.scale, flower.z);
      scale.set(1, 0.24 * flower.scale, 1);
      matrix.compose(position, rotation, scale);
      stemRef.current?.setMatrixAt(index, matrix);
    });
    if (petalRef.current) {
      petalRef.current.instanceMatrix.needsUpdate = true;
      if (petalRef.current.instanceColor) petalRef.current.instanceColor.needsUpdate = true;
    }
    if (centerRef.current) centerRef.current.instanceMatrix.needsUpdate = true;
    if (stemRef.current) stemRef.current.instanceMatrix.needsUpdate = true;
  }, [flowers, scratch]);

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    [petalRef.current, centerRef.current, stemRef.current].forEach((mesh) => {
      if (mesh?.material.userData.windShader) {
        mesh.material.userData.windShader.uniforms.uWindTime.value = clock.elapsedTime;
      }
    });
  });

  useEffect(() => () => {
    petalGeometry.dispose();
    centerGeometry.dispose();
    stemGeometry.dispose();
    petalMaterial.dispose();
    centerMaterial.dispose();
    stemMaterial.dispose();
  }, [centerGeometry, centerMaterial, petalGeometry, petalMaterial, stemGeometry, stemMaterial]);

  return (
    <group>
      <instancedMesh ref={stemRef} args={[stemGeometry, stemMaterial, flowers.length]} />
      <instancedMesh ref={petalRef} args={[petalGeometry, petalMaterial, flowers.length * 8]} />
      <instancedMesh ref={centerRef} args={[centerGeometry, centerMaterial, flowers.length]} />
    </group>
  );
}

function PathStones() {
  const rocks = useRef([]);
  const geometries = useMemo(() => [
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.DodecahedronGeometry(1, 0),
  ], []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.94,
    flatShading: true,
  }), []);
  const stones = useMemo(() => {
    const nextRandom = createRandom(44621);
    const groups = [[], []];
    const colors = ['#713d31', '#95543b', '#a56c50', '#6d6258', '#887b6c', '#b17a56'];

    for (let index = 0; index < 320; index += 1) {
      const alongCabinTrail = index % 5 === 0 || index % 5 === 3;
      const alongBranch = index % 5 === 1;
      const z = alongCabinTrail
        ? 2.1 - nextRandom() * 24.7
        : alongBranch
          ? 2.1 - nextRandom() * 10.3
          : 13 - nextRandom() * 29;
      const side = nextRandom() < 0.5 ? -1 : 1;
      const center = alongCabinTrail
        ? cabinTrailCenterX(z)
        : alongBranch
          ? branchTrailCenterX(z)
          : pathCenter(z);
      const offset = alongBranch || alongCabinTrail
        ? 0.58 + nextRandom() * 0.95
        : 1.02 + nextRandom() * 2.1;
      const x = center + side * offset;
      const size = 0.028 + nextRandom() * 0.072;
      const creekside = Math.abs(z - streamCenterZ(x)) < 1.25 && x < -6 && x > -15;
      groups[creekside ? 1 : 0].push({
        x,
        y: terrainHeight(x, z),
        z,
        scale: [
          size * (0.78 + nextRandom() * 1.25),
          size * (0.36 + nextRandom() * 0.58),
          size * (0.72 + nextRandom() * 1.2),
        ],
        rotation: new THREE.Euler(
          nextRandom() * 0.3,
          nextRandom() * Math.PI,
          nextRandom() * 0.3,
        ),
        color: new THREE.Color(colors[Math.floor(nextRandom() * colors.length)]),
      });
    }
    return groups;
  }, []);

  useLayoutEffect(() => {
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const matrix = new THREE.Matrix4();

    stones.forEach((group, type) => {
      const mesh = rocks.current[type];
      if (!mesh) return;
      group.forEach((stone, index) => {
        position.set(stone.x, stone.y + stone.scale[1] * 0.48, stone.z);
        scale.set(...stone.scale);
        quaternion.setFromEuler(stone.rotation);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        mesh.setColorAt(index, stone.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }, [stones]);

  useEffect(() => () => {
    geometries.forEach((geometry) => geometry.dispose());
    material.dispose();
  }, [geometries, material]);

  return (
    <group>
      {stones.map((group, index) => (
        <instancedMesh
          key={index}
          ref={(mesh) => { rocks.current[index] = mesh; }}
          args={[geometries[index], material, group.length]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}

function AtmosphericClouds({ reducedMotion }) {
  const layers = useRef([]);
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 12, 8), []);
  const cloudPositions = useMemo(() => [0, 1].map((layer) => {
    const nextRandom = createRandom(2879 + layer);
    return Array.from({ length: 16 }, (_, index) => {
      const side = index % 2 === 0 ? -1 : 1;
      return {
        x: side * (4.5 + nextRandom() * 13),
        y: 3.1 + nextRandom() * 6.5,
        z: (nextRandom() - 0.5) * 6,
        scale: [1.8 + nextRandom() * 3.5, 0.35 + nextRandom() * 0.8, 0.55 + nextRandom() * 1.1],
      };
    });
  }), []);
  const cloudMaterials = useMemo(() => [
    new THREE.MeshBasicMaterial({ color: '#f9b887', transparent: true, opacity: 0.18, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: '#d8a2b3', transparent: true, opacity: 0.14, depthWrite: false }),
  ], []);
  const cloudMatrices = useMemo(() => ({
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    matrix: new THREE.Matrix4(),
  }), []);

  useLayoutEffect(() => {
    const { position, scale, rotation, matrix } = cloudMatrices;
    cloudPositions.forEach((clouds, layer) => {
      const mesh = layers.current[layer];
      if (!mesh) return;
      clouds.forEach((cloud, index) => {
        position.set(cloud.x, cloud.y, cloud.z);
        scale.set(...cloud.scale);
        rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, index * 0.71);
        matrix.compose(position, rotation, scale);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [cloudMatrices, cloudPositions]);

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    layers.current.forEach((layer, index) => {
      if (layer) layer.position.x = Math.sin(clock.elapsedTime * 0.025 + index * Math.PI) * 0.48;
    });
  });

  return cloudPositions.map((clouds, index) => (
    <instancedMesh
      key={index}
      ref={(mesh) => { layers.current[index] = mesh; }}
      args={[geometry, cloudMaterials[index], clouds.length]}
      position={[0, 0, index === 0 ? -19 : -27]}
      frustumCulled={false}
    />
  ));
}

function SkyBird({ reducedMotion }) {
  const bird = useRef(null);
  const leftWing = useRef(null);
  const rightWing = useRef(null);
  const wingGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.42, 0.1, 1.24, 0.36);
    shape.quadraticCurveTo(1.05, 0.12, 1.38, -0.24);
    shape.quadraticCurveTo(0.77, -0.05, 0.18, -0.1);
    shape.closePath();
    return new THREE.ShapeGeometry(shape, 5);
  }, []);
  const bodyGeometry = useMemo(() => new THREE.IcosahedronGeometry(0.28, 1), []);
  const featherMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#302d3b',
    roughness: 0.78,
    flatShading: true,
    side: THREE.DoubleSide,
  }), []);
  const breastMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#b57c62',
    roughness: 0.8,
    flatShading: true,
  }), []);
  const beakMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d3a26b',
    roughness: 0.78,
    flatShading: true,
  }), []);
  const eyeMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f1d8a4' }), []);

  useFrame(({ clock }) => {
    if (!bird.current) return;
    const time = clock.elapsedTime;
    const across = reducedMotion ? 0 : Math.sin(time * 0.14) * 31;
    const velocity = Math.cos(time * 0.14);
    bird.current.position.set(across, 11.6 + (reducedMotion ? 0 : Math.sin(time * 0.62) * 0.55), -16.5);
    bird.current.rotation.y = velocity >= 0 ? -Math.PI / 2 : Math.PI / 2;
    bird.current.rotation.z = reducedMotion ? 0 : Math.sin(time * 0.14) * 0.035;
    if (!reducedMotion) {
      const flap = Math.sin(time * 4.1) * 0.34;
      if (leftWing.current) leftWing.current.rotation.z = flap;
      if (rightWing.current) rightWing.current.rotation.z = -flap;
    }
  });

  useEffect(() => () => {
    wingGeometry.dispose();
    bodyGeometry.dispose();
    featherMaterial.dispose();
    breastMaterial.dispose();
    beakMaterial.dispose();
    eyeMaterial.dispose();
  }, [beakMaterial, bodyGeometry, breastMaterial, eyeMaterial, featherMaterial, wingGeometry]);

  return (
    <group ref={bird} scale={1.45}>
      <mesh geometry={bodyGeometry} scale={[0.48, 0.42, 1.5]} material={featherMaterial} castShadow />
      <mesh position={[0, 0.025, -0.35]} scale={[0.34, 0.34, 0.85]} material={breastMaterial}>
        <sphereGeometry args={[0.22, 10, 7]} />
      </mesh>
      <mesh position={[0, 0.035, -0.72]} scale={0.46} material={featherMaterial}>
        <sphereGeometry args={[0.2, 10, 8]} />
      </mesh>
      <mesh position={[0, 0.04, -0.88]} rotation={[-Math.PI / 2, 0, 0]} material={beakMaterial}>
        <coneGeometry args={[0.07, 0.2, 5]} />
      </mesh>
      <mesh position={[-0.09, 0.1, -0.81]} material={eyeMaterial}>
        <sphereGeometry args={[0.025, 6, 5]} />
      </mesh>
      <mesh position={[0.09, 0.1, -0.81]} material={eyeMaterial}>
        <sphereGeometry args={[0.025, 6, 5]} />
      </mesh>
      <group ref={leftWing} position={[-0.12, 0.07, -0.08]} scale={[-1, 1, 1]}>
        <mesh geometry={wingGeometry} material={featherMaterial} castShadow />
      </group>
      <group ref={rightWing} position={[0.12, 0.07, -0.08]}>
        <mesh geometry={wingGeometry} material={featherMaterial} castShadow />
      </group>
      {[-0.12, 0, 0.12].map((x) => (
        <mesh key={x} position={[x, 0, 0.42]} rotation={[Math.PI / 2, 0, x * 1.5]} scale={[0.65, 1, 1]} material={featherMaterial}>
          <coneGeometry args={[0.09, 0.42, 5]} />
        </mesh>
      ))}
    </group>
  );
}

function CreekWater({ reducedMotion }) {
  const geometry = useMemo(() => createCreekGeometry(), []);
  const waterRef = useRef(null);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMotion: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      uniform float uMotion;
      varying vec2 vUv;
      varying vec3 vViewPosition;
      varying vec3 vViewNormal;

      void main() {
        vUv = uv;
        vec3 displaced = position;
        displaced.y += (
          sin(position.x * 1.8 + position.z * 1.1 + uTime * 1.4) * 0.018
          + sin(position.x * 3.1 - position.z * 2.0 + uTime * 0.8) * 0.008
        ) * uMotion;
        vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
        vViewPosition = -mvPosition.xyz;
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vViewPosition;
      varying vec3 vViewNormal;

      void main() {
        float currentTime = uTime;
        float flow = sin(vUv.x * 38.0 - currentTime * 2.4 + sin(vUv.y * 11.0) * 0.9);
        float glint = pow(max(flow, 0.0), 16.0);
        float reflectedLeaves = smoothstep(
          0.72,
          0.98,
          sin(vUv.x * 17.0 + vUv.y * 6.0 + sin(vUv.x * 9.0) * 0.65)
        );
        float fresnel = pow(
          1.0 - max(dot(normalize(vViewNormal), normalize(vViewPosition)), 0.0),
          2.0
        );
        vec3 deepWater = vec3(0.13, 0.39, 0.46);
        vec3 skyReflection = vec3(0.53, 0.76, 0.78);
        vec3 foliageReflection = vec3(0.34, 0.51, 0.39);
        vec3 color = mix(deepWater, skyReflection, vUv.y * 0.34 + fresnel * 0.24);
        color = mix(color, foliageReflection, reflectedLeaves * 0.19);
        color += vec3(0.48, 0.66, 0.61) * glint * 0.3;
        gl_FragColor = vec4(color, 0.88);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  useFrame(({ clock }) => {
    const activeUniforms = waterRef.current?.material?.uniforms;
    if (!activeUniforms) return;
    activeUniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
    activeUniforms.uMotion.value = reducedMotion ? 0 : 1;
  });

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <mesh ref={waterRef} geometry={geometry} material={material} renderOrder={1} />
  );
}

function CreeksideTree({ reducedMotion }) {
  const canopy = useRef(null);
  const materials = useMemo(() => ({
    bark: new THREE.MeshStandardMaterial({ color: '#60432f', roughness: 0.96, flatShading: true }),
    deepLeaves: new THREE.MeshStandardMaterial({ color: '#466446', roughness: 0.92, flatShading: true }),
    leaves: new THREE.MeshStandardMaterial({ color: '#65804f', roughness: 0.9, flatShading: true }),
    lightLeaves: new THREE.MeshStandardMaterial({ color: '#809261', roughness: 0.92, flatShading: true }),
  }), []);
  const y = terrainHeight(RIVERSIDE_TREE_POSITION.x, RIVERSIDE_TREE_POSITION.z);

  useFrame(({ clock }) => {
    if (!canopy.current) return;
    canopy.current.rotation.z = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.48) * 0.018;
  });

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  return (
    <group position={[RIVERSIDE_TREE_POSITION.x, y, RIVERSIDE_TREE_POSITION.z]}>
      <mesh position={[0, 1.24, 0]} material={materials.bark} castShadow receiveShadow>
        <cylinderGeometry args={[0.24, 0.36, 2.5, 7]} />
      </mesh>
      <group ref={canopy} position={[0, 2.85, 0]}>
        <mesh position={[0, 0.18, 0]} scale={[1.3, 1.04, 1.2]} material={materials.deepLeaves} castShadow receiveShadow>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
        <mesh position={[-0.74, -0.12, 0.08]} scale={[0.82, 0.74, 0.85]} material={materials.leaves} castShadow receiveShadow>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
        <mesh position={[0.7, -0.06, -0.12]} scale={[0.82, 0.76, 0.84]} material={materials.lightLeaves} castShadow receiveShadow>
          <icosahedronGeometry args={[1, 1]} />
        </mesh>
      </group>
    </group>
  );
}

function MountainRocks() {
  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const materials = useMemo(() => [
    new THREE.MeshStandardMaterial({ color: '#706257', roughness: 0.97, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#8a7565', roughness: 0.95, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: '#594e48', roughness: 0.98, flatShading: true }),
  ], []);
  const formations = useMemo(() => [
    { x: 5.7, z: -25.2, scale: [1.05, 1.35, 1.05], rotation: [0.08, 0.4, -0.12], material: 0 },
    { x: 15.2, z: -21.8, scale: [1.25, 1.65, 1.15], rotation: [-0.1, -0.6, 0.16], material: 2 },
    { x: 13.5, z: -25.8, scale: [1.25, 1.45, 1.1], rotation: [0.15, 0.8, 0.08], material: 1 },
    { x: 6.6, z: -27.1, scale: [0.95, 1.2, 0.9], rotation: [-0.08, -0.2, -0.14], material: 2 },
  ], []);

  useEffect(() => () => {
    geometry.dispose();
    materials.forEach((material) => material.dispose());
  }, [geometry, materials]);

  return formations.map((rock, index) => (
    <mesh
      key={index}
      geometry={geometry}
      material={materials[rock.material]}
      position={[rock.x, terrainHeight(rock.x, rock.z) + rock.scale[1] * 0.38, rock.z]}
      scale={rock.scale}
      rotation={rock.rotation}
      castShadow
      receiveShadow
    />
  ));
}

function LogCabin({ reducedMotion, dogActive }) {
  const cabinX = 11.1;
  const cabinZ = -8.4;
  const cabinY = terrainHeight(cabinX, cabinZ);
  const logGeometry = useMemo(() => new THREE.CylinderGeometry(0.16, 0.16, 1, 8), []);
  const woodMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8c5230',
    roughness: 0.94,
    flatShading: true,
  }), []);
  const darkWoodMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#563421',
    roughness: 0.93,
  }), []);
  const roofMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#493b2c',
    roughness: 0.98,
    flatShading: true,
  }), []);
  const porchMaterials = useMemo(() => ({
    wood: new THREE.MeshStandardMaterial({ color: '#795337', roughness: 0.93, flatShading: true }),
    woodLight: new THREE.MeshStandardMaterial({ color: '#a77a4f', roughness: 0.9 }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#d8b27e', roughness: 0.42, metalness: 0.04 }),
    ceramicBlue: new THREE.MeshStandardMaterial({ color: '#739e9d', roughness: 0.38, metalness: 0.04 }),
    leaves: new THREE.MeshStandardMaterial({ color: '#577c4b', roughness: 0.88, flatShading: true }),
    leafLight: new THREE.MeshStandardMaterial({ color: '#82945a', roughness: 0.9, flatShading: true }),
    book: new THREE.MeshStandardMaterial({ color: '#8b5140', roughness: 0.86 }),
    bookGreen: new THREE.MeshStandardMaterial({ color: '#526b58', roughness: 0.88 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c19b5c', metalness: 0.62, roughness: 0.36 }),
  }), []);
  const vineCurves = useMemo(() => [-1.62, 1.65].map((x, index) => {
    const points = Array.from({ length: 7 }, (_, point) => new THREE.Vector3(
      x + Math.sin(point * 1.3 + index) * 0.13,
      0.48 + point * 0.37,
      1.91 + Math.cos(point * 1.1 + index) * 0.04,
    ));
    return new THREE.CatmullRomCurve3(points);
  }), []);
  const vineGeometries = useMemo(() => vineCurves.map((curve) => (
    new THREE.TubeGeometry(curve, 32, 0.026, 5, false)
  )), [vineCurves]);
  const decorLeafGeometry = useMemo(() => new THREE.IcosahedronGeometry(0.1, 0), []);
  const logs = useMemo(() => {
    const rows = [];
    const wallRows = 7;
    for (let row = 0; row < wallRows; row += 1) {
      const y = 0.28 + row * 0.32;
      const gableRows = row >= 6;
      const endLength = gableRows ? 3.2 - (row - 5) * 0.8 : 3.9;
      rows.push(
        { axis: 'x', x: 0, y, z: -1.65, length: endLength },
        { axis: 'x', x: 0, y, z: 1.65, length: endLength },
        ...(!gableRows ? [
          { axis: 'z', x: -1.9, y, z: 0, length: 3.3 },
          { axis: 'z', x: 1.9, y, z: 0, length: 3.3 },
        ] : []),
      );
    }
    return rows;
  }, []);
  const beetleWalk = useRef(null);
  const beetleShell = useRef(null);
  const beetleLegs = useRef([]);
  const door = useRef(null);
  const dog = useRef(null);
  const dogTail = useRef(null);
  const dogLegs = useRef([]);
  const dogProgress = useRef(0);
  const [doorManuallyOpen, setDoorManuallyOpen] = useState(false);
  const beetleMaterials = useMemo(() => ({
    shell: new THREE.MeshPhysicalMaterial({
      color: '#456d55',
      roughness: 0.62,
      metalness: 0.04,
      clearcoat: 0.18,
    }),
    body: new THREE.MeshStandardMaterial({ color: '#45382d', roughness: 0.88 }),
    legs: new THREE.MeshStandardMaterial({ color: '#594332', roughness: 0.94 }),
    spots: new THREE.MeshStandardMaterial({
      color: '#f0d18b',
      emissive: '#8b703c',
      emissiveIntensity: 0.16,
      roughness: 0.82,
      flatShading: true,
    }),
    smallSpots: new THREE.MeshStandardMaterial({
      color: '#d6e0aa',
      emissive: '#647744',
      emissiveIntensity: 0.12,
      roughness: 0.86,
      flatShading: true,
    }),
  }), []);
  const dogMaterials = useMemo(() => ({
    coat: new THREE.MeshStandardMaterial({ color: '#b98353', roughness: 0.88, flatShading: true }),
    muzzle: new THREE.MeshStandardMaterial({ color: '#e1c49a', roughness: 0.9, flatShading: true }),
    ears: new THREE.MeshStandardMaterial({ color: '#724936', roughness: 0.9, flatShading: true }),
    nose: new THREE.MeshStandardMaterial({ color: '#392c29', roughness: 0.5 }),
    eyes: new THREE.MeshBasicMaterial({ color: '#241e1b' }),
  }), []);

  useFrame(({ clock }, delta) => {
    const beetle = beetleWalk.current;
    if (!beetle) return;
    const time = clock.elapsedTime;
    const progress = reducedMotion ? 0 : (time * 0.035) % 1;
    const z = THREE.MathUtils.lerp(7.5, -5.8, progress);
    const x = pathCenter(z) + 0.72 + (reducedMotion ? 0 : Math.sin(time * 1.4) * 0.08);
    beetle.position.set(x, terrainHeight(x, z) + 0.09, z);
    if (!reducedMotion) {
      beetle.rotation.y = THREE.MathUtils.damp(
        beetle.rotation.y,
        Math.atan2(-0.72 - Math.cos(time * 1.4) * 0.08, 1),
        7,
        delta,
      );
    }
    if (beetleShell.current && !reducedMotion) {
      beetleShell.current.rotation.z = Math.sin(time * 12) * 0.045;
    }
    if (!reducedMotion) {
      beetleLegs.current.forEach((leg, index) => {
        if (leg) leg.rotation.z = Math.sin(time * 16 + index * Math.PI / 3) * 0.18;
      });
    }
  });

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    const targetAngle = dogActive || doorManuallyOpen ? -1.12 : 0;
    if (door.current) {
      door.current.rotation.y = THREE.MathUtils.damp(door.current.rotation.y, targetAngle, 3.5, delta);
    }

    const targetProgress = dogActive ? 1 : 0;
    dogProgress.current = THREE.MathUtils.damp(
      dogProgress.current,
      targetProgress,
      dogActive ? 0.95 : 0.4,
      delta,
    );
    if (!dog.current) return;
    const progress = dogProgress.current;
    const dogZ = cabinZ + 1.55 + progress * 2.45;
    dog.current.visible = progress > 0.015;
    dog.current.position.set(
      cabinX + Math.sin(progress * Math.PI) * 0.42,
      terrainHeight(cabinX, dogZ) + 0.05 + (reducedMotion ? 0 : Math.abs(Math.sin(time * 8)) * 0.035),
      dogZ,
    );
    dog.current.rotation.y = Math.sin(progress * Math.PI) * 0.16;
    if (!reducedMotion) {
      dogLegs.current.forEach((leg, index) => {
        if (leg) leg.rotation.x = Math.sin(time * 9 + (index % 2) * Math.PI) * 0.28 * progress;
      });
      if (dogTail.current) dogTail.current.rotation.x = Math.sin(time * 9) * 0.52;
    }
  });

  useEffect(() => () => {
    logGeometry.dispose();
    Object.values(beetleMaterials).forEach((material) => material.dispose());
    Object.values(dogMaterials).forEach((material) => material.dispose());
    woodMaterial.dispose();
    darkWoodMaterial.dispose();
    roofMaterial.dispose();
    Object.values(porchMaterials).forEach((material) => material.dispose());
    vineGeometries.forEach((geometry) => geometry.dispose());
    decorLeafGeometry.dispose();
  }, [beetleMaterials, decorLeafGeometry, darkWoodMaterial, dogMaterials, logGeometry, porchMaterials, roofMaterial, vineGeometries, woodMaterial]);

  return (
    <group>
      <group position={[cabinX, cabinY + 0.04, cabinZ]}>
        {logs.map((log, index) => (
          <mesh
            key={index}
            geometry={logGeometry}
            material={woodMaterial}
            position={[log.x, log.y, log.z]}
            rotation={log.axis === 'x' ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
            scale={[1, log.length, 1]}
            castShadow
            receiveShadow
          />
        ))}
        <group ref={door} position={[-0.41, 0.16, 1.78]}>
          <group
            onClick={(event) => {
              event.stopPropagation();
              setDoorManuallyOpen((open) => !open);
            }}
          >
            <mesh position={[0.41, 0.9, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.82, 1.8, 0.08]} />
              <meshStandardMaterial color="#38251a" roughness={0.9} />
            </mesh>
            {[-0.2, 0, 0.2].map((x) => (
              <mesh key={x} position={[0.41 + x, 0.9, -0.045]}>
                <boxGeometry args={[0.025, 1.68, 0.012]} />
                <primitive object={darkWoodMaterial} attach="material" />
              </mesh>
            ))}
            <mesh position={[0.71, 0.9, -0.07]}>
              <sphereGeometry args={[0.045, 10, 8]} />
              <meshStandardMaterial color="#c4a164" metalness={0.76} roughness={0.32} />
            </mesh>
            <mesh position={[0.73, 0.9, -0.065]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.075, 0.018, 6, 14]} />
              <meshStandardMaterial color="#b99659" metalness={0.78} roughness={0.3} />
            </mesh>
          </group>
        </group>
        <mesh position={[0, 2.15, 1.79]}>
          <boxGeometry args={[0.92, 0.12, 0.1]} />
          <meshStandardMaterial color="#b88954" roughness={0.8} />
        </mesh>
        <mesh position={[-0.9, 1.58, 1.74]}>
          <boxGeometry args={[0.48, 0.52, 0.09]} />
          <meshStandardMaterial color="#8fd0d1" emissive="#457f72" emissiveIntensity={0.18} roughness={0.34} />
        </mesh>
        <mesh position={[-0.82, 3.05, 0]} rotation={[0, 0, Math.PI / 6]} material={roofMaterial} castShadow>
          <boxGeometry args={[1.9, 0.2, 4.55]} />
        </mesh>
        <mesh position={[0.82, 3.05, 0]} rotation={[0, 0, -Math.PI / 6]} material={roofMaterial} castShadow>
          <boxGeometry args={[1.9, 0.2, 4.55]} />
        </mesh>
        <mesh position={[1.85, 3.3, -0.95]} material={darkWoodMaterial}>
          <cylinderGeometry args={[0.18, 0.22, 1.35, 7]} />
        </mesh>
        <group position={[0, 0.08, 2.45]}>
          {Array.from({ length: 7 }, (_, index) => (
            <mesh
              key={index}
              position={[-2.25 + index * 0.72, 0, 0]}
              material={porchMaterials.wood}
              receiveShadow
            >
              <boxGeometry args={[0.68, 0.13, 1.55]} />
            </mesh>
          ))}
          {[-1.95, 1.95].map((x) => [-0.28, 1.08].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, 0.5, z]} material={porchMaterials.wood} castShadow>
              <boxGeometry args={[0.14, 0.94, 0.14]} />
            </mesh>
          )))}
        </group>
        <group position={[1.12, 0.86, 2.7]}>
          <mesh material={porchMaterials.wood} castShadow>
            <boxGeometry args={[0.78, 0.1, 0.62]} />
          </mesh>
          {[-0.29, 0.29].map((x) => [-0.22, 0.22].map((z) => (
            <mesh key={`${x}-${z}`} position={[x, -0.36, z]} material={porchMaterials.wood} castShadow>
              <cylinderGeometry args={[0.035, 0.045, 0.68, 6]} />
            </mesh>
          )))}
          <group position={[-0.08, 0.15, 0]}>
            <mesh scale={[0.13, 0.11, 0.13]} material={porchMaterials.ceramic} castShadow>
              <sphereGeometry args={[1, 12, 9]} />
            </mesh>
            <mesh position={[0, 0.1, 0]} material={porchMaterials.ceramic} castShadow>
              <cylinderGeometry args={[0.07, 0.09, 0.08, 10]} />
            </mesh>
            <mesh position={[0, 0.16, 0]} material={porchMaterials.brass}>
              <sphereGeometry args={[0.026, 8, 6]} />
            </mesh>
            <mesh position={[0.14, 0.02, 0]} rotation={[0, 0, -Math.PI / 2]} material={porchMaterials.ceramic}>
              <torusGeometry args={[0.067, 0.018, 6, 12, Math.PI * 1.55]} />
            </mesh>
            <mesh position={[-0.16, 0.03, 0]} rotation={[0, 0, -Math.PI / 2]} material={porchMaterials.ceramic}>
              <coneGeometry args={[0.065, 0.2, 8]} />
            </mesh>
          </group>
          <mesh position={[0.26, 0.11, 0.08]} material={porchMaterials.ceramicBlue} castShadow>
            <cylinderGeometry args={[0.065, 0.075, 0.16, 9]} />
          </mesh>
          <mesh position={[0.26, 0.2, 0.08]} material={porchMaterials.ceramicBlue}>
            <torusGeometry args={[0.052, 0.012, 6, 12]} />
          </mesh>
        </group>
        <group position={[1.42, 0, 1.91]}>
          {[1.23, 1.9].map((y) => (
            <mesh key={y} position={[0, y, 0]} material={porchMaterials.woodLight} castShadow>
              <boxGeometry args={[0.72, 0.09, 0.2]} />
            </mesh>
          ))}
          <mesh position={[-0.18, 1.42, -0.01]} scale={[0.16, 0.18, 0.13]} material={porchMaterials.ceramicBlue} castShadow>
            <sphereGeometry args={[1, 9, 7]} />
          </mesh>
          <mesh position={[-0.18, 1.62, -0.01]} material={porchMaterials.leaves}>
            <cylinderGeometry args={[0.09, 0.11, 0.08, 8]} />
          </mesh>
          {[-0.28, -0.12, 0.05].map((x, index) => (
            <mesh key={x} position={[x, 1.82 + (index % 2) * 0.08, 0]} rotation={[0, 0, (index - 1) * 0.28]} material={porchMaterials.leaves}>
              <coneGeometry args={[0.07, 0.32, 5]} />
            </mesh>
          ))}
          {[0.08, 0.23, 0.39].map((x, index) => (
            <group key={x} position={[x, 1.32, -0.02]} rotation={[0, 0, index % 2 ? 0.06 : -0.08]}>
              <mesh position={[0, 0.09, 0]} material={index === 1 ? porchMaterials.bookGreen : porchMaterials.book} castShadow>
                <boxGeometry args={[0.12, 0.28 + index * 0.035, 0.08]} />
              </mesh>
              <mesh position={[0, 0.09, 0.044]} material={porchMaterials.brass}>
                <boxGeometry args={[0.014, 0.12, 0.006]} />
              </mesh>
            </group>
          ))}
          <mesh position={[0.05, 2.04, 0]} material={porchMaterials.ceramic} castShadow>
            <cylinderGeometry args={[0.1, 0.13, 0.2, 8]} />
          </mesh>
          <mesh position={[0.05, 2.18, 0]} material={porchMaterials.leafLight}>
            <cylinderGeometry args={[0.11, 0.09, 0.08, 8]} />
          </mesh>
        </group>
        <group position={[-1.42, 0, 2.52]} rotation={[0.28, -0.2, 0]}>
          {[[-0.28, -0.2], [0.28, -0.2], [0, 0.35]].map(([x, z]) => (
            <mesh key={`${x}-${z}`} position={[x, 0.54, z]} rotation={[0, 0, x * 0.45]} material={porchMaterials.wood} castShadow>
              <cylinderGeometry args={[0.025, 0.035, 1.12, 6]} />
            </mesh>
          ))}
          <mesh position={[0, 0.82, 0]} rotation={[0.32, 0, -0.12]} material={porchMaterials.brass} castShadow>
            <cylinderGeometry args={[0.07, 0.085, 0.62, 8]} />
          </mesh>
          <mesh position={[0, 0.82, 0.32]} rotation={[Math.PI / 2, 0, 0]} material={porchMaterials.brass}>
            <torusGeometry args={[0.078, 0.018, 6, 12]} />
          </mesh>
          <mesh position={[0, 0.82, 0.36]} rotation={[Math.PI / 2, 0, 0]} material={porchMaterials.ceramicBlue}>
            <circleGeometry args={[0.057, 10]} />
          </mesh>
          <mesh position={[0, 1.14, 0]} rotation={[0.32, 0, -0.12]} material={porchMaterials.woodLight}>
            <cylinderGeometry args={[0.028, 0.035, 0.12, 6]} />
          </mesh>
        </group>
        {vineGeometries.map((geometry, index) => (
          <group key={index}>
            <mesh geometry={geometry} material={porchMaterials.leaves} />
            {Array.from({ length: 8 }, (_, leaf) => {
              const t = 0.12 + leaf * 0.105;
              const point = vineCurves[index].getPoint(t);
              return (
                <mesh
                  key={leaf}
                  geometry={decorLeafGeometry}
                  material={leaf % 2 ? porchMaterials.leafLight : porchMaterials.leaves}
                  position={[point.x + (leaf % 2 ? 0.12 : -0.12), point.y, point.z]}
                  scale={[0.75, 0.35, 1.25]}
                  rotation={[0, 0, leaf % 2 ? 0.55 : -0.55]}
                  castShadow
                />
              );
            })}
          </group>
        ))}
      </group>
      <group ref={dog} visible={false}>
        <mesh position={[0, 0.46, 0]} scale={[0.29, 0.34, 0.56]} material={dogMaterials.coat} castShadow>
          <sphereGeometry args={[1, 12, 9]} />
        </mesh>
        <mesh position={[0, 0.58, 0.42]} scale={[0.25, 0.27, 0.28]} material={dogMaterials.coat} castShadow>
          <sphereGeometry args={[1, 12, 9]} />
        </mesh>
        <mesh position={[0, 0.48, 0.64]} scale={[0.16, 0.13, 0.22]} material={dogMaterials.muzzle} castShadow>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
        <mesh position={[0, 0.53, 0.83]} material={dogMaterials.nose}>
          <sphereGeometry args={[0.075, 9, 7]} />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.16, 0.78, 0.36]} rotation={[0.12, 0, side * -0.22]} scale={[0.1, 0.19, 0.1]} material={dogMaterials.ears} castShadow>
              <coneGeometry args={[1, 1, 6]} />
            </mesh>
            <mesh position={[side * 0.11, 0.64, 0.62]} material={dogMaterials.eyes}>
              <sphereGeometry args={[0.027, 7, 6]} />
            </mesh>
          </group>
        ))}
        <group ref={dogTail} position={[0, 0.58, -0.48]}>
          <mesh rotation={[0.45, 0, 0]} material={dogMaterials.coat} castShadow>
            <capsuleGeometry args={[0.055, 0.34, 4, 7]} />
          </mesh>
        </group>
        {[
          [-0.19, -0.2],
          [0.19, -0.2],
          [-0.19, 0.34],
          [0.19, 0.34],
        ].map(([x, z], index) => (
          <group
            key={index}
            ref={(leg) => { dogLegs.current[index] = leg; }}
            position={[x, 0.32, z]}
          >
            <mesh material={dogMaterials.coat} castShadow>
              <capsuleGeometry args={[0.075, 0.29, 4, 7]} />
            </mesh>
            <mesh position={[0, -0.15, 0.06]} scale={[1, 0.68, 1.3]} material={dogMaterials.muzzle} castShadow>
              <sphereGeometry args={[0.075, 8, 6]} />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={beetleWalk} scale={0.9}>
        <group ref={beetleShell} position={[0, 0.06, 0]} scale={[0.17, 0.1, 0.23]}>
          <mesh material={beetleMaterials.shell} castShadow>
            <sphereGeometry args={[1, 16, 10]} />
          </mesh>
          {[
            [-0.48, 0.76, -0.18, 0.14],
            [-0.16, 0.94, -0.08, 0.19],
            [0.22, 0.91, -0.12, 0.13],
            [0.52, 0.72, -0.08, 0.17],
            [-0.39, 0.78, 0.28, 0.1],
            [0.04, 0.98, 0.24, 0.14],
            [0.42, 0.82, 0.31, 0.11],
          ].map(([x, y, z, size], index) => (
            <mesh
              key={index}
              position={[x, y, z]}
              scale={[size, size * 0.62, size * 0.42]}
              material={index % 3 === 0 ? beetleMaterials.smallSpots : beetleMaterials.spots}
              castShadow
            >
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
          ))}
        </group>
        <mesh position={[0, 0.045, 0.19]} scale={[0.095, 0.075, 0.09]} material={beetleMaterials.body} castShadow>
          <sphereGeometry args={[1, 12, 8]} />
        </mesh>
        {Array.from({ length: 6 }, (_, index) => (
          <mesh
            key={index}
            ref={(mesh) => { beetleLegs.current[index] = mesh; }}
            position={[(index % 2 === 0 ? -1 : 1) * 0.11, 0.025, -0.1 + Math.floor(index / 2) * 0.13]}
            rotation={[0, 0, (index % 2 === 0 ? -1 : 1) * 0.45]}
            material={beetleMaterials.legs}
          >
            <capsuleGeometry args={[0.018, 0.13, 3, 5]} />
          </mesh>
        ))}
        <mesh position={[-0.045, 0.12, 0.25]} rotation={[0.3, 0, -0.32]} material={beetleMaterials.legs}>
          <cylinderGeometry args={[0.008, 0.008, 0.14, 5]} />
        </mesh>
        <mesh position={[0.045, 0.12, 0.25]} rotation={[0.3, 0, 0.32]} material={beetleMaterials.legs}>
          <cylinderGeometry args={[0.008, 0.008, 0.14, 5]} />
        </mesh>
      </group>
    </group>
  );
}

function CabinGrove() {
  const trees = useMemo(() => [
    { x: -3.35, z: -2.35, height: 2.4, crown: '#55744b' },
    { x: 3.65, z: -2.7, height: 2.8, crown: '#718653' },
    { x: -3.7, z: 1.35, height: 2.15, crown: '#647a4c' },
    { x: 3.7, z: 1.5, height: 2.55, crown: '#87935a' },
    { x: -2.8, z: 4.05, height: 2.35, crown: '#738650' },
    { x: 2.9, z: -4.15, height: 2.2, crown: '#586f49' },
  ], []);
  const trunkGeometry = useMemo(() => new THREE.CylinderGeometry(0.1, 0.18, 1, 7), []);
  const crownGeometry = useMemo(() => new THREE.IcosahedronGeometry(1, 1), []);
  const trunkMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#765039',
    roughness: 0.96,
    flatShading: true,
  }), []);
  const crownMaterials = useMemo(() => trees.map((tree) => new THREE.MeshStandardMaterial({
    color: tree.crown,
    roughness: 0.92,
    flatShading: true,
  })), [trees]);

  useEffect(() => () => {
    trunkGeometry.dispose();
    crownGeometry.dispose();
    trunkMaterial.dispose();
    crownMaterials.forEach((material) => material.dispose());
  }, [crownGeometry, crownMaterials, trunkGeometry, trunkMaterial]);

  return (
    <group>
      {trees.map((tree, index) => {
        const x = 11.1 + tree.x;
        const z = -8.4 + tree.z;
        const y = terrainHeight(x, z);
        return (
          <group key={index} position={[x, y, z]}>
            <mesh
              geometry={trunkGeometry}
              material={trunkMaterial}
              position={[0, tree.height * 0.38, 0]}
              scale={[1, tree.height * 0.76, 1]}
              castShadow
              receiveShadow
            />
            <mesh
              geometry={crownGeometry}
              material={crownMaterials[index]}
              position={[0, tree.height * 0.83, 0]}
              scale={[0.8, tree.height * 0.38, 0.8]}
              castShadow
            />
          </group>
        );
      })}
    </group>
  );
}

function ForestReader({ greeting, reducedMotion }) {
  const head = useRef(null);
  const book = useRef(null);
  const readerMaterials = useMemo(() => ({
    coat: new THREE.MeshStandardMaterial({ color: '#536b5f', roughness: 0.9, flatShading: true }),
    trousers: new THREE.MeshStandardMaterial({ color: '#57493b', roughness: 0.92, flatShading: true }),
    skin: new THREE.MeshStandardMaterial({ color: '#d8a98c', roughness: 0.82 }),
    hair: new THREE.MeshStandardMaterial({ color: '#44352e', roughness: 0.94, flatShading: true }),
    wood: new THREE.MeshStandardMaterial({ color: '#78573d', roughness: 0.96, flatShading: true }),
    book: new THREE.MeshStandardMaterial({ color: '#6f4935', roughness: 0.84 }),
    pages: new THREE.MeshStandardMaterial({ color: '#e8dcc0', roughness: 0.92 }),
  }), []);
  const y = terrainHeight(READER_POSITION.x, READER_LOCAL_Z);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    if (head.current) {
      head.current.rotation.x = THREE.MathUtils.damp(
        head.current.rotation.x,
        greeting ? 0.13 : -0.3,
        greeting ? 2.8 : 1.8,
        delta,
      );
      head.current.rotation.y = THREE.MathUtils.damp(
        head.current.rotation.y,
        greeting ? 0.16 : 0,
        2.2,
        delta,
      );
    }
    if (book.current) {
      book.current.rotation.x = THREE.MathUtils.damp(
        book.current.rotation.x,
        greeting ? 0.04 : 0.24,
        2.4,
        delta,
      );
    }
  });

  useEffect(() => () => {
    Object.values(readerMaterials).forEach((material) => material.dispose());
  }, [readerMaterials]);

  return (
    <group position={[READER_POSITION.x, y, READER_POSITION.z]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0.42, 0]} rotation={[0, 0, Math.PI / 2]} material={readerMaterials.wood} castShadow receiveShadow>
        <cylinderGeometry args={[0.19, 0.2, 1.45, 8]} />
      </mesh>
      {[-0.48, 0.48].map((x) => (
        <mesh key={x} position={[x, 0.21, 0]} material={readerMaterials.wood} castShadow>
          <cylinderGeometry args={[0.075, 0.09, 0.4, 7]} />
        </mesh>
      ))}
      <group position={[0, 0.53, 0.04]}>
        <mesh position={[0, 0.38, 0.09]} rotation={[0.1, 0, 0]} material={readerMaterials.trousers} castShadow>
          <boxGeometry args={[0.5, 0.29, 0.48]} />
        </mesh>
        {[-0.16, 0.16].map((x) => (
          <group key={x} position={[x, 0.26, 0.07]}>
            <mesh position={[0, -0.04, -0.29]} rotation={[Math.PI / 2, 0, 0]} material={readerMaterials.trousers} castShadow>
              <capsuleGeometry args={[0.1, 0.42, 4, 8]} />
            </mesh>
            <mesh position={[0, -0.1, -0.54]} material={readerMaterials.wood} castShadow>
              <boxGeometry args={[0.18, 0.1, 0.3]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.76, 0.1]} rotation={[0.08, 0, 0]} material={readerMaterials.coat} castShadow receiveShadow>
          <capsuleGeometry args={[0.27, 0.47, 5, 9]} />
        </mesh>
        <group ref={head} position={[0, 1.31, -0.01]}>
          <mesh scale={[0.23, 0.26, 0.22]} material={readerMaterials.skin} castShadow>
            <sphereGeometry args={[1, 12, 9]} />
          </mesh>
          <mesh position={[0, 0.13, 0.045]} scale={[1.04, 0.68, 0.92]} material={readerMaterials.hair} castShadow>
            <sphereGeometry args={[0.23, 11, 8]} />
          </mesh>
        </group>
        <group ref={book} position={[0, 0.73, -0.3]} rotation={[0.24, 0, 0]}>
          <mesh position={[0, 0, 0]} material={readerMaterials.book} castShadow>
            <boxGeometry args={[0.49, 0.065, 0.34]} />
          </mesh>
          {[-0.12, 0.12].map((x) => (
            <mesh key={x} position={[x, 0.04, 0]} rotation={[0, 0, x < 0 ? -0.04 : 0.04]} material={readerMaterials.pages}>
              <boxGeometry args={[0.225, 0.018, 0.3]} />
            </mesh>
          ))}
          <mesh position={[0, 0.05, 0]} material={readerMaterials.book}>
            <boxGeometry args={[0.025, 0.025, 0.32]} />
          </mesh>
        </group>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.25, 0.98, 0.02]} rotation={[0, 0, side * -0.28]}>
            <mesh position={[side * -0.025, -0.16, -0.12]} rotation={[0.5, 0, side * 0.16]} material={readerMaterials.coat} castShadow>
              <capsuleGeometry args={[0.085, 0.29, 4, 7]} />
            </mesh>
            <mesh position={[side * -0.045, -0.29, -0.23]} material={readerMaterials.skin} castShadow>
              <sphereGeometry args={[0.075, 8, 6]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function Terrain({ reducedMotion, dogActive }) {
  const geometry = useMemo(() => createTerrainGeometry(), []);
  const branchTrailGeometry = useMemo(() => createBranchTrailGeometry(), []);
  const cabinTrailGeometry = useMemo(() => createCabinTrailGeometry(), []);
  const mesh = useRef(null);
  const { pointer } = useThree();
  const terrainMaps = useMemo(() => createTerrainMaps(), []);
  const terrainMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: terrainMaps.colorMap,
    normalMap: terrainMaps.normalMap,
    normalScale: new THREE.Vector2(0.56, 0.56),
    roughnessMap: terrainMaps.roughnessMap,
    bumpMap: terrainMaps.bumpMap,
    bumpScale: 0.052,
    roughness: 0.94,
    metalness: 0,
  }), [terrainMaps]);
  const branchTrailMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#bf7952',
    map: terrainMaps.colorMap,
    normalMap: terrainMaps.normalMap,
    normalScale: new THREE.Vector2(0.38, 0.38),
    bumpMap: terrainMaps.bumpMap,
    bumpScale: 0.034,
    roughness: 0.98,
  }), [terrainMaps]);

  useEffect(() => () => {
    geometry.dispose();
    branchTrailGeometry.dispose();
    cabinTrailGeometry.dispose();
    terrainMaterial.dispose();
    branchTrailMaterial.dispose();
    terrainMaps.colorMap.dispose();
    terrainMaps.normalMap.dispose();
    terrainMaps.bumpMap.dispose();
    terrainMaps.roughnessMap.dispose();
  }, [branchTrailGeometry, branchTrailMaterial, cabinTrailGeometry, geometry, terrainMaps, terrainMaterial]);

  useFrame((_, delta) => {
    if (!mesh.current || reducedMotion) return;
    mesh.current.rotation.z = THREE.MathUtils.damp(mesh.current.rotation.z, pointer.x * 0.008, 2, delta);
  });

  return (
    <group ref={mesh} position={[0, 0, 1]}>
      <mesh geometry={geometry} receiveShadow>
        <primitive object={terrainMaterial} attach="material" />
      </mesh>
      <mesh geometry={branchTrailGeometry} material={branchTrailMaterial} receiveShadow />
      <mesh geometry={cabinTrailGeometry} material={branchTrailMaterial} receiveShadow />
      <CreekWater reducedMotion={reducedMotion} />
      <LogCabin reducedMotion={reducedMotion} dogActive={dogActive} />
      <CabinGrove />
      <CreeksideTree reducedMotion={reducedMotion} />
      <MountainRocks />
      <Forest />
      <MeadowGrass reducedMotion={reducedMotion} />
      <Wildflowers reducedMotion={reducedMotion} />
      <PathStones />
    </group>
  );
}

function usePortalCurve(scale = 1) {
  return useMemo(() => {
    const points = [];
    for (let index = 0; index < 96; index += 1) {
      const angle = (index / 96) * Math.PI * 2;
      const irregularity = 1 + 0.055 * Math.sin(angle * 3 + 0.5) + 0.028 * Math.sin(angle * 7);
      points.push(new THREE.Vector3(
        Math.cos(angle) * 2.42 * irregularity * scale,
        Math.sin(angle) * 3.85 * (1 + 0.035 * Math.cos(angle * 5)) * scale,
        0,
      ));
    }
    return new THREE.CatmullRomCurve3(points, true, 'centripetal');
  }, [scale]);
}

function PortalRim({ z, scale, radius, color, emissive, intensity, canEnterGalaxy }) {
  const rim = useRef(null);
  const curve = usePortalCurve(scale);
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 192, radius, 10, true), [curve, radius]);

  useFrame(({ clock }, delta) => {
    const material = rim.current?.material;
    if (!material) return;
    const pulse = canEnterGalaxy ? 1.8 + Math.sin(clock.elapsedTime * 3.2) * 0.18 : 1;
    material.emissiveIntensity = THREE.MathUtils.damp(
      material.emissiveIntensity,
      intensity * pulse,
      4,
      delta,
    );
  });

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh ref={rim} geometry={geometry} position={[0, 0, z]} castShadow>
      <meshStandardMaterial
        color={color}
        emissive={emissive}
        emissiveIntensity={intensity}
        metalness={0.58}
        roughness={0.32}
      />
    </mesh>
  );
}

function CosmicMirror({ canEnterGalaxy, reducedMotion }) {
  const material = useRef(null);

  useFrame(({ clock }, delta) => {
    const uniforms = material.current?.uniforms;
    if (!uniforms) return;
    uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
    uniforms.uProximity.value = THREE.MathUtils.damp(
      uniforms.uProximity.value,
      canEnterGalaxy ? 1 : 0,
      1.8,
      delta,
    );
  });

  return (
    <mesh position={[0, 0, -0.45]} scale={[2.35, 3.7, 0.62]}>
      <sphereGeometry args={[1, 48, 36]} />
      <shaderMaterial
        ref={material}
        uniforms={{ uTime: { value: 0 }, uProximity: { value: 0 } }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform float uTime;
          uniform float uProximity;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          void main() {
            float speed = mix(0.24, 0.72, uProximity);
            vec2 uv = vUv;
            float wave = sin(uv.y * 24.0 + uTime * speed) * 0.008
              + sin(uv.x * 17.0 - uTime * speed * 0.72) * 0.006;
            uv.x += wave;
            uv.y += sin(uv.x * 20.0 + uTime * 0.31) * 0.005;

            float ripple = sin(length((uv - 0.5) * vec2(1.0, 0.72)) * 52.0 - uTime * speed * 1.8);
            float sheen = pow(max(0.0, ripple * 0.5 + 0.5), 10.0);
            float reflection = pow(max(0.0, sin(uv.x * 9.0 + uv.y * 12.0 + uTime * 0.18)), 16.0);
            vec3 obsidian = mix(vec3(0.006, 0.012, 0.035), vec3(0.025, 0.045, 0.1), uv.y);
            obsidian += vec3(0.025, 0.055, 0.11) * sheen * (0.25 + uProximity * 0.55);
            obsidian += vec3(0.11, 0.22, 0.38) * reflection * (0.22 + uProximity * 0.6);

            vec2 starGrid = floor(uv * vec2(72.0, 46.0));
            vec2 starPoint = fract(uv * vec2(72.0, 46.0)) - 0.5;
            float starSeed = hash(starGrid);
            float star = (1.0 - smoothstep(0.015, 0.075, length(starPoint)))
              * step(0.991, starSeed)
              * (0.48 + 0.52 * sin(uTime * 1.7 + starSeed * 62.0));
            obsidian += vec3(0.58, 0.77, 1.0) * star * (0.5 + uProximity * 1.2);
            gl_FragColor = vec4(obsidian, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `}
        toneMapped
      />
    </mesh>
  );
}

function PortalGravity({ canEnterGalaxy, reducedMotion }) {
  const leafMesh = useRef(null);
  const motePositions = useRef(null);
  const leafGeometry = useMemo(() => new THREE.SphereGeometry(1, 7, 5), []);
  const leafMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.88,
    flatShading: true,
  }), []);
  const motes = useMemo(() => {
    const random = createRandom(34817);
    return Array.from({ length: 104 }, () => ({
      angle: random() * Math.PI * 2,
      progress: random(),
      speed: 0.075 + random() * 0.12,
      size: 0.018 + random() * 0.034,
    }));
  }, []);
  const leaves = useMemo(() => {
    const random = createRandom(8731);
    const palette = ['#7b8950', '#9c8958', '#536c48', '#aa704e'];
    return Array.from({ length: 22 }, () => ({
      angle: random() * Math.PI * 2,
      progress: random(),
      speed: 0.035 + random() * 0.045,
      rotation: random() * Math.PI * 2,
      color: new THREE.Color(palette[Math.floor(random() * palette.length)]),
    }));
  }, []);
  const moteProgress = useRef(new Float32Array(motes.map((mote) => mote.progress)));
  const leafProgress = useRef(new Float32Array(leaves.map((leaf) => leaf.progress)));
  const scratch = useMemo(() => ({
    position: new THREE.Vector3(),
    scale: new THREE.Vector3(),
    rotation: new THREE.Quaternion(),
    matrix: new THREE.Matrix4(),
    axis: new THREE.Vector3(0, 1, 0),
  }), []);

  useFrame((_, delta) => {
    const positions = motePositions.current;
    if (!positions || !leafMesh.current) return;
    const { position, scale, rotation, matrix, axis } = scratch;
    const speedScale = reducedMotion ? 0 : canEnterGalaxy ? 1.9 : 0.75;
    motes.forEach((mote, index) => {
      moteProgress.current[index] = (moteProgress.current[index] + delta * mote.speed * speedScale) % 1;
      const progress = moteProgress.current[index];
      const radius = THREE.MathUtils.lerp(4.5, 0.08, progress);
      const angle = mote.angle + progress * 5.2;
      positions.setXYZ(
        index,
        Math.cos(angle) * radius,
        -3.55 * (1 - progress) + Math.sin(progress * Math.PI) * 0.52,
        1.15 * (1 - progress) + 0.14,
      );
    });
    positions.needsUpdate = true;

    leaves.forEach((leaf, index) => {
      leafProgress.current[index] = (leafProgress.current[index] + delta * leaf.speed * speedScale) % 1;
      const progress = leafProgress.current[index];
      const radius = THREE.MathUtils.lerp(4.7, 0.12, progress);
      const angle = leaf.angle + progress * 3.8;
      position.set(
        Math.cos(angle) * radius,
        -3.72 * (1 - progress) + Math.sin(progress * Math.PI) * 0.3,
        1.45 * (1 - progress) + 0.2,
      );
      scale.set(0.16 * (1 - progress * 0.45), 0.025, 0.075 * (1 - progress * 0.45));
      rotation.setFromAxisAngle(axis, leaf.rotation + progress * 5);
      matrix.compose(position, rotation, scale);
      leafMesh.current.setMatrixAt(index, matrix);
      leafMesh.current.setColorAt(index, leaf.color);
    });
    leafMesh.current.instanceMatrix.needsUpdate = true;
    if (leafMesh.current.instanceColor) leafMesh.current.instanceColor.needsUpdate = true;
  });

  useEffect(() => () => {
    leafGeometry.dispose();
    leafMaterial.dispose();
  }, [leafGeometry, leafMaterial]);

  return (
    <>
      <points frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute
            ref={motePositions}
            attach="attributes-position"
            args={[new Float32Array(motes.length * 3), 3]}
          />
        </bufferGeometry>
        <pointsMaterial color="#b9ddff" size={0.045} sizeAttenuation transparent opacity={0.82} depthWrite={false} />
      </points>
      <instancedMesh
        ref={leafMesh}
        args={[leafGeometry, leafMaterial, leaves.length]}
        frustumCulled={false}
      />
    </>
  );
}

function PortalStars({ reducedMotion }) {
  const pointsRef = useRef(null);
  const positions = useMemo(() => {
    const data = new Float32Array(620 * 3);
    for (let index = 0; index < 620; index += 1) {
      const vertical = ((index * 0.61803398875) % 1) * 7.5 - 3.75;
      const edge = Math.sqrt(Math.max(0, 1 - (vertical / 4.05) ** 2)) * 2.15;
      const horizontal = (((index * 0.75487766625) % 1) * 2 - 1) * edge;
      data[index * 3] = horizontal;
      data[index * 3 + 1] = vertical;
      data[index * 3 + 2] = 0.3 + ((index * 0.56984029099) % 1) * 2.5;
    }
    return data;
  }, []);

  useFrame(({ clock }) => {
    if (pointsRef.current && !reducedMotion) {
      pointsRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.08) * 0.025;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#f8e9c8" size={0.045} sizeAttenuation transparent opacity={0.86} depthWrite={false} />
    </points>
  );
}

function Portal({ reducedMotion, canEnterGalaxy, onEnterGalaxy }) {
  const portal = useRef(null);
  const orbit = useRef(null);
  const portalLight = useRef(null);

  useFrame(({ clock }, delta) => {
    const time = clock.elapsedTime;
    if (!reducedMotion) {
      if (portal.current) portal.current.rotation.y = THREE.MathUtils.damp(portal.current.rotation.y, Math.sin(time * 0.24) * 0.035, 1.8, delta);
      if (orbit.current) orbit.current.rotation.z = time * 0.04;
    }
    if (portalLight.current) {
      portalLight.current.intensity = THREE.MathUtils.damp(
        portalLight.current.intensity,
        canEnterGalaxy ? 3.2 : 1.7,
        3,
        delta,
      );
    }
  });

  return (
    <group ref={portal} position={[0, 3.1, -8.4]}>
      <CosmicMirror canEnterGalaxy={canEnterGalaxy} reducedMotion={reducedMotion} />
      <PortalGravity canEnterGalaxy={canEnterGalaxy} reducedMotion={reducedMotion} />
      <mesh
        position={[0, 0, 0.16]}
        onClick={(event) => {
          event.stopPropagation();
          onEnterGalaxy?.();
        }}
      >
        <planeGeometry args={[4.25, 7]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <PortalRim z={0.22} scale={1.06} radius={0.14} color="#d8c5a0" emissive="#8a643d" intensity={0.32} canEnterGalaxy={canEnterGalaxy} />
      <PortalRim z={0} scale={1} radius={0.075} color="#9bbdf0" emissive="#3986ff" intensity={1.5} canEnterGalaxy={canEnterGalaxy} />
      <PortalRim z={-0.4} scale={0.89} radius={0.065} color="#577da8" emissive="#244e8d" intensity={0.82} canEnterGalaxy={canEnterGalaxy} />

      <PortalStars reducedMotion={reducedMotion} />
      <group ref={orbit}>
        <mesh position={[-0.72, 2.48, 0.32]} castShadow>
          <sphereGeometry args={[0.42, 32, 24]} />
          <meshStandardMaterial color="#478ed8" emissive="#133c70" emissiveIntensity={0.48} roughness={0.38} />
        </mesh>
        <mesh position={[0.72, 0.72, 0.38]} rotation={[0.16, 0, -0.2]} castShadow>
          <sphereGeometry args={[0.56, 32, 24]} />
          <meshStandardMaterial color="#cb9762" emissive="#512a13" emissiveIntensity={0.28} roughness={0.62} />
        </mesh>
        <mesh position={[-0.48, -1.55, 0.32]} castShadow>
          <sphereGeometry args={[0.32, 28, 20]} />
          <meshStandardMaterial color="#73aee4" emissive="#18436d" emissiveIntensity={0.5} roughness={0.36} />
        </mesh>
        <mesh position={[0.77, 0.72, 0.28]} rotation={[0.3, 0, -0.22]}>
          <torusGeometry args={[0.82, 0.045, 10, 64]} />
          <meshStandardMaterial color="#d9c18d" emissive="#8b6b36" emissiveIntensity={0.5} metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
      <pointLight ref={portalLight} position={[0, 0, 1.6]} color="#75aaff" intensity={1.7} distance={12} />
    </group>
  );
}

function Limb({ position, rotation = [0, 0, 0], color, radius = 0.12, length = 0.76 }) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <capsuleGeometry args={[radius, length, 5, 10]} />
      <meshStandardMaterial color={color} roughness={0.76} />
    </mesh>
  );
}

function Hand({ mirror = 1, material }) {
  const fingerLengths = [0.17, 0.21, 0.19, 0.15];
  return (
    <group scale={[mirror, 1, 1]}>
      <mesh position={[0, -0.045, 0]} scale={[0.085, 0.115, 0.055]} material={material} castShadow>
        <sphereGeometry args={[1, 12, 9]} />
      </mesh>
      {fingerLengths.map((length, index) => {
        const x = (index - 1.5) * 0.043;
        return (
          <group key={index} position={[x, -0.12, 0.005]} rotation={[0, 0, (index - 1.5) * -0.07]}>
            <mesh position={[0, -length * 0.36, 0]} material={material} castShadow>
              <capsuleGeometry args={[0.023, length * 0.58, 4, 7]} />
            </mesh>
            <mesh position={[0, -length * 0.76, 0.003]} scale={[0.92, 0.96, 0.92]} material={material} castShadow>
              <sphereGeometry args={[0.022, 8, 6]} />
            </mesh>
          </group>
        );
      })}
      <group position={[mirror * 0.065, -0.005, 0.01]} rotation={[0, 0, mirror * -0.72]}>
        <mesh position={[0, -0.065, 0]} material={material} castShadow>
          <capsuleGeometry args={[0.027, 0.105, 4, 7]} />
        </mesh>
        <mesh position={[0, -0.12, 0]} material={material} castShadow>
          <sphereGeometry args={[0.027, 8, 6]} />
        </mesh>
      </group>
    </group>
  );
}

function Sneaker({ upperMaterial, soleMaterial, laceMaterial, sideMaterial }) {
  return (
    <group>
      <mesh position={[0, -0.055, -0.055]} material={soleMaterial} castShadow receiveShadow>
        <boxGeometry args={[0.26, 0.105, 0.43]} />
      </mesh>
      <mesh position={[0, -0.002, -0.06]} material={sideMaterial} castShadow>
        <boxGeometry args={[0.267, 0.045, 0.405]} />
      </mesh>
      <mesh position={[0, 0.065, -0.045]} scale={[0.115, 0.088, 0.205]} material={upperMaterial} castShadow receiveShadow>
        <sphereGeometry args={[1, 16, 10]} />
      </mesh>
      <mesh position={[0, 0.045, -0.185]} scale={[0.108, 0.068, 0.1]} material={upperMaterial} castShadow>
        <sphereGeometry args={[1, 14, 9]} />
      </mesh>
      <mesh position={[0, 0.115, 0.055]} scale={[0.09, 0.072, 0.095]} material={upperMaterial} castShadow>
        <sphereGeometry args={[1, 12, 8]} />
      </mesh>
      <mesh position={[0, 0.125, 0.056]} material={sideMaterial}>
        <boxGeometry args={[0.13, 0.015, 0.012]} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          {[0.005, 0.045, 0.085].map((y, index) => (
            <group key={y} position={[side * (0.075 - index * 0.008), y + 0.092, -0.09 + index * 0.055]}>
              <mesh rotation={[0.02, 0, side * 0.12]} material={laceMaterial} castShadow>
                <capsuleGeometry args={[0.009, 0.105, 3, 5]} />
              </mesh>
              <mesh position={[0, 0, 0.012]} material={laceMaterial}>
                <sphereGeometry args={[0.011, 6, 5]} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      <mesh position={[0, 0.015, -0.055]} material={sideMaterial}>
        <boxGeometry args={[0.275, 0.018, 0.42]} />
      </mesh>
    </group>
  );
}

function StrawHat() {
  const textures = useMemo(() => {
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = 512;
    colorCanvas.height = 512;
    const colorContext = colorCanvas.getContext('2d');
    colorContext.fillStyle = '#d6ad6b';
    colorContext.fillRect(0, 0, 512, 512);
    for (let radius = 5; radius < 360; radius += 5) {
      colorContext.beginPath();
      colorContext.arc(256, 256, radius, 0, Math.PI * 2);
      colorContext.strokeStyle = radius % 10 === 0 ? 'rgba(105, 70, 35, 0.34)' : 'rgba(255, 228, 166, 0.38)';
      colorContext.lineWidth = radius % 10 === 0 ? 1.6 : 1;
      colorContext.stroke();
    }
    for (let index = 0; index < 180; index += 1) {
      const angle = (index / 180) * Math.PI * 2;
      colorContext.beginPath();
      colorContext.moveTo(256 + Math.cos(angle) * 72, 256 + Math.sin(angle) * 72);
      colorContext.lineTo(256 + Math.cos(angle) * 246, 256 + Math.sin(angle) * 246);
      colorContext.strokeStyle = index % 2 === 0 ? 'rgba(112, 75, 39, 0.16)' : 'rgba(255, 230, 174, 0.2)';
      colorContext.lineWidth = 1;
      colorContext.stroke();
    }

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = 256;
    bumpCanvas.height = 256;
    const bumpContext = bumpCanvas.getContext('2d');
    bumpContext.fillStyle = '#808080';
    bumpContext.fillRect(0, 0, 256, 256);
    for (let line = 0; line < 256; line += 4) {
      bumpContext.strokeStyle = line % 8 === 0 ? '#a0a0a0' : '#686868';
      bumpContext.lineWidth = 1;
      bumpContext.beginPath();
      bumpContext.moveTo(0, line);
      bumpContext.lineTo(256, line);
      bumpContext.stroke();
    }

    const map = new THREE.CanvasTexture(colorCanvas);
    map.colorSpace = THREE.SRGBColorSpace;
    const bumpMap = new THREE.CanvasTexture(bumpCanvas);
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    bumpMap.wrapS = THREE.RepeatWrapping;
    bumpMap.wrapT = THREE.RepeatWrapping;
    return { map, bumpMap };
  }, []);
  const strawMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: textures.map,
    bumpMap: textures.bumpMap,
    bumpScale: 0.035,
    roughness: 0.92,
  }), [textures]);

  useEffect(() => () => {
    textures.map.dispose();
    textures.bumpMap.dispose();
    strawMaterial.dispose();
  }, [strawMaterial, textures]);

  return (
    <group rotation={[0.05, 0, -0.12]}>
      <mesh castShadow>
        <cylinderGeometry args={[0.7, 0.74, 0.075, 40]} />
        <primitive object={strawMaterial} attach="material" />
      </mesh>
      <mesh position={[0, 0.17, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.3, 0.29, 28]} />
        <primitive object={strawMaterial} attach="material" />
      </mesh>
      <mesh position={[0, 0.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.275, 0.025, 8, 32]} />
        <meshStandardMaterial color="#704c32" roughness={0.76} />
      </mesh>
      <mesh position={[0, 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.61, 0.012, 6, 48]} />
        <meshStandardMaterial color="#b98a4d" roughness={0.88} />
      </mesh>
    </group>
  );
}

function createFabricMaps() {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorContext = colorCanvas.getContext('2d');
  colorContext.fillStyle = '#f3efe5';
  colorContext.fillRect(0, 0, size, size);
  for (let index = 0; index < size; index += 4) {
    colorContext.strokeStyle = index % 8 === 0 ? 'rgba(151, 135, 111, 0.12)' : 'rgba(255, 255, 255, 0.18)';
    colorContext.lineWidth = 1;
    colorContext.beginPath();
    colorContext.moveTo(index, 0);
    colorContext.lineTo(index, size);
    colorContext.stroke();
    colorContext.beginPath();
    colorContext.moveTo(0, index);
    colorContext.lineTo(size, index);
    colorContext.stroke();
  }

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpContext = bumpCanvas.getContext('2d');
  bumpContext.fillStyle = '#808080';
  bumpContext.fillRect(0, 0, size, size);
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalContext = normalCanvas.getContext('2d');
  normalContext.fillStyle = 'rgb(128, 128, 255)';
  normalContext.fillRect(0, 0, size, size);
  for (let index = 0; index < size; index += 5) {
    const raised = index % 10 === 0;
    bumpContext.strokeStyle = raised ? '#989898' : '#696969';
    bumpContext.lineWidth = 1.5;
    bumpContext.beginPath();
    bumpContext.moveTo(index, 0);
    bumpContext.lineTo(index, size);
    bumpContext.stroke();
    bumpContext.beginPath();
    bumpContext.moveTo(0, index);
    bumpContext.lineTo(size, index);
    bumpContext.stroke();
    normalContext.strokeStyle = raised ? 'rgb(140, 128, 252)' : 'rgb(116, 128, 252)';
    normalContext.lineWidth = 1;
    normalContext.beginPath();
    normalContext.moveTo(index, 0);
    normalContext.lineTo(index, size);
    normalContext.stroke();
    normalContext.strokeStyle = raised ? 'rgb(128, 140, 252)' : 'rgb(128, 116, 252)';
    normalContext.beginPath();
    normalContext.moveTo(0, index);
    normalContext.lineTo(size, index);
    normalContext.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  [map, bumpMap, normalMap].forEach((texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 3);
  });
  return { map, bumpMap, normalMap };
}

function createBagFabricMaps() {
  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorContext = colorCanvas.getContext('2d');
  const leatherGradient = colorContext.createLinearGradient(0, 0, size, size);
  leatherGradient.addColorStop(0, '#9b6b46');
  leatherGradient.addColorStop(0.48, '#815334');
  leatherGradient.addColorStop(1, '#a4764c');
  colorContext.fillStyle = leatherGradient;
  colorContext.fillRect(0, 0, size, size);
  let grainSeed = 19871;
  const randomGrain = () => {
    grainSeed = (grainSeed * 16807) % 2147483647;
    return (grainSeed - 1) / 2147483646;
  };
  for (let index = 0; index < 1800; index += 1) {
    const x = randomGrain() * size;
    const y = randomGrain() * size;
    const length = 2 + randomGrain() * 12;
    colorContext.strokeStyle = randomGrain() > 0.52
      ? 'rgba(53, 32, 19, 0.11)'
      : 'rgba(242, 205, 157, 0.12)';
    colorContext.lineWidth = 0.45 + randomGrain() * 0.8;
    colorContext.beginPath();
    colorContext.moveTo(x, y);
    colorContext.lineTo(x + length, y + (randomGrain() - 0.5) * 2);
    colorContext.stroke();
  }

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpContext = bumpCanvas.getContext('2d');
  bumpContext.fillStyle = '#858585';
  bumpContext.fillRect(0, 0, size, size);
  for (let index = 0; index < 1600; index += 1) {
    const x = randomGrain() * size;
    const y = randomGrain() * size;
    const length = 2 + randomGrain() * 10;
    const tone = Math.round(112 + randomGrain() * 72);
    bumpContext.strokeStyle = `rgba(${tone}, ${tone}, ${tone}, 0.48)`;
    bumpContext.lineWidth = 0.6 + randomGrain() * 1.1;
    bumpContext.beginPath();
    bumpContext.moveTo(x, y);
    bumpContext.lineTo(x + length, y + (randomGrain() - 0.5) * 2);
    bumpContext.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  [map, bumpMap].forEach((texture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 2);
  });
  return { map, bumpMap };
}

function createLeatherStrapGeometry(curve, width) {
  const segments = 44;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const point = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const normalX = -tangent.y;
    const normalY = tangent.x;
    positions.push(
      point.x - normalX * width * 0.5, point.y - normalY * width * 0.5, point.z,
      point.x + normalX * width * 0.5, point.y + normalY * width * 0.5, point.z,
    );
    uvs.push(0, t * 5, 1, t * 5);
    if (index < segments) {
      const current = index * 2;
      indices.push(current, current + 1, current + 2, current + 1, current + 3, current + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function createDressGeometry(profile) {
  const radialSegments = 72;
  const heightSegments = 40;
  const positions = [];
  const uvs = [];
  const indices = [];
  const bottom = profile[0].y;
  const top = profile[profile.length - 1].y;

  for (let row = 0; row <= heightSegments; row += 1) {
    const v = row / heightSegments;
    const y = THREE.MathUtils.lerp(bottom, top, v);
    let segment = 0;
    while (segment < profile.length - 2 && profile[segment + 1].y < y) segment += 1;
    const lower = profile[segment];
    const upper = profile[segment + 1];
    const blend = THREE.MathUtils.clamp((y - lower.y) / (upper.y - lower.y), 0, 1);
    const baseRadius = THREE.MathUtils.lerp(lower.x, upper.x, blend);
    const pleatStrength = THREE.MathUtils.smoothstep(y, 0.12, 0.72) * (1 - THREE.MathUtils.smoothstep(y, 1.25, 1.62));

    for (let column = 0; column <= radialSegments; column += 1) {
      const u = column / radialSegments;
      const angle = u * Math.PI * 2;
      const folds = (Math.sin(angle * 12 + v * 2.2) * 0.028 + Math.sin(angle * 24 - v * 3) * 0.008) * pleatStrength;
      const radius = baseRadius + folds;
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      uvs.push(u * 2, v * 3);

      if (row < heightSegments && column < radialSegments) {
        const current = row * (radialSegments + 1) + column;
        const nextRow = current + radialSegments + 1;
        indices.push(current, nextRow, current + 1, current + 1, nextRow, nextRow + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function Walker({ reducedMotion, movement, isNearReader, onJourneyStateChange }) {
  const root = useRef(null);
  const body = useRef(null);
  const hair = useRef(null);
  const leftLeg = useRef(null);
  const rightLeg = useRef(null);
  const leftArm = useRef(null);
  const rightArm = useRef(null);
  const { camera } = useThree();
  const desiredCameraPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const walkStartedAt = useRef(null);
  const previousJourneyState = useRef({
    hasMoved: false,
    isNearPortal: false,
    isNearCabin: false,
    isNearReader: false,
    isAtSummit: false,
  });
  const dressProfile = useMemo(() => [
    new THREE.Vector2(0.4, 0.22),
    new THREE.Vector2(0.48, 0.26),
    new THREE.Vector2(0.48, 0.3),
    new THREE.Vector2(0.43, 0.64),
    new THREE.Vector2(0.34, 1.05),
    new THREE.Vector2(0.27, 1.3),
    new THREE.Vector2(0.3, 1.39),
    new THREE.Vector2(0.24, 1.47),
    new THREE.Vector2(0.31, 1.62),
    new THREE.Vector2(0.28, 1.75),
    new THREE.Vector2(0.14, 1.79),
  ], []);
  const dressGeometry = useMemo(() => createDressGeometry(dressProfile), [dressProfile]);
  const fabricMaps = useMemo(() => createFabricMaps(), []);
  const fabricMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: fabricMaps.map,
    normalMap: fabricMaps.normalMap,
    normalScale: new THREE.Vector2(0.2, 0.2),
    roughnessMap: fabricMaps.bumpMap,
    bumpMap: fabricMaps.bumpMap,
    bumpScale: 0.018,
    displacementMap: fabricMaps.bumpMap,
    displacementScale: 0.004,
    roughness: 0.96,
  }), [fabricMaps]);
  const bagMaps = useMemo(() => createBagFabricMaps(), []);
  const bagMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    map: bagMaps.map,
    bumpMap: bagMaps.bumpMap,
    bumpScale: 0.065,
    roughness: 0.78,
  }), [bagMaps]);
  const leatherGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.18, -0.2);
    shape.lineTo(0.18, -0.2);
    shape.quadraticCurveTo(0.215, -0.2, 0.215, -0.16);
    shape.lineTo(0.215, 0.16);
    shape.quadraticCurveTo(0.215, 0.2, 0.18, 0.2);
    shape.lineTo(-0.18, 0.2);
    shape.quadraticCurveTo(-0.215, 0.2, -0.215, 0.16);
    shape.lineTo(-0.215, -0.16);
    shape.quadraticCurveTo(-0.215, -0.2, -0.18, -0.2);
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.15,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.018,
      bevelThickness: 0.018,
      curveSegments: 6,
    });
  }, []);
  const flapGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.2, 0.08);
    shape.quadraticCurveTo(-0.2, 0.13, -0.16, 0.13);
    shape.lineTo(0.16, 0.13);
    shape.quadraticCurveTo(0.2, 0.13, 0.2, 0.08);
    shape.lineTo(0.17, -0.1);
    shape.quadraticCurveTo(0, -0.16, -0.17, -0.1);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.035,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 0.012,
      bevelThickness: 0.012,
      curveSegments: 6,
    });
  }, []);
  const strapMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8b5b39',
    map: bagMaps.map,
    bumpMap: bagMaps.bumpMap,
    bumpScale: 0.04,
    roughness: 0.76,
    side: THREE.DoubleSide,
  }), [bagMaps]);
  const strapCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.25, 1.77, -0.22),
    new THREE.Vector3(0.31, 1.52, -0.28),
    new THREE.Vector3(0.08, 1.22, -0.34),
    new THREE.Vector3(-0.22, 0.96, -0.36),
    new THREE.Vector3(-0.31, 0.78, -0.3),
  ]), []);
  const strapGeometry = useMemo(() => createLeatherStrapGeometry(strapCurve, 0.088), [strapCurve]);
  const backStrapCurve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.31, 0.78, 0.42),
    new THREE.Vector3(-0.22, 1.05, 0.5),
    new THREE.Vector3(0.02, 1.34, 0.5),
    new THREE.Vector3(0.27, 1.58, 0.45),
    new THREE.Vector3(0.25, 1.77, 0.35),
  ]), []);
  const backStrapGeometry = useMemo(() => createLeatherStrapGeometry(backStrapCurve, 0.088), [backStrapCurve]);
  const strapStitchGeometries = useMemo(() => [strapCurve, backStrapCurve].flatMap((curve) => (
    [-1, 1].map((side) => {
      const points = Array.from({ length: 28 }, (_, index) => {
        const t = index / 27;
        const point = curve.getPointAt(t);
        const tangent = curve.getTangentAt(t);
        const offset = side * 0.035;
        return new THREE.Vector3(
          point.x - tangent.y * offset,
          point.y + tangent.x * offset,
          point.z - 0.008,
        );
      });
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.0045, 5, false);
    })
  )), [backStrapCurve, strapCurve]);
  const claspMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d9bb7b',
    metalness: 0.88,
    roughness: 0.3,
  }), []);
  const stitchMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e0bd8b',
    roughness: 0.9,
  }), []);
  const handMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e3b49b',
    roughness: 0.78,
  }), []);
  const sneakerMaterials = useMemo(() => ({
    upper: new THREE.MeshStandardMaterial({ color: '#d8d0bd', roughness: 0.86 }),
    sole: new THREE.MeshStandardMaterial({ color: '#403a37', roughness: 0.92 }),
    lace: new THREE.MeshStandardMaterial({ color: '#f0e9d8', roughness: 0.88 }),
    accent: new THREE.MeshStandardMaterial({ color: '#82928a', roughness: 0.72 }),
  }), []);
  const hairProfile = useMemo(() => [
    new THREE.Vector2(0.12, -0.67),
    new THREE.Vector2(0.27, -0.59),
    new THREE.Vector2(0.34, -0.28),
    new THREE.Vector2(0.31, 0.02),
    new THREE.Vector2(0.28, 0.22),
    new THREE.Vector2(0.25, 0.34),
    new THREE.Vector2(0.05, 0.39),
  ], []);

  useEffect(() => () => {
    dressGeometry.dispose();
    fabricMaterial.dispose();
    fabricMaps.map.dispose();
    fabricMaps.bumpMap.dispose();
    fabricMaps.normalMap.dispose();
    bagMaterial.dispose();
    strapMaterial.dispose();
    bagMaps.map.dispose();
    bagMaps.bumpMap.dispose();
    leatherGeometry.dispose();
    flapGeometry.dispose();
    strapGeometry.dispose();
    backStrapGeometry.dispose();
    strapStitchGeometries.forEach((geometry) => geometry.dispose());
    claspMaterial.dispose();
    stitchMaterial.dispose();
    handMaterial.dispose();
    Object.values(sneakerMaterials).forEach((material) => material.dispose());
  }, [
    backStrapGeometry,
    bagMaps,
    bagMaterial,
    claspMaterial,
    dressGeometry,
    fabricMaps,
    fabricMaterial,
    flapGeometry,
    handMaterial,
    leatherGeometry,
    sneakerMaterials,
    strapGeometry,
    strapMaterial,
    strapStitchGeometries,
    stitchMaterial,
  ]);

  useEffect(() => {
    const arm = rightArm.current;
    if (!arm) return undefined;
    if (!isNearReader) {
      const returnToRest = gsap.to(arm.rotation, {
        z: 0,
        duration: 0.3,
        ease: 'power2.out',
      });
      return () => returnToRest.kill();
    }

    const greeting = gsap.timeline();
    greeting
      .to(arm.rotation, { z: 1.02, duration: 0.38, ease: 'power2.out' })
      .to(arm.rotation, { z: 0.78, duration: 0.18, repeat: 2, yoyo: true, ease: 'sine.inOut' })
      .to(arm.rotation, { z: 0, duration: 0.38, ease: 'power2.inOut' });
    return () => greeting.kill();
  }, [isNearReader]);

  useFrame(({ clock }, delta) => {
    if (!root.current || !body.current) return;
    const time = clock.elapsedTime;
    const input = movement.current;
    const horizontal = Number(input.right) - Number(input.left);
    const vertical = Number(input.backward) - Number(input.forward);
    const moving = horizontal !== 0 || vertical !== 0;

    if (moving) {
      direction.set(horizontal, 0, vertical).normalize();
      const speed = input.sprint ? 6.2 : 4;
      root.current.position.x += direction.x * speed * delta;
      root.current.position.z += direction.z * speed * delta;
      const localZ = root.current.position.z - 1;
      const trailBounds = [{ center: pathCenter(localZ), halfWidth: 2.45 }];
      if (localZ >= -10.5 && localZ <= 2.7) {
        trailBounds.push({ center: branchTrailCenterX(localZ), halfWidth: 1.5 });
      }
      if (localZ >= -23.8 && localZ <= 2.7) {
        trailBounds.push({ center: cabinTrailCenterX(localZ), halfWidth: 1.5 });
      }
      const isOnTrail = trailBounds.some(({ center, halfWidth }) => (
        root.current.position.x >= center - halfWidth
        && root.current.position.x <= center + halfWidth
      ));
      if (!isOnTrail) {
        root.current.position.x = trailBounds
          .map(({ center, halfWidth }) => THREE.MathUtils.clamp(
            root.current.position.x,
            center - halfWidth,
            center + halfWidth,
          ))
          .reduce((closest, candidate) => (
            Math.abs(root.current.position.x - candidate) < Math.abs(root.current.position.x - closest)
              ? candidate
              : closest
          ));
      }
      root.current.position.z = THREE.MathUtils.clamp(root.current.position.z, -22.8, 13);
      root.current.position.y = terrainHeight(root.current.position.x, root.current.position.z - 1);
      const targetYaw = Math.atan2(-direction.x, -direction.z);
      const yawDifference = Math.atan2(
        Math.sin(targetYaw - root.current.rotation.y),
        Math.cos(targetYaw - root.current.rotation.y),
      );
      root.current.rotation.y += yawDifference * (1 - Math.exp(-delta * 8));
      if (walkStartedAt.current == null) walkStartedAt.current = time;
    } else {
      walkStartedAt.current = null;
    }

    const localZ = root.current.position.z - 1;
    const branchAvailable = localZ >= -10.5 && localZ <= 2.7;
    const onCreekBranch = branchAvailable
      && Math.abs(root.current.position.x - branchTrailCenterX(localZ)) <= 1.8;
    const onCabinTrail = localZ >= -23.8 && localZ <= 2.7
      && Math.abs(root.current.position.x - cabinTrailCenterX(localZ)) <= 1.8;
    const isNearCabin = Math.hypot(
      root.current.position.x - 11.1,
      localZ + 8.4,
    ) <= 5.2;
    const readerLocalZ = READER_POSITION.z - 1;
    const isNearReader = Math.hypot(
      root.current.position.x - READER_POSITION.x,
      localZ - readerLocalZ,
    ) <= 3.1;
    const isAtSummit = Math.hypot(
      root.current.position.x - MOUNTAIN_SUMMIT.x,
      localZ - MOUNTAIN_SUMMIT.z,
    ) <= 2.1;
    const isNearPortal = !onCreekBranch && !onCabinTrail
      && root.current.position.z <= -5.7
      && Math.abs(root.current.position.x) <= 2.3;
    const hasMoved = Math.hypot(root.current.position.x - 0.52, root.current.position.z - 3.5) > 0.55;
    const previousState = previousJourneyState.current;
    if (
      previousState.hasMoved !== hasMoved
      || previousState.isNearPortal !== isNearPortal
      || previousState.isNearCabin !== isNearCabin
      || previousState.isNearReader !== isNearReader
      || previousState.isAtSummit !== isAtSummit
    ) {
      previousJourneyState.current = { hasMoved, isNearPortal, isNearCabin, isNearReader, isAtSummit };
      onJourneyStateChange?.({ hasMoved, isNearPortal, isNearCabin, isNearReader, isAtSummit });
    }

    const walkTime = walkStartedAt.current == null ? time * 0.35 : (time - walkStartedAt.current) * 9;
    const step = moving ? Math.sin(walkTime) : 0;
    const walkAmplitude = reducedMotion ? 0.14 : 0.42;
    body.current.position.y = moving && !reducedMotion
      ? Math.abs(step) * 0.055
      : Math.sin(time * 1.1) * (reducedMotion ? 0 : 0.018);
    body.current.rotation.z = moving ? Math.sin(walkTime) * (reducedMotion ? 0.008 : 0.025) : 0;
    if (leftLeg.current) leftLeg.current.rotation.x = moving ? step * walkAmplitude : 0;
    if (rightLeg.current) rightLeg.current.rotation.x = moving ? -step * walkAmplitude : 0;
    if (leftArm.current) leftArm.current.rotation.x = moving ? -step * walkAmplitude * 0.6 : 0;
    if (rightArm.current) rightArm.current.rotation.x = moving ? step * walkAmplitude * 0.52 : 0;
    if (!isNearReader) {
      if (leftArm.current) {
        leftArm.current.rotation.z = THREE.MathUtils.damp(
          leftArm.current.rotation.z,
          isAtSummit ? 0.34 : 0,
          3,
          delta,
        );
      }
      if (rightArm.current) {
        rightArm.current.rotation.z = THREE.MathUtils.damp(
          rightArm.current.rotation.z,
          isAtSummit ? -0.34 : 0,
          3,
          delta,
        );
      }
    }
    if (hair.current) {
      const sway = moving ? step * (reducedMotion ? 0.025 : 0.075) : Math.sin(time * 0.8) * 0.018;
      hair.current.rotation.z = THREE.MathUtils.damp(hair.current.rotation.z, sway, 5, delta);
    }

    if (time > 2.4) {
      desiredCameraPosition.set(
        root.current.position.x,
        root.current.position.y + (isAtSummit ? 7.6 : 5.2),
        root.current.position.z + (isAtSummit ? 13.5 : 10.5),
      );
      camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-delta * 1.15));
      cameraTarget.set(
        root.current.position.x,
        root.current.position.y + (isAtSummit ? 1.9 : 1.4),
        root.current.position.z - (isAtSummit ? 4.8 : 3),
      );
      camera.lookAt(cameraTarget);
    }
  });

  return (
    <group ref={root} position={[0.52, terrainHeight(0.52, 2.5), 3.5]} scale={1}>
      <group ref={body}>
        <mesh castShadow receiveShadow>
          <primitive object={dressGeometry} attach="geometry" />
          <primitive object={fabricMaterial} attach="material" />
        </mesh>
        <mesh geometry={strapGeometry} material={strapMaterial} castShadow />
        <mesh geometry={backStrapGeometry} material={strapMaterial} castShadow />
        {strapStitchGeometries.map((geometry, index) => (
          <mesh key={index} geometry={geometry} material={stitchMaterial} />
        ))}
        <group position={[0.24, 1.49, -0.35]} rotation={[0, 0, -0.2]}>
          <mesh position={[-0.049, 0, 0]} material={claspMaterial}>
            <boxGeometry args={[0.012, 0.11, 0.018]} />
          </mesh>
          <mesh position={[0.049, 0, 0]} material={claspMaterial}>
            <boxGeometry args={[0.012, 0.11, 0.018]} />
          </mesh>
          <mesh position={[0, 0.049, 0]} material={claspMaterial}>
            <boxGeometry args={[0.1, 0.012, 0.018]} />
          </mesh>
          <mesh position={[0, -0.049, 0]} material={claspMaterial}>
            <boxGeometry args={[0.1, 0.012, 0.018]} />
          </mesh>
          <mesh position={[0, 0, 0.01]} material={claspMaterial}>
            <boxGeometry args={[0.014, 0.072, 0.022]} />
          </mesh>
        </group>
        <group position={[-0.3, 0.99, -0.37]}>
          <mesh geometry={leatherGeometry} material={bagMaterial} castShadow receiveShadow />
          <group position={[0, 0.19, -0.03]}>
            <mesh geometry={flapGeometry} material={bagMaterial} castShadow receiveShadow />
            <mesh position={[0, -0.105, -0.048]} material={claspMaterial}>
              <boxGeometry args={[0.13, 0.022, 0.016]} />
            </mesh>
            <mesh position={[0, -0.13, -0.054]} material={claspMaterial} castShadow>
              <boxGeometry args={[0.052, 0.044, 0.025]} />
            </mesh>
            <mesh position={[0, -0.13, -0.071]} material={bagMaterial}>
              <boxGeometry args={[0.018, 0.064, 0.008]} />
            </mesh>
          </group>
        </group>
        <mesh position={[0, 1.96, -0.045]} scale={[0.92, 1.02, 0.9]} castShadow>
          <sphereGeometry args={[0.23, 20, 16]} />
          <meshStandardMaterial color="#e3b49b" roughness={0.75} />
        </mesh>
        <mesh position={[0, 1.98, 0.025]} scale={[1.02, 0.95, 0.92]} castShadow>
          <sphereGeometry args={[0.245, 20, 16]} />
          <meshStandardMaterial color="#633b31" roughness={0.94} />
        </mesh>
        <group ref={hair} position={[0, 1.67, 0.19]} scale={[1.18, 1, 0.78]}>
          <mesh castShadow>
            <latheGeometry args={[hairProfile, 20]} />
            <meshStandardMaterial color="#57352c" roughness={0.93} />
          </mesh>
        </group>

        <group ref={leftLeg} position={[-0.19, 0.54, 0]}>
          <Limb position={[0, -0.27, 0]} color="#49352e" radius={0.095} length={0.48} />
          <group position={[0, -0.55, -0.03]}>
            <Sneaker
              upperMaterial={sneakerMaterials.upper}
              soleMaterial={sneakerMaterials.sole}
              laceMaterial={sneakerMaterials.lace}
              sideMaterial={sneakerMaterials.accent}
            />
          </group>
        </group>
        <group ref={rightLeg} position={[0.19, 0.54, 0]}>
          <Limb position={[0, -0.27, 0]} color="#49352e" radius={0.095} length={0.48} />
          <group position={[0, -0.55, -0.03]}>
            <Sneaker
              upperMaterial={sneakerMaterials.upper}
              soleMaterial={sneakerMaterials.sole}
              laceMaterial={sneakerMaterials.lace}
              sideMaterial={sneakerMaterials.accent}
            />
          </group>
        </group>

        <group ref={leftArm} position={[-0.3, 1.58, 0]}>
          <Limb position={[-0.13, -0.31, 0.015]} rotation={[0, 0, -0.18]} color="#e4ddd0" radius={0.105} length={0.55} />
          <group position={[-0.13, -0.76, 0.025]} rotation={[0, 0, -0.06]}>
            <Hand material={handMaterial} />
          </group>
        </group>
        <group ref={rightArm} position={[0.3, 1.58, 0]}>
          <Limb position={[0.14, -0.27, 0.03]} rotation={[0, 0, 0.22]} color="#e4ddd0" radius={0.105} length={0.55} />
          <group position={[0.14, -0.76, 0.045]} rotation={[0, 0, 0.06]}>
            <Hand mirror={-1} material={handMaterial} />
          </group>
          <mesh position={[0.14, -0.48, 0.03]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.112, 0.014, 8, 28]} />
            <meshStandardMaterial color="#d6b56f" metalness={0.72} roughness={0.32} />
          </mesh>
        </group>
        <group position={[0, 2.2, -0.035]} scale={0.75}>
          <StrawHat />
        </group>
      </group>
    </group>
  );
}

function CameraArrival({ reducedMotion }) {
  const { camera } = useThree();

  useEffect(() => {
    const target = [0, 2.05, -2.5];
    const destination = { x: 0, y: 5.1, z: 25.5 };
    if (reducedMotion) {
      camera.position.set(destination.x, destination.y, destination.z);
      camera.lookAt(...target);
      return undefined;
    }

    camera.position.set(0, 7, 33);
    camera.lookAt(...target);
    const arrival = gsap.to(camera.position, {
      ...destination,
      duration: 2.4,
      ease: 'power2.inOut',
      onUpdate: () => camera.lookAt(...target),
    });
    return () => arrival.kill();
  }, [camera, reducedMotion]);

  return null;
}

function RealWorldScene({
  reducedMotion,
  audioLevel,
  movement,
  journeyState,
  onJourneyStateChange,
  onPortalEnter,
}) {
  return (
    <>
      <color attach="background" args={['#6f475f']} />
      <SkyDome reducedMotion={reducedMotion} />
      <AtmosphericClouds reducedMotion={reducedMotion} />
      <SkyBird reducedMotion={reducedMotion} />
      <ambientLight intensity={0.58} color="#ffd0a2" />
      <directionalLight
        position={[-14, 8, -20]}
        intensity={3.1}
        color="#ffbd78"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-bias={-0.0002}
      />
      <hemisphereLight args={['#db9bb0', '#473243', 0.72]} />

      <Terrain reducedMotion={reducedMotion} dogActive={journeyState.isNearCabin} />
      <ForestReader greeting={journeyState.isNearReader} reducedMotion={reducedMotion} />
      <Portal
        reducedMotion={reducedMotion}
        canEnterGalaxy={journeyState.isNearPortal}
        onEnterGalaxy={onPortalEnter}
      />
      <Walker
        reducedMotion={reducedMotion}
        movement={movement}
        isNearReader={journeyState.isNearReader}
        onJourneyStateChange={onJourneyStateChange}
      />
      <ButterflyGuide audioLevel={audioLevel} reducedMotion={reducedMotion} />
      <fog attach="fog" args={['#bd8292', 23, 70]} />
      <EffectComposer multisampling={0}>
        <Bloom
          intensity={journeyState.isNearPortal ? 0.9 : 0.42}
          luminanceThreshold={0.78}
          luminanceSmoothing={0.22}
          mipmapBlur
        />
      </EffectComposer>
    </>
  );
}

export default function RealWorldCollage({ onEnterGalaxy }) {
  const shouldReduceMotion = useReducedMotion();
  const { audioLevel } = useAppAudio();
  const [journeyState, setJourneyState] = useState({
    hasMoved: false,
    isNearPortal: false,
    isNearCabin: false,
    isNearReader: false,
    isAtSummit: false,
  });
  const movement = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  });
  const handleJourneyStateChange = useCallback((nextState) => {
    if (nextState.isNearPortal) {
      onEnterGalaxy?.();
      return;
    }
    setJourneyState((currentState) => (
      currentState.hasMoved === nextState.hasMoved
      && currentState.isNearPortal === nextState.isNearPortal
      && currentState.isNearCabin === nextState.isNearCabin
      && currentState.isNearReader === nextState.isNearReader
      && currentState.isAtSummit === nextState.isAtSummit
        ? currentState
        : nextState
    ));
  }, [onEnterGalaxy]);

  useEffect(() => {
    const keyDirections = {
      KeyW: 'forward',
      ArrowUp: 'forward',
      KeyS: 'backward',
      ArrowDown: 'backward',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      ShiftLeft: 'sprint',
      ShiftRight: 'sprint',
    };
    const clearMovement = () => {
      Object.keys(movement.current).forEach((key) => {
        movement.current[key] = false;
      });
    };
    const handleKeyDown = (event) => {
      const direction = keyDirections[event.code];
      if (!direction) return;
      if (event.code.startsWith('Arrow')) event.preventDefault();
      movement.current[direction] = true;
    };
    const handleKeyUp = (event) => {
      const direction = keyDirections[event.code];
      if (direction) movement.current[direction] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearMovement);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearMovement);
    };
  }, []);

  useEffect(() => {
    if (!journeyState.isNearPortal) return undefined;
    const handleJump = (event) => {
      if (event.code !== 'Space' || event.repeat) return;
      const activeElement = document.activeElement;
      if (activeElement?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeElement?.tagName)) return;
      event.preventDefault();
      onEnterGalaxy?.();
    };
    window.addEventListener('keydown', handleJump);
    return () => window.removeEventListener('keydown', handleJump);
  }, [journeyState.isNearPortal, onEnterGalaxy]);

  const movementButton = (direction, label, glyph, extraClasses = '') => (
    <button
      key={direction}
      type="button"
      aria-label={label}
      className={`flex h-12 w-12 touch-none items-center justify-center rounded-xl border border-white/30 bg-black/35 text-lg text-white/90 shadow-lg backdrop-blur-md active:bg-white/25 ${extraClasses}`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        movement.current[direction] = true;
      }}
      onPointerUp={() => { movement.current[direction] = false; }}
      onPointerCancel={() => { movement.current[direction] = false; }}
      onLostPointerCapture={() => { movement.current[direction] = false; }}
    >
      {glyph}
    </button>
  );

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: shouldReduceMotion ? 0 : 0.22, ease: 'easeOut' } }}
      transition={{ duration: shouldReduceMotion ? 0 : 0.8, ease: 'easeOut' }}
      className="fixed inset-0 z-[110] overflow-hidden bg-[#152735] text-white"
      aria-label="Mundo real: camino entre el cielo y el universo"
    >
      <Canvas
        shadows="percentage"
        dpr={[1, 1.5]}
        camera={{ position: [0, 7, 33], fov: 43, near: 0.1, far: 150 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
      >
        <CameraArrival reducedMotion={shouldReduceMotion} />
        <RealWorldScene
          reducedMotion={shouldReduceMotion}
          audioLevel={audioLevel}
          movement={movement}
          journeyState={journeyState}
          onJourneyStateChange={handleJourneyStateChange}
          onPortalEnter={onEnterGalaxy}
        />
      </Canvas>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[18%] top-[27%] z-[1] aspect-square w-[clamp(5rem,11vw,9rem)] rounded-full mix-blend-screen"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255, 246, 220, 0.88) 0%, rgba(255, 190, 125, 0.56) 24%, rgba(239, 107, 104, 0.2) 48%, transparent 74%)',
          filter: 'blur(1px)',
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            'radial-gradient(ellipse at 18% 25%, rgba(223, 188, 157, 0.24), transparent 42%)',
            'radial-gradient(ellipse at 83% 38%, rgba(177, 198, 173, 0.2), transparent 46%)',
            'radial-gradient(ellipse at 52% 82%, rgba(210, 171, 132, 0.18), transparent 48%)',
            'repeating-linear-gradient(0deg, rgba(84, 65, 48, 0.035) 0 1px, transparent 1px 4px)',
            'repeating-linear-gradient(90deg, rgba(255, 246, 225, 0.045) 0 1px, transparent 1px 5px)',
          ].join(', '),
          mixBlendMode: 'soft-light',
          opacity: 0.82,
          backdropFilter: 'saturate(0.78) sepia(0.1) contrast(0.94) blur(0.25px)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#07121b]/15 via-transparent to-[#130e08]/20" />
      <motion.p
        id="portal-guidance"
        key={[
          journeyState.isNearPortal,
          journeyState.isNearCabin,
          journeyState.isNearReader,
          journeyState.isAtSummit,
          journeyState.hasMoved,
        ].join('-')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
        aria-live="polite"
        className="pointer-events-none absolute bottom-[13.5rem] left-1/2 z-10 w-[min(88vw,24rem)] -translate-x-1/2 rounded-xl border border-white/15 bg-[#07121b]/75 px-3 py-2 text-center font-mono text-[9px] leading-relaxed tracking-wide text-white/80 shadow-lg backdrop-blur-md sm:bottom-6 sm:left-6 sm:w-auto sm:translate-x-0 sm:rounded-full sm:px-4"
      >
        {journeyState.isNearPortal
          ? 'EL PORTAL ESTÁ CERCA · PULSA ESPACIO PARA SALTAR AL UNIVERSO'
          : journeyState.isAtSummit
            ? 'CUMBRE · DETENTE Y CONTEMPLA EL ATARDECER SOBRE EL BOSQUE'
          : journeyState.isNearReader
            ? 'RÍO · EL LECTOR LEVANTA LA VISTA Y TE DEVUELVE EL SALUDO'
            : journeyState.isNearCabin
              ? 'LA PUERTA SE ABRE · UN AMIGO PELUDO SALE A RECIBIRTE'
          : journeyState.hasMoved
                ? 'EL SENDERO RODEA LA CASITA Y SE ADENTRA EN EL BOSQUE · HAY ALGUIEN LEYENDO JUNTO AL RÍO'
                : 'USA WASD O LAS FLECHAS · SIGUE EL SENDERO HACIA LA CASITA Y EL BOSQUE'}
        {!journeyState.isNearPortal && !journeyState.isNearCabin && !journeyState.isNearReader && !journeyState.isAtSummit && !journeyState.hasMoved && (
          <span className="hidden sm:inline"> · SHIFT PARA CORRER</span>
        )}
      </motion.p>
      <div className="absolute bottom-5 left-1/2 grid -translate-x-1/2 grid-cols-3 gap-1.5 sm:hidden" aria-label="Controles para caminar">
        <span />
        {movementButton('forward', 'Caminar hacia adelante', '↑')}
        <span />
        {movementButton('left', 'Caminar hacia la izquierda', '←')}
        {movementButton('backward', 'Caminar hacia atrás', '↓')}
        {movementButton('right', 'Caminar hacia la derecha', '→')}
      </div>
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3 sm:p-7">
        <section
          aria-label="Identidad de Gaby"
          className="max-w-[min(62vw,22rem)] border border-white/15 bg-[#07121b]/65 px-3 py-2.5 font-mono shadow-lg backdrop-blur-xl sm:max-w-sm sm:px-4 sm:py-3"
        >
          <p className="mb-1 text-[7px] uppercase tracking-[0.2em] text-amber-100/65 sm:text-[8px]">
            {journeyState.isNearPortal
              ? 'Portal · destino disponible'
              : journeyState.isAtSummit
                ? 'Cumbre · hora dorada'
              : journeyState.isNearReader
                ? 'Río · rincón de lectura'
                : journeyState.isNearCabin
                  ? 'Refugio · la casita'
                  : 'Mundo real · 01'}
          </p>
          <h1 className="text-[12px] tracking-[0.12em] text-white sm:text-base">
            Gaby Edwin <span className="text-amber-100/70">_</span>
          </h1>
          <p className="mt-1 text-[8px] tracking-[0.06em] text-white/75 sm:text-[10px] sm:tracking-[0.1em]">
            Frontend Developer &amp; Arte Digital
          </p>
        </section>
        <AnimatePresence>
          {journeyState.isNearPortal && (
            <motion.button
              type="button"
              data-cursor
              onClick={onEnterGalaxy}
              aria-label="Entrar al portal y descubrir la galaxia"
              aria-describedby="portal-guidance"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
              className="min-h-11 shrink-0 border border-cyan-100/40 bg-[#07121b]/75 px-3 py-2 font-mono text-[9px] tracking-[0.08em] text-cyan-50 shadow-lg backdrop-blur-xl transition hover:border-cyan-100/75 hover:bg-[#10233a]/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-70 sm:px-4 sm:text-[10px]"
            >
              <span className="sm:hidden">SALTAR →</span>
              <span className="hidden sm:inline">SALTAR AL UNIVERSO →</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
