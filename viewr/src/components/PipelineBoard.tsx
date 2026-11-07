import { Bug, Code2, ShieldAlert, Terminal, CheckCircle2, Loader2, Clock } from "lucide-react";
import { Run, State, TERMINAL } from "../lib/api";

interface PipelineBoardProps {
  run: Run;
}

interface AgentCardConfig {
  id: string;
  step: string;
  stateKey: State;
  title: string;
  role: string;
  icon: typeof Bug;
  desc: string;
}

const AGENTS: AgentCardConfig[] = [
  {
    id: "scanner",
    step: "01",
    stateKey: "scanning",
    title: "Scanner",
    role: "Semgrep SAST",
    icon: Bug,
    desc: "Clones repository into isolated workspace and flags AST vulnerabilities.",
  },
  {
    id: "coder",
    step: "02",
    stateKey: "patching",
    title: "Coder",
    role: "Gemini 3.5 Flash",
    icon: Code2,
    desc: "Synthesizes minimal surgical unified diff targeting findings and verifies git apply.",
  },
  {
    id: "reviewer",
    step: "03",
    stateKey: "reviewing",
    title: "Reviewer",
    role: "Adversarial Audit",
    icon: ShieldAlert,
    desc: "Evaluates findings and diff with independent LLM pass to prevent regressions.",
  },
  {
    id: "tester",
    step: "04",
    stateKey: "testing",
    title: "Tester",
    role: "Container Sandbox",
    icon: Terminal,
    desc: "Applies patch and runs test suite in network-isolated container.",
  },
];

export default function PipelineBoard({ run }: PipelineBoardProps) {
  const getStatus = (stateKey: State) => {
    const isCurrent = run.state === stateKey;
    const isCompleted = run.history.some((h) => h.state === stateKey);
    const isFailed = run.state === "failed" || run.state === "rejected";

    if (isCurrent) return "running";
    if (isCompleted) return "done";
    if (isFailed && TERMINAL.includes(run.state)) return "waiting";
    return "waiting";
  };

  const formatRepoName = (url: string) => {
    return url.replace(/^https?:\/\/github\.com\//, "");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: "0 2px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px" }}>
          <div className="status-dot"></div>
          <span style={{ fontWeight: 600, color: "var(--fg-main)" }}>
            {formatRepoName(run.repo_url)}
          </span>
          {run.base_sha && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--fg-dim)", background: "rgba(255,255,255,0.04)", padding: "1px 6px", borderRadius: 4 }}>
              {run.base_sha.slice(0, 7)}
            </span>
          )}
        </div>
        <span style={{ fontSize: "12px", color: "var(--fg-muted)" }}>
          Attempt <span style={{ color: "var(--fg-main)", fontWeight: 600 }}>{run.attempts || 1}</span> of 2
        </span>
      </div>

      <div className="pipeline-track">
        {AGENTS.map((agent) => {
          const status = getStatus(agent.stateKey);
          const Icon = agent.icon;

          return (
            <div
              key={agent.id}
              className={`agent-card ${status}`}
              id={`agent-card-${agent.id}`}
            >
              <div className="agent-header">
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className="agent-icon-box">
                    <Icon size={16} />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--fg-dim)" }}>
                    {agent.step}
                  </span>
                </div>
                <div className={`agent-state-badge ${status}`}>
                  {status === "running" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Loader2 size={10} className="spin" /> RUNNING
                    </span>
                  ) : status === "done" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <CheckCircle2 size={10} /> DONE
                    </span>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Clock size={10} /> QUEUED
                    </span>
                  )}
                </div>
              </div>

              <div className="agent-info">
                <h4>{agent.title}</h4>
                <div style={{ fontSize: "11px", fontWeight: 500, color: "var(--accent)", marginTop: 1 }}>
                  {agent.role}
                </div>
                <p>{agent.desc}</p>
              </div>

              {/* Dynamic metrics if available */}
              {agent.id === "scanner" && run.scan && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8, marginTop: "auto", fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--fg-dim)" }}>Findings:</span>
                  <b style={{ color: run.scan.findings.length > 0 ? "var(--crimson)" : "var(--emerald)" }}>
                    {run.scan.findings.length}
                  </b>
                </div>
              )}

              {agent.id === "coder" && run.patch && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8, marginTop: "auto", fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--fg-dim)" }}>Files:</span>
                  <b style={{ color: "var(--accent)" }}>
                    {run.files.length || 1}
                  </b>
                </div>
              )}

              {agent.id === "reviewer" && run.review && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8, marginTop: "auto", fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--fg-dim)" }}>Verdict:</span>
                  <b style={{ color: run.review.verdict === "approved" ? "var(--emerald)" : "var(--crimson)", textTransform: "capitalize" }}>
                    {run.review.verdict || "pending"}
                  </b>
                </div>
              )}

              {agent.id === "tester" && run.tests && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 8, marginTop: "auto", fontSize: "11px", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--fg-dim)" }}>Passed:</span>
                  <b style={{ color: run.verified ? "var(--emerald)" : "var(--amber)" }}>
                    {run.tests.checks.filter(c => c.status === "passed").length}/{run.tests.checks.length}
                  </b>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
