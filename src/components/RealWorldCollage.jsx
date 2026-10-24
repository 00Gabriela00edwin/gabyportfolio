import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { motion, useReducedMotion } from 'framer-motion';
import gsap from 'gsap';
import * as THREE from 'three';
import Butterfly from './Butterfly';
import { useAppAudio } from '../audio/AudioContext';

const TERRAIN_WIDTH = 34;
const TERRAIN_DEPTH = 38;
const TERRAIN_SEGMENTS_X = 190;
const TERRAIN_SEGMENTS_Z = 210;
const BUTTERFLY_PARTICLE_COUNT = 34;
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
  const progress = THREE.MathUtils.smoothstep(z, -8.5, 2.4);
  const start = pathCenter(2.4) - 0.85;
  return THREE.MathUtils.lerp(-8.35, start, progress) + Math.sin(progress * Math.PI) * 0.32;
}

function streamCenterZ(x) {
  return -8.25 + Math.sin((x + 10) * 0.72) * 0.22;
}

function terrainHeight(x, z) {
  const distanceFromPath = Math.abs(x - pathCenter(z));
  const bank = Math.exp(-1 * (((distanceFromPath - 1.85) / 0.7) ** 2)) * 0.78;
  const pathCut = Math.exp(-((distanceFromPath / 1.05) ** 4)) * 0.28;
  const branchDistance = Math.abs(x - branchTrailCenterX(z));
  const branchGate = THREE.MathUtils.smoothstep(z, -9, -8.2)
    * (1 - THREE.MathUtils.smoothstep(z, 2.05, 2.7));
  const branchCut = Math.exp(-((branchDistance / 0.9) ** 4)) * branchGate * 0.12;
  const creekDistance = Math.abs(z - streamCenterZ(x));
  const creekGate = THREE.MathUtils.smoothstep(x, -15, -13.5)
    * (1 - THREE.MathUtils.smoothstep(x, -7.7, -5.8));
  const creekCut = Math.exp(-((creekDistance / 0.48) ** 2)) * creekGate * 0.43;
  const creekBank = Math.exp(-(((creekDistance - 0.72) / 0.25) ** 2)) * creekGate * 0.17;
  const furrows = Math.sin(x * 1.85 + z * 0.45 + Math.sin(z * 0.18) * 0.7)
    * Math.cos(z * 1.2 - x * 0.3) * 0.055;
  const rollingGround = Math.sin(x * 0.42 + z * 0.26 + Math.sin(z * 0.13) * 1.1) * 0.22
    + Math.cos(z * 0.38 + Math.sin(x * 0.2)) * 0.18
    + Math.sin(x * 1.2 + z * 0.72) * Math.cos(z * 0.94 - x * 0.36) * 0.11
    + Math.sin(x * 3.7 + z * 2.8) * 0.035;
  const wheelRuts = Math.exp(-(((distanceFromPath - 0.34) / 0.1) ** 2)) * 0.035;
  return -1.35 - z * 0.023 + bank - pathCut - branchCut - creekCut + creekBank - wheelRuts + furrows + rollingGround;
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
      const branchGate = THREE.MathUtils.smoothstep(z, -9, -8.2)
        * (1 - THREE.MathUtils.smoothstep(z, 2.05, 2.7));
      const branchBlend = (1 - THREE.MathUtils.smoothstep(branchDistance, 0.58, 1.02)) * branchGate;
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
      const creekBankColor = new THREE.Color('#654f3d').lerp(field, THREE.MathUtils.clamp((variation + 1) * 0.12, 0, 0.3));
      const color = groundColor
        .lerp(pathColor, pathBlend)
        .lerp(branchColor, branchBlend)
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

function createBranchTrailGeometry() {
  const segments = 160;
  const widthSegments = 8;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let row = 0; row <= segments; row += 1) {
    const progress = row / segments;
    const z = THREE.MathUtils.lerp(2.4, -8.55, progress);
    const centerX = branchTrailCenterX(z);
    const width = 1.12 + Math.sin(progress * Math.PI * 8) * 0.035;
    for (let column = 0; column <= widthSegments; column += 1) {
      const across = column / widthSegments;
      const x = centerX + (across - 0.5) * width * 2;
      positions.push(x, terrainHeight(x, z) + 0.055, z);
      uvs.push(across, progress * 7);
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
      const z = centerZ + (across - 0.5) * 0.98;
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
        vec3 horizon = vec3(0.98, 0.4, 0.17);
        vec3 zenith = vec3(0.015, 0.16, 0.48);
        vec3 sky = mix(horizon, zenith, height);
        vec2 cloudUv = vec2(vUv.x * 8.0 + uTime * 0.003, vUv.y * 5.0 + uTime * 0.001);
        float clouds = cloudNoise(cloudUv);
        float cloudMask = smoothstep(0.58, 0.84, clouds) * (1.0 - smoothstep(0.78, 0.98, vUv.y));
        vec3 cloudColor = mix(vec3(0.78, 0.57, 0.43), vec3(0.98, 0.92, 0.82), vUv.y);
        gl_FragColor = vec4(mix(sky, cloudColor, cloudMask * 0.62), 1.0);
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
      const branchActive = z >= -8.5 && z <= 2.7;
      const branchDistance = Math.abs(x - branchTrailCenterX(z));
      const creekDistance = Math.abs(z - streamCenterZ(x));
      const nearCreek = x >= -15 && x <= -5.8;
      if (
        mainPathDistance < 1.72
        || (branchActive && branchDistance < 1.34)
        || (nearCreek && creekDistance < 0.95)
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
      const branchActive = z >= -8.5 && z <= 2.7;
      if (branchActive && side < 0 && Math.abs(x - branchTrailCenterX(z)) < 3.2) {
        x = branchTrailCenterX(z) - 3.2 - nextRandom() * 1.4;
      }
      const nearCreek = x >= -15 && x <= -5.8 && Math.abs(z - streamCenterZ(x)) < 1.7;
      if (nearCreek) {
        x = Math.min(-5.4, x + (side < 0 ? -2.4 : 2.4));
      }
      if (x > 7 && Math.abs(z + 3.8) < 5.2) continue;
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
    while (blooms.length < 720 && attempts < 4000) {
      attempts += 1;
      const x = -16 + nextRandom() * 32;
      const z = -18 + nextRandom() * 36;
      const mainDistance = Math.abs(x - pathCenter(z));
      const branchDistance = Math.abs(x - branchTrailCenterX(z));
      const creekDistance = Math.abs(z - streamCenterZ(x));
      const branchActive = z >= -8.5 && z <= 2.7;
      if (
        mainDistance < 1.8
        || (branchActive && branchDistance < 1.42)
        || (x >= -15 && x <= -5.8 && creekDistance < 1.1)
      ) continue;
      const colors = ['#fffaf0', '#f9f4df', '#fffdf5', '#fff7e8'];
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
      const alongBranch = index % 4 === 0;
      const z = alongBranch ? 2.1 - nextRandom() * 10.3 : 13 - nextRandom() * 29;
      const side = nextRandom() < 0.5 ? -1 : 1;
      const center = alongBranch ? branchTrailCenterX(z) : pathCenter(z);
      const offset = alongBranch
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
    new THREE.MeshBasicMaterial({ color: '#f0d5be', transparent: true, opacity: 0.13, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: '#d9e5e5', transparent: true, opacity: 0.09, depthWrite: false }),
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

function CreekWater({ reducedMotion }) {
  const geometry = useMemo(() => createCreekGeometry(), []);
  const waterRef = useRef(null);
  const material = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#91d2d1',
    emissive: '#174d5a',
    emissiveIntensity: 0.12,
    roughness: 0.2,
    metalness: 0.04,
    clearcoat: 0.82,
    clearcoatRoughness: 0.16,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);
  const basePositions = useMemo(() => geometry.attributes.position.array.slice(), [geometry]);

  useFrame(({ clock }) => {
    const waterGeometry = waterRef.current?.geometry;
    if (reducedMotion || !waterGeometry) return;
    const positions = waterGeometry.attributes.position.array;
    const time = clock.elapsedTime;
    for (let index = 0; index < positions.length; index += 3) {
      const x = basePositions[index];
      const z = basePositions[index + 2];
      positions[index + 1] = basePositions[index + 1]
        + Math.sin(x * 2.2 + time * 1.25 + z * 1.6) * 0.018
        + Math.sin(x * 4.1 - time * 0.78) * 0.009;
    }
    waterGeometry.attributes.position.needsUpdate = true;
    waterGeometry.computeVertexNormals();
  });

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <mesh ref={waterRef} geometry={geometry} material={material} renderOrder={1} />
  );
}

function Waterfall({ reducedMotion }) {
  const sheetRef = useRef(null);
  const waterfallX = -6.7;
  const geometry = useMemo(() => new THREE.PlaneGeometry(3.2, 1.05, 20, 20), []);
  const fallBase = terrainHeight(waterfallX, streamCenterZ(waterfallX)) + 0.2;
  const material = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#b8eced',
    emissive: '#4b9ba2',
    emissiveIntensity: 0.2,
    roughness: 0.16,
    metalness: 0.02,
    clearcoat: 0.9,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);
  const basePositions = useMemo(() => geometry.attributes.position.array.slice(), [geometry]);
  const foamPositions = useMemo(() => {
    const values = new Float32Array(48 * 3);
    for (let index = 0; index < 48; index += 1) {
      values[index * 3] = Math.sin(index * 12.9898) * 0.8;
      values[index * 3 + 1] = -0.34 + (index % 8) * 0.025;
      values[index * 3 + 2] = 0.01 + Math.cos(index * 7.1) * 0.025;
    }
    return values;
  }, []);
  const foamRef = useRef(null);

  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const sheetGeometry = sheetRef.current?.geometry;
    if (sheetGeometry) {
      const positions = sheetGeometry.attributes.position.array;
      const time = clock.elapsedTime;
      for (let index = 0; index < positions.length; index += 3) {
        const x = basePositions[index];
        const y = basePositions[index + 1];
        positions[index + 2] = basePositions[index + 2]
          + Math.sin(y * 12 - time * 3 + x * 2) * 0.025
          + Math.sin(x * 9 + time * 1.8) * 0.012;
      }
      sheetGeometry.attributes.position.needsUpdate = true;
      sheetGeometry.computeVertexNormals();
    }
    if (foamRef.current) {
      foamRef.current.position.y = fallBase + 0.04 + Math.sin(clock.elapsedTime * 2.4) * 0.025;
      foamRef.current.material.opacity = 0.42 + Math.sin(clock.elapsedTime * 3.2) * 0.1;
    }
  });

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  return (
    <group position={[waterfallX, 0, -8.15]}>
      <mesh ref={sheetRef} geometry={geometry} material={material} position={[0, fallBase + 0.525, 0]} />
      <points ref={foamRef} position={[0, fallBase + 0.04, 0.025]}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[foamPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#efffff"
          size={0.055}
          sizeAttenuation
          transparent
          opacity={0.48}
          depthWrite={false}
        />
      </points>
    </group>
  );
}

function LogCabin({ reducedMotion }) {
  const cabinX = 11.1;
  const cabinZ = -3.8;
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

  useEffect(() => () => {
    logGeometry.dispose();
    Object.values(beetleMaterials).forEach((material) => material.dispose());
    woodMaterial.dispose();
    darkWoodMaterial.dispose();
    roofMaterial.dispose();
  }, [beetleMaterials, darkWoodMaterial, logGeometry, roofMaterial, woodMaterial]);

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
        <mesh position={[0, 1.06, 1.73]} castShadow>
          <boxGeometry args={[0.82, 1.8, 0.08]} />
          <meshStandardMaterial color="#38251a" roughness={0.9} />
        </mesh>
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

function Terrain({ reducedMotion }) {
  const geometry = useMemo(() => createTerrainGeometry(), []);
  const branchTrailGeometry = useMemo(() => createBranchTrailGeometry(), []);
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
    terrainMaterial.dispose();
    branchTrailMaterial.dispose();
    terrainMaps.colorMap.dispose();
    terrainMaps.normalMap.dispose();
    terrainMaps.bumpMap.dispose();
    terrainMaps.roughnessMap.dispose();
  }, [branchTrailGeometry, branchTrailMaterial, geometry, terrainMaps, terrainMaterial]);

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
      <CreekWater reducedMotion={reducedMotion} />
      <Waterfall reducedMotion={reducedMotion} />
      <LogCabin reducedMotion={reducedMotion} />
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

function PortalRim({ z, scale, radius, color, emissive, intensity }) {
  const curve = usePortalCurve(scale);
  const geometry = useMemo(() => new THREE.TubeGeometry(curve, 192, radius, 10, true), [curve, radius]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={[0, 0, z]} castShadow>
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

function Portal({ reducedMotion, onEnterGalaxy }) {
  const portal = useRef(null);
  const orbit = useRef(null);

  useFrame(({ clock }, delta) => {
    if (reducedMotion) return;
    const time = clock.elapsedTime;
    if (portal.current) portal.current.rotation.y = THREE.MathUtils.damp(portal.current.rotation.y, Math.sin(time * 0.24) * 0.035, 1.8, delta);
    if (orbit.current) orbit.current.rotation.z = time * 0.04;
  });

  return (
    <group ref={portal} position={[0, 3.1, -8.4]}>
      <mesh position={[0, 0, -0.45]} scale={[2.35, 3.7, 0.62]}>
        <sphereGeometry args={[1, 48, 36]} />
        <meshStandardMaterial color="#071522" emissive="#102e56" emissiveIntensity={0.75} roughness={0.28} metalness={0.24} />
      </mesh>
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
      <PortalRim z={0.22} scale={1.06} radius={0.14} color="#d8c5a0" emissive="#8a643d" intensity={0.32} />
      <PortalRim z={0} scale={1} radius={0.075} color="#9bbdf0" emissive="#3986ff" intensity={1.5} />
      <PortalRim z={-0.4} scale={0.89} radius={0.065} color="#577da8" emissive="#244e8d" intensity={0.82} />

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
      <pointLight position={[0, 0, 1.6]} color="#75aaff" intensity={2.1} distance={12} />
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

function Walker({ reducedMotion, movement, portalTransitioning, onPortalEnter }) {
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
  const portalTriggered = useRef(false);
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
  }, [dressGeometry, fabricMaps, fabricMaterial]);

  useFrame(({ clock }, delta) => {
    if (!root.current || !body.current) return;
    const time = clock.elapsedTime;
    const input = movement.current;
    const horizontal = Number(input.right) - Number(input.left);
    const vertical = Number(input.backward) - Number(input.forward);
    const moving = !portalTransitioning && (horizontal !== 0 || vertical !== 0);

    if (moving) {
      direction.set(horizontal, 0, vertical).normalize();
      const speed = input.sprint ? 6.2 : 4;
      root.current.position.x += direction.x * speed * delta;
      root.current.position.z += direction.z * speed * delta;
      const localZ = root.current.position.z - 1;
      const path = pathCenter(localZ);
      const branchAvailable = localZ >= -8.5 && localZ <= 2.7;
      if (branchAvailable) {
        const branchCenter = branchTrailCenterX(localZ);
        const mainMin = path - 2.45;
        const mainMax = path + 2.45;
        const branchMin = branchCenter - 1.5;
        const branchMax = branchCenter + 1.5;
        const inMainTrail = root.current.position.x >= mainMin && root.current.position.x <= mainMax;
        const inBranchTrail = root.current.position.x >= branchMin && root.current.position.x <= branchMax;
        if (!inMainTrail && !inBranchTrail) {
          const mainX = THREE.MathUtils.clamp(root.current.position.x, mainMin, mainMax);
          const branchX = THREE.MathUtils.clamp(root.current.position.x, branchMin, branchMax);
          root.current.position.x = Math.abs(root.current.position.x - branchX) < Math.abs(root.current.position.x - mainX)
            ? branchX
            : mainX;
        }
      } else {
        root.current.position.x = THREE.MathUtils.clamp(root.current.position.x, path - 2.45, path + 2.45);
      }
      root.current.position.z = THREE.MathUtils.clamp(root.current.position.z, -15, 13);
      root.current.position.y = terrainHeight(root.current.position.x, root.current.position.z - 1);
      const targetYaw = Math.atan2(-direction.x, -direction.z);
      const yawDifference = Math.atan2(
        Math.sin(targetYaw - root.current.rotation.y),
        Math.cos(targetYaw - root.current.rotation.y),
      );
      root.current.rotation.y += yawDifference * (1 - Math.exp(-delta * 8));
      if (walkStartedAt.current == null) walkStartedAt.current = time;
      const onCreekBranch = branchAvailable
        && Math.abs(root.current.position.x - branchTrailCenterX(localZ)) <= 1.8;
      if (
        !portalTriggered.current
        && !onCreekBranch
        && root.current.position.z <= -5.7
        && Math.abs(root.current.position.x) <= 2.3
      ) {
        portalTriggered.current = true;
        onPortalEnter?.();
      }
    } else {
      walkStartedAt.current = null;
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
    if (hair.current) {
      const sway = moving ? step * (reducedMotion ? 0.025 : 0.075) : Math.sin(time * 0.8) * 0.018;
      hair.current.rotation.z = THREE.MathUtils.damp(hair.current.rotation.z, sway, 5, delta);
    }

    if (time > 2.4 && !portalTransitioning) {
      desiredCameraPosition.set(
        root.current.position.x,
        root.current.position.y + 5.2,
        root.current.position.z + 10.5,
      );
      camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-delta * 1.15));
      cameraTarget.set(
        root.current.position.x,
        root.current.position.y + 1.4,
        root.current.position.z - 3,
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
          <mesh position={[0, -0.54, 0.08]} rotation={[0, 0, 0]} castShadow>
            <capsuleGeometry args={[0.1, 0.2, 4, 8]} />
            <meshStandardMaterial color="#68452f" roughness={0.74} />
          </mesh>
        </group>
        <group ref={rightLeg} position={[0.19, 0.54, 0]}>
          <Limb position={[0, -0.27, 0]} color="#49352e" radius={0.095} length={0.48} />
          <mesh position={[0, -0.54, 0.08]} castShadow>
            <capsuleGeometry args={[0.1, 0.2, 4, 8]} />
            <meshStandardMaterial color="#68452f" roughness={0.74} />
          </mesh>
        </group>

        <group ref={leftArm} position={[-0.3, 1.58, 0]}>
          <Limb position={[-0.13, -0.31, 0.015]} rotation={[0, 0, -0.18]} color="#e4ddd0" radius={0.105} length={0.55} />
        </group>
        <group ref={rightArm} position={[0.3, 1.58, 0]}>
          <Limb position={[0.14, -0.27, 0.03]} rotation={[0, 0, 0.22]} color="#e4ddd0" radius={0.105} length={0.55} />
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

function ButterflyStardust({ positionRef, reducedMotion }) {
  const particleRefs = useRef([]);
  const elapsedSinceEmission = useRef(0);
  const nextParticle = useRef(0);
  const particleState = useMemo(() => Array.from({ length: BUTTERFLY_PARTICLE_COUNT }, (_, index) => ({
      life: 0.65 + (index % 5) * 0.08,
      velocity: new THREE.Vector3(
        Math.sin(index * 17.13) * 0.65,
        0.35 + (index % 4) * 0.06,
        0.2 + Math.cos(index * 11.71) * 0.38,
      ),
      size: 0.65 + (index % 4) * 0.12,
      warm: index % 2 === 0,
    })), []);
  const ages = useRef(null);
  if (ages.current == null) ages.current = new Float32Array(BUTTERFLY_PARTICLE_COUNT).fill(2);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.14, 7, 6), []);
  const materials = useMemo(() => particleState.map((particle) => new THREE.MeshBasicMaterial({
    color: particle.warm ? '#ffc87a' : '#d9f7ff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })), [particleState]);

  useEffect(() => () => {
    geometry.dispose();
    materials.forEach((material) => material.dispose());
  }, [geometry, materials]);

  useFrame((_, delta) => {
    if (!reducedMotion && positionRef.current.lengthSq() > 0) {
      elapsedSinceEmission.current += delta;
      if (elapsedSinceEmission.current >= 0.045) {
        elapsedSinceEmission.current = 0;
        const index = nextParticle.current;
        ages.current[index] = 0;
        particleRefs.current[index]?.position.copy(positionRef.current);
        if (particleRefs.current[index]) particleRefs.current[index].visible = true;
        nextParticle.current = (index + 1) % BUTTERFLY_PARTICLE_COUNT;
      }
    }

    particleState.forEach((particle, index) => {
      const mesh = particleRefs.current[index];
      if (!mesh) return;
      if (ages.current[index] < particle.life) {
        ages.current[index] += delta;
        const progress = Math.min(1, ages.current[index] / particle.life);
        const opacity = (1 - progress) ** 1.8;
        mesh.position.addScaledVector(particle.velocity, delta);
        mesh.scale.setScalar(particle.size * (1 - progress * 0.72));
        mesh.material.opacity = opacity * 0.82;
        mesh.visible = true;
      } else {
        mesh.visible = false;
        mesh.material.opacity = 0;
      }
    });
  });

  return (
    <group>
      {particleState.map((particle, index) => (
        <mesh
          key={index}
          ref={(mesh) => { particleRefs.current[index] = mesh; }}
          geometry={geometry}
          material={materials[index]}
          visible={false}
          scale={particle.size}
          renderOrder={2}
        />
      ))}
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

function PortalTravel({ active, reducedMotion, onComplete }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(0, 3.1, -24), []);

  useEffect(() => {
    if (!active) return undefined;
    if (reducedMotion) {
      camera.position.set(0, 3.1, -12);
      camera.lookAt(target);
      onComplete();
      return undefined;
    }

    const timeline = gsap.timeline({ onComplete });
    timeline
      .to(camera.position, {
        x: 0,
        y: 3.1,
        z: -12.5,
        duration: 1.8,
        ease: 'power3.in',
        onUpdate: () => camera.lookAt(target),
      })
      .to(camera, {
        fov: 27,
        duration: 0.9,
        ease: 'power2.in',
        onUpdate: () => {
          camera.lookAt(target);
          camera.updateProjectionMatrix();
        },
      }, 0.9);

    return () => timeline.kill();
  }, [active, camera, onComplete, reducedMotion, target]);

  return null;
}

function RealWorldScene({
  reducedMotion,
  audioLevel,
  movement,
  portalTransitioning,
  onPortalEnter,
  onPortalComplete,
}) {
  const butterflyPosition = useRef(new THREE.Vector3());
  const updateButterflyPosition = useCallback((position) => {
    butterflyPosition.current.copy(position);
  }, []);

  return (
    <>
      <color attach="background" args={['#6b9aab']} />
      <SkyDome reducedMotion={reducedMotion} />
      <AtmosphericClouds reducedMotion={reducedMotion} />
      <ambientLight intensity={0.7} color="#d9e8ed" />
      <directionalLight
        position={[-7, 12, 8]}
        intensity={2.6}
        color="#ffe4b0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
        shadow-bias={-0.0002}
      />
      <hemisphereLight args={['#9bcbe0', '#60422e', 0.5]} />

      <Terrain reducedMotion={reducedMotion} />
      <Portal reducedMotion={reducedMotion} onEnterGalaxy={onPortalEnter} />
      <Walker
        reducedMotion={reducedMotion}
        movement={movement}
        portalTransitioning={portalTransitioning}
        onPortalEnter={onPortalEnter}
      />
      <PortalTravel
        active={portalTransitioning}
        reducedMotion={reducedMotion}
        onComplete={onPortalComplete}
      />
      <Butterfly
        isEntered
        audioLevel={audioLevel}
        reducedMotion={reducedMotion}
        anchorPosition={[1.1, 2.4, 2.1]}
        cursorFollow
        scaleMultiplier={3.2}
        onPositionUpdate={updateButterflyPosition}
      />
      <ButterflyStardust positionRef={butterflyPosition} reducedMotion={reducedMotion} />
      <fog attach="fog" args={['#b3c9c5', 23, 68]} />
    </>
  );
}

export default function RealWorldCollage({ onEnterGalaxy }) {
  const shouldReduceMotion = useReducedMotion();
  const { audioLevel } = useAppAudio();
  const [portalTransitioning, setPortalTransitioning] = useState(false);
  const hasStartedPortalTransition = useRef(false);
  const movement = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  });
  const beginPortalTransition = useCallback(() => {
    if (hasStartedPortalTransition.current) return;
    hasStartedPortalTransition.current = true;
    setPortalTransitioning(true);
  }, []);
  const finishPortalTransition = useCallback(() => {
    onEnterGalaxy?.();
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
      exit={{ opacity: 0 }}
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
          portalTransitioning={portalTransitioning}
          onPortalEnter={beginPortalTransition}
          onPortalComplete={finishPortalTransition}
        />
      </Canvas>

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
      <motion.div
        aria-hidden="true"
        animate={{ opacity: portalTransitioning ? 1 : 0 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.8, ease: 'easeIn' }}
        className="pointer-events-none absolute inset-0 z-[115] bg-[radial-gradient(ellipse_at_center,rgba(210,241,255,0.98)_0%,rgba(114,176,255,0.72)_22%,rgba(14,33,65,0)_68%)]"
      />
      <p className="pointer-events-none absolute bottom-6 left-6 hidden rounded-full border border-white/20 bg-black/25 px-4 py-2 font-mono text-[9px] tracking-[0.16em] text-white/75 backdrop-blur-md sm:block">
        WASD / FLECHAS PARA CAMINAR · SHIFT PARA CORRER · SENDERO IZQUIERDO AL ARROYO
      </p>
      <div className="absolute bottom-5 left-1/2 grid -translate-x-1/2 grid-cols-3 gap-1.5 sm:hidden" aria-label="Controles para caminar">
        <span />
        {movementButton('forward', 'Caminar hacia adelante', '↑')}
        <span />
        {movementButton('left', 'Caminar hacia la izquierda', '←')}
        {movementButton('backward', 'Caminar hacia atrás', '↓')}
        {movementButton('right', 'Caminar hacia la derecha', '→')}
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 sm:p-7">
        <p className="rounded-full border border-white/25 bg-black/25 px-4 py-2 font-mono text-[9px] tracking-[0.24em] text-white/80 backdrop-blur-md sm:text-[10px]">
          MUNDO REAL · 01
        </p>
        <button
          type="button"
          data-cursor
          onClick={beginPortalTransition}
          disabled={portalTransitioning}
          className="min-h-11 border border-white/35 bg-black/30 px-4 py-2 font-mono text-[9px] tracking-[0.12em] text-white shadow-[0_0_24px_rgba(255,255,255,0.08)] backdrop-blur-md transition hover:border-white/75 hover:bg-black/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white sm:text-[10px]"
        >
          ATRAVESAR EL PORTAL →
        </button>
      </div>
    </motion.section>
  );
}
