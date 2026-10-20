/**
 * GLSL Shaders for the 3D Organic Cyber-Sphere and Particle Halo.
 * Recreates the dense organic wireframe, cyan-to-magenta spatial gradient,
 * illuminated ridge crests, and floating particle constellation.
 */

export const sphereVertexShader = `
precision highp float;

attribute vec3 a_position;
attribute vec2 a_gridCoord; // (u, v) normalized parameter

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_time;
uniform float u_audioRMS;
uniform float u_audioBass;
uniform float u_audioMid;
uniform float u_audioHigh;
uniform float u_userSpeaking;

varying vec3 v_worldPosition;
varying vec3 v_normal;
varying float v_elevation;
varying float v_fresnel;
varying vec2 v_gridCoord;

// Magnetic Resonance & Organic Ferrofluid 3D Displacement
vec3 getOrganicOffset(vec3 p, float t, float rms, float bass, float mid, float high, float userSpeak) {
  // 1. Audio Activity Level: strictly 0.0 when settled / idle
  float audioIntensity = clamp(bass * 1.6 + rms * 1.3, 0.0, 1.0);

  // 2. Magnetic Resonance Shell: Forms dynamic ferrofluid spikes along magnetic field lines
  // Only activates when audio is playing (speaking)
  float spikeField1 = pow(abs(sin(p.x * 4.2 + t * 3.8) * cos(p.y * 3.6 - t * 3.2)), 2.0);
  float spikeField2 = pow(abs(cos(p.z * 4.4 + t * 4.0) * sin(p.x * 3.5 + p.y * 3.0)), 2.0);
  float magneticSpikes = (spikeField1 + spikeField2) * (audioIntensity * 0.36);

  // 3. Harmonic Wave Vibrations: Voice formants travel across the point lattice surface
  float voiceWave = sin(p.z * 8.0 + t * 9.0) * cos(p.x * 7.5 - t * 8.5) * (mid * 0.18);

  // 4. Acoustic Surface Tension & Transients
  float acousticTension = sin(p.y * 14.0 + t * 14.0) * (high * 0.12);

  // 5. Subtle Listening State acknowledgement when student speaks
  float userListening = userSpeak * sin(p.y * 6.0 + t * 3.0) * 0.05;

  // When settled (idle), totalDisplacement is exactly 0.0 -> pristine round sphere
  float totalDisplacement = magneticSpikes + voiceWave + acousticTension + userListening;

  return p * (1.0 + totalDisplacement);
}

void main() {
  v_gridCoord = a_gridCoord;
  
  // Compute displaced vertex
  vec3 displaced = getOrganicOffset(
    a_position, 
    u_time, 
    u_audioRMS, 
    u_audioBass, 
    u_audioMid, 
    u_audioHigh, 
    u_userSpeaking
  );

  // Surface normal
  vec3 norm = normalize(displaced);
  v_normal = norm;

  vec4 viewPos = u_modelViewMatrix * vec4(displaced, 1.0);
  v_worldPosition = displaced;
  v_elevation = length(displaced) - 1.0;

  // Compute view-dependent Fresnel rim lighting (bright glowing perimeter)
  vec3 viewDir = normalize(-viewPos.xyz);
  vec3 normalCam = normalize((u_modelViewMatrix * vec4(norm, 0.0)).xyz);
  v_fresnel = clamp(1.0 - abs(dot(viewDir, normalCam)), 0.0, 1.0);

  // Attenuated point size for coordinate point lattice
  gl_PointSize = clamp((3.0 + v_fresnel * 1.5 + v_elevation * 3.0) * (360.0 / -viewPos.z), 2.0, 8.0);

  gl_Position = u_projectionMatrix * viewPos;
}
`;

export const sphereFragmentShader = `
precision highp float;

uniform float u_audioRMS;
uniform float u_userSpeaking;

varying vec3 v_worldPosition;
varying vec3 v_normal;
varying float v_elevation;
varying float v_fresnel;
varying vec2 v_gridCoord;

void main() {
  // Reference 1 Color Specification:
  // Left/Top-Left side: Electric Cyan (#00f0ff) and Royal Blue (#1030e0)
  // Center: Deep Indigo and Rich Violet (#7928ca)
  // Right/Bottom-Right side: Blazing Neon Magenta (#ff0080) and Hot Pink (#ff2a8d)

  // Map normalized X/Y across sphere to gradient ratio (0.0 on left, 1.0 on right)
  float t = clamp((v_worldPosition.x * 0.52 - v_worldPosition.y * 0.22) + 0.5, 0.0, 1.0);

  vec3 cyan = vec3(0.0, 0.88, 1.0);        // #00e0ff Electric Cyan
  vec3 blue = vec3(0.12, 0.25, 0.92);      // #1f40eb Deep Royal Blue
  vec3 purple = vec3(0.58, 0.12, 0.86);    // #941edb Violet / Purple
  vec3 magenta = vec3(1.0, 0.0, 0.62);     // #ff009e Neon Magenta
  vec3 hotPink = vec3(1.0, 0.25, 0.75);    // #ff40bf Hot Pink Ridge Glow

  vec3 color;
  if (t < 0.35) {
    color = mix(cyan, blue, t / 0.35);
  } else if (t < 0.65) {
    color = mix(blue, purple, (t - 0.35) / 0.30);
  } else {
    color = mix(purple, magenta, (t - 0.65) / 0.35);
  }

  // Crest and Ridge Luminosity: Peaks and outward folds catch brilliant highlights
  float ridgeGlow = smoothstep(-0.02, 0.22, v_elevation);
  vec3 highlightColor = mix(cyan * 1.25, hotPink * 1.35, t);
  color = mix(color, highlightColor, ridgeGlow * 0.55);

  // Audio energy boost when speaking
  color += (color * u_audioRMS * 0.4);

  // Depth-based alpha: Front ridges are crisp and solid; deep valleys and back sides are translucent
  float depthAlpha = clamp((v_worldPosition.z + 0.8) / 1.7, 0.3, 0.95);
  float rim = pow(v_fresnel, 1.6) * 0.45;
  float alpha = clamp(depthAlpha + rim + ridgeGlow * 0.25, 0.25, 1.0);

  // Fade back-facing lines to let front sculpture shine with clarity
  if (v_worldPosition.z < -0.15) {
    alpha *= smoothstep(-1.2, -0.15, v_worldPosition.z);
  }

  if (u_userSpeaking > 0.0) {
    // Subtle cyan tint when listening to user
    color = mix(color, cyan, u_userSpeaking * 0.25);
  }

  gl_FragColor = vec4(color, alpha);
}
`;

export const particleVertexShader = `
precision highp float;

attribute vec3 a_position;
attribute float a_phase;
attribute float a_size;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform float u_time;
uniform float u_audioRMS;
uniform float u_audioBass;

varying vec3 v_particlePos;
varying float v_phase;
varying float v_alpha;

void main() {
  v_phase = a_phase;

  // Orbit rotation and floating harmonic drift around the sphere
  float angle = u_time * 0.12 + a_phase * 6.28318;
  float cosA = cos(angle * 0.5);
  float sinA = sin(angle * 0.5);

  vec3 p = a_position;
  // Slow gentle 3D orbital swirl
  vec3 rotated = vec3(
    p.x * cosA - p.z * sinA,
    p.y + sin(u_time * 0.8 + a_phase * 10.0) * 0.06,
    p.x * sinA + p.z * cosA
  );

  // Audio bass expands the particle constellation halo
  float expansion = 1.0 + u_audioBass * 0.18 + u_audioRMS * 0.1;
  rotated *= expansion;

  v_particlePos = rotated;

  vec4 viewPos = u_modelViewMatrix * vec4(rotated, 1.0);

  // Particle size with perspective attenuation
  float pSize = a_size * (1.0 + u_audioRMS * 0.5);
  gl_PointSize = clamp(pSize * (350.0 / -viewPos.z), 2.0, 14.0);

  // Fade particles in background
  v_alpha = clamp((rotated.z + 1.4) / 2.5, 0.25, 0.95);

  gl_Position = u_projectionMatrix * viewPos;
}
`;

export const particleFragmentShader = `
precision highp float;

varying vec3 v_particlePos;
varying float v_phase;
varying float v_alpha;

void main() {
  // Circular point sprite with smooth Gaussian radial falloff
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) {
    discard;
  }

  // Smooth circular glow
  float glow = smoothstep(0.5, 0.05, dist);

  // Color gradient matching surrounding sphere position:
  // Cyan on left, Violet in center, Magenta/Pink on right
  float t = clamp((v_particlePos.x * 0.55 - v_particlePos.y * 0.25) + 0.5, 0.0, 1.0);

  vec3 cyan = vec3(0.0, 0.95, 1.0);
  vec3 purple = vec3(0.65, 0.2, 0.95);
  vec3 magenta = vec3(1.0, 0.1, 0.65);

  vec3 color;
  if (t < 0.5) {
    color = mix(cyan, purple, t * 2.0);
  } else {
    color = mix(purple, magenta, (t - 0.5) * 2.0);
  }

  gl_FragColor = vec4(color, glow * v_alpha * 0.85);
}
`;

export const spherePointFragmentShader = `
precision highp float;

uniform float u_audioRMS;
uniform float u_userSpeaking;

varying vec3 v_worldPosition;
varying float v_fresnel;
varying float v_elevation;

void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) {
    discard;
  }

  // Smooth circular dot sprite with soft glow falloff
  float circle = smoothstep(0.5, 0.08, dist);

  // Gradient: Electric Cyan on Left -> Deep Indigo/Purple -> Vibrant Magenta on Right
  float t = clamp((v_worldPosition.x * 0.52 - v_worldPosition.y * 0.22) + 0.5, 0.0, 1.0);
  vec3 cyan = vec3(0.0, 0.92, 1.0);
  vec3 blue = vec3(0.18, 0.32, 0.96);
  vec3 purple = vec3(0.62, 0.16, 0.90);
  vec3 magenta = vec3(1.0, 0.08, 0.65);

  vec3 color;
  if (t < 0.35) {
    color = mix(cyan, blue, t / 0.35);
  } else if (t < 0.65) {
    color = mix(blue, purple, (t - 0.35) / 0.30);
  } else {
    color = mix(purple, magenta, (t - 0.65) / 0.35);
  }

  // Intense glowing rim highlights matching reference image (media_1792521134534.png)
  float rimGlow = pow(v_fresnel, 2.2);
  color = mix(color, vec3(1.0, 1.0, 1.0), rimGlow * 0.75);

  // Audio spike elevation highlight
  if (v_elevation > 0.01) {
    color = mix(color, vec3(1.0), clamp(v_elevation * 3.0, 0.0, 0.8));
  }

  float alpha = circle * clamp(0.65 + rimGlow * 0.35, 0.65, 1.0);
  // Soft fade on back-side points
  if (v_worldPosition.z < -0.15) {
    alpha *= smoothstep(-1.1, -0.15, v_worldPosition.z);
  }

  gl_FragColor = vec4(color, alpha);
}
`;
