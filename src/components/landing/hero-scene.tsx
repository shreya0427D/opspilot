"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

// The hero's real-time 3D model: a sapphire operations console (its screen drawn from the real
// dashboard layout), invoice sheets, and task nodes with a light pulse flowing between them.
// All animation runs in useFrame against refs — React never re-renders per frame.

const INK = "#172230";

function makeCanvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawConsole(ctx: CanvasRenderingContext2D) {
  const W = 1024, H = 640;
  ctx.fillStyle = "#172230";
  ctx.fillRect(0, 0, W, H);
  // sidebar
  ctx.fillStyle = "#1b2a3c";
  ctx.fillRect(0, 0, 200, H);
  ctx.font = "600 26px system-ui, sans-serif";
  ctx.fillStyle = "#fffcf6";
  ctx.fillText("OpsPilot", 34, 56);
  ["Dashboard", "Invoices", "Clients", "Payments", "Documents", "Tasks", "Approvals"].forEach((label, i) => {
    if (i === 0) {
      rr(ctx, 18, 84 + i * 46, 164, 36, 8, "#24354b");
      rr(ctx, 18, 90 + i * 46, 3, 24, 1, "#b89150");
    }
    ctx.font = "500 19px system-ui, sans-serif";
    ctx.fillStyle = i === 0 ? "#ffffff" : "#93a2b5";
    ctx.fillText(label, 34, 109 + i * 46);
  });
  // command bar
  rr(ctx, 230, 26, 760, 44, 10, "#1e2d40");
  ctx.fillStyle = "#93a2b5";
  ctx.font = "18px system-ui, sans-serif";
  ctx.fillText("Chase all overdue invoices", 254, 54);
  // three cards
  const cards = ["Overdue", "Outstanding", "Needs attention"];
  cards.forEach((c, i) => {
    const x = 230 + i * 258;
    rr(ctx, x, 96, 240, 132, 14, "#1e2d40");
    ctx.fillStyle = "#b9c4d2";
    ctx.font = "17px system-ui, sans-serif";
    ctx.fillText(c, x + 18, 128);
    rr(ctx, x + 18, 150, 150 - i * 20, 14, 7, i === 0 ? "#b89150" : "#3a5170");
    rr(ctx, x + 18, 176, 100, 10, 5, "#2e425a");
  });
  // timeline
  rr(ctx, 230, 248, 760, 360, 14, "#1e2d40");
  ctx.fillStyle = "#b9c4d2";
  ctx.font = "17px system-ui, sans-serif";
  ctx.fillText("Execution timeline", 252, 282);
  const steps = ["Plan the work", "Find overdue invoices", "Draft reminder emails", "Check drafts against invoices", "Ask you to approve the emails"];
  steps.forEach((s, i) => {
    const y = 318 + i * 56;
    const done = i < 4;
    ctx.fillStyle = done ? "rgba(140,195,160,.22)" : "rgba(184,145,80,.3)";
    ctx.beginPath();
    ctx.arc(266, y - 6, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = done ? "#8cc3a0" : "#d9be85";
    ctx.font = "bold 15px system-ui";
    ctx.fillText(done ? "✓" : "…", 260, y - 1);
    ctx.fillStyle = "#dfe5ec";
    ctx.font = "19px system-ui, sans-serif";
    ctx.fillText(s, 294, y);
    if (!done) {
      rr(ctx, 600, y - 24, 178, 30, 8, "rgba(184,145,80,.2)");
      ctx.fillStyle = "#d9be85";
      ctx.font = "15px system-ui";
      ctx.fillText("Awaiting approval", 614, y - 4);
    }
  });
}

function drawInvoice(paid: boolean, n: number) {
  return (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#fffcf6";
    ctx.fillRect(0, 0, 512, 680);
    ctx.fillStyle = "#b89150";
    ctx.fillRect(40, 30, 60, 4);
    ctx.fillStyle = "#172230";
    ctx.font = "700 34px Georgia, serif";
    ctx.fillText("INVOICE", 40, 76);
    ctx.font = "20px system-ui";
    ctx.fillStyle = "#5e584e";
    ctx.fillText(`No. SAMPLE-10${n}`, 40, 112);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = i % 3 === 0 ? "#cdbfa5" : "#e9e0ce";
      ctx.fillRect(40, 170 + i * 46, i % 2 ? 300 : 420, 14);
    }
    ctx.fillStyle = "#172230";
    ctx.fillRect(40, 520, 432, 2);
    ctx.font = "600 24px system-ui";
    ctx.fillText("Total", 40, 568);
    ctx.fillRect(330, 552, 142, 16);
    if (paid) {
      ctx.save();
      ctx.translate(300, 380);
      ctx.rotate(-0.28);
      ctx.strokeStyle = "#b5523f";
      ctx.lineWidth = 7;
      ctx.strokeRect(-110, -48, 220, 92);
      ctx.fillStyle = "#b5523f";
      ctx.font = "800 64px system-ui";
      ctx.fillText("PAID", -82, 24);
      ctx.restore();
    }
  };
}

interface SceneProps {
  reducedMotion: boolean;
  compact: boolean;
  dragRef: React.RefObject<{ x: number; y: number }>;
  pointerRef: React.RefObject<{ x: number; y: number }>;
}

function Scene({ reducedMotion, compact, dragRef, pointerRef }: SceneProps) {
  const root = useRef<THREE.Group>(null);
  const sheets = useRef<THREE.Group>(null);
  const pulse = useRef<THREE.Mesh>(null);
  const pulseLight = useRef<THREE.PointLight>(null);
  const { invalidate } = useThree();

  const consoleTex = useMemo(() => makeCanvasTexture(1024, 640, drawConsole), []);
  const invoiceTex = useMemo(() => [0, 1, 2].map((i) => makeCanvasTexture(512, 680, drawInvoice(i === 1, i + 1))), []);
  useEffect(() => () => [consoleTex, ...invoiceTex].forEach((t) => t.dispose()), [consoleTex, invoiceTex]);

  // Task nodes and the path information travels along.
  const nodes = useMemo(
    () => [
      new THREE.Vector3(-2.9, 1.25, 0.6),
      new THREE.Vector3(-2.1, -1.35, 0.9),
      new THREE.Vector3(0, -1.75, 1.2),
      new THREE.Vector3(2.15, -1.25, 0.9),
      new THREE.Vector3(2.85, 1.15, 0.6),
    ],
    [],
  );
  const curve = useMemo(() => new THREE.CatmullRomCurve3(nodes, false, "centripetal", 0.4), [nodes]);
  const trail = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(120));
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#b89150", transparent: true, opacity: 0.7 }));
  }, [curve]);
  useEffect(() => () => {
    trail.geometry.dispose();
    (trail.material as THREE.Material).dispose();
  }, [trail]);

  const rot = useRef({ x: 0, y: 0 });
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const scroll = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight || 1)));
    const p = pointerRef.current!;
    const d = dragRef.current!;
    const targetY = d.x + (reducedMotion ? 0 : p.x * 0.18) - 0.32;
    const targetX = d.y + (reducedMotion ? 0 : -p.y * 0.1) + 0.06 + scroll * 0.35;
    const k = 1 - Math.pow(0.001, delta);
    rot.current.y += (targetY - rot.current.y) * k;
    rot.current.x += (targetX - rot.current.x) * k;
    if (root.current) {
      root.current.rotation.set(rot.current.x, rot.current.y, 0);
      // Scroll hands the scene off to the next section: it lifts away and recedes.
      root.current.position.y = scroll * 1.6;
      root.current.position.z = -scroll * 2.2;
    }
    if (!reducedMotion && sheets.current) {
      sheets.current.children.forEach((s, i) => {
        s.position.y = s.userData.baseY + Math.sin(t * 0.7 + i * 1.7) * 0.08;
        s.rotation.z = s.userData.baseRz + Math.sin(t * 0.5 + i) * 0.02;
      });
    }
    if (pulse.current) {
      const u = reducedMotion ? 0.62 : (t * 0.12) % 1;
      const pos = curve.getPointAt(u);
      pulse.current.position.copy(pos);
      pulseLight.current?.position.copy(pos);
    }
    if (reducedMotion) invalidate();
  });

  const scale = compact ? 0.7 : 0.84;
  const sheetLayout = compact
    ? [{ x: -1.9, y: 1.4, z: 0.5, rz: 0.08, ry: 0.35 }]
    : [
        { x: -3.35, y: 0.15, z: -0.2, rz: 0.1, ry: 0.42 },
        { x: 3.3, y: -0.25, z: 0.1, rz: -0.08, ry: -0.4 },
        { x: -2.25, y: 1.55, z: -0.9, rz: -0.06, ry: 0.3 },
      ];

  return (
    <group ref={root} scale={scale}>
      {/* console body: brushed metal with an inset screen */}
      <mesh castShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[4.3, 2.75, 0.16]} />
        <meshStandardMaterial color="#24354b" metalness={0.7} roughness={0.38} />
      </mesh>
      <mesh position={[0, 0.05, 0.085]}>
        <planeGeometry args={[4.1, 2.56]} />
        <meshStandardMaterial map={consoleTex} emissiveMap={consoleTex} emissive="#ffffff" emissiveIntensity={0.9} roughness={0.45} />
      </mesh>
      {/* stand */}
      <mesh position={[0, -1.55, -0.25]} rotation={[-0.35, 0, 0]}>
        <boxGeometry args={[0.5, 0.55, 0.08]} />
        <meshStandardMaterial color="#b89150" metalness={0.45} roughness={0.35} />
      </mesh>
      <mesh position={[0, -1.82, -0.05]}>
        <cylinderGeometry args={[0.95, 1.05, 0.06, 48]} />
        <meshStandardMaterial color="#a8854a" metalness={0.45} roughness={0.32} />
      </mesh>

      {/* invoice sheets */}
      <group ref={sheets}>
        {sheetLayout.map((s, i) => (
          <mesh key={i} position={[s.x, s.y, s.z]} rotation={[0, s.ry, s.rz]} userData={{ baseY: s.y, baseRz: s.rz }}>
            <boxGeometry args={[1.05, 1.4, 0.012]} />
            <meshStandardMaterial attach="material-4" map={invoiceTex[i % 3]} roughness={0.85} />
            <meshStandardMaterial attach="material-0" color="#efe7d8" />
            <meshStandardMaterial attach="material-1" color="#efe7d8" />
            <meshStandardMaterial attach="material-2" color="#efe7d8" />
            <meshStandardMaterial attach="material-3" color="#efe7d8" />
            <meshStandardMaterial attach="material-5" color="#ddd3c1" />
          </mesh>
        ))}
      </group>

      {/* task nodes + information trail */}
      {!compact && <primitive object={trail} />}
      {!compact &&
        nodes.map((n, i) => (
          <mesh key={i} position={n}>
            <octahedronGeometry args={[i === 2 ? 0.16 : 0.11, 0]} />
            <meshStandardMaterial color={i === 4 ? "#d9be85" : "#24354b"} emissive={i === 4 ? "#b89150" : "#24354b"} emissiveIntensity={i === 4 ? 0.6 : 0.2} metalness={0.8} roughness={0.3} />
          </mesh>
        ))}
      <mesh ref={pulse}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color="#f3e2bb" />
      </mesh>
      <pointLight ref={pulseLight} color="#d9be85" intensity={2} distance={2.5} />
    </group>
  );
}

export default function HeroScene({
  reducedMotion,
  compact,
  dragRef,
  pointerRef,
  onReady,
}: SceneProps & { onReady: () => void }) {
  return (
    <Canvas
      dpr={[1, compact ? 1.5 : 1.75]}
      camera={{ position: [0, 0.25, 9.2], fov: 36 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      frameloop={reducedMotion ? "demand" : "always"}
      onCreated={({ gl }) => {
        gl.setClearColor(INK, 0);
        onReady();
      }}
    >
      <ambientLight intensity={0.75} color="#fff6e6" />
      <directionalLight position={[4, 5, 6]} intensity={1.8} color="#fff1d6" />
      <directionalLight position={[-6, 2, -4]} intensity={0.9} color="#9fb3cc" />
      <pointLight position={[0, -3, 4]} intensity={4} distance={12} color="#d9be85" />
      <Scene reducedMotion={reducedMotion} compact={compact} dragRef={dragRef} pointerRef={pointerRef} />
    </Canvas>
  );
}
