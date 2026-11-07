import { ShieldCheck, Cpu, Terminal, GitBranch } from "lucide-react";

const PRINCIPLES = [
  {
    icon: Cpu,
    title: "Surgical Patches",
    desc: "The Coder receives exact AST finding context and is constrained to output minimal unified diffs without speculative refactoring.",
  },
  {
    icon: ShieldCheck,
    title: "Adversarial Review",
    desc: "The Reviewer inspects findings and diffs independently without seeing model reasoning, acting as a skeptical security auditor.",
  },
  {
    icon: Terminal,
    title: "Zero-Network Sandboxes",
    desc: "Test validation executes in dedicated Docker containers with network disabled, dropped capabilities, and strict resource limits.",
  },
  {
    icon: GitBranch,
    title: "Protected Branches",
    desc: "Remediations target dedicated conduit/* branches only. Base and default branches are protected against direct writes.",
  },
];

export default function ArchitecturePrinciples() {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 12 }} id="principles-section">
      <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <h2 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--fg-main)" }}>
          Verification Architecture
        </h2>
        <p style={{ fontSize: "13px", color: "var(--fg-muted)", maxWidth: "52ch" }}>
          A patch is not a fix until independently reviewed and proven in isolated tests.
        </p>
      </div>

      <div className="principles-grid">
        {PRINCIPLES.map((p, idx) => {
          const Icon = p.icon;
          return (
            <div key={idx} className="principle-card">
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "rgba(255, 255, 255, 0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--fg-muted)",
                  border: "1px solid var(--border-subtle)",
                  marginBottom: 4,
                }}
              >
                <Icon size={16} />
              </div>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
