/**
 * LightspeedCanvas
 * -----------------------------------------------------------------------------
 * A raw-WebGL "jump to hyperspace" backdrop, deliberately subtle. No scene
 * graph, no camera, no post-processing chain, just a single draw call per
 * frame over an instanced starfield, composited through a feedback pass for
 * motion-blur trails.
 *
 * Each particle lives on a fixed radial from the origin, with a per-particle
 * phase that cycles 0..1 over time. Radius grows with phase^3 so particles
 * spend most of their life crawling out of the core and then snap past the
 * viewport edge (the classic Star Wars lightspeed acceleration curve). On
 * each new cycle the particle is re-seeded with a fresh angle, the effect
 * reads as an infinite forward jump with no visible loop.
 *
 * Runtime budget:
 *   - ~5k particles
 *   - single VBO, two FBOs for the feedback blur
 *   - no per-frame allocation
 *
 * We keep this entirely in-file (no external shaders) so the marketing
 * page bundle stays tight.
 */

import * as React from "react";

// ────────────────────────────────────────────────────────────────────────────
// Shader sources
// ────────────────────────────────────────────────────────────────────────────

const VERTEX_SRC = /* glsl */ `#version 300 es
precision highp float;

// Per-particle seeds, two independent uniform randoms in [0, 1).
// x seeds the radial angle, y seeds the phase offset so every particle is
// at a different point in its lifecycle.
in vec2 a_seed;

uniform float u_time;
uniform float u_pixelRatio;
uniform float u_speed;    // cycles per second, how "fast" the warp runs
uniform float u_intro;    // 0..1 first-paint envelope, engines spooling up

out float v_life;         // 0..1 phase (0 = just born, 1 = about to die)
out float v_radius;       // actual NDC radius this particle is at
out vec2  v_dir;          // unit radial direction (cos a, sin a)
out float v_intro;        // forwarded so the fragment shader can dim alpha

void main() {
  // Deterministic angle. Multiplying by TAU maps seed.x into [0, 2π).
  float angle = a_seed.x * 6.2831853;

  // Cycle each particle through phase 0..1. Offsetting by seed.y staggers
  // births so the starfield looks organic rather than pulsing in lockstep.
  float phase = fract(a_seed.y + u_time * u_speed);

  // Radius as phase^3, particles linger near the core then accelerate
  // hard toward the edge. This is the ease that gives Star Wars its snap.
  float r = pow(phase, 3.0) * 2.1;

  vec2 dir = vec2(cos(angle), sin(angle));
  vec2 pos = dir * r;

  // Point size scales with phase too, streaks grow as they fly out.
  // Cap lower than before so nothing reads as a hot spotlight.
  // We also shrink particles slightly during the intro, undersized streaks
  // look restrained, like light sources still coming online.
  float sizeIntro = mix(0.55, 1.0, u_intro);
  float pointSize = mix(1.2, 16.0, pow(phase, 2.0)) * u_pixelRatio * sizeIntro;

  gl_Position = vec4(pos, 0.0, 1.0);
  gl_PointSize = pointSize;

  v_life = phase;
  v_radius = r;
  v_dir = dir;
  v_intro = u_intro;
}
`;

const FRAGMENT_SRC = /* glsl */ `#version 300 es
precision highp float;

in float v_life;
in float v_radius;
in vec2  v_dir;
in float v_intro;

out vec4 fragColor;

void main() {
  // Each gl_Point is a square; rotate its local coordinates into the
  // particle's radial frame so we can stretch along the streak axis.
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float c = v_dir.x;
  float s = v_dir.y;
  vec2 local = vec2(pc.x * c + pc.y * s, -pc.x * s + pc.y * c);

  // Long on x (streak direction), narrow on y. Stretch increases with life
  // so young particles read as dots and old ones read as long streaks.
  float stretch = mix(2.0, 7.0, v_life);
  local.x /= stretch;

  float d = length(local);
  float core = smoothstep(0.85, 0.0, d);
  float halo = smoothstep(1.1, 0.3, d) * 0.18;

  // CENTER DEAD-ZONE. The text lives at r ≈ 0. We want particles to be
  // invisible inside r=0.4 and only fully lit past r=0.65, so streaks
  // emerge from a wide empty hole and trail outward toward the edge.
  float radialGate = smoothstep(0.4, 0.65, v_radius);

  // Also fade out at the far edge so streaks dissolve into black rather
  // than clipping hard at the viewport corner.
  float edgeFade = 1.0 - smoothstep(1.5, 1.9, v_radius);

  // First-paint envelope. Cube it so the rise is gentle at the start
  // (engines humming, not yet roaring) and accelerates into full bloom.
  // v_intro is clamped 0..1 on the CPU side so we trust it here.
  float introGain = v_intro * v_intro * v_intro;

  float alpha = (core + halo)
    * radialGate
    * edgeFade
    // Global dimming, the whole field should read as a whisper.
    * 0.32
    * introGain;
  if (alpha < 0.01) discard;

  // Cool white with a subtle blue tint. No violet, no hot orange, we
  // want "calm hyperspace," not "breakdown of causality."
  vec3 cool = vec3(0.74, 0.84, 1.0);
  vec3 hot = vec3(1.0, 1.0, 1.0);
  vec3 rgb = mix(cool, hot, core);

  fragColor = vec4(rgb, alpha);
}
`;

// Full-screen feedback pass, decays the previous frame into the next for
// the motion-blur trails that sell the lightspeed look.
const FEEDBACK_VERTEX = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FEEDBACK_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_prev;
uniform float u_decay;
void main() {
  vec4 prev = texture(u_prev, v_uv);
  fragColor = vec4(prev.rgb * u_decay, prev.a * u_decay);
}
`;

// ────────────────────────────────────────────────────────────────────────────
// GL helpers
// ────────────────────────────────────────────────────────────────────────────

function compileShader(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link failed: ${info}`);
  }
  return prog;
}

// ────────────────────────────────────────────────────────────────────────────
// React component
// ────────────────────────────────────────────────────────────────────────────

export interface LightspeedCanvasProps {
  /** Number of streaking particles. Default 2.5k, intentionally sparse. */
  density?: number;
  /** Warp speed in lifecycles-per-second. Default 0.16, slow and patient. */
  speed?: number;
  /** Optional className for positioning. */
  className?: string;
}

export const LightspeedCanvas: React.FC<LightspeedCanvasProps> = ({
  density = 2_500,
  speed = 0.16,
  className,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      premultipliedAlpha: true,
      alpha: true,
    });
    if (!gl) {
      canvas.style.display = "none";
      return;
    }

    // ─── Compile programs ────────────────────────────────────────────────
    let particleProg: WebGLProgram;
    let feedbackProg: WebGLProgram;
    try {
      particleProg = linkProgram(gl, VERTEX_SRC, FRAGMENT_SRC);
      feedbackProg = linkProgram(gl, FEEDBACK_VERTEX, FEEDBACK_FRAGMENT);
    } catch (err) {
      console.error("[LightspeedCanvas] shader failure", err);
      return;
    }

    const uTime = gl.getUniformLocation(particleProg, "u_time")!;
    const uPx = gl.getUniformLocation(particleProg, "u_pixelRatio")!;
    const uSpeed = gl.getUniformLocation(particleProg, "u_speed")!;
    const uIntro = gl.getUniformLocation(particleProg, "u_intro")!;

    const uFbPrev = gl.getUniformLocation(feedbackProg, "u_prev")!;
    const uFbDecay = gl.getUniformLocation(feedbackProg, "u_decay")!;

    // ─── Particle attributes ─────────────────────────────────────────────
    const seeds = new Float32Array(density * 2);
    for (let i = 0; i < density * 2; i++) seeds[i] = Math.random();

    const seedBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const aSeed = gl.getAttribLocation(particleProg, "a_seed");
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.enableVertexAttribArray(aSeed);
    gl.vertexAttribPointer(aSeed, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    // ─── Fullscreen quad for the feedback pass ───────────────────────────
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const quadVao = gl.createVertexArray()!;
    gl.bindVertexArray(quadVao);
    const aPos = gl.getAttribLocation(feedbackProg, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // ─── Ping-pong FBOs for motion blur ──────────────────────────────────
    type Pass = { fbo: WebGLFramebuffer; tex: WebGLTexture };
    function makePass(w: number, h: number): Pass {
      const tex = gl!.createTexture()!;
      gl!.bindTexture(gl!.TEXTURE_2D, tex);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        w,
        h,
        0,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        null,
      );
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
      gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
      const fbo = gl!.createFramebuffer()!;
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
      gl!.framebufferTexture2D(
        gl!.FRAMEBUFFER,
        gl!.COLOR_ATTACHMENT0,
        gl!.TEXTURE_2D,
        tex,
        0,
      );
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      return { fbo, tex };
    }

    let passA: Pass | null = null;
    let passB: Pass | null = null;
    let backbufW = 0;
    let backbufH = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.floor(canvas!.clientWidth * dpr);
      const h = Math.floor(canvas!.clientHeight * dpr);
      if (w === backbufW && h === backbufH) return;
      canvas!.width = w;
      canvas!.height = h;
      backbufW = w;
      backbufH = h;
      if (passA) {
        gl!.deleteTexture(passA.tex);
        gl!.deleteFramebuffer(passA.fbo);
      }
      if (passB) {
        gl!.deleteTexture(passB.tex);
        gl!.deleteFramebuffer(passB.fbo);
      }
      passA = makePass(w, h);
      passB = makePass(w, h);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ─── Render loop ─────────────────────────────────────────────────────
    const start = performance.now();
    // Duration (seconds) of the first-paint envelope, how long the warp
    // takes to spool from a whisper to full bloom. Tuned to overlap with
    // the CSS entrance choreography on .site-root / .site-hero__*.
    const INTRO_DURATION = 1.6;
    let raf = 0;

    const frame = (now: number) => {
      const elapsed = (now - start) / 1000;

      // Smoothstep-shaped intro envelope: slow start, slow finish, quick
      // middle. Evaluated per-frame rather than ticked, so pausing the
      // tab and resuming doesn't desync the envelope from elapsed time.
      const t = Math.min(1, Math.max(0, elapsed / INTRO_DURATION));
      const intro = t * t * (3 - 2 * t);

      // Warp speed spools from ~30% up to 100% over the intro. The
      // fragment shader already cubes u_intro to dim the alpha, so we
      // don't need to dim here, just choose the tempo.
      const effectiveSpeed = speed * (0.3 + 0.7 * intro);

      if (!passA || !passB) return;

      // ── Feedback decay: fade the previous frame into passB ──────────
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, passB.fbo);
      gl!.viewport(0, 0, backbufW, backbufH);
      gl!.useProgram(feedbackProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, passA.tex);
      gl!.uniform1i(uFbPrev, 0);
      // A heavy decay would eat the trails; a light one would leave them
      // smeared into a haze. 0.82 keeps short, crisp streaks without the
      // whole viewport fogging up.
      gl!.uniform1f(uFbDecay, 0.82);
      gl!.bindVertexArray(quadVao);
      gl!.disable(gl!.BLEND);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

      // ── Particle pass (additive) ────────────────────────────────────
      gl!.useProgram(particleProg);
      gl!.uniform1f(uTime, elapsed);
      gl!.uniform1f(uPx, Math.min(window.devicePixelRatio || 1, 2));
      gl!.uniform1f(uSpeed, effectiveSpeed);
      gl!.uniform1f(uIntro, intro);

      gl!.enable(gl!.BLEND);
      gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE);
      gl!.bindVertexArray(vao);
      gl!.drawArrays(gl!.POINTS, 0, density);

      // ── Blit passB → default framebuffer ────────────────────────────
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.viewport(0, 0, backbufW, backbufH);
      gl!.useProgram(feedbackProg);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, passB.tex);
      gl!.uniform1i(uFbPrev, 0);
      gl!.uniform1f(uFbDecay, 1.0);
      gl!.bindVertexArray(quadVao);
      gl!.disable(gl!.BLEND);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

      // Swap so next frame fades THIS frame.
      const tmp = passA;
      passA = passB;
      passB = tmp;

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    // ── Pause when the tab's hidden ─────────────────────────────────────
    const onVis = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      ro.disconnect();
      gl.deleteBuffer(seedBuf);
      gl.deleteBuffer(quadBuf);
      gl.deleteVertexArray(vao);
      gl.deleteVertexArray(quadVao);
      gl.deleteProgram(particleProg);
      gl.deleteProgram(feedbackProg);
      if (passA) {
        gl.deleteTexture(passA.tex);
        gl.deleteFramebuffer(passA.fbo);
      }
      if (passB) {
        gl.deleteTexture(passB.tex);
        gl.deleteFramebuffer(passB.fbo);
      }
    };
  }, [density, speed]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        background:
          "radial-gradient(ellipse at center, #05050c 0%, #000000 70%)",
      }}
    />
  );
};
