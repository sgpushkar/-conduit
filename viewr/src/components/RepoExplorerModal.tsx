import { useState, useEffect } from "react";
import {
  X,
  Search,
  FolderGit2,
  Github,
  HardDrive,
  ShieldAlert,
  Loader2,
  Lock,
  Globe,
  GitBranch,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { Repo, repos, Me } from "../lib/api";

interface RepoExplorerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRepo: (repo: Repo) => void;
  user: Me | null | undefined;
  onOpenAuth?: () => void;
}

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: "#f7df1e",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Go: "#00ADD8",
  Local: "#10b981",
};

export default function RepoExplorerModal({
  isOpen,
  onClose,
  onSelectRepo,
  user,
  onOpenAuth,
}: RepoExplorerModalProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "github" | "workspace" | "benchmark">("all");
  const [repoList, setRepoList] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadRepos = async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await repos(q);
      setRepoList(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch repositories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRepos(query);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      loadRepos(query);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  if (!isOpen) return null;

  const filtered = repoList.filter((r) => {
    if (tab === "all") return true;
    return r.source === tab;
  });

  const counts = {
    all: repoList.length,
    github: repoList.filter((r) => r.source === "github").length,
    workspace: repoList.filter((r) => r.source === "workspace").length,
    benchmark: repoList.filter((r) => r.source === "benchmark").length,
  };

  return (
    <div className="modal-overlay" onClick={onClose} id="modal-repo-explorer-overlay">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 760, width: "100%", maxHeight: "88vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}
      >
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="brand-icon" style={{ width: 32, height: 32 }}>
              <FolderGit2 size={16} />
            </div>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--fg-main)" }}>Select Repository</h3>
              <p style={{ fontSize: "12px", color: "var(--fg-muted)" }}>Browse GitHub repositories, local workspaces, or benchmark testbeds</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Search & Tabs */}
        <div style={{ padding: "14px 24px", display: "flex", flexDirection: "column", gap: 12, borderBottom: "1px solid var(--border-subtle)", background: "rgba(255, 255, 255, 0.01)" }}>
          <div className="input-box-wrapper">
            <Search size={15} className="input-icon" />
            <input
              type="text"
              className="text-input"
              placeholder="Search repositories by name, description, or language..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {loading && <Loader2 size={14} className="spin" style={{ position: "absolute", right: 14, color: "var(--accent)" }} />}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`preset-chip ${tab === "all" ? "active" : ""}`}
              onClick={() => setTab("all")}
              style={tab === "all" ? { background: "rgba(255, 255, 255, 0.1)", color: "#fff", borderColor: "var(--border-hover)" } : {}}
            >
              All Repositories ({counts.all})
            </button>
            <button
              type="button"
              className={`preset-chip ${tab === "github" ? "active" : ""}`}
              onClick={() => setTab("github")}
              style={tab === "github" ? { background: "rgba(255, 255, 255, 0.1)", color: "#fff", borderColor: "var(--border-hover)" } : {}}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <Github size={12} /> GitHub ({counts.github})
              </span>
            </button>
            <button
              type="button"
              className={`preset-chip ${tab === "workspace" ? "active" : ""}`}
              onClick={() => setTab("workspace")}
              style={tab === "workspace" ? { background: "rgba(255, 255, 255, 0.1)", color: "#fff", borderColor: "var(--border-hover)" } : {}}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <HardDrive size={12} /> Local Workspaces ({counts.workspace})
              </span>
            </button>
            <button
              type="button"
              className={`preset-chip ${tab === "benchmark" ? "active" : ""}`}
              onClick={() => setTab("benchmark")}
              style={tab === "benchmark" ? { background: "rgba(255, 255, 255, 0.1)", color: "#fff", borderColor: "var(--border-hover)" } : {}}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <ShieldAlert size={12} /> Benchmarks ({counts.benchmark})
              </span>
            </button>
          </div>
        </div>

        {/* List Content */}
        <div style={{ padding: "16px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
          {error && (
            <div className="alert-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          {tab === "github" && !user?.has_token && (
            <div
              style={{
                background: "rgba(56, 189, 248, 0.06)",
                border: "1px solid rgba(56, 189, 248, 0.2)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Github size={15} color="var(--accent)" />
                <span style={{ fontSize: "12px", color: "var(--fg-main)" }}>
                  Connect your GitHub account to load your private and organization repositories.
                </span>
              </div>
              {onOpenAuth && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  style={{ fontSize: "11px", padding: "4px 10px", gap: 5, flexShrink: 0 }}
                >
                  <Github size={12} />
                  <span>Continue with GitHub</span>
                </button>
              )}
            </div>
          )}

          {filtered.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--fg-muted)" }}>
              <FolderGit2 size={32} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
              <p style={{ fontSize: "14px", fontWeight: 500 }}>No repositories found</p>
              <p style={{ fontSize: "12px", color: "var(--fg-dim)", marginTop: 4 }}>
                {tab === "github" && !user?.has_token
                  ? "Connect your GitHub account or Personal Access Token to view your repositories."
                  : "Try searching with a different keyword or enter a custom Git URL directly."}
              </p>
              {tab === "github" && !user?.has_token && onOpenAuth && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                  style={{ marginTop: 14, gap: 8, display: "inline-flex" }}
                >
                  <Github size={14} />
                  <span>Continue with GitHub</span>
                </button>
              )}
            </div>
          )}

          {filtered.map((r) => {
            const langColor = r.language ? (LANGUAGE_COLORS[r.language] || "#94a3b8") : "#94a3b8";

            return (
              <div
                key={r.full_name}
                className="finding-item"
                style={{
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "14px 16px",
                  borderRadius: 10,
                }}
                onClick={() => {
                  onSelectRepo(r);
                  onClose();
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {r.source === "github" ? (
                      <Github size={14} color="var(--fg-muted)" />
                    ) : r.source === "workspace" ? (
                      <HardDrive size={14} color="var(--emerald)" />
                    ) : (
                      <ShieldAlert size={14} color="var(--amber)" />
                    )}

                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg-main)", letterSpacing: "-0.01em" }}>
                      {r.full_name}
                    </span>

                    {r.private ? (
                      <span className="brand-badge" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "10px" }}>
                        <Lock size={9} /> Private
                      </span>
                    ) : (
                      <span className="brand-badge" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: "10px" }}>
                        <Globe size={9} /> Public
                      </span>
                    )}

                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        padding: "1px 6px",
                        borderRadius: 4,
                        background:
                          r.source === "workspace"
                            ? "var(--emerald-soft)"
                            : r.source === "github"
                            ? "var(--accent-soft)"
                            : "var(--amber-soft)",
                        color:
                          r.source === "workspace"
                            ? "var(--emerald)"
                            : r.source === "github"
                            ? "var(--accent)"
                            : "var(--amber)",
                      }}
                    >
                      {r.source === "workspace" ? "Local Workspace" : r.source === "github" ? "GitHub" : "Benchmark"}
                    </span>
                  </div>

                  {r.description && (
                    <p style={{ fontSize: "12px", color: "var(--fg-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.description}
                    </p>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: "11px", color: "var(--fg-dim)", marginTop: 2 }}>
                    {r.language && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: langColor }} />
                        <span>{r.language}</span>
                      </span>
                    )}
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <GitBranch size={11} /> {r.default_branch || "main"}
                    </span>
                    {r.updated_at && <span>{r.updated_at}</span>}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: "6px 12px", fontSize: "12px", gap: 6, flexShrink: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectRepo(r);
                    onClose();
                  }}
                >
                  <span>Select</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 24px", borderTop: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255, 255, 255, 0.01)" }}>
          <span style={{ fontSize: "12px", color: "var(--fg-dim)" }}>
            Showing {filtered.length} of {repoList.length} repositories
          </span>
          <button type="button" className="btn-secondary" onClick={onClose} style={{ fontSize: "12px", padding: "6px 12px" }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
