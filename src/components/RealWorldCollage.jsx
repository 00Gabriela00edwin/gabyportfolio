import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import * as THREE from 'three';
import ButterflyGuide from './ButterflyGuide';
import { useAppAudio } from '../audio/AudioContext';

const TrailPhysics = lazy(() => import('./TrailPhysics'));

const TERRAIN_WIDTH = 34;
const TERRAIN_DEPTH = 68;
const TERRAIN_SEGMENTS_X = 190;
const TERRAIN_SEGMENTS_Z = 210;
const GRASS_TUFT_COUNT = 34000;

function SceneReady({ onReady }) {
  const hasReportedReady = useRef(false);

  useFrame(() => {
    if (hasReportedReady.current) return;
    hasReportedReady.current = true;
    onReady();
  });

  return null;
}

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

function streamCenterZ(x) {
  return -29.4 + Math.sin(x * 0.22) * 0.2
    + Math.sin(x * 0.58) * 0.07;
}

function branchTrailCenterX(z) {
  const progress = THREE.MathUtils.smoothstep(z, -10.1, 2.4);
  const start = pathCenter(2.4) - 0.85;
  return THREE.MathUtils.lerp(-8.35, start, progress) + Math.sin(progress * Math.PI) * 0.32;
}

function stationTrailCenterX(z) {
  const progress = THREE.MathUtils.smoothstep(z, -15.8, -12.4);
  return THREE.MathUtils.lerp(-13.55, pathCenter(-12.4), progress)
    - Math.sin(progress * Math.PI) * 0.8;
}

function cabinTrailCenterX(z) {
  const doorZ = CABIN_FRONT_Z - 1;
  const progress = THREE.MathUtils.smoothstep(z, doorZ, 2.4);
  return THREE.MathUtils.lerp(CABIN_X, pathCenter(2.4) + 0.4, progress)
    + Math.sin(progress * Math.PI) * 1.35;
}

function mountainTrailCenterX(z) {
  const progress = THREE.MathUtils.smoothstep(z, -23.8, MOUNTAIN_TRAIL_START_Z);
  return THREE.MathUtils.lerp(MOUNTAIN_SUMMIT.x, pathCenter(MOUNTAIN_TRAIL_START_Z) + 0.4, progress)
    + Math.sin(progress * Math.PI * 2) * 2.1;
}

const READER_LOCAL_Z = -9.2;
const READER_POSITION = {
  x: -9.45,
  z: READER_LOCAL_Z + 1,
};
const CABIN_X = 11.1;
const CABIN_LOCAL_Z = -8.4;
const CABIN_FRONT_Z = CABIN_LOCAL_Z + 1 + 1.65;
const CABIN_BACK_Z = CABIN_LOCAL_Z + 1 - 1.65;
const TRAIN_TRACK_X = -15.2;
const TRAIN_TRACK_CENTER_Z = -15.5;
const TRAIN_STATION_POSITION = { x: -12.9, z: -15.5 };
const TRAIN_TRIGGER_RADIUS = 5.2;
const TRAIN_START_Z = -9.5;
const TRAIN_END_Z = -21.5;
const RIVERSIDE_TREE_POSITION = { x: -12.1, z: -10.7 };
const MOUNTAIN_SUMMIT = { x: 10.1, z: -23.2 };
const MOUNTAIN_TRAIL_START_Z = -11.2;
const CABIN_TRAIL_END_Z = CABIN_FRONT_Z - 1;
const RIVER_CENTER_Z = -29.4;
const BRIDGE_CENTER_X = pathCenter(RIVER_CENTER_Z);
const BRIDGE_CENTER_Z = streamCenterZ(BRIDGE_CENTER_X);
const BRIDGE_DESTINATION_Z = BRIDGE_CENTER_Z - 2.4;

function mountainLiftAt(x, z) {
  const horizontal = (x - MOUNTAIN_SUMMIT.x) / 6.1;
  const depth = (z - MOUNTAIN_SUMMIT.z) / 7.4;
  const ridge = Math.sin(x * 0.62 + z * 0.24) * 0.13
    + Math.cos(z * 0.78 - x * 0.19) * 0.1;
  const ridgeMask = Math.exp(-((horizontal * horizontal + depth * depth) * 0.72));
  return Math.max(0, 5.8 * Math.exp(-((horizontal * horizontal + depth * depth) * 0.78))
    + ridge * ridgeMask);
}

function terrainHeight(x, z) {
  const distanceFromPath = Math.abs(x - pathCenter(z));
  const bank = Math.exp(-1 * (((distanceFromPath - 1.85) / 0.7) ** 2)) * 0.78;
  const pathCut = Math.exp(-((distanceFromPath / 1.05) ** 4)) * 0.28;
  const branchDistance = Math.abs(x - branchTrailCenterX(z));
  const branchGate = THREE.MathUtils.smoothstep(z, -10.6, -9.8)
    * (1 - THREE.MathUtils.smoothstep(z, 2.05, 2.7));
  const branchCut = Math.exp(-((branchDistance / 0.9) ** 4)) * branchGate * 0.12;
  const stationTrailDistance = Math.abs(x - stationTrailCenterX(z));
  const stationTrailGate = THREE.MathUtils.smoothstep(z, -15.95, -15.5)
    * (1 - THREE.MathUtils.smoothstep(z, -12.4, -11.9));
  const stationTrailCut = Math.exp(-((stationTrailDistance / 0.88) ** 4)) * stationTrailGate * 0.12;
  const cabinDistance = Math.abs(x - cabinTrailCenterX(z));
  const cabinGate = THREE.MathUtils.smoothstep(z, CABIN_TRAIL_END_Z - 0.45, CABIN_TRAIL_END_Z)
    * (1 - THREE.MathUtils.smoothstep(z, 2.05, 2.7));
  const cabinCut = Math.exp(-((cabinDistance / 0.9) ** 4)) * cabinGate * 0.12;
  const mountainDistance = Math.abs(x - mountainTrailCenterX(z));
  const mountainGate = THREE.MathUtils.smoothstep(z, -24.1, -23.4)
    * (1 - THREE.MathUtils.smoothstep(z, MOUNTAIN_TRAIL_START_Z - 0.4, MOUNTAIN_TRAIL_START_Z));
  const mountainCut = Math.exp(-((mountainDistance / 0.9) ** 4)) * mountainGate * 0.15;
  const riverDistance = Math.abs(z - streamCenterZ(x));
  const riverGate = THREE.MathUtils.smoothstep(x, -17, -15.6)
    * (1 - THREE.MathUtils.smoothstep(x, 15.6, 17));
  const riverCut = Math.exp(-((riverDistance / 0.62) ** 2)) * riverGate * 0.38;
  const riverBank = Math.exp(-(((riverDistance - 0.94) / 0.34) ** 2)) * riverGate * 0.16;
  const riverApproach = THREE.MathUtils.smoothstep(-z, 25.2, 29.2)
    * (1 - THREE.MathUtils.smoothstep(-z, 30.2, 33.2));
  const riverDescent = riverApproach * 0.52;
  const mountainLift = mountainLiftAt(x, z);
  const furrows = Math.sin(x * 1.85 + z * 0.45 + Math.sin(z * 0.18) * 0.7)
    * Math.cos(z * 1.2 - x * 0.3) * 0.055;
  const rollingGround = Math.sin(x * 0.42 + z * 0.26 + Math.sin(z * 0.13) * 1.1) * 0.22
    + Math.cos(z * 0.38 + Math.sin(x * 0.2)) * 0.18
    + Math.sin(x * 1.2 + z * 0.72) * Math.cos(z * 0.94 - x * 0.36) * 0.11
    + Math.sin(x * 3.7 + z * 2.8) * 0.035;
  const wheelRuts = Math.exp(-(((distanceFromPath - 0.34) / 0.1) ** 2)) * 0.035;
  return -1.35 - z * 0.023 + bank - pathCut - branchCut - stationTrailCut - cabinCut - mountainCut
    - riverCut + riverBank - riverDescent - wheelRuts + furrows + rollingGround + mountainLift;
}

function bridgeDeckHeight(x, z) {
  const span = 1.72;
  const offset = z - BRIDGE_CENTER_Z;
  if (Math.abs(offset) > span || Math.abs(x - BRIDGE_CENTER_X) > 1.4) return null;
  const farBank = terrainHeight(x, BRIDGE_CENTER_Z - span);
  const nearBank = terrainHeight(x, BRIDGE_CENTER_Z + span);
  const progress = (offset + span) / (span * 2);
  return THREE.MathUtils.lerp(farBank, nearBank, progress)
    + 0.34 * (1 - (offset / span) ** 2);
}

function walkerGroundHeight(x, z) {
  return Math.max(terrainHeight(x, z), bridgeDeckHeight(x, z) ?? -Infinity);
}

const WALKER_START_POSITION = [
  0.52,
  terrainHeight(0.52, 2.5),
  3.5,
];

const PORTAL_POSITION = {
  x: MOUNTAIN_SUMMIT.x,
  y: terrainHeight(MOUNTAIN_SUMMIT.x, MOUNTAIN_SUMMIT.z) + 2.4,
  z: MOUNTAIN_SUMMIT.z + 1,
};

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
      const stationTrailDistance = Math.abs(x - stationTrailCenterX(z));
      const stationTrailGate = THREE.MathUtils.smoothstep(z, -16, -15.2)
        * (1 - THREE.MathUtils.smoothstep(z, -12.4, -11.8));
      const stationTrailBlend = (1 - THREE.MathUtils.smoothstep(stationTrailDistance, 0.72, 1.3))
        * stationTrailGate;
      const cabinDistance = Math.abs(x - cabinTrailCenterX(z));
      const cabinGate = THREE.MathUtils.smoothstep(z, CABIN_TRAIL_END_Z - 0.45, CABIN_TRAIL_END_Z)
        * (1 - THREE.MathUtils.smoothstep(z, 2.05, 2.7));
      const cabinBlend = (1 - THREE.MathUtils.smoothstep(cabinDistance, 0.58, 1.02)) * cabinGate;
      const mountainDistance = Math.abs(x - mountainTrailCenterX(z));
      const mountainGate = THREE.MathUtils.smoothstep(z, -24.1, -23.4)
        * (1 - THREE.MathUtils.smoothstep(z, MOUNTAIN_TRAIL_START_Z - 0.4, MOUNTAIN_TRAIL_START_Z));
      const mountainTrailBlend = (1 - THREE.MathUtils.smoothstep(mountainDistance, 0.52, 1.04)) * mountainGate;
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
      const stationTrailColor = soil.clone().lerp(new THREE.Color('#783b27'), (variation + 1) * 0.13);
      const cabinColor = soil.clone().lerp(new THREE.Color('#783b27'), (variation + 1) * 0.13);
      const mountainTrailColor = soil.clone().lerp(new THREE.Color('#783b27'), (variation + 1) * 0.13);
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
        .lerp(stationTrailColor, stationTrailBlend)
        .lerp(cabinColor, cabinBlend)
        .lerp(mountainTrailColor, mountainTrailBlend);

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

function createStationTrailGeometry() {
  return createTrailGeometry(stationTrailCenterX, -12.4, -15.8, 1.34);
}

function createCabinTrailGeometry() {
  return createTrailGeometry(cabinTrailCenterX, 2.4, CABIN_TRAIL_END_Z, 1.08);
}

function createMountainTrailGeometry() {
  return createTrailGeometry(mountainTrailCenterX, MOUNTAIN_TRAIL_START_Z, -23.8, 0.96);
}

function createStreamGeometry() {
  const segments = 180;
  const widthSegments = 12;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row <= segments; row += 1) {
    const progress = row / segments;
    const x = THREE.MathUtils.lerp(-16.1, 16.1, progress);
    for (let column = 0; column <= widthSegments; column += 1) {
      const across = column / widthSegments;
      const z = streamCenterZ(x) + (across - 0.5) * 1.55;
      positions.push(x, terrainHeight(x, z) + 0.012, z);
      uvs.push(progress * 9, across);
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


function SkyDome() {
  const shader = useMemo(() => ({
    uniforms: {},
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;

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
        vec3 horizon = vec3(0.63, 0.84, 0.96);
        vec3 sunsetBand = vec3(0.42, 0.72, 0.91);
        vec3 zenith = vec3(0.24, 0.55, 0.82);
        vec3 sky = mix(horizon, sunsetBand, smoothstep(0.02, 0.42, height));
        sky = mix(sky, zenith, smoothstep(0.38, 0.96, height));
        float horizonGlow = exp(-pow((vUv.y - 0.16) * 9.0, 2.0));
        sky += vec3(0.035, 0.055, 0.065) * horizonGlow;
        vec2 cloudUv = vec2(vUv.x * 8.0, vUv.y * 5.0);
        float clouds = cloudNoise(cloudUv);
        float cloudMask = smoothstep(0.58, 0.84, clouds) * (1.0 - smoothstep(0.78, 0.98, vUv.y));
        float cloudLight = smoothstep(0.05, 0.4, vUv.y);
        vec3 cloudColor = mix(vec3(0.78, 0.88, 0.94), vec3(0.96, 0.98, 1.0), cloudLight);
        cloudColor = mix(cloudColor, vec3(0.95, 0.98, 1.0), horizonGlow * 0.4);

        float milkyWayCenter = 0.3 + sin((vUv.x - 0.5) * 6.2831) * 0.045;
        float milkyWayBand = exp(-pow((vUv.y - milkyWayCenter) * 13.0, 2.0));
        float milkyWayTexture = cloudNoise(vUv * vec2(29.0, 17.0));
        float milkyWay = milkyWayBand * smoothstep(0.28, 0.72, milkyWayTexture);
        sky = mix(sky, sky + vec3(0.018, 0.025, 0.04), milkyWay * 0.32);
        sky += vec3(0.008, 0.018, 0.035) * exp(-pow((vUv.y - 0.4) * 5.0, 2.0));

        vec2 butterfly = (vUv - vec2(0.72, 0.7)) * vec2(1.0, 1.65);
        butterfly.x += butterfly.y * 0.16;
        float wingShape = exp(-pow((abs(butterfly.x) - 0.095) * 15.0, 2.0)
          - pow(butterfly.y * 7.0, 2.0));
        float wingTexture = 0.55 + cloudNoise(butterfly * 34.0) * 0.45;
        float butterflyNebula = wingShape * wingTexture;
        float butterflyCore = exp(-abs(butterfly.x) * 42.0 - abs(butterfly.y) * 8.0);
        sky += vec3(0.08, 0.16, 0.22) * butterflyNebula * 0.18
          + vec3(0.06, 0.14, 0.2) * butterflyNebula * 0.12
          + vec3(0.08, 0.16, 0.22) * butterflyCore * 0.16;

        vec2 starGrid = floor(vUv * vec2(96.0, 52.0));
        vec2 starPoint = fract(vUv * vec2(96.0, 52.0)) - 0.5;
        float star = (1.0 - smoothstep(0.025, 0.09, length(starPoint)))
          * step(0.994, hash(starGrid));
        sky += vec3(0.035, 0.07, 0.1) * star * smoothstep(0.28, 0.72, vUv.y);

        gl_FragColor = vec4(mix(sky, cloudColor, cloudMask * 0.72), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  return (
    <mesh>
      <sphereGeometry args={[90, 48, 32]} />
      <shaderMaterial args={[shader]} side={THREE.BackSide} />
    </mesh>
  );
}

function MountainStream({ reducedMotion }) {
  const waterRef = useRef(null);
  const geometry = useMemo(() => createStreamGeometry(), []);
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
          sin(position.x * 2.4 + position.z * 1.8 + uTime * 1.25) * 0.009
          + sin(position.x * 4.1 - position.z * 2.6 + uTime * 0.72) * 0.004
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
        float ripple = sin(vUv.x * 48.0 - uTime * 2.1 + sin(vUv.y * 13.0) * 0.7);
        float glint = pow(max(ripple, 0.0), 13.0);
        float fresnel = pow(
          1.0 - max(dot(normalize(vViewNormal), normalize(vViewPosition)), 0.0),
          2.0
        );
        vec3 deepWater = vec3(0.1, 0.34, 0.4);
        vec3 reflectedSky = vec3(0.53, 0.76, 0.77);
        vec3 color = mix(deepWater, reflectedSky, vUv.y * 0.36 + fresnel * 0.3);
        color += vec3(0.48, 0.72, 0.68) * glint * 0.27;
        gl_FragColor = vec4(color, 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }), []);

  useFrame(({ clock }) => {
    const uniforms = waterRef.current?.material?.uniforms;
    if (!uniforms) return;
    uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
    uniforms.uMotion.value = reducedMotion ? 0 : 1;
  });

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return <mesh ref={waterRef} geometry={geometry} material={material} renderOrder={1} />;
}

function ScenicBridge() {
  const materials = useMemo(() => ({
    planks: new THREE.MeshStandardMaterial({ color: '#76533a', roughness: 0.95, flatShading: true }),
    beams: new THREE.MeshStandardMaterial({ color: '#4d382b', roughness: 0.96, flatShading: true }),
  }), []);
  const destinationY = terrainHeight(BRIDGE_CENTER_X, BRIDGE_DESTINATION_Z);
  const sidePositions = [-1.22, 1.22];
  const railSegments = 8;

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  return (
    <group>
      {Array.from({ length: 15 }, (_, index) => {
        const offset = (index / 14 - 0.5) * 3.35;
        const z = BRIDGE_CENTER_Z + offset;
        const deckY = bridgeDeckHeight(BRIDGE_CENTER_X, z) ?? terrainHeight(BRIDGE_CENTER_X, z);
        return (
          <mesh
            key={`bridge-plank-${index}`}
            position={[BRIDGE_CENTER_X, deckY + 0.045, z]}
            material={materials.planks}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[2.52, 0.09, 0.19]} />
          </mesh>
        );
      })}
      {sidePositions.map((offset) => {
        const x = BRIDGE_CENTER_X + offset;
        return (
          <group key={`bridge-rail-${offset}`}>
            {Array.from({ length: 7 }, (_, index) => {
              const z = BRIDGE_CENTER_Z - 1.55 + index * 0.515;
              const deckY = bridgeDeckHeight(x, z) ?? terrainHeight(x, z);
              return (
                <mesh
                  key={`bridge-post-${index}`}
                  position={[x, deckY + 0.43, z]}
                  material={materials.beams}
                  castShadow
                >
                  <boxGeometry args={[0.13, 0.78, 0.13]} />
                </mesh>
              );
            })}
            {Array.from({ length: railSegments }, (_, index) => {
              const z1 = BRIDGE_CENTER_Z - 1.65 + (index / railSegments) * 3.3;
              const z2 = BRIDGE_CENTER_Z - 1.65 + ((index + 1) / railSegments) * 3.3;
              const y1 = (bridgeDeckHeight(x, z1) ?? terrainHeight(x, z1)) + 0.76;
              const y2 = (bridgeDeckHeight(x, z2) ?? terrainHeight(x, z2)) + 0.76;
              const angle = -Math.atan2(y2 - y1, z2 - z1);
              return (
                <mesh
                  key={`bridge-handrail-${index}`}
                  position={[x, (y1 + y2) / 2, (z1 + z2) / 2]}
                  rotation={[angle, 0, 0]}
                  material={materials.beams}
                  castShadow
                >
                  <boxGeometry args={[0.14, 0.14, Math.hypot(z2 - z1, y2 - y1)]} />
                </mesh>
              );
            })}
          </group>
        );
      })}
      <group position={[BRIDGE_CENTER_X, destinationY, BRIDGE_DESTINATION_Z]}>
        <mesh position={[-0.86, 1.05, 0]} material={materials.beams} castShadow>
          <boxGeometry args={[0.16, 2.1, 0.16]} />
        </mesh>
        <mesh position={[0.86, 1.05, 0]} material={materials.beams} castShadow>
          <boxGeometry args={[0.16, 2.1, 0.16]} />
        </mesh>
        <pointLight position={[0, 1.6, 0]} color="#9be6e7" intensity={0.75} distance={5} />
      </group>
    </group>
  );
}

function HorizonMountains() {
  const mountainRanges = useMemo(() => {
    const ranges = [
      {
        z: -39.5,
        depth: 5.8,
        color: new THREE.Color('#778da7'),
        peaks: [
          [-19, 5.2, 2.6], [-14.6, 6.7, 2.8], [-9.7, 4.8, 2.5],
          [-4.7, 6.2, 2.7], [0.2, 7.5, 3], [5.1, 5.1, 2.5],
          [9.6, 6.6, 2.8], [14.5, 4.9, 2.6], [19, 6, 2.7],
        ],
      },
      {
        z: -45.8,
        depth: 6.5,
        color: new THREE.Color('#6e829d'),
        peaks: [
          [-19.5, 6.1, 3], [-13, 7.4, 3.2], [-6.3, 5.8, 2.9],
          [0.7, 7.8, 3.2], [7, 6.3, 3], [13.5, 7.1, 3.1],
          [19.5, 5.8, 3],
        ],
      },
    ];
    const widthSegments = 176;
    const depthSegments = 32;
    return ranges.map((range, rangeIndex) => {
      const positions = [];
      const colors = [];
      const indices = [];
      for (let row = 0; row <= depthSegments; row += 1) {
        const depthProgress = row / depthSegments;
        const z = range.z + depthProgress * range.depth;
        const depthFade = Math.sin(depthProgress * Math.PI) ** 0.62;
        for (let column = 0; column <= widthSegments; column += 1) {
          const x = -24 + (column / widthSegments) * 48;
          const ridge = range.peaks.reduce((height, [peakX, peakHeight, peakWidth]) => {
            const peakProfile = Math.max(0, 1 - Math.abs((x - peakX) / peakWidth));
            return height + peakHeight * peakProfile ** 0.82;
          }, 0);
          const undulation = Math.sin(x * 0.42 + rangeIndex * 1.7) * 0.07
            + Math.sin(x * 0.93 - rangeIndex) * 0.025;
          const y = -1.8 + Math.max(0, ridge + undulation) * depthFade;
          positions.push(x, y, z);
          const heightTint = THREE.MathUtils.clamp((y + 1.8) / 5.2, 0, 1);
          const tint = range.color.clone().lerp(
            new THREE.Color(rangeIndex === 0 ? '#a4b0bf' : '#929fb1'),
            heightTint * 0.23,
          );
          colors.push(tint.r, tint.g, tint.b);
          if (row < depthSegments && column < widthSegments) {
            const index = row * (widthSegments + 1) + column;
            const nextRow = index + widthSegments + 1;
            indices.push(index, nextRow, index + 1, index + 1, nextRow, nextRow + 1);
          }
        }
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setIndex(indices);
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 1,
        metalness: 0,
        flatShading: false,
        fog: true,
      });
      return { geometry, material };
    });
  }, []);

  useEffect(() => () => {
    mountainRanges.forEach(({ geometry, material }) => {
      geometry.dispose();
      material.dispose();
    });
  }, [mountainRanges]);

  return (
    <group>
      {mountainRanges.map(({ geometry, material }, index) => (
        <mesh
          key={`horizon-range-${index}`}
          geometry={geometry}
          material={material}
          receiveShadow
        />
      ))}
    </group>
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
  const grassCount = useMemo(
    () => (window.matchMedia('(pointer: coarse)').matches ? 13000 : GRASS_TUFT_COUNT),
    [],
  );
  const grassGeometry = useMemo(() => createGrassGeometry(), []);
  const windValues = useMemo(() => {
    const random = createRandom(22561);
    return new Float32Array(grassCount).map(() => (random() < 0.38 ? 0.35 + random() * 0.65 : 0));
  }, [grassCount]);
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
    const targetCount = grassCount;
    let attempts = 0;
    while (blades.length < targetCount && attempts < targetCount * 4) {
      attempts += 1;
      const x = -16.4 + nextRandom() * 32.8;
      const z = -18.2 + nextRandom() * 36.4;
      const mainPathDistance = Math.abs(x - pathCenter(z));
      const branchActive = z >= -10.5 && z <= 2.7;
      const branchDistance = Math.abs(x - branchTrailCenterX(z));
      const stationTrailActive = z >= -15.8 && z <= -12.4;
      const stationTrailDistance = Math.abs(x - stationTrailCenterX(z));
      const cabinTrailActive = z >= CABIN_TRAIL_END_Z - 0.4 && z <= 2.7;
      const cabinTrailDistance = Math.abs(x - cabinTrailCenterX(z));
      const mountainTrailActive = z >= -23.8 && z <= MOUNTAIN_TRAIL_START_Z + 0.4;
      const mountainTrailDistance = Math.abs(x - mountainTrailCenterX(z));
      const mountainLift = mountainLiftAt(x, z);
      if (
        mainPathDistance < 1.72
        || (branchActive && branchDistance < 1.34)
        || (stationTrailActive && stationTrailDistance < 1.62)
        || (cabinTrailActive && cabinTrailDistance < 1.34)
        || (mountainTrailActive && mountainTrailDistance < 1.26)
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
  }, [grassCount]);
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
      if (x >= -17 && x <= -10.5 && z >= -22.5 && z <= -9) continue;
      const branchActive = z >= -10.5 && z <= 2.7;
      if (Math.abs(x - pathCenter(z)) < 3.2) continue;
      if (branchActive && Math.abs(x - branchTrailCenterX(z)) < 3.2) continue;
      const stationTrailActive = z >= -15.8 && z <= -12.4;
      if (stationTrailActive && Math.abs(x - stationTrailCenterX(z)) < 3.5) continue;
      if (Math.hypot(x - READER_POSITION.x, z - (READER_POSITION.z - 1)) < 9.5) continue;
      if (mountainLiftAt(x, z) > 1.4) continue;
      if (Math.hypot(x - CABIN_X, z - CABIN_LOCAL_Z) < 6.6) continue;
      const cabinTrailActive = z >= CABIN_TRAIL_END_Z - 0.4 && z <= 2.7;
      const mountainTrailActive = z >= -23.8 && z <= MOUNTAIN_TRAIL_START_Z + 0.4;
      if (cabinTrailActive && Math.abs(x - cabinTrailCenterX(z)) < 5.2) continue;
      if (mountainTrailActive && Math.abs(x - mountainTrailCenterX(z)) < 3.2) continue;
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

    for (let index = 0; index < 28; index += 1) {
      const z = -21.3 + (index % 2) * 1.1 + (nextRandom() - 0.5) * 0.45;
      const x = -15.2 + index * 1.12 + (nextRandom() - 0.5) * 0.7;
      const mountainTrailActive = z >= -23.8 && z <= MOUNTAIN_TRAIL_START_Z + 0.4;
      if (mountainLiftAt(x, z) > 1.4) continue;
      if (mountainTrailActive && Math.abs(x - mountainTrailCenterX(z)) < 2.8) continue;
      const type = index % 3;
      const height = 0.85 + nextRandom() * 0.55;
      const treeScale = 0.72 + nextRandom() * 0.2;
      groups[type].push({
        x,
        y: terrainHeight(x, z),
        z,
        height,
        treeScale,
        crownScale: [
          0.42 + nextRandom() * 0.16,
          height * 0.38,
          0.42 + nextRandom() * 0.16,
        ],
        rotation: new THREE.Euler(
          (nextRandom() - 0.5) * 0.08,
          nextRandom() * Math.PI * 2,
          (nextRandom() - 0.5) * 0.08,
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
        z = 2.35 - nextRandom() * (2.35 - CABIN_TRAIL_END_Z);
        const side = nextRandom() < 0.5 ? -1 : 1;
        x = cabinTrailCenterX(z) + side * (1.22 + nextRandom() * 0.7);
      } else if (attempts <= 760) {
        z = MOUNTAIN_TRAIL_START_Z - nextRandom() * (MOUNTAIN_TRAIL_START_Z + 23.8);
        const side = nextRandom() < 0.5 ? -1 : 1;
        x = mountainTrailCenterX(z) + side * (1.24 + nextRandom() * 0.7);
      } else if (attempts <= 920) {
        z = -12.4 - nextRandom() * 3.4;
        const side = nextRandom() < 0.5 ? -1 : 1;
        x = stationTrailCenterX(z) + side * (1.24 + nextRandom() * 0.7);
      } else {
        x = -16 + nextRandom() * 32;
        z = -18 + nextRandom() * 36;
      }
      const mainDistance = Math.abs(x - pathCenter(z));
      const branchDistance = Math.abs(x - branchTrailCenterX(z));
      const cabinDistance = Math.abs(x - cabinTrailCenterX(z));
      const mountainTrailDistance = Math.abs(x - mountainTrailCenterX(z));
      const mountainLift = mountainLiftAt(x, z);
      const branchActive = z >= -10.5 && z <= 2.7;
      const stationTrailActive = z >= -15.8 && z <= -12.4;
      const cabinTrailActive = z >= CABIN_TRAIL_END_Z - 0.4 && z <= 2.7;
      const mountainTrailActive = z >= -23.8 && z <= MOUNTAIN_TRAIL_START_Z + 0.4;
      if (
        mainDistance < 1.2
        || (branchActive && branchDistance < 1.2)
        || (stationTrailActive && Math.abs(x - stationTrailCenterX(z)) < 1.55)
        || (cabinTrailActive && cabinDistance < 1.2)
        || (mountainTrailActive && mountainTrailDistance < 1.2)
        || mountainLift > 1.2
      ) continue;
      const colors = ['#fffaf0', '#f9f4df', '#fffdf5', '#fff7e8', '#e7a5a0', '#e9c56f', '#b9addd'];
      blooms.push({
        x,
        y: terrainHeight(x, z),
        z,
        scale: 0.82 + nextRandom() * 0.72,
        openness: 0.78 + nextRandom() * 0.3,
        color: new THREE.Color(colors[Math.floor(nextRandom() * colors.length)]),
        rotation: nextRandom() * Math.PI * 2,
      });
    }
    return blooms;
  }, []);
  const petalGeometry = useMemo(() => new THREE.SphereGeometry(1, 7, 5), []);
  const centerGeometry = useMemo(() => new THREE.SphereGeometry(0.055, 7, 5), []);
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
      position.set(flower.x, flower.y + 0.29 * flower.scale, flower.z);
      scale.set(0.06 * flower.scale, 0.026 * flower.scale, 0.13 * flower.scale);
      for (let petal = 0; petal < 8; petal += 1) {
        const angle = flower.rotation + (petal / 8) * Math.PI * 2;
        position.x = flower.x + Math.sin(angle) * 0.084 * flower.scale * flower.openness;
        position.z = flower.z + Math.cos(angle) * 0.084 * flower.scale * flower.openness;
        rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, angle);
        matrix.compose(position, rotation, scale);
        petalRef.current?.setMatrixAt(index * 8 + petal, matrix);
        petalRef.current?.setColorAt(index * 8 + petal, flower.color);
      }

      position.set(flower.x, flower.y + 0.37 * flower.scale, flower.z);
      scale.setScalar(1);
      matrix.compose(position, rotation, scale);
      centerRef.current?.setMatrixAt(index, matrix);

      position.set(flower.x, flower.y + 0.18 * flower.scale, flower.z);
      scale.set(1, 0.36 * flower.scale, 1);
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
      const trailType = index % 6;
      const alongCabinTrail = trailType === 0;
      const alongMountainTrail = trailType === 1 || trailType === 4;
      const alongBranch = trailType === 2;
      const z = alongCabinTrail
        ? 2.1 - nextRandom() * (2.1 - CABIN_TRAIL_END_Z)
        : alongMountainTrail
          ? THREE.MathUtils.lerp(MOUNTAIN_TRAIL_START_Z, -23.8, nextRandom())
          : alongBranch
            ? 2.1 - nextRandom() * 10.3
            : 13 - nextRandom() * 29;
      const side = nextRandom() < 0.5 ? -1 : 1;
      const center = alongCabinTrail
        ? cabinTrailCenterX(z)
        : alongMountainTrail
          ? mountainTrailCenterX(z)
          : alongBranch
            ? branchTrailCenterX(z)
            : pathCenter(z);
      const offset = alongMountainTrail
        ? 0.64 + nextRandom() * 0.8
        : alongBranch || alongCabinTrail
          ? 0.58 + nextRandom() * 0.95
        : 1.02 + nextRandom() * 2.1;
      const x = center + side * offset;
      const size = 0.028 + nextRandom() * 0.072;
      groups[0].push({
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


function RiversideTree({ reducedMotion }) {
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

function LogCabin({
  reducedMotion,
  dogActive,
  isInsideCabin,
  onDoorOpen,
}) {
  const cabinX = CABIN_X;
  const cabinZ = CABIN_LOCAL_Z;
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
  const smokeMaterials = useMemo(() => Array.from({ length: 5 }, () => new THREE.MeshBasicMaterial({
    color: '#c8c0b5',
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
  })), []);
  const porchMaterials = useMemo(() => ({
    wood: new THREE.MeshStandardMaterial({ color: '#795337', roughness: 0.93, flatShading: true }),
    woodLight: new THREE.MeshStandardMaterial({ color: '#a77a4f', roughness: 0.9 }),
    ceramic: new THREE.MeshStandardMaterial({ color: '#d8b27e', roughness: 0.42, metalness: 0.04 }),
    ceramicBlue: new THREE.MeshStandardMaterial({ color: '#739e9d', roughness: 0.38, metalness: 0.04 }),
    leaves: new THREE.MeshStandardMaterial({ color: '#577c4b', roughness: 0.88, flatShading: true }),
    leafLight: new THREE.MeshStandardMaterial({ color: '#82945a', roughness: 0.9, flatShading: true }),
    book: new THREE.MeshStandardMaterial({ color: '#8b5140', roughness: 0.86 }),
    bookGreen: new THREE.MeshStandardMaterial({ color: '#526b58', roughness: 0.88 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c19b5c', metalness: 0.28, roughness: 0.62 }),
    telescopeMetal: new THREE.MeshStandardMaterial({ color: '#343b43', metalness: 0.22, roughness: 0.66 }),
    telescopeBody: new THREE.MeshStandardMaterial({ color: '#343d45', metalness: 0.12, roughness: 0.78 }),
    telescopeRubber: new THREE.MeshStandardMaterial({ color: '#171c21', roughness: 0.92 }),
    telescopeLens: new THREE.MeshStandardMaterial({
      color: '#365e70',
      emissive: '#173444',
      emissiveIntensity: 0.18,
      metalness: 0.08,
      roughness: 0.3,
    }),
    butterflyFrame: new THREE.MeshStandardMaterial({ color: '#63462f', roughness: 0.84, flatShading: true }),
    butterflyPaper: new THREE.MeshStandardMaterial({ color: '#dfcfad', roughness: 0.96 }),
    butterflyInk: new THREE.MeshStandardMaterial({ color: '#493b30', roughness: 0.92 }),
    butterflyWings: ['#9b6551', '#6f7f66', '#bb9461', '#647f8b', '#a16b74', '#657253'].map(
      (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }),
    ),
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
      const frontLog = { axis: 'x', x: 0, y, z: 1.65, length: endLength };
      rows.push(
        { axis: 'x', x: 0, y, z: -1.65, length: endLength },
        ...(gableRows ? [frontLog] : [
          { ...frontLog, x: -1.25, length: 1.4 },
          { ...frontLog, x: 1.25, length: 1.4 },
        ]),
        ...(!gableRows ? [
          { axis: 'z', x: -1.9, y, z: 0, length: 3.3 },
          { axis: 'z', x: 1.9, y, z: 0, length: 3.3 },
        ] : []),
      );
    }
    return rows;
  }, []);
  const butterflyFrames = useMemo(() => {
    const sizes = [0.18, 0.21, 0.26, 0.34, 0.45, 0.6];
    return sizes.map((size, index) => {
      const radius = 0.13 * (1.35 ** index);
      const angle = index * Math.PI / 2;
      return {
        size,
        x: Math.cos(angle) * radius,
        y: 1.28 + Math.sin(angle) * radius,
        rotation: angle * 0.08,
        index,
      };
    });
  }, []);
  const beetleWalk = useRef(null);
  const beetleShell = useRef(null);
  const beetleLegs = useRef([]);
  const door = useRef(null);
  const dog = useRef(null);
  const dogHead = useRef(null);
  const dogTail = useRef(null);
  const dogLegs = useRef([]);
  const chimneySmoke = useRef([]);
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
    coat: new THREE.MeshStandardMaterial({ color: '#f1eee5', roughness: 0.94, flatShading: true }),
    muzzle: new THREE.MeshStandardMaterial({ color: '#ded8cb', roughness: 0.92, flatShading: true }),
    ears: new THREE.MeshStandardMaterial({ color: '#e8e3d8', roughness: 0.94, flatShading: true }),
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
    chimneySmoke.current.forEach((puff, index) => {
      if (!puff) return;
      const progress = reducedMotion
        ? index / chimneySmoke.current.length
        : (time * 0.22 + index / chimneySmoke.current.length) % 1;
      puff.position.set(
        1.42 + Math.sin(time * 0.8 + index) * progress * 0.24,
        4.3 + progress * 1.55,
        -0.95 + Math.cos(time * 0.6 + index) * progress * 0.12,
      );
      puff.scale.setScalar(0.08 + progress * 0.24);
      smokeMaterials[index].opacity = (1 - progress) * 0.2;
    });
    const targetAngle = dogActive || doorManuallyOpen ? -1.12 : 0;
    if (door.current) {
      door.current.rotation.y = THREE.MathUtils.damp(door.current.rotation.y, targetAngle, 3.5, delta);
    }

    if (!dog.current) return;
    const stride = reducedMotion ? 0 : time * 0.72;
    const dogX = cabinX + (reducedMotion ? 0 : Math.sin(stride) * 0.96);
    const direction = Math.cos(stride);
    dog.current.position.set(
      dogX,
      cabinY + 0.1 + (reducedMotion ? 0 : Math.abs(Math.sin(stride * 6)) * 0.02),
      cabinZ + 2.45,
    );
    dog.current.rotation.y = reducedMotion ? 0 : direction >= 0 ? Math.PI / 2 : -Math.PI / 2;
    if (!reducedMotion) {
      dogLegs.current.forEach((leg, index) => {
        if (leg) {
          const phase = stride * 8 + (index % 2) * Math.PI + (index > 1 ? Math.PI : 0);
          leg.rotation.x = Math.sin(phase) * 0.34;
        }
      });
      if (dogTail.current) dogTail.current.rotation.x = Math.sin(time * 9) * 0.52;
      if (dogHead.current) {
        dogHead.current.rotation.x = Math.sin(stride * 4) * 0.045;
        dogHead.current.rotation.z = Math.sin(stride * 2.2) * 0.035;
      }
    }
  });

  useEffect(() => () => {
    logGeometry.dispose();
    Object.values(beetleMaterials).forEach((material) => material.dispose());
    Object.values(dogMaterials).forEach((material) => material.dispose());
    woodMaterial.dispose();
    darkWoodMaterial.dispose();
    roofMaterial.dispose();
    smokeMaterials.forEach((material) => material.dispose());
    Object.values(porchMaterials).forEach((material) => {
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    });
    vineGeometries.forEach((geometry) => geometry.dispose());
    decorLeafGeometry.dispose();
  }, [beetleMaterials, decorLeafGeometry, darkWoodMaterial, dogMaterials, logGeometry, porchMaterials, roofMaterial, smokeMaterials, vineGeometries, woodMaterial]);

  return (
    <group>
      <group position={[cabinX, cabinY + 0.04, cabinZ]}>
        {logs.map((log, index) => (
          isInsideCabin && log.axis === 'x' && log.z === 1.65 ? null : (
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
          )
        ))}
        <group visible={isInsideCabin} position={[0, 0, -1.43]}>
          {butterflyFrames.map(({ size, x, y, rotation, index }) => (
            <group key={`butterfly-frame-${index}`} position={[x, y, 0]} rotation={[0, 0, rotation]}>
              <mesh material={porchMaterials.butterflyFrame} castShadow>
                <boxGeometry args={[size, size, 0.055]} />
              </mesh>
              <mesh position={[0, 0, 0.031]} material={porchMaterials.butterflyPaper}>
                <boxGeometry args={[size - 0.035, size - 0.035, 0.012]} />
              </mesh>
              <mesh position={[-size * 0.13, size * 0.045, 0.043]} scale={[size * 0.16, size * 0.22, size * 0.035]} material={porchMaterials.butterflyWings[index]} castShadow>
                <sphereGeometry args={[1, 8, 6]} />
              </mesh>
              <mesh position={[size * 0.13, size * 0.045, 0.043]} scale={[size * 0.16, size * 0.22, size * 0.035]} material={porchMaterials.butterflyWings[index]} castShadow>
                <sphereGeometry args={[1, 8, 6]} />
              </mesh>
              <mesh position={[0, 0.015, 0.047]} material={porchMaterials.butterflyInk}>
                <boxGeometry args={[size * 0.035, size * 0.34, 0.018]} />
              </mesh>
            </group>
          ))}
        </group>
        <group>
          <mesh position={[0, 0.08, 0]} material={porchMaterials.wood} receiveShadow>
            <boxGeometry args={[3.55, 0.16, 3.05]} />
          </mesh>
          <pointLight position={[0, 2.05, -0.5]} color="#ffb765" intensity={1.8} distance={6} decay={2} />
          <group position={[0.98, 0, -0.58]}>
            <mesh position={[0, 0.56, 0]} material={porchMaterials.woodLight} castShadow>
              <boxGeometry args={[0.82, 0.12, 0.72]} />
            </mesh>
            {[[-0.32, -0.27], [-0.32, 0.27], [0.32, -0.27], [0.32, 0.27]].map(([x, z]) => (
              <mesh key={`${x}-${z}`} position={[x, 0.3, z]} material={porchMaterials.wood} castShadow>
                <cylinderGeometry args={[0.035, 0.045, 0.52, 6]} />
              </mesh>
            ))}
            <mesh position={[0, 0.68, 0]} material={porchMaterials.ceramic} castShadow>
              <cylinderGeometry args={[0.12, 0.15, 0.2, 8]} />
            </mesh>
            <mesh position={[0, 0.82, 0]} material={porchMaterials.brass}>
              <sphereGeometry args={[0.045, 8, 6]} />
            </mesh>
          </group>
          <mesh position={[-0.95, 0.36, -0.7]} rotation={[0, 0, 0.04]} material={porchMaterials.bookGreen} castShadow>
            <boxGeometry args={[0.52, 0.08, 0.72]} />
          </mesh>
          <group position={[-1.2, 0.1, -1.27]}>
            {[-0.05, 0.68, 1.31].map((y) => (
              <mesh key={`shelf-${y}`} position={[0, y, 0]} material={porchMaterials.woodLight} castShadow receiveShadow>
                <boxGeometry args={[0.94, 0.09, 0.42]} />
              </mesh>
            ))}
            {[-0.43, 0.43].map((x) => (
              <mesh key={`side-${x}`} position={[x, 0.62, 0]} material={porchMaterials.wood} castShadow>
                <boxGeometry args={[0.08, 1.32, 0.4]} />
              </mesh>
            ))}
            {[0, 1].map((shelf) => (
              <group key={`books-${shelf}`} position={[0, 0.18 + shelf * 0.68, 0.015]}>
                {Array.from({ length: 6 }, (_, index) => {
                  const height = 0.27 + (index % 3) * 0.045;
                  return (
                    <group
                      key={index}
                      position={[-0.34 + index * 0.13, height / 2, 0]}
                      rotation={[0, 0, (index % 2 ? 1 : -1) * 0.035]}
                    >
                      <mesh
                        material={index % 3 === 1 ? porchMaterials.bookGreen : porchMaterials.book}
                        castShadow
                      >
                        <boxGeometry args={[0.105, height, 0.25]} />
                      </mesh>
                      <mesh position={[0, 0, 0.128]} material={porchMaterials.brass}>
                        <boxGeometry args={[0.012, height * 0.58, 0.006]} />
                      </mesh>
                    </group>
                  );
                })}
              </group>
            ))}
            <pointLight position={[0.15, 1.45, 0.55]} color="#ffd18a" intensity={0.65} distance={3.5} decay={2} />
          </group>
        </group>
        <group ref={door} position={[-0.41, 0.16, 1.78]}>
          <group
            onPointerOver={(event) => {
              event.stopPropagation();
              event.nativeEvent.target.style.cursor = 'pointer';
            }}
            onPointerOut={(event) => {
              event.nativeEvent.target.style.cursor = '';
            }}
            onClick={(event) => {
              event.stopPropagation();
              setDoorManuallyOpen(true);
              onDoorOpen?.();
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
        <mesh visible={!isInsideCabin} position={[-0.94, 3.1, 0]} rotation={[0, 0, Math.PI / 6]} material={roofMaterial} castShadow>
          <boxGeometry args={[2.25, 0.2, 5.1]} />
        </mesh>
        <mesh visible={!isInsideCabin} position={[0.94, 3.1, 0]} rotation={[0, 0, -Math.PI / 6]} material={roofMaterial} castShadow>
          <boxGeometry args={[2.25, 0.2, 5.1]} />
        </mesh>
        <mesh visible={!isInsideCabin} position={[1.42, 3.55, -0.95]} material={darkWoodMaterial} castShadow>
          <cylinderGeometry args={[0.18, 0.22, 1.35, 7]} />
        </mesh>
        <mesh visible={!isInsideCabin} position={[1.42, 4.24, -0.95]} material={porchMaterials.woodLight} castShadow>
          <cylinderGeometry args={[0.23, 0.23, 0.08, 7]} />
        </mesh>
        {smokeMaterials.map((material, index) => (
          <mesh
            key={`chimney-smoke-${index}`}
            ref={(puff) => { chimneySmoke.current[index] = puff; }}
            visible={!isInsideCabin}
            position={[1.42, 4.3, -0.95]}
            material={material}
          >
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
        ))}
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
        <group position={[-1.42, 0, 2.52]}>
          <mesh position={[-0.2, 0.47, 0]} rotation={[0, 0, -0.4]} material={porchMaterials.telescopeMetal} castShadow>
            <cylinderGeometry args={[0.018, 0.03, 0.96, 7]} />
          </mesh>
          <mesh position={[0.2, 0.47, 0]} rotation={[0, 0, 0.4]} material={porchMaterials.telescopeMetal} castShadow>
            <cylinderGeometry args={[0.018, 0.03, 0.96, 7]} />
          </mesh>
          <mesh position={[0, 0.47, -0.2]} rotation={[0.4, 0, 0]} material={porchMaterials.telescopeMetal} castShadow>
            <cylinderGeometry args={[0.018, 0.03, 0.96, 7]} />
          </mesh>
          {[
            [-0.38, 0.045, 0],
            [0.38, 0.045, 0],
            [0, 0.045, -0.38],
          ].map(([x, y, z]) => (
            <mesh key={`${x}-${z}`} position={[x, y, z]} scale={[0.055, 0.04, 0.055]} material={porchMaterials.telescopeRubber}>
              <sphereGeometry args={[1, 8, 6]} />
            </mesh>
          ))}
          <mesh position={[0, 0.45, 0]} material={porchMaterials.telescopeMetal} castShadow>
            <cylinderGeometry args={[0.045, 0.06, 0.72, 8]} />
          </mesh>
          <mesh position={[0, 0.49, 0]} material={porchMaterials.telescopeMetal}>
            <cylinderGeometry args={[0.2, 0.2, 0.025, 12, 1, true]} />
          </mesh>
          <mesh position={[0, 0.88, 0]} material={porchMaterials.telescopeMetal} castShadow>
            <cylinderGeometry args={[0.1, 0.13, 0.15, 10]} />
          </mesh>
          <mesh position={[0, 1.04, 0]} material={porchMaterials.telescopeMetal} castShadow>
            <boxGeometry args={[0.32, 0.09, 0.2]} />
          </mesh>
          <mesh position={[-0.115, 1.1, 0]} rotation={[0, 0, -0.12]} material={porchMaterials.telescopeMetal} castShadow>
            <cylinderGeometry args={[0.025, 0.03, 0.4, 7]} />
          </mesh>
          <mesh position={[0.115, 1.1, 0]} rotation={[0, 0, 0.12]} material={porchMaterials.telescopeMetal} castShadow>
            <cylinderGeometry args={[0.025, 0.03, 0.4, 7]} />
          </mesh>
          <group position={[0, 1.27, 0]} rotation={[0.62, 0, -0.18]}>
            <mesh material={porchMaterials.telescopeBody} castShadow>
              <cylinderGeometry args={[0.075, 0.09, 0.88, 12]} />
            </mesh>
            <mesh position={[0, 0.43, 0]} material={porchMaterials.telescopeMetal} castShadow>
              <cylinderGeometry args={[0.092, 0.092, 0.075, 12]} />
            </mesh>
            <mesh position={[0, 0.478, 0]} rotation={[-Math.PI / 2, 0, 0]} material={porchMaterials.telescopeRubber}>
              <circleGeometry args={[0.078, 12]} />
            </mesh>
            <mesh position={[0, 0.482, 0.002]} rotation={[-Math.PI / 2, 0, 0]} material={porchMaterials.telescopeLens}>
              <circleGeometry args={[0.06, 12]} />
            </mesh>
            <mesh position={[0, -0.43, 0]} material={porchMaterials.telescopeMetal}>
              <cylinderGeometry args={[0.082, 0.082, 0.075, 12]} />
            </mesh>
            <mesh position={[0, -0.51, 0]} material={porchMaterials.telescopeRubber}>
              <cylinderGeometry args={[0.05, 0.062, 0.12, 10]} />
            </mesh>
            <mesh position={[0.105, -0.15, 0]} material={porchMaterials.telescopeMetal} castShadow>
              <cylinderGeometry args={[0.025, 0.03, 0.16, 8]} />
            </mesh>
            <mesh position={[0.16, -0.15, 0]} material={porchMaterials.telescopeRubber}>
              <cylinderGeometry args={[0.026, 0.026, 0.04, 8]} />
            </mesh>
            <group position={[0.13, 0.21, 0.01]} rotation={[0.62, 0, 0]}>
              <mesh material={porchMaterials.telescopeBody} castShadow>
                <cylinderGeometry args={[0.022, 0.028, 0.32, 8]} />
              </mesh>
              <mesh position={[0, 0.17, 0]} material={porchMaterials.telescopeMetal}>
                <torusGeometry args={[0.03, 0.008, 6, 10]} />
              </mesh>
            </group>
          </group>
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
      <group ref={dog} scale={0.72}>
        <mesh position={[0, 0.46, 0]} scale={[0.29, 0.34, 0.56]} material={dogMaterials.coat} castShadow>
          <sphereGeometry args={[1, 12, 9]} />
        </mesh>
        {[
          [-0.16, 0.69, -0.24],
          [0, 0.76, -0.28],
          [0.16, 0.69, -0.24],
          [-0.18, 0.68, 0.08],
          [0.18, 0.68, 0.08],
        ].map(([x, y, z]) => (
          <mesh key={`${x}-${y}-${z}`} position={[x, y, z]} material={dogMaterials.coat} castShadow>
            <dodecahedronGeometry args={[0.105, 0]} />
          </mesh>
        ))}
        <group ref={dogHead} position={[0, 0.58, 0.42]}>
          <mesh scale={[0.25, 0.27, 0.28]} material={dogMaterials.coat} castShadow>
            <sphereGeometry args={[1, 12, 9]} />
          </mesh>
          {[-0.11, 0, 0.11].map((x) => (
            <mesh key={x} position={[x, 0.2, 0.02]} material={dogMaterials.coat} castShadow>
              <dodecahedronGeometry args={[0.09, 0]} />
            </mesh>
          ))}
          <mesh position={[0, -0.1, 0.22]} scale={[0.16, 0.13, 0.22]} material={dogMaterials.muzzle} castShadow>
            <sphereGeometry args={[1, 10, 8]} />
          </mesh>
          <mesh position={[0, -0.05, 0.41]} material={dogMaterials.nose}>
            <sphereGeometry args={[0.075, 9, 7]} />
          </mesh>
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh position={[side * 0.16, 0.2, -0.06]} rotation={[0.12, 0, side * -0.22]} scale={[0.1, 0.19, 0.1]} material={dogMaterials.ears} castShadow>
                <coneGeometry args={[1, 1, 6]} />
              </mesh>
              <mesh position={[side * 0.11, 0.06, 0.2]} material={dogMaterials.eyes}>
                <sphereGeometry args={[0.027, 7, 6]} />
              </mesh>
            </group>
          ))}
        </group>
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
    { x: -6.2, z: 1.35, height: 2.15, crown: '#647a4c' },
    { x: 6.2, z: 1.5, height: 2.55, crown: '#87935a' },
    { x: -6.5, z: 4.05, height: 2.35, crown: '#738650' },
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

function ForestTurtle({ reducedMotion }) {
  const head = useRef(null);
  const materials = useMemo(() => ({
    shell: new THREE.MeshStandardMaterial({ color: '#66764a', roughness: 0.92, flatShading: true }),
    shellRim: new THREE.MeshStandardMaterial({ color: '#8b8b55', roughness: 0.94, flatShading: true }),
    underside: new THREE.MeshStandardMaterial({ color: '#c4aa78', roughness: 0.92, flatShading: true }),
    skin: new THREE.MeshStandardMaterial({ color: '#78915c', roughness: 0.9, flatShading: true }),
    eyes: new THREE.MeshStandardMaterial({ color: '#241f18', roughness: 0.76 }),
  }), []);
  const x = READER_POSITION.x + 1.9;
  const z = READER_LOCAL_Z;
  const y = terrainHeight(x, z);

  useFrame(({ clock }) => {
    if (!head.current || reducedMotion) return;
    head.current.rotation.y = Math.sin(clock.elapsedTime * 0.8) * 0.09;
  });

  useEffect(() => () => {
    Object.values(materials).forEach((material) => material.dispose());
  }, [materials]);

  return (
    <group position={[x, y, z]} rotation={[0, Math.PI * 0.15, 0]}>
      <mesh position={[0, 0.15, 0]} scale={[0.42, 0.13, 0.52]} material={materials.underside} castShadow receiveShadow>
        <sphereGeometry args={[1, 10, 7]} />
      </mesh>
      <mesh position={[0, 0.31, 0.02]} scale={[0.45, 0.28, 0.54]} material={materials.shell} castShadow receiveShadow>
        <sphereGeometry args={[1, 10, 7]} />
      </mesh>
      <mesh position={[0, 0.2, 0.02]} scale={[0.47, 0.075, 0.56]} material={materials.shellRim} castShadow receiveShadow>
        <cylinderGeometry args={[1, 1, 1, 10]} />
      </mesh>
      <group ref={head} position={[0, 0.24, -0.51]}>
        <mesh position={[0, 0, -0.14]} scale={[0.17, 0.14, 0.23]} material={materials.skin} castShadow receiveShadow>
          <sphereGeometry args={[1, 9, 7]} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 0.105, 0.045, -0.28]} material={materials.eyes}>
            <sphereGeometry args={[0.025, 6, 5]} />
          </mesh>
        ))}
      </group>
      {[-1, 1].flatMap((side) => [-1, 1].map((front) => (
        <mesh
          key={`${side}-${front}`}
          position={[side * 0.32, 0.1, front * 0.34]}
          rotation={[0, side * front * 0.16, side * 0.12]}
          scale={[0.16, 0.13, 0.2]}
          material={materials.skin}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[1, 8, 6]} />
        </mesh>
      )))}
      <mesh position={[0, 0.16, 0.55]} rotation={[Math.PI / 2, 0, 0]} material={materials.skin}>
        <coneGeometry args={[0.09, 0.2, 5]} />
      </mesh>
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
    hat: new THREE.MeshStandardMaterial({ color: '#9a7045', roughness: 0.94, flatShading: true }),
    bag: new THREE.MeshStandardMaterial({ color: '#9b6845', roughness: 0.96, flatShading: true }),
    shoes: new THREE.MeshStandardMaterial({ color: '#334f6b', roughness: 0.88, flatShading: true }),
    shoeMidsole: new THREE.MeshStandardMaterial({ color: '#e8e2d7', roughness: 0.9 }),
    shoeOutsole: new THREE.MeshStandardMaterial({ color: '#3d454b', roughness: 0.96, flatShading: true }),
    shoeLaces: new THREE.MeshStandardMaterial({ color: '#f4f0e7', roughness: 0.82 }),
    shoeAccent: new THREE.MeshStandardMaterial({ color: '#e39a62', roughness: 0.86 }),
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
          <group key={x} position={[x, 0.22, 0.08]}>
            <mesh position={[0, 0, -0.3]} rotation={[Math.PI / 2 - 0.16, 0, 0]} material={readerMaterials.trousers} castShadow receiveShadow>
              <capsuleGeometry args={[0.13, 0.38, 5, 9]} />
            </mesh>
            <mesh position={[0, -0.38, -0.56]} material={readerMaterials.trousers} castShadow receiveShadow>
              <capsuleGeometry args={[0.09, 0.42, 5, 9]} />
            </mesh>
            <group position={[0, -0.68, -0.68]} rotation={[0.05, 0, 0]}>
              <mesh position={[0, -0.025, 0.01]} scale={[0.145, 0.055, 0.27]} material={readerMaterials.shoeOutsole} castShadow receiveShadow>
                <sphereGeometry args={[1, 14, 9]} />
              </mesh>
              <mesh position={[0, 0.005, 0.01]} scale={[0.14, 0.052, 0.265]} material={readerMaterials.shoeMidsole} castShadow receiveShadow>
                <sphereGeometry args={[1, 14, 9]} />
              </mesh>
              <mesh position={[0, 0.065, -0.015]} scale={[0.119, 0.09, 0.22]} material={readerMaterials.shoes} castShadow receiveShadow>
                <sphereGeometry args={[1, 14, 9]} />
              </mesh>
              <mesh position={[0, 0.045, 0.135]} scale={[0.113, 0.073, 0.105]} material={readerMaterials.shoes} castShadow receiveShadow>
                <sphereGeometry args={[1, 14, 9]} />
              </mesh>
              {[-0.065, -0.025, 0.015, 0.055].map((z) => (
                <mesh key={z} position={[0, 0.145, z]} rotation={[0, 0, 0.08]} material={readerMaterials.shoeLaces}>
                  <boxGeometry args={[0.105, 0.012, 0.018]} />
                </mesh>
              ))}
              {[-1, 1].map((side) => (
                <mesh key={side} position={[side * 0.116, 0.065, -0.025]} scale={[0.009, 0.024, 0.115]} material={readerMaterials.shoeAccent}>
                  <sphereGeometry args={[1, 8, 6]} />
                </mesh>
              ))}
            </group>
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
          <mesh position={[0, 0.23, 0]} material={readerMaterials.hat} castShadow>
            <cylinderGeometry args={[0.32, 0.3, 0.055, 12]} />
          </mesh>
          <mesh position={[0, 0.34, 0.015]} material={readerMaterials.hat} castShadow>
            <cylinderGeometry args={[0.2, 0.23, 0.19, 10]} />
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
          <group key={side} position={[side * 0.24, 0.98, 0.02]} rotation={[0, 0, side * -0.28]}>
            <mesh position={[side * -0.025, -0.11, -0.08]} rotation={[0.42, 0, side * 0.1]} material={readerMaterials.coat} castShadow>
              <capsuleGeometry args={[0.095, 0.34, 4, 7]} />
            </mesh>
            <mesh position={[side * -0.045, -0.25, -0.24]} rotation={[0.58, 0, 0]} material={readerMaterials.coat} castShadow>
              <capsuleGeometry args={[0.075, 0.18, 4, 7]} />
            </mesh>
            <mesh position={[side * -0.045, -0.34, -0.31]} material={readerMaterials.skin} castShadow>
              <sphereGeometry args={[0.07, 8, 6]} />
            </mesh>
          </group>
        ))}
      </group>
      <group position={[-0.78, 0, 0.32]} rotation={[0, -0.22, -0.08]}>
        <mesh position={[0, 0.2, 0]} material={readerMaterials.bag} castShadow receiveShadow>
          <boxGeometry args={[0.38, 0.38, 0.2]} />
        </mesh>
        <mesh position={[0, 0.41, 0]} rotation={[0, 0, Math.PI / 2]} material={readerMaterials.wood} castShadow>
          <torusGeometry args={[0.16, 0.035, 6, 12, Math.PI]} />
        </mesh>
        <mesh position={[0, 0.28, -0.11]} material={readerMaterials.hat} castShadow>
          <boxGeometry args={[0.22, 0.11, 0.025]} />
        </mesh>
      </group>
      <group position={[0.84, 0, -0.55]}>
        <mesh position={[0, 0.56, 0]} material={readerMaterials.wood} castShadow receiveShadow>
          <boxGeometry args={[0.68, 0.09, 0.5]} />
        </mesh>
        {[[-0.25, -0.18], [-0.25, 0.18], [0.25, -0.18], [0.25, 0.18]].map(([x, z]) => (
          <mesh key={`${x}-${z}`} position={[x, 0.28, z]} material={readerMaterials.wood} castShadow>
            <cylinderGeometry args={[0.035, 0.045, 0.54, 6]} />
          </mesh>
        ))}
        <mesh position={[0, 0.64, 0]} material={readerMaterials.book} castShadow>
          <boxGeometry args={[0.23, 0.045, 0.17]} />
        </mesh>
      </group>
    </group>
  );
}

function StationAndTrain({ walkerPosition, reducedMotion }) {
  const { setTrainPassing } = useAppAudio();
  const train = useRef(null);
  const wheels = useRef([]);
  const steamPuffs = useRef([]);
  const passage = useRef({ active: false, elapsed: 0, hasPassed: false, wasNear: false });
  const materials = useMemo(() => ({
    stationWood: new THREE.MeshStandardMaterial({ color: '#67432e', roughness: 0.94, flatShading: true }),
    trim: new THREE.MeshStandardMaterial({ color: '#a77a4f', roughness: 0.88, flatShading: true }),
    roof: new THREE.MeshStandardMaterial({ color: '#40352d', roughness: 0.96, flatShading: true }),
    rail: new THREE.MeshStandardMaterial({ color: '#45494a', metalness: 0.58, roughness: 0.5 }),
    wheel: new THREE.MeshStandardMaterial({ color: '#302b28', metalness: 0.22, roughness: 0.72 }),
    engine: new THREE.MeshStandardMaterial({ color: '#31554e', metalness: 0.28, roughness: 0.62, flatShading: true }),
    boiler: new THREE.MeshStandardMaterial({ color: '#263b39', metalness: 0.28, roughness: 0.58 }),
    brass: new THREE.MeshStandardMaterial({ color: '#d3a85e', metalness: 0.68, roughness: 0.34 }),
    window: new THREE.MeshBasicMaterial({ color: '#ffd995', toneMapped: false }),
    smoke: Array.from({ length: 5 }, () => new THREE.MeshBasicMaterial({
      color: '#d8d1c5',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    })),
  }), []);
  const stationY = terrainHeight(TRAIN_STATION_POSITION.x, TRAIN_STATION_POSITION.z);

  useFrame((_, delta) => {
    const state = passage.current;
    const passageDuration = reducedMotion ? 10 : 8;
    const walker = walkerPosition.current;
    const nearStation = Math.hypot(
      walker.x - TRAIN_STATION_POSITION.x,
      walker.z - (TRAIN_STATION_POSITION.z + 1),
    ) <= TRAIN_TRIGGER_RADIUS;

    if (nearStation && !state.wasNear && !state.hasPassed) {
      state.active = true;
      state.elapsed = 0;
      state.hasPassed = true;
    }
    if (!nearStation && !state.active && state.hasPassed) state.hasPassed = false;
    state.wasNear = nearStation;

    if (!train.current) return;
    if (state.active) {
      state.elapsed = Math.min(state.elapsed + delta, passageDuration);
      if (state.elapsed >= passageDuration) state.active = false;
    }

    const progress = state.elapsed / passageDuration;
    const easedProgress = progress * progress * (3 - 2 * progress);
    train.current.position.z = THREE.MathUtils.lerp(TRAIN_START_Z, TRAIN_END_Z, easedProgress);
    train.current.position.y = terrainHeight(TRAIN_TRACK_X, train.current.position.z) + 0.06;
    const trainIsPassing = state.active
      && Math.hypot(
        walker.x - TRAIN_TRACK_X,
        walker.z - (train.current.position.z + 1),
      ) <= 4.2;
    setTrainPassing(trainIsPassing);
    const wheelRotation = state.active ? state.elapsed * 5 : 0;
    wheels.current.forEach((wheel) => {
      if (wheel) wheel.rotation.z = wheelRotation;
    });

    steamPuffs.current.forEach((puff, index) => {
      if (!puff) return;
      const puffProgress = (state.active ? state.elapsed * 0.72 + index / steamPuffs.current.length : 0) % 1;
      puff.position.set(
        0.53 + Math.sin(state.elapsed * 2 + index) * puffProgress * 0.14,
        1.48 + puffProgress * 0.9,
        Math.cos(state.elapsed * 1.5 + index) * puffProgress * 0.12,
      );
      puff.scale.setScalar(0.06 + puffProgress * 0.16);
      materials.smoke[index].opacity = state.active ? (1 - puffProgress) * 0.3 : 0;
    });
  });

  useEffect(() => () => {
    Object.values(materials).forEach((material) => {
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    });
  }, [materials]);

  return (
    <group>
      {Array.from({ length: 21 }, (_, index) => {
        const z = -21.5 + index * 0.6;
        const y = terrainHeight(TRAIN_TRACK_X, z);
        return (
          <mesh key={`station-sleeper-${index}`} position={[TRAIN_TRACK_X, y + 0.07, z]} material={materials.stationWood} receiveShadow>
            <boxGeometry args={[1.9, 0.14, 0.2]} />
          </mesh>
        );
      })}
      {[-0.55, 0.55].map((offset) => (
        <mesh
          key={offset}
          position={[TRAIN_TRACK_X + offset, terrainHeight(TRAIN_TRACK_X + offset, TRAIN_TRACK_CENTER_Z) + 0.16, TRAIN_TRACK_CENTER_Z]}
          material={materials.rail}
          receiveShadow
        >
          <boxGeometry args={[0.1, 0.1, 12.1]} />
        </mesh>
      ))}

      <group position={[TRAIN_STATION_POSITION.x, stationY, TRAIN_STATION_POSITION.z]} rotation={[0, -Math.PI / 2, 0]}>
        <mesh position={[0, 0.16, 0.65]} material={materials.trim} receiveShadow>
          <boxGeometry args={[3.5, 0.28, 1.5]} />
        </mesh>
        {[-1.42, 1.42].map((x) => (
          <group key={x}>
            <mesh position={[x, 1.05, -0.75]} material={materials.stationWood} castShadow>
              <boxGeometry args={[0.16, 1.8, 0.16]} />
            </mesh>
            <mesh position={[x, 1.85, -0.75]} material={materials.trim}>
              <boxGeometry args={[0.3, 0.08, 0.3]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 1.35, -0.75]} material={materials.stationWood} castShadow>
          <boxGeometry args={[2.75, 1.1, 0.18]} />
        </mesh>
        <mesh position={[0, 2.12, -0.75]} material={materials.roof} castShadow>
          <boxGeometry args={[3.7, 0.22, 1.45]} />
        </mesh>
        <mesh position={[0, 1.58, -0.63]} material={materials.trim}>
          <boxGeometry args={[1.15, 0.22, 0.04]} />
        </mesh>
        <mesh position={[0, 1.58, -0.59]} material={materials.stationWood}>
          <boxGeometry args={[0.92, 0.1, 0.025]} />
        </mesh>
        {[-1.16, 1.16].map((x) => (
          <group key={`station-lantern-${x}`} position={[x, 1.65, 0.12]}>
            <mesh material={materials.brass} castShadow>
              <boxGeometry args={[0.16, 0.24, 0.16]} />
            </mesh>
            <mesh position={[0, -0.02, 0.01]} material={materials.window}>
              <boxGeometry args={[0.1, 0.15, 0.1]} />
            </mesh>
            <pointLight position={[0, -0.02, 0.12]} color="#ffc77b" intensity={0.55} distance={3.5} />
          </group>
        ))}
      </group>

      <group
        ref={train}
        position={[TRAIN_TRACK_X, terrainHeight(TRAIN_TRACK_X, TRAIN_START_Z) + 0.06, TRAIN_START_Z]}
        rotation={[0, Math.PI / 2, 0]}
      >
        <mesh position={[0, 0.34, 0]} material={materials.wheel} castShadow>
          <boxGeometry args={[2.1, 0.18, 0.68]} />
        </mesh>
        <mesh position={[-0.7, 0.9, 0]} material={materials.engine} castShadow>
          <boxGeometry args={[0.78, 1.05, 0.68]} />
        </mesh>
        <mesh position={[0.16, 0.78, 0]} rotation={[0, 0, Math.PI / 2]} material={materials.boiler} castShadow>
          <cylinderGeometry args={[0.34, 0.34, 1.45, 12]} />
        </mesh>
        <mesh position={[0.53, 1.23, 0]} material={materials.wheel} castShadow>
          <cylinderGeometry args={[0.13, 0.2, 0.42, 8]} />
        </mesh>
        <mesh position={[0.89, 0.42, 0]} rotation={[0, 0, -0.3]} material={materials.brass}>
          <boxGeometry args={[0.58, 0.08, 0.66]} />
        </mesh>
        <mesh position={[0.82, 0.91, 0]} material={materials.brass}>
          <sphereGeometry args={[0.13, 10, 8]} />
        </mesh>
        {[-0.65, 0.15].map((x, axleIndex) => [-0.38, 0.38].map((z, sideIndex) => (
          <mesh
            key={`engine-wheel-${x}-${z}`}
            ref={(wheel) => { wheels.current[axleIndex * 2 + sideIndex] = wheel; }}
            position={[x, 0.25, z]}
            rotation={[Math.PI / 2, 0, 0]}
            material={materials.wheel}
            castShadow
          >
            <cylinderGeometry args={[0.23, 0.23, 0.12, 12]} />
          </mesh>
        )))}
        {[-1, -2.35].map((x, carIndex) => (
          <group key={`train-car-${x}`} position={[x, 0, 0]}>
            <mesh position={[0, 0.63, 0]} material={materials.stationWood} castShadow>
              <boxGeometry args={[1.14, 0.62, 0.72]} />
            </mesh>
            <mesh position={[0, 0.98, 0]} material={materials.roof} castShadow>
              <boxGeometry args={[1.28, 0.12, 0.84]} />
            </mesh>
            {[-0.35, 0.35].map((wheelX, axleIndex) => [-0.4, 0.4].map((z, sideIndex) => (
              <mesh
                key={`${wheelX}-${z}`}
                ref={(wheel) => { wheels.current[4 + carIndex * 4 + axleIndex * 2 + sideIndex] = wheel; }}
                position={[wheelX, 0.22, z]}
                rotation={[Math.PI / 2, 0, 0]}
                material={materials.wheel}
                castShadow
              >
                <cylinderGeometry args={[0.18, 0.18, 0.1, 10]} />
              </mesh>
            )))}
          </group>
        ))}
        {materials.smoke.map((material, index) => (
          <mesh
            key={`train-steam-${index}`}
            ref={(puff) => { steamPuffs.current[index] = puff; }}
            position={[0.53, 1.48, 0]}
            material={material}
          >
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Terrain({
  reducedMotion,
  dogActive,
  isInsideCabin,
  onDoorOpen,
  walkerPosition,
}) {
  const geometry = useMemo(() => createTerrainGeometry(), []);
  const branchTrailGeometry = useMemo(() => createBranchTrailGeometry(), []);
  const stationTrailGeometry = useMemo(() => createStationTrailGeometry(), []);
  const cabinTrailGeometry = useMemo(() => createCabinTrailGeometry(), []);
  const mountainTrailGeometry = useMemo(() => createMountainTrailGeometry(), []);
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
    color: '#efc995',
    emissive: '#3b2719',
    emissiveIntensity: 0.15,
    roughness: 0.72,
    metalness: 0.02,
  }), []);

  useEffect(() => () => {
    geometry.dispose();
    branchTrailGeometry.dispose();
    stationTrailGeometry.dispose();
    cabinTrailGeometry.dispose();
    mountainTrailGeometry.dispose();
    terrainMaterial.dispose();
    branchTrailMaterial.dispose();
    terrainMaps.colorMap.dispose();
    terrainMaps.normalMap.dispose();
    terrainMaps.bumpMap.dispose();
    terrainMaps.roughnessMap.dispose();
  }, [branchTrailGeometry, branchTrailMaterial, cabinTrailGeometry, geometry, mountainTrailGeometry, stationTrailGeometry, terrainMaps, terrainMaterial]);

  useFrame((_, delta) => {
    if (!mesh.current || reducedMotion) return;
    mesh.current.rotation.z = THREE.MathUtils.damp(mesh.current.rotation.z, pointer.x * 0.008, 2, delta);
  });

  return (
    <group ref={mesh} position={[0, 0, 1]}>
      <mesh geometry={geometry} receiveShadow>
        <primitive object={terrainMaterial} attach="material" />
      </mesh>
      <mesh geometry={branchTrailGeometry} receiveShadow>
        <primitive object={branchTrailMaterial} attach="material" />
      </mesh>
      <mesh geometry={stationTrailGeometry} receiveShadow>
        <primitive object={branchTrailMaterial} attach="material" />
      </mesh>
      <mesh geometry={cabinTrailGeometry} receiveShadow>
        <primitive object={branchTrailMaterial} attach="material" />
      </mesh>
      <mesh geometry={mountainTrailGeometry} receiveShadow>
        <primitive object={branchTrailMaterial} attach="material" />
      </mesh>
      <MountainStream reducedMotion={reducedMotion} />
      <ScenicBridge />
      <HorizonMountains />
      <LogCabin
        reducedMotion={reducedMotion}
        dogActive={dogActive}
        isInsideCabin={isInsideCabin}
        onDoorOpen={onDoorOpen}
      />
      <CabinGrove />
      <RiversideTree reducedMotion={reducedMotion} />
      <MountainRocks />
      <Forest />
      <MeadowGrass reducedMotion={reducedMotion} />
      <Wildflowers reducedMotion={reducedMotion} />
      <ForestTurtle reducedMotion={reducedMotion} />
      <PathStones />
      <StationAndTrain walkerPosition={walkerPosition} reducedMotion={reducedMotion} />
    </group>
  );
}

function PortalVista({ reducedMotion, onEnterGalaxy }) {
  const moonRef = useRef(null);
  const [moonTexture] = useLoader(THREE.TextureLoader, ['/textures/celestial/moon_1024.jpg']);
  const moonMap = useMemo(() => {
    const texture = moonTexture.clone();
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [moonTexture]);

  useFrame(({ clock }, delta) => {
    if (!moonRef.current) return;
    if (!reducedMotion) {
      moonRef.current.rotation.y += delta * 0.035;
      moonRef.current.position.y = -0.22 + Math.sin(clock.elapsedTime * 0.65) * 0.045;
    }
  });

  useEffect(() => () => moonMap.dispose(), [moonMap]);

  return (
    <mesh
      ref={moonRef}
      position={[0.66, -0.22, -0.78]}
      onClick={(event) => {
        event.stopPropagation();
        onEnterGalaxy?.();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        window.dispatchEvent(new CustomEvent('app:world-cursor', {
          detail: { active: true, x: event.nativeEvent.clientX, y: event.nativeEvent.clientY },
        }));
      }}
      onPointerOut={() => window.dispatchEvent(new CustomEvent('app:world-cursor', {
        detail: { active: false },
      }))}
    >
      <sphereGeometry args={[0.78, 48, 32]} />
      <meshStandardMaterial map={moonMap} roughness={0.96} metalness={0} />
    </mesh>
  );
}

function Portal({ reducedMotion, onEnterGalaxy }) {
  return (
    <group position={[PORTAL_POSITION.x, PORTAL_POSITION.y, PORTAL_POSITION.z]}>
      <PortalVista reducedMotion={reducedMotion} onEnterGalaxy={onEnterGalaxy} />
    </group>
  );
}

function Limb({ position, rotation = [0, 0, 0], color, material, radius = 0.12, length = 0.76 }) {
  return (
    <mesh position={position} rotation={rotation} castShadow>
      <capsuleGeometry args={[radius, length, 5, 10]} />
      {material ? (
        <primitive object={material} attach="material" />
      ) : (
        <meshStandardMaterial color={color} roughness={0.76} />
      )}
    </mesh>
  );
}

function createTaperedArmGeometry(points, startRadius, endRadius) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const tubularSegments = 20;
  const radialSegments = 10;
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions = [];
  const indices = [];

  for (let ring = 0; ring <= tubularSegments; ring += 1) {
    const t = ring / tubularSegments;
    const point = curve.getPointAt(t);
    const radius = THREE.MathUtils.lerp(startRadius, endRadius, THREE.MathUtils.smoothstep(t, 0, 1));
    for (let side = 0; side <= radialSegments; side += 1) {
      const angle = (side / radialSegments) * Math.PI * 2;
      const normal = frames.normals[ring].clone().multiplyScalar(Math.cos(angle));
      const binormal = frames.binormals[ring].clone().multiplyScalar(Math.sin(angle));
      positions.push(
        point.x + radius * (normal.x + binormal.x),
        point.y + radius * (normal.y + binormal.y),
        point.z + radius * (normal.z + binormal.z),
      );

      if (ring < tubularSegments && side < radialSegments) {
        const current = ring * (radialSegments + 1) + side;
        const nextRing = current + radialSegments + 1;
        indices.push(current, nextRing, current + 1, current + 1, nextRing, nextRing + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function Hand({ mirror = 1, material }) {
  const fingerLengths = [0.155, 0.19, 0.17, 0.14];
  return (
    <group scale={[mirror * 0.82, 0.88, 0.8]}>
      <mesh position={[0, -0.04, 0]} scale={[0.078, 0.098, 0.052]} material={material} castShadow>
        <sphereGeometry args={[1, 12, 9]} />
      </mesh>
      <mesh position={[0, 0.035, 0]} material={material} castShadow>
        <capsuleGeometry args={[0.037, 0.055, 4, 8]} />
      </mesh>
      {fingerLengths.map((length, index) => {
        const x = (index - 1.5) * 0.037;
        const firstJointLength = length * 0.58;
        const secondJointLength = length * 0.42;
        return (
          <group key={index} position={[x, -0.115, 0.005]} rotation={[0, 0, (index - 1.5) * -0.055]}>
            <mesh position={[0, -firstJointLength * 0.38, 0]} material={material} castShadow>
              <capsuleGeometry args={[0.014, firstJointLength * 0.62, 4, 8]} />
            </mesh>
            <group position={[0, -firstJointLength * 0.76, 0]} rotation={[0, 0, index === 3 ? 0.08 : 0]}>
              <mesh position={[0, -secondJointLength * 0.34, 0]} material={material} castShadow>
                <capsuleGeometry args={[0.011, secondJointLength * 0.55, 4, 8]} />
              </mesh>
              <mesh position={[0, -secondJointLength * 0.76, 0.003]} scale={[0.8, 0.88, 0.8]} material={material} castShadow>
                <sphereGeometry args={[0.015, 8, 6]} />
              </mesh>
            </group>
          </group>
        );
      })}
      <group position={[mirror * 0.065, -0.005, 0.01]} rotation={[0, 0, mirror * -0.72]}>
        <mesh position={[0, -0.065, 0]} material={material} castShadow>
          <capsuleGeometry args={[0.021, 0.095, 4, 7]} />
        </mesh>
        <mesh position={[0, -0.12, 0]} material={material} castShadow>
          <sphereGeometry args={[0.02, 8, 6]} />
        </mesh>
      </group>
    </group>
  );
}

function Sneaker({ upperMaterial, soleMaterial, laceMaterial, sideMaterial }) {
  return (
    <group>
      <mesh
        position={[0, -0.055, -0.055]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1, 1, 0.42]}
        material={soleMaterial}
        castShadow
        receiveShadow
      >
        <capsuleGeometry args={[0.12, 0.17, 5, 12]} />
      </mesh>
      <mesh
        position={[0, -0.005, -0.06]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1, 1, 0.19]}
        material={sideMaterial}
        castShadow
      >
        <capsuleGeometry args={[0.119, 0.16, 5, 12]} />
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
      <mesh
        position={[0, 0.125, 0.056]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[0.55, 0.55, 0.2]}
        material={sideMaterial}
      >
        <capsuleGeometry args={[0.09, 0.08, 3, 8]} />
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
      <mesh
        position={[0, 0.015, -0.055]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[1, 1, 0.1]}
        material={sideMaterial}
      >
        <capsuleGeometry args={[0.125, 0.17, 4, 12]} />
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
  const radialSegments = 80;
  const heightSegments = 44;
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
    const height = upper.y - lower.y;
    const blend = THREE.MathUtils.clamp((y - lower.y) / height, 0, 1);
    const previous = profile[Math.max(0, segment - 1)];
    const next = profile[Math.min(profile.length - 1, segment + 2)];
    const lowerSlope = segment === 0
      ? (upper.x - lower.x) / height
      : (upper.x - previous.x) / (upper.y - previous.y);
    const upperSlope = segment === profile.length - 2
      ? (upper.x - lower.x) / height
      : (next.x - lower.x) / (next.y - lower.y);
    const blendSquared = blend * blend;
    const blendCubed = blendSquared * blend;
    const baseRadius = (2 * blendCubed - 3 * blendSquared + 1) * lower.x
      + (blendCubed - 2 * blendSquared + blend) * height * lowerSlope
      + (-2 * blendCubed + 3 * blendSquared) * upper.x
      + (blendCubed - blendSquared) * height * upperSlope;
    const pleatStrength = THREE.MathUtils.smoothstep(y, 0.16, 0.52)
      * (1 - THREE.MathUtils.smoothstep(y, 1.34, 1.78));
    const hemMovement = 1 - THREE.MathUtils.smoothstep(y, 0.22, 0.48);

    for (let column = 0; column <= radialSegments; column += 1) {
      const u = column / radialSegments;
      const angle = u * Math.PI * 2;
      const panelFold = Math.cos(angle * 10 + Math.sin(v * Math.PI) * 0.22) * 0.008;
      const folds = (
        Math.sin(angle * 8 + v * 1.6) * 0.018
        + Math.sin(angle * 16 - v * 2.4) * 0.005
        + Math.sin(angle * 3 + v * 3.2) * 0.007
      ) * pleatStrength;
      const radius = baseRadius + folds + panelFold * pleatStrength;
      const hemWave = Math.sin(angle * 6 + 0.45) * 0.012 * hemMovement;
      positions.push(Math.cos(angle) * radius, y + hemWave, Math.sin(angle) * radius);
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

function Walker({
  reducedMotion,
  movement,
  setWalkingAudio,
  setPorchWalkingAudio,
  exitCabinRequested,
  onCabinExitComplete,
  positionRef,
  isInsideCabin,
  isNearReader,
  onJourneyStateChange,
}) {
  const root = useRef(null);
  const body = useRef(null);
  const hair = useRef(null);
  const enteredCabin = useRef(false);
  const leftLeg = useRef(null);
  const rightLeg = useRef(null);
  const leftArm = useRef(null);
  const rightArm = useRef(null);
  const { camera, gl } = useThree();
  const desiredCameraPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraTarget = useMemo(() => new THREE.Vector3(), []);
  const cabinOrbit = useRef({ yaw: 0.3, pitch: 0 });
  const cabinLookTarget = useMemo(() => new THREE.Vector3(
    CABIN_X - 0.4,
    terrainHeight(CABIN_X, CABIN_LOCAL_Z) + 1.45,
    CABIN_LOCAL_Z - 0.1,
  ), []);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const walkStartedAt = useRef(null);

  useEffect(() => {
    if (!isInsideCabin) return undefined;

    const canvas = gl.domElement;
    let activePointerId = null;
    let previousX = 0;
    let previousY = 0;

    const handlePointerDown = (event) => {
      if (event.button !== 0 || activePointerId !== null) return;
      activePointerId = event.pointerId;
      previousX = event.clientX;
      previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const handlePointerMove = (event) => {
      if (event.pointerId !== activePointerId) return;
      cabinOrbit.current.yaw = THREE.MathUtils.clamp(
        cabinOrbit.current.yaw - (event.clientX - previousX) * 0.006,
        -0.05,
        0.65,
      );
      cabinOrbit.current.pitch = THREE.MathUtils.clamp(
        cabinOrbit.current.pitch + (event.clientY - previousY) * 0.004,
        -0.5,
        0.5,
      );
      previousX = event.clientX;
      previousY = event.clientY;
    };
    const handlePointerUp = (event) => {
      if (event.pointerId !== activePointerId) return;
      activePointerId = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('pointercancel', handlePointerUp);
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('pointercancel', handlePointerUp);
      if (activePointerId !== null && canvas.hasPointerCapture(activePointerId)) {
        canvas.releasePointerCapture(activePointerId);
      }
    };
  }, [gl, isInsideCabin]);
  const previousJourneyState = useRef({
    hasMoved: false,
    isNearPortal: false,
    isNearCabin: false,
    isInsideCabin: false,
    isNearReader: false,
    isAtSummit: false,
    isNearBridgeDestination: false,
  });
  const dressProfile = useMemo(() => [
    new THREE.Vector2(0.39, 0.22),
    new THREE.Vector2(0.45, 0.28),
    new THREE.Vector2(0.43, 0.4),
    new THREE.Vector2(0.39, 0.68),
    new THREE.Vector2(0.33, 1.02),
    new THREE.Vector2(0.27, 1.27),
    new THREE.Vector2(0.25, 1.4),
    new THREE.Vector2(0.24, 1.51),
    new THREE.Vector2(0.2, 1.67),
    new THREE.Vector2(0.14, 1.79),
  ], []);
  const dressGeometry = useMemo(() => createDressGeometry(dressProfile), [dressProfile]);
  const beltGeometry = useMemo(() => new THREE.CylinderGeometry(0.27, 0.27, 0.075, 32, 1, true), []);
  const beltMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#765039',
    roughness: 0.82,
    metalness: 0.04,
    side: THREE.DoubleSide,
  }), []);
  const armGeometries = useMemo(() => ({
    leftUpper: createTaperedArmGeometry(
      [[0, -0.035, 0], [-0.045, -0.16, 0.015], [-0.075, -0.34, 0.025]],
      0.078,
      0.06,
    ),
    leftForearm: createTaperedArmGeometry(
      [[-0.075, -0.32, 0.025], [-0.1, -0.48, 0.035], [-0.12, -0.68, 0.04]],
      0.058,
      0.044,
    ),
    rightUpper: createTaperedArmGeometry(
      [[0, -0.035, 0], [0.045, -0.16, 0.015], [0.075, -0.34, 0.025]],
      0.078,
      0.06,
    ),
    rightForearm: createTaperedArmGeometry(
      [[0.075, -0.32, 0.025], [0.1, -0.48, 0.035], [0.12, -0.68, 0.04]],
      0.058,
      0.044,
    ),
  }), []);
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
    emissive: '#3b2118',
    emissiveIntensity: 0.045,
    roughness: 0.96,
    metalness: 0.015,
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
  const pocketGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.115, -0.07);
    shape.lineTo(0.115, -0.07);
    shape.quadraticCurveTo(0.14, -0.07, 0.14, -0.045);
    shape.lineTo(0.14, 0.045);
    shape.quadraticCurveTo(0.14, 0.07, 0.115, 0.07);
    shape.lineTo(-0.115, 0.07);
    shape.quadraticCurveTo(-0.14, 0.07, -0.14, 0.045);
    shape.lineTo(-0.14, -0.045);
    shape.quadraticCurveTo(-0.14, -0.07, -0.115, -0.07);
    return new THREE.ExtrudeGeometry(shape, {
      depth: 0.018,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.006,
      bevelThickness: 0.006,
      curveSegments: 5,
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
  const strapStitchGeometries = useMemo(() => [strapCurve].flatMap((curve) => (
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
  )), [strapCurve]);
  const claspMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#d9bb7b',
    metalness: 0.88,
    roughness: 0.3,
  }), []);
  const bagTrimMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#583a29',
    roughness: 0.84,
  }), []);
  const stitchMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e0bd8b',
    roughness: 0.9,
  }), []);
  const bagDetailGeometries = useMemo(() => {
    const pocketPoints = [
      new THREE.Vector3(-0.115, -0.07, 0.18),
      new THREE.Vector3(0.115, -0.07, 0.18),
      new THREE.Vector3(0.14, -0.045, 0.18),
      new THREE.Vector3(0.14, 0.045, 0.18),
      new THREE.Vector3(0.115, 0.07, 0.18),
      new THREE.Vector3(-0.115, 0.07, 0.18),
      new THREE.Vector3(-0.14, 0.045, 0.18),
      new THREE.Vector3(-0.14, -0.045, 0.18),
    ];
    const pocketCurve = new THREE.CatmullRomCurve3(pocketPoints, true);
    const flapCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.16, 0.08, 0.045),
      new THREE.Vector3(-0.15, -0.085, 0.045),
      new THREE.Vector3(0, -0.15, 0.045),
      new THREE.Vector3(0.15, -0.085, 0.045),
      new THREE.Vector3(0.16, 0.08, 0.045),
    ]);
    return {
      pocketStitch: new THREE.TubeGeometry(pocketCurve, 32, 0.003, 5, true),
      flapStitch: new THREE.TubeGeometry(flapCurve, 24, 0.003, 5, false),
    };
  }, []);
  const handMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e3b49b',
    roughness: 0.9,
    metalness: 0.01,
  }), []);
  const sleeveMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e4ddd0',
    roughness: 0.94,
    metalness: 0.01,
  }), []);
  const faceMaterials = useMemo(() => ({
    eyes: new THREE.MeshStandardMaterial({ color: '#382723', roughness: 0.55 }),
    lips: new THREE.MeshStandardMaterial({ color: '#965d58', roughness: 0.82 }),
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
    beltGeometry.dispose();
    beltMaterial.dispose();
    Object.values(armGeometries).forEach((geometry) => geometry.dispose());
    fabricMaterial.dispose();
    fabricMaps.map.dispose();
    fabricMaps.bumpMap.dispose();
    fabricMaps.normalMap.dispose();
    bagMaterial.dispose();
    strapMaterial.dispose();
    bagTrimMaterial.dispose();
    bagMaps.map.dispose();
    bagMaps.bumpMap.dispose();
    leatherGeometry.dispose();
    flapGeometry.dispose();
    pocketGeometry.dispose();
    strapGeometry.dispose();
    strapStitchGeometries.forEach((geometry) => geometry.dispose());
    bagDetailGeometries.pocketStitch.dispose();
    bagDetailGeometries.flapStitch.dispose();
    claspMaterial.dispose();
    stitchMaterial.dispose();
    handMaterial.dispose();
    sleeveMaterial.dispose();
    Object.values(faceMaterials).forEach((material) => material.dispose());
    Object.values(sneakerMaterials).forEach((material) => material.dispose());
  }, [
    bagMaps,
    bagMaterial,
    bagDetailGeometries,
    bagTrimMaterial,
    beltGeometry,
    beltMaterial,
    claspMaterial,
    dressGeometry,
    armGeometries,
    faceMaterials,
    fabricMaps,
    fabricMaterial,
    flapGeometry,
    handMaterial,
    leatherGeometry,
    pocketGeometry,
    sneakerMaterials,
    strapGeometry,
    strapMaterial,
    strapStitchGeometries,
    sleeveMaterial,
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
    positionRef.current.copy(root.current.position);
    const input = movement.current;
    const horizontal = Number(input.right) - Number(input.left);
    const vertical = Number(input.backward) - Number(input.forward);
    const exitingCabin = enteredCabin.current && exitCabinRequested;
    const moving = exitingCabin || horizontal !== 0 || vertical !== 0;

    if (moving) {
      const speed = input.sprint ? 6.2 : 4;
      if (exitingCabin) {
        direction.set(0, 0, 1);
        root.current.position.x = THREE.MathUtils.damp(root.current.position.x, CABIN_X, 9, delta);
        root.current.position.z += speed * delta;
        if (root.current.position.z >= CABIN_FRONT_Z + 0.35) {
          enteredCabin.current = false;
          onCabinExitComplete();
        }
      } else {
        const previousX = root.current.position.x;
        const previousZ = root.current.position.z;
        direction.set(horizontal, 0, vertical).normalize();
        root.current.position.x += direction.x * speed * delta;
        root.current.position.z += direction.z * speed * delta;
        const localZ = root.current.position.z - 1;
        const trailBounds = [{ center: pathCenter(localZ), halfWidth: 2.45 }];
        if (localZ >= -10.5 && localZ <= 2.7) {
          trailBounds.push({ center: branchTrailCenterX(localZ), halfWidth: 1.5 });
        }
        if (localZ >= -15.8 && localZ <= -12.4) {
          trailBounds.push({ center: stationTrailCenterX(localZ), halfWidth: 1.8 });
        }
        if (localZ >= CABIN_TRAIL_END_Z - 0.4 && localZ <= 2.7) {
          trailBounds.push({ center: cabinTrailCenterX(localZ), halfWidth: 1.5 });
        }
        if (localZ >= -23.8 && localZ <= MOUNTAIN_TRAIL_START_Z + 0.4) {
          trailBounds.push({ center: mountainTrailCenterX(localZ), halfWidth: 1.45 });
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
        root.current.position.z = THREE.MathUtils.clamp(root.current.position.z, -32.8, 13);
        const currentX = root.current.position.x;
        const currentZ = root.current.position.z;
        const cabinInside = currentX > CABIN_X - 1.72
          && currentX < CABIN_X + 1.72
          && currentZ > CABIN_BACK_Z
          && currentZ < CABIN_FRONT_Z;
        const crossedFrontWall = (previousZ > CABIN_FRONT_Z && currentZ <= CABIN_FRONT_Z)
          || (previousZ <= CABIN_FRONT_Z && currentZ > CABIN_FRONT_Z);
        const withinDoorway = Math.abs((previousX + currentX) * 0.5 - CABIN_X) <= 0.42;
        const crossedWallOutsideDoor = crossedFrontWall
          && (previousX + currentX) * 0.5 > CABIN_X - 1.9
          && (previousX + currentX) * 0.5 < CABIN_X + 1.9
          && !withinDoorway;

        if (enteredCabin.current) {
          if (!cabinInside && !(crossedFrontWall && withinDoorway && currentZ > CABIN_FRONT_Z)) {
            root.current.position.x = previousX;
            root.current.position.z = previousZ;
          } else if (crossedFrontWall && withinDoorway && currentZ > CABIN_FRONT_Z) {
            enteredCabin.current = false;
          }
        } else if (crossedWallOutsideDoor || (cabinInside && !(crossedFrontWall && withinDoorway && currentZ < CABIN_FRONT_Z))) {
          root.current.position.x = previousX;
          root.current.position.z = previousZ;
        } else if (cabinInside) {
          enteredCabin.current = true;
        }
      }

      root.current.position.y = walkerGroundHeight(root.current.position.x, root.current.position.z - 1);
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
    const onCabinPorch = root.current.position.x >= CABIN_X - 2.6
      && root.current.position.x <= CABIN_X + 2.6
      && root.current.position.z >= CABIN_LOCAL_Z + 1 + 1.45
      && root.current.position.z <= CABIN_LOCAL_Z + 1 + 3.45;
    setWalkingAudio(moving && !onCabinPorch);
    setPorchWalkingAudio(moving && onCabinPorch);
    const localZ = root.current.position.z - 1;
    const isNearCabin = Math.hypot(
      root.current.position.x - 11.1,
      localZ + 8.4,
    ) <= 5.2;
    const isInsideCabin = enteredCabin.current;
    const readerLocalZ = READER_POSITION.z - 1;
    const isNearReader = Math.hypot(
      root.current.position.x - READER_POSITION.x,
      localZ - readerLocalZ,
    ) <= 3.1;
    const isAtSummit = Math.hypot(
      root.current.position.x - MOUNTAIN_SUMMIT.x,
      localZ - MOUNTAIN_SUMMIT.z,
    ) <= 2.1;
    const isNearBridgeDestination = Math.hypot(
      root.current.position.x - BRIDGE_CENTER_X,
      localZ - BRIDGE_DESTINATION_Z,
    ) <= 1.65;
    const isNearPortal = Math.hypot(
      root.current.position.x - (PORTAL_POSITION.x + 0.66),
      root.current.position.z - (PORTAL_POSITION.z - 0.78),
    ) <= 2.65;
    const hasMoved = Math.hypot(root.current.position.x - 0.52, root.current.position.z - 3.5) > 0.55;
    const previousState = previousJourneyState.current;
    if (
      previousState.hasMoved !== hasMoved
      || previousState.isNearPortal !== isNearPortal
      || previousState.isNearCabin !== isNearCabin
      || previousState.isInsideCabin !== isInsideCabin
      || previousState.isNearReader !== isNearReader
      || previousState.isAtSummit !== isAtSummit
      || previousState.isNearBridgeDestination !== isNearBridgeDestination
    ) {
      previousJourneyState.current = {
        hasMoved,
        isNearPortal,
        isNearCabin,
        isInsideCabin,
        isNearReader,
        isAtSummit,
        isNearBridgeDestination,
      };
      onJourneyStateChange?.({
        hasMoved,
        isNearPortal,
        isNearCabin,
        isInsideCabin,
        isNearReader,
        isAtSummit,
        isNearBridgeDestination,
      });
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

    positionRef.current.copy(root.current.position);
    if (time > 2.4) {
      if (enteredCabin.current) {
        const { yaw, pitch } = cabinOrbit.current;
        desiredCameraPosition.set(
          cabinLookTarget.x + Math.sin(yaw) * 4.2,
          cabinLookTarget.y + 1.1 + pitch,
          cabinLookTarget.z + Math.cos(yaw) * 4.2,
        );
        cameraTarget.lerp(cabinLookTarget, 1 - Math.exp(-delta * 2.2));
        camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-delta * 2.2));
      } else {
        desiredCameraPosition.set(
          root.current.position.x,
          root.current.position.y + (isAtSummit ? 7.6 : 5.2),
          root.current.position.z + (isAtSummit ? 13.5 : 10.5),
        );
        cameraTarget.set(
          root.current.position.x,
          root.current.position.y + (isAtSummit ? 1.9 : 1.4),
          root.current.position.z - (isAtSummit ? 4.8 : 3),
        );
        camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-delta * 1.15));
      }
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
        <mesh
          geometry={beltGeometry}
          material={beltMaterial}
          position={[0, 1.35, 0]}
          castShadow
          receiveShadow
        />
        <group position={[0, 1.35, -0.263]}>
          <mesh material={claspMaterial} castShadow>
            <boxGeometry args={[0.15, 0.09, 0.035]} />
          </mesh>
          <mesh position={[0, 0, -0.021]} material={beltMaterial}>
            <boxGeometry args={[0.085, 0.041, 0.012]} />
          </mesh>
          <mesh position={[0.018, 0, -0.029]} material={claspMaterial}>
            <boxGeometry args={[0.012, 0.052, 0.012]} />
          </mesh>
        </group>
        <mesh geometry={strapGeometry} material={strapMaterial} castShadow />
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
            <mesh geometry={bagDetailGeometries.flapStitch} material={stitchMaterial} />
            <mesh position={[0, -0.105, -0.048]} material={bagTrimMaterial}>
              <boxGeometry args={[0.14, 0.03, 0.014]} />
            </mesh>
            <mesh position={[0, -0.105, -0.058]} material={claspMaterial} castShadow>
              <boxGeometry args={[0.09, 0.018, 0.018]} />
            </mesh>
            <mesh position={[0, -0.105, -0.069]} material={bagTrimMaterial}>
              <boxGeometry args={[0.014, 0.038, 0.008]} />
            </mesh>
          </group>
          <mesh
            geometry={pocketGeometry}
            material={bagMaterial}
            position={[0, -0.075, 0.155]}
            castShadow
            receiveShadow
          />
          <mesh geometry={bagDetailGeometries.pocketStitch} material={stitchMaterial} />
          <mesh position={[0, -0.075, 0.181]} material={bagTrimMaterial}>
            <boxGeometry args={[0.11, 0.012, 0.008]} />
          </mesh>
          <mesh position={[0, -0.075, 0.187]} material={claspMaterial} castShadow>
            <boxGeometry args={[0.045, 0.026, 0.012]} />
          </mesh>
        </group>
        <mesh position={[0, 1.96, -0.045]} scale={[0.9, 1.06, 0.88]} castShadow>
          <sphereGeometry args={[0.23, 24, 18]} />
          <primitive object={handMaterial} attach="material" />
        </mesh>
        <mesh position={[0, 1.98, 0.025]} scale={[1, 0.96, 0.92]} castShadow>
          <sphereGeometry args={[0.235, 24, 18]} />
          <meshStandardMaterial color="#633b31" roughness={0.94} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={`eye-${side}`}
            position={[side * 0.075, 2.005, -0.247]}
            scale={[0.024, 0.028, 0.009]}
            material={faceMaterials.eyes}
          >
            <sphereGeometry args={[1, 10, 8]} />
          </mesh>
        ))}
        <mesh position={[0, 1.95, -0.26]} scale={[0.08, 0.12, 0.1]} material={handMaterial}>
          <sphereGeometry args={[0.23, 10, 8]} />
        </mesh>
        <mesh position={[0, 1.885, -0.247]} scale={[0.035, 0.008, 0.006]} material={faceMaterials.lips}>
          <sphereGeometry args={[1, 10, 6]} />
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

        <group ref={leftArm} position={[-0.27, 1.58, 0]}>
          <mesh geometry={armGeometries.leftUpper} material={sleeveMaterial} castShadow />
          <mesh position={[-0.075, -0.33, 0.025]} scale={[0.061, 0.064, 0.058]} material={sleeveMaterial} castShadow>
            <sphereGeometry args={[1, 12, 9]} />
          </mesh>
          <mesh geometry={armGeometries.leftForearm} material={sleeveMaterial} castShadow />
          <group position={[-0.12, -0.68, 0.04]}>
            <Hand material={handMaterial} />
          </group>
        </group>
        <group ref={rightArm} position={[0.27, 1.58, 0]}>
          <mesh geometry={armGeometries.rightUpper} material={sleeveMaterial} castShadow />
          <mesh position={[0.075, -0.33, 0.025]} scale={[0.061, 0.064, 0.058]} material={sleeveMaterial} castShadow>
            <sphereGeometry args={[1, 12, 9]} />
          </mesh>
          <mesh geometry={armGeometries.rightForearm} material={sleeveMaterial} castShadow />
          <group position={[0.12, -0.68, 0.04]} rotation={[0, 0, 0.06]}>
            <Hand mirror={-1} material={handMaterial} />
          </group>
          <mesh position={[0.11, -0.45, 0.03]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <torusGeometry args={[0.074, 0.009, 8, 28]} />
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
  setWalkingAudio,
  setPorchWalkingAudio,
  playAudioEffect,
  exitCabinRequested,
  onCabinExitComplete,
  journeyState,
  onJourneyStateChange,
  onEnterGalaxy,
  onCabinDoorOpen,
}) {
  const walkerPosition = useRef(new THREE.Vector3(
    ...WALKER_START_POSITION,
  ));
  const trailLetters = useMemo(
    () => [...'GABYEDWIN'].map((character, index) => {
      const localZ = -0.6;
      const wordGap = index >= 4 ? 0.6 : 0;
      const xOffset = (index - 4) * 0.95 + wordGap - 0.3;
      const x = pathCenter(localZ) + xOffset;
      return {
        character,
        key: `letter-${index}`,
        position: [x, terrainHeight(x, localZ), localZ + 1],
        rotationY: 0,
      };
    }),
    [],
  );

  return (
    <>
      <color attach="background" args={['#6f475f']} />
      <SkyDome />
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

      <Terrain
        reducedMotion={reducedMotion}
        dogActive={journeyState.isNearCabin}
        isInsideCabin={journeyState.isInsideCabin}
        onDoorOpen={onCabinDoorOpen}
        walkerPosition={walkerPosition}
      />
      <Suspense fallback={null}>
        <TrailPhysics
          letters={trailLetters}
          positionRef={walkerPosition}
          initialPosition={WALKER_START_POSITION}
          onWalkerCollision={() => playAudioEffect('collision')}
        />
      </Suspense>
      <ForestReader greeting={journeyState.isNearReader} reducedMotion={reducedMotion} />
      <Suspense fallback={null}>
        <Portal
          reducedMotion={reducedMotion}
          onEnterGalaxy={onEnterGalaxy}
        />
      </Suspense>
      <Walker
        reducedMotion={reducedMotion}
        movement={movement}
        setWalkingAudio={setWalkingAudio}
        setPorchWalkingAudio={setPorchWalkingAudio}
        exitCabinRequested={exitCabinRequested}
        onCabinExitComplete={onCabinExitComplete}
        positionRef={walkerPosition}
        isInsideCabin={journeyState.isInsideCabin}
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

export default function RealWorldCollage({ onEnterGalaxy, onEnterCredentials }) {
  const shouldReduceMotion = useReducedMotion();
  const {
    audioLevel,
    playAudioEffect,
    setWalkingAudio,
    setPorchWalkingAudio,
  } = useAppAudio();
  const [sceneReady, setSceneReady] = useState(false);
  const [cabinWelcomeOpen, setCabinWelcomeOpen] = useState(false);
  const [exitCabinRequested, setExitCabinRequested] = useState(false);
  const [journeyState, setJourneyState] = useState({
    hasMoved: false,
    isNearPortal: false,
    isNearCabin: false,
    isInsideCabin: false,
    isNearReader: false,
    isAtSummit: false,
    isNearBridgeDestination: false,
  });
  const movement = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  });
  const portalTransitionStarted = useRef(false);
  const credentialsTransitionStarted = useRef(false);
  const openCabinWelcome = useCallback(() => {
    setCabinWelcomeOpen(true);
  }, []);
  const completeCabinExit = useCallback(() => setExitCabinRequested(false), []);
  const enterGalaxy = useCallback(() => {
    if (portalTransitionStarted.current) return;
    portalTransitionStarted.current = true;
    setWalkingAudio(false, true);
    setPorchWalkingAudio(false, true);
    Object.keys(movement.current).forEach((key) => {
      movement.current[key] = false;
    });
    onEnterGalaxy?.();
  }, [onEnterGalaxy, setWalkingAudio, setPorchWalkingAudio]);
  const enterCredentials = useCallback(() => {
    if (credentialsTransitionStarted.current) return;
    credentialsTransitionStarted.current = true;
    setWalkingAudio(false, true);
    setPorchWalkingAudio(false, true);
    Object.keys(movement.current).forEach((key) => {
      movement.current[key] = false;
    });
    onEnterCredentials?.();
  }, [onEnterCredentials, setWalkingAudio, setPorchWalkingAudio]);
  const handleJourneyStateChange = useCallback((nextState) => {
    setJourneyState((currentState) => (
      currentState.hasMoved === nextState.hasMoved
      && currentState.isNearPortal === nextState.isNearPortal
      && currentState.isNearCabin === nextState.isNearCabin
      && currentState.isInsideCabin === nextState.isInsideCabin
      && currentState.isNearReader === nextState.isNearReader
      && currentState.isAtSummit === nextState.isAtSummit
      && currentState.isNearBridgeDestination === nextState.isNearBridgeDestination
        ? currentState
        : nextState
    ));
    if (nextState.isNearPortal) enterGalaxy();
  }, [enterGalaxy]);

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
      enterGalaxy();
    };
    window.addEventListener('keydown', handleJump);
    return () => window.removeEventListener('keydown', handleJump);
  }, [enterGalaxy, journeyState.isNearPortal]);

  useEffect(() => {
    if (!journeyState.isNearBridgeDestination) return undefined;
    const handleDestinationKey = (event) => {
      if (event.code !== 'Space' || event.repeat) return;
      const activeElement = document.activeElement;
      if (activeElement?.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(activeElement?.tagName)) return;
      event.preventDefault();
      enterCredentials();
    };
    window.addEventListener('keydown', handleDestinationKey);
    return () => window.removeEventListener('keydown', handleDestinationKey);
  }, [enterCredentials, journeyState.isNearBridgeDestination]);

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
        dpr={[1, 1.25]}
        camera={{ position: [0, 7, 33], fov: 43, near: 0.1, far: 150 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        style={{ touchAction: journeyState.isInsideCabin ? 'none' : 'auto' }}
      >
        <SceneReady onReady={() => setSceneReady(true)} />
        <CameraArrival reducedMotion={shouldReduceMotion} />
        <RealWorldScene
          reducedMotion={shouldReduceMotion}
          audioLevel={audioLevel}
          movement={movement}
          setWalkingAudio={setWalkingAudio}
          setPorchWalkingAudio={setPorchWalkingAudio}
          exitCabinRequested={exitCabinRequested}
          onCabinExitComplete={completeCabinExit}
          playAudioEffect={playAudioEffect}
          journeyState={journeyState}
          onJourneyStateChange={handleJourneyStateChange}
          onEnterGalaxy={enterGalaxy}
          onCabinDoorOpen={openCabinWelcome}
        />
      </Canvas>

      {!sceneReady && (
        <div
          role="status"
          aria-label="Cargando escena"
          className="pointer-events-none absolute inset-0 z-[80] flex items-center justify-center bg-[#07121b]/65"
        >
          <span
            aria-hidden="true"
            className={`h-12 w-12 rounded-full border border-amber-100/20 border-t-amber-100/80 shadow-[0_0_36px_rgba(251,191,36,0.12)] ${shouldReduceMotion ? '' : 'motion-safe:animate-spin'}`}
          />
        </div>
      )}

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
          journeyState.isNearBridgeDestination,
          journeyState.hasMoved,
        ].join('-')}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
        aria-live="polite"
        className="pointer-events-none absolute bottom-[13.5rem] left-1/2 z-10 w-[min(88vw,24rem)] -translate-x-1/2 rounded-xl border border-white/15 bg-[#07121b]/75 px-3 py-2 text-center font-mono text-[9px] leading-relaxed tracking-wide text-white/80 shadow-lg backdrop-blur-md sm:bottom-6 sm:left-6 sm:w-auto sm:translate-x-0 sm:rounded-full sm:px-4"
      >
        {journeyState.isNearPortal
          ? 'ACÉRCATE A LA LUNA · REGRESO AL COSMOS'
          : journeyState.isNearBridgeDestination
            ? 'PUENTE CRUZADO · PULSA ESPACIO O EL BOTÓN PARA ABRIR FORMACIÓN'
          : journeyState.isInsideCabin
            ? 'ARRASTRA PARA MIRAR ALREDEDOR · USA ↓ PARA SALIR'
          : journeyState.isAtSummit
            ? 'CUMBRE · ACÉRCATE A LA LUNA PARA VOLVER AL COSMOS'
          : journeyState.isNearReader
            ? 'ALEXIS ESTÁ LEYENDO EN EL BOSQUE · ACÉRCATE PARA SALUDAR'
            : journeyState.isNearCabin
              ? 'LA PUERTA ESTÁ ABIERTA · ACÉRCATE Y ENTRA EN LA CABAÑA'
          : journeyState.hasMoved
                  ? 'SIGUE EL SENDERO DETRÁS DE LA MONTAÑA · CRUZA EL PUENTE HACIA FORMACIÓN'
                  : 'USA WASD O LAS FLECHAS · SIGUE EL SENDERO HACIA LA CASITA Y LA MONTAÑA'}
        {!journeyState.isNearPortal && !journeyState.isNearBridgeDestination && !journeyState.isNearCabin && !journeyState.isNearReader && !journeyState.isAtSummit && !journeyState.hasMoved && (
          <span className="hidden sm:inline"> · SHIFT PARA CORRER</span>
        )}
      </motion.p>
      {journeyState.isInsideCabin && (
        <button
          type="button"
          onClick={() => setExitCabinRequested(true)}
          className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full border border-amber-100/35 bg-[#101b20]/80 px-4 py-3 font-mono text-[9px] uppercase tracking-[0.12em] text-amber-50 shadow-lg backdrop-blur-xl transition hover:border-amber-100/65 hover:bg-[#17272a]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-100 sm:right-7 sm:px-5 sm:text-[10px]"
        >
          Salir de la cabaña →
        </button>
      )}
      {journeyState.isNearBridgeDestination && (
        <motion.button
          type="button"
          onClick={enterCredentials}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-xl border border-cyan-100/35 bg-[#07121b]/85 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.12em] text-cyan-50 shadow-xl backdrop-blur-xl transition hover:border-cyan-100/70 hover:bg-[#10233a]/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:bottom-20"
        >
          Abrir Formación y certificaciones →
        </motion.button>
      )}
      <AnimatePresence>
        {cabinWelcomeOpen && (
          <motion.aside
            role="dialog"
            aria-modal="false"
            aria-labelledby="cabin-welcome-title"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
            className="absolute left-1/2 top-1/2 z-[100] w-[min(88vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-amber-100/25 bg-[#101b20]/90 p-5 text-center shadow-2xl backdrop-blur-xl sm:p-7"
          >
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-amber-100/65">
              Refugio de Gaby
            </p>
            <h2 id="cabin-welcome-title" className="mt-2 font-display text-xl text-amber-50 sm:text-2xl">
              Bienvenida a la casita
            </h2>
            <p className="mt-3 font-body text-sm leading-relaxed text-white/75">
              Un rincón tranquilo para explorar antes de seguir el sendero.
            </p>
            <button
              type="button"
              onClick={() => setCabinWelcomeOpen(false)}
              className="mt-5 min-h-11 rounded-lg border border-amber-100/35 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-amber-50 transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              Continuar explorando
            </button>
          </motion.aside>
        )}
      </AnimatePresence>
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
              ? 'Umbral · gravedad inversa'
              : journeyState.isNearBridgeDestination
                ? 'Puente · destino formación'
              : journeyState.isAtSummit
                ? 'Cumbre · hora dorada'
              : journeyState.isNearReader
                ? 'Bosque · rincón de lectura'
                : journeyState.isNearCabin
                  ? 'Refugio · la casita'
                  : ''}
          </p>
          <h1 className="text-[12px] tracking-[0.12em] text-white sm:text-base">
            Gaby Edwin <span className="text-amber-100/70">_</span>
          </h1>
          <p className="mt-1 text-[8px] tracking-[0.06em] text-white/75 sm:text-[10px] sm:tracking-[0.1em]">
            Creative Developer &amp; Arte Digital
          </p>
        </section>
        <motion.button
          type="button"
          data-cursor
          onClick={onEnterGalaxy}
          aria-label="Saltar la experiencia interactiva y abrir el portafolio"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.2 }}
          className="min-h-11 shrink-0 border border-cyan-100/40 bg-[#07121b]/75 px-3 py-2 font-mono text-[9px] tracking-[0.08em] text-cyan-50 shadow-lg backdrop-blur-xl transition hover:border-cyan-100/75 hover:bg-[#10233a]/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:px-4 sm:text-[10px]"
        >
          <span className="sm:hidden">Ver portafolio →</span>
          <span className="hidden sm:inline">SALTAR RECORRIDO · VER PORTAFOLIO →</span>
        </motion.button>
      </div>
    </motion.section>
  );
}
