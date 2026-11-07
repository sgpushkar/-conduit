import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import { MutableRefObject, useMemo, useRef } from "react";

type V3 = [number, number, number];
const NODES: { id: string; label: string; pos: V3; on: number; color: string; w: number }[] = [
  { id: "repo", label: "GitHub repository", pos: [0, 3.6, 0], on: 0.0, color: "#F5F5F5", w: 2.4 },
  { id: "scan", label: "Scanner Agent", pos: [-2.5, 1.5, 0], on: 0.15, color: "#C6283D", w: 1.9 },
  { id: "code", label: "Coder Agent", pos: [2.5, 1.5, 0], on: 0.22, color: "#F5F5F5", w: 1.9 },
  { id: "join", label: "findings + diff", pos: [0, -0.1, 0], on: 0.36, color: "#B8BCC2", w: 1.6 },
  { id: "rev", label: "Reviewer Agent", pos: [-2.5, -1.7, 0], on: 0.42, color: "#B8BCC2", w: 1.9 },
  { id: "test", label: "Tester Agent", pos: [2.5, -1.7, 0], on: 0.5, color: "#B8BCC2", w: 1.9 },
  { id: "out", label: "Verified patch + PR", pos: [0, -3.7, 0], on: 0.8, color: "#8BCF9B", w: 2.5 },
];
const P = Object.fromEntries(NODES.map((n) => [n.id, n.pos])) as Record<string, V3>;
const EDGES: [string, string, number, number][] = [
  ["repo", "scan", 0.05, 0.18], ["repo", "code", 0.05, 0.25], ["scan", "join", 0.2, 0.38], ["code", "join", 0.26, 0.38],
  ["join", "rev", 0.38, 0.5], ["join", "test", 0.38, 0.55], ["rev", "out", 0.58, 0.8], ["test", "out", 0.58, 0.8],
];
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ss = (x: number) => { x = clamp(x); return x * x * (3 - 2 * x); };

function Node({ n, p }: { n: (typeof NODES)[number]; p: MutableRefObject<number> }) {
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  const col = useMemo(() => new THREE.Color(n.color), [n.color]);
  useFrame(() => { const a = ss((p.current - n.on) / 0.08); mat.current.emissiveIntensity = a * 0.9; mat.current.opacity = 0.55 + a * 0.45; });
  return (
    <group position={n.pos}>
      <mesh><boxGeometry args={[n.w, 0.72, 0.5]} />
        <meshStandardMaterial ref={mat} color="#25272B" emissive={col} transparent metalness={0.6} roughness={0.35} /></mesh>
      <Html center position={[0, 0, 0.3]} style={{ pointerEvents: "none" }}><span className="node-label">{n.label}</span></Html>
    </group>
  );
}

function Edge({ e, p }: { e: (typeof EDGES)[number]; p: MutableRefObject<number> }) {
  const [a, b, t0, t1] = e;
  const line = useRef<any>(null);
  const dot = useRef<THREE.Mesh>(null!);
  const A = useMemo(() => new THREE.Vector3(...P[a]), [a]);
  const B = useMemo(() => new THREE.Vector3(...P[b]), [b]);
  const green = b === "out";
  useFrame(() => {
    const l = clamp((p.current - t0) / (t1 - t0));
    if (line.current) line.current.material.opacity = 0.18 + l * 0.7;
    dot.current.visible = l > 0 && l < 1;
    dot.current.position.lerpVectors(A, B, l);
  });
  return (
    <>
      <Line ref={line} points={[P[a], P[b]]} color={green ? "#8BCF9B" : "#B8BCC2"} lineWidth={1.5} transparent opacity={0.18} />
      <mesh ref={dot}><sphereGeometry args={[0.09, 16, 16]} /><meshBasicMaterial color={a === "scan" ? "#C6283D" : "#F5F5F5"} /></mesh>
    </>
  );
}

function Rig({ p }: { p: MutableRefObject<number> }) {
  const { camera, size } = useThree();
  useFrame(() => {
    const k = size.width / size.height < 0.8 ? 1.7 : 1;
    const reveal = ss((p.current - 0.82) / 0.18);
    const y = (2.4 - p.current * 4.8) * (1 - reveal);
    camera.position.set(Math.sin(p.current * Math.PI) * 1.6 * (1 - reveal), y, (8.5 + reveal * 5) * k);
    camera.lookAt(0, y * 0.7, 0);
  });
  return null;
}

export default function PipelineScene({ progress }: { progress: MutableRefObject<number> }) {
  return (
    <Canvas camera={{ fov: 48, position: [0, 2.4, 8.5] }} dpr={[1, 2]} gl={{ antialias: true }}>
      <color attach="background" args={["#050505"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 6]} intensity={1.4} />
      <Rig p={progress} />
      {EDGES.map((e) => <Edge key={e[0] + e[1]} e={e} p={progress} />)}
      {NODES.map((n) => <Node key={n.id} n={n} p={progress} />)}
    </Canvas>
  );
}
