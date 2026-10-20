import React, { useEffect, useRef } from 'react';
import { audioAnalyzer } from '@/utils/audioAnalyzer';
import {
  sphereVertexShader,
  sphereFragmentShader,
  spherePointFragmentShader,
  particleVertexShader,
  particleFragmentShader
} from './sphereShaders';

interface AoedeCyberSphere3DProps {
  isSpeaking: boolean;
  isUserSpeaking: boolean;
  onClick?: () => void;
  size?: number;
}

export const AoedeCyberSphere3D: React.FC<AoedeCyberSphere3DProps> = ({
  isSpeaking,
  isUserSpeaking,
  onClick,
  size = 360
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isSpeakingRef = useRef(isSpeaking);
  const isUserSpeakingRef = useRef(isUserSpeaking);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
    isUserSpeakingRef.current = isUserSpeaking;
  }, [isSpeaking, isUserSpeaking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize WebGL context with transparent background & antialiasing
    const gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false
    }) || (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);

    if (!gl) {
      console.warn('[AoedeCyberSphere3D] WebGL not supported on this device.');
      return;
    }

    let animId: number;
    let time = 0;

    // High DPI Canvas Scaling
    const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);

    // Shader compilation helper
    const createShader = (type: number, source: string): WebGLShader | null => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[AoedeCyberSphere3D] Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const createProgram = (vsSource: string, fsSource: string): WebGLProgram | null => {
      const vs = createShader(gl.VERTEX_SHADER, vsSource);
      const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
      if (!vs || !fs) return null;

      const program = gl.createProgram();
      if (!program) return null;
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('[AoedeCyberSphere3D] Program link error:', gl.getProgramInfoLog(program));
        return null;
      }
      return program;
    };

    // 1. Build Sphere Programs: Lines & Coordinate Point Matrix
    const sphereProgram = createProgram(sphereVertexShader, sphereFragmentShader);
    const spherePointProgram = createProgram(sphereVertexShader, spherePointFragmentShader);
    // 2. Build Particle Program
    const particleProgram = createProgram(particleVertexShader, particleFragmentShader);

    if (!sphereProgram || !spherePointProgram || !particleProgram) return;

    // --- GEOMETRY: Dense Curvilinear 3D Wireframe Mesh ---
    // Reference 1 is a dense, high-resolution interconnected organic mesh
    const latCount = 60;
    const lonCount = 88;
    const positions: number[] = [];
    const gridCoords: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i <= latCount; i++) {
      const theta = (i * Math.PI) / latCount;
      const v = i / latCount;

      for (let j = 0; j <= lonCount; j++) {
        const phi = (j * 2 * Math.PI) / lonCount;
        const u = j / lonCount;

        // Base unit sphere coordinates
        const x = Math.sin(theta) * Math.cos(phi);
        const y = Math.cos(theta);
        const z = Math.sin(theta) * Math.sin(phi);

        positions.push(x, y, z);
        gridCoords.push(u, v);
      }
    }

    // Connect wireframe lines (latitude rings + longitude arcs)
    for (let i = 0; i <= latCount; i++) {
      for (let j = 0; j < lonCount; j++) {
        const idx1 = i * (lonCount + 1) + j;
        const idx2 = idx1 + 1;

        // Longitudinal wire segment
        indices.push(idx1, idx2);

        // Latitudinal wire segment
        if (i < latCount) {
          const idx3 = (i + 1) * (lonCount + 1) + j;
          indices.push(idx1, idx3);
        }
      }
    }

    // Sphere Buffers
    const spherePosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, spherePosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const sphereGridBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sphereGridBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridCoords), gl.STATIC_DRAW);

    const sphereIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

    const indexCount = indices.length;
    const vertexCount = (latCount + 1) * (lonCount + 1);

    // --- PARTICLE SYSTEM: Surrounding Luminous Constellation Halo ---
    // 220 particles distributed in a spherical shell around the sphere
    const particleCount = 220;
    const particlePositions: number[] = [];
    const particlePhases: number[] = [];
    const particleSizes: number[] = [];

    for (let p = 0; p < particleCount; p++) {
      // Golden spiral distribution on sphere with radial jitter
      const theta = Math.acos(1 - 2 * (p / particleCount));
      const phi = Math.PI * (1 + Math.sqrt(5)) * p;
      const radius = 1.15 + (Math.sin(p * 7.1) * 0.5 + 0.5) * 0.28;

      const px = radius * Math.sin(theta) * Math.cos(phi);
      const py = radius * Math.cos(theta);
      const pz = radius * Math.sin(theta) * Math.sin(phi);

      particlePositions.push(px, py, pz);
      particlePhases.push(p / particleCount);
      particleSizes.push(1.8 + (p % 3) * 1.2);
    }

    const particlePosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, particlePosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(particlePositions), gl.STATIC_DRAW);

    const particlePhaseBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, particlePhaseBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(particlePhases), gl.STATIC_DRAW);

    const particleSizeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, particleSizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(particleSizes), gl.STATIC_DRAW);

    // Uniform locations for Sphere Lines
    gl.useProgram(sphereProgram);
    const sLocModelView = gl.getUniformLocation(sphereProgram, 'u_modelViewMatrix');
    const sLocProjection = gl.getUniformLocation(sphereProgram, 'u_projectionMatrix');
    const sLocTime = gl.getUniformLocation(sphereProgram, 'u_time');
    const sLocAudioRMS = gl.getUniformLocation(sphereProgram, 'u_audioRMS');
    const sLocAudioBass = gl.getUniformLocation(sphereProgram, 'u_audioBass');
    const sLocAudioMid = gl.getUniformLocation(sphereProgram, 'u_audioMid');
    const sLocAudioHigh = gl.getUniformLocation(sphereProgram, 'u_audioHigh');
    const sLocUserSpeaking = gl.getUniformLocation(sphereProgram, 'u_userSpeaking');

    const sAttrPos = gl.getAttribLocation(sphereProgram, 'a_position');
    const sAttrGrid = gl.getAttribLocation(sphereProgram, 'a_gridCoord');

    // Uniform locations for Sphere Point Grid (media reference)
    gl.useProgram(spherePointProgram);
    const spLocModelView = gl.getUniformLocation(spherePointProgram, 'u_modelViewMatrix');
    const spLocProjection = gl.getUniformLocation(spherePointProgram, 'u_projectionMatrix');
    const spLocTime = gl.getUniformLocation(spherePointProgram, 'u_time');
    const spLocAudioRMS = gl.getUniformLocation(spherePointProgram, 'u_audioRMS');
    const spLocAudioBass = gl.getUniformLocation(spherePointProgram, 'u_audioBass');
    const spLocAudioMid = gl.getUniformLocation(spherePointProgram, 'u_audioMid');
    const spLocAudioHigh = gl.getUniformLocation(spherePointProgram, 'u_audioHigh');
    const spLocUserSpeaking = gl.getUniformLocation(spherePointProgram, 'u_userSpeaking');

    const spAttrPos = gl.getAttribLocation(spherePointProgram, 'a_position');
    const spAttrGrid = gl.getAttribLocation(spherePointProgram, 'a_gridCoord');

    // Uniform locations for Particles
    gl.useProgram(particleProgram);
    const pLocModelView = gl.getUniformLocation(particleProgram, 'u_modelViewMatrix');
    const pLocProjection = gl.getUniformLocation(particleProgram, 'u_projectionMatrix');
    const pLocTime = gl.getUniformLocation(particleProgram, 'u_time');
    const pLocAudioRMS = gl.getUniformLocation(particleProgram, 'u_audioRMS');
    const pLocAudioBass = gl.getUniformLocation(particleProgram, 'u_audioBass');

    const pAttrPos = gl.getAttribLocation(particleProgram, 'a_position');
    const pAttrPhase = gl.getAttribLocation(particleProgram, 'a_phase');
    const pAttrSize = gl.getAttribLocation(particleProgram, 'a_size');

    // Matrix calculation helpers (4x4 column-major)
    const perspectiveMatrix = (fovY: number, aspect: number, near: number, far: number): Float32Array => {
      const f = 1.0 / Math.tan(fovY / 2);
      const nf = 1 / (near - far);
      return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
      ]);
    };

    const createModelViewMatrix = (rotX: number, rotY: number, transZ: number): Float32Array => {
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);

      return new Float32Array([
        cosY, sinX * sinY, -cosX * sinY, 0,
        0, cosX, sinX, 0,
        sinY, -sinX * cosY, cosX * cosY, 0,
        0, 0, transZ, 1
      ]);
    };

    const projMatrix = perspectiveMatrix((42 * Math.PI) / 180, 1.0, 0.1, 100.0);

    // WebGL Render Settings
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);

    // --- ANIMATION LOOP ---
    const render = () => {
      time += 0.016;

      // Extract real-time Web Audio API frequency & RMS metrics
      const audioMetrics = audioAnalyzer.getMetrics();
      const isActuallySpeaking = isSpeakingRef.current && (audioMetrics.isPlaying || audioMetrics.rms > 0.03);

      const audioRMS = isActuallySpeaking ? audioMetrics.rms : 0.0;
      const audioBass = isActuallySpeaking ? audioMetrics.bass : 0.0;
      const audioMid = isActuallySpeaking ? audioMetrics.mid : 0.0;
      const audioHigh = isActuallySpeaking ? audioMetrics.high : 0.0;
      const userSpeaking = isUserSpeakingRef.current ? 1.0 : 0.0;

      // Gentle planetary tilt & precession
      const rotX = 0.22 + Math.sin(time * 0.4) * 0.06;
      const rotY = time * 0.25;
      const modelView = createModelViewMatrix(rotX, rotY, -3.45);

      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      // --- 1. RENDER 3D ORGANIC CYBER-SPHERE WIREFRAME ---
      gl.useProgram(sphereProgram);

      gl.uniformMatrix4fv(sLocProjection, false, projMatrix);
      gl.uniformMatrix4fv(sLocModelView, false, modelView);
      gl.uniform1f(sLocTime, time);
      gl.uniform1f(sLocAudioRMS, audioRMS);
      gl.uniform1f(sLocAudioBass, audioBass);
      gl.uniform1f(sLocAudioMid, audioMid);
      gl.uniform1f(sLocAudioHigh, audioHigh);
      gl.uniform1f(sLocUserSpeaking, userSpeaking);

      gl.bindBuffer(gl.ARRAY_BUFFER, spherePosBuffer);
      gl.enableVertexAttribArray(sAttrPos);
      gl.vertexAttribPointer(sAttrPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, sphereGridBuffer);
      gl.enableVertexAttribArray(sAttrGrid);
      gl.vertexAttribPointer(sAttrGrid, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, sphereIndexBuffer);
      gl.drawElements(gl.LINES, indexCount, gl.UNSIGNED_SHORT, 0);

      // --- 2. RENDER LUMINOUS COORDINATE POINT LATTICE (MEDIA REFERENCE) ---
      gl.useProgram(spherePointProgram);

      gl.uniformMatrix4fv(spLocProjection, false, projMatrix);
      gl.uniformMatrix4fv(spLocModelView, false, modelView);
      gl.uniform1f(spLocTime, time);
      gl.uniform1f(spLocAudioRMS, audioRMS);
      gl.uniform1f(spLocAudioBass, audioBass);
      gl.uniform1f(spLocAudioMid, audioMid);
      gl.uniform1f(spLocAudioHigh, audioHigh);
      gl.uniform1f(spLocUserSpeaking, userSpeaking);

      gl.bindBuffer(gl.ARRAY_BUFFER, spherePosBuffer);
      gl.enableVertexAttribArray(spAttrPos);
      gl.vertexAttribPointer(spAttrPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, sphereGridBuffer);
      gl.enableVertexAttribArray(spAttrGrid);
      gl.vertexAttribPointer(spAttrGrid, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, vertexCount);

      // --- 3. RENDER ORBITING PARTICLE HALO ---
      gl.useProgram(particleProgram);

      gl.uniformMatrix4fv(pLocProjection, false, projMatrix);
      gl.uniformMatrix4fv(pLocModelView, false, modelView);
      gl.uniform1f(pLocTime, time);
      gl.uniform1f(pLocAudioRMS, audioRMS);
      gl.uniform1f(pLocAudioBass, audioBass);

      gl.bindBuffer(gl.ARRAY_BUFFER, particlePosBuffer);
      gl.enableVertexAttribArray(pAttrPos);
      gl.vertexAttribPointer(pAttrPos, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, particlePhaseBuffer);
      gl.enableVertexAttribArray(pAttrPhase);
      gl.vertexAttribPointer(pAttrPhase, 1, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, particleSizeBuffer);
      gl.enableVertexAttribArray(pAttrSize);
      gl.vertexAttribPointer(pAttrSize, 1, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, particleCount);

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      // Clean up WebGL resources
      if (spherePosBuffer) gl.deleteBuffer(spherePosBuffer);
      if (sphereGridBuffer) gl.deleteBuffer(sphereGridBuffer);
      if (sphereIndexBuffer) gl.deleteBuffer(sphereIndexBuffer);
      if (particlePosBuffer) gl.deleteBuffer(particlePosBuffer);
      if (particlePhaseBuffer) gl.deleteBuffer(particlePhaseBuffer);
      if (particleSizeBuffer) gl.deleteBuffer(particleSizeBuffer);
      if (sphereProgram) gl.deleteProgram(sphereProgram);
      if (spherePointProgram) gl.deleteProgram(spherePointProgram);
      if (particleProgram) gl.deleteProgram(particleProgram);
    };
  }, [size]);

  return (
    <div
      onClick={onClick}
      className="relative flex items-center justify-center cursor-pointer select-none transition-transform active:scale-95"
      style={{ width: size, height: size }}
      title={isSpeaking ? "Tap to interrupt Aoede" : ""}
    >
      {/* Luminous Neon Backlight Glow (Subtle spatial bloom matching cyan-magenta gradient) */}
      <div
        className={`absolute inset-6 rounded-full transition-all duration-700 pointer-events-none blur-3xl opacity-75 ${
          isSpeaking
            ? 'bg-gradient-to-tr from-cyan-400/30 via-purple-600/40 to-pink-500/40 scale-110'
            : isUserSpeaking
            ? 'bg-gradient-to-tr from-cyan-400/35 via-blue-500/25 to-indigo-500/25 scale-105'
            : 'bg-gradient-to-tr from-cyan-400/15 via-purple-500/15 to-pink-400/15 scale-95'
        }`}
      />

      {/* GPU-Accelerated 3D WebGL Organic Cyber-Sphere Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="relative z-10 block"
      />
    </div>
  );
};
