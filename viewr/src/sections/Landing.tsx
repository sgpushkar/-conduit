import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { bindProgress } from "../animations/scrollProgress";
import { hasWebGL, useReducedMotion } from "../hooks/useCapabilities";
const PipelineScene = lazy(() => import("../scenes/PipelineScene"));

export const AGENTS = [
  ["Scanner", "Runs Semgrep over the cloned repo and records severity, location and evidence. If no scanner is installed, it says so instead of pretending."],
  ["Coder", "Reads the flagged code and proposes the smallest unified diff that fixes it. It works on a throwaway copy, never your default branch."],
  ["Reviewer", "A separate pass that checks the diff against the findings and can reject it for unrelated changes or regressions."],
  ["Tester", "Applies the diff and runs the project's tests inside a network-less container. No isolation, no execution."],
];
const CAPTIONS = [
  null,
  ["Repository in", "CONDUIT clones the repository into a disposable workspace. Nothing touches the original."],
  ["Scanner finds, Coder fixes", AGENTS[0][1]],
  ["Two independent checks", "The Reviewer reads the diff while the Tester runs it in isolation. Either can say no."],
  ["Evidence converges", "Review verdict and test results are combined. A failed or missing check blocks verification."],
  ["Verified patch", "Only a diff that was approved and passed isolated tests is marked verified."],
];
const stageOf = (p: number) => (p < 0.1 ? 0 : p < 0.2 ? 1 : p < 0.5 ? 2 : p < 0.7 ? 3 : p < 0.88 ? 4 : 5);

function Hero() {
  return (
    <div className="hero">
      <h1>CONDUIT</h1>
      <p className="tag">Find the Flaw. Prove the Fix.</p>
      <p className="sub">Four agents take a GitHub repository from vulnerability to reviewed, tested patch, and show their evidence at every step.</p>
      <a className="cta" href="#run">Scan a repository</a>
    </div>
  );
}

export default function Landing() {
  const reduced = useReducedMotion();
  const [gl] = useState(hasWebGL);
  const box = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const [stage, setStage] = useState(0);
  const animated = gl && !reduced;
  useEffect(() => {
    if (!animated || !box.current) return;
    return bindProgress(box.current, progress, (p) => setStage(stageOf(p)));
  }, [animated]);

  if (!animated) {
    return (
      <header className="static-hero">
        <Hero />
        <ol className="agent-grid" aria-label="Pipeline">
          <li className="repo-node">GitHub repository</li>
          {AGENTS.map(([n, d]) => <li key={n}><b>{n} Agent</b><span>{d}</span></li>)}
          <li className="out-node">Verified patch + PR</li>
        </ol>
      </header>
    );
  }
  const cap = CAPTIONS[stage];
  return (
    <header ref={box} className="pin-track">
      <div className="pin">
        <Suspense fallback={null}><PipelineScene progress={progress} /></Suspense>
        {stage === 0 ? <Hero /> : cap && <aside className="caption" aria-live="polite"><h2>{cap[0]}</h2><p>{cap[1]}</p></aside>}
      </div>
    </header>
  );
}
