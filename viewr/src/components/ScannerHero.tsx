import { useState, useEffect } from "react";
import {
  GitBranch,
  Play,
  Sparkles,
  Loader2,
  GitPullRequest,
  Search,
  Shield,
  ChevronDown,
  ChevronUp,
  Lock,
  FolderGit2,
  Github,
  HardDrive,
  Globe,
} from "lucide-react";
import { branchesByUrl, Me, Repo } from "../lib/api";
import RepoExplorerModal from "./RepoExplorerModal";

interface ScannerHeroProps {
  user: Me | null | undefined;
  onLaunch: (repoUrl: string, branch: string, autoPr: boolean, patToken?: string) => Promise<void>;
  busy: boolean;
  onOpenAuth: () => void;
}

const PRESETS = [
  { label: "Node/Express Testbed", url: "https://github.com/sgpushkar/Vulnerability-repo_test", branch: "main" },
  { label: "OWASP NodeGoat", url: "https://github.com/OWASP/NodeGoat", branch: "master" },
  { label: "Pallets Flask", url: "https://github.com/pallets/flask", branch: "main" },
  { label: "Gin Framework", url: "https://github.com/gin-gonic/gin", branch: "master" },
];

export default function ScannerHero({ user, onLaunch, busy, onOpenAuth }: ScannerHeroProps) {
  const [repoUrl, setRepoUrl] = useState("https://github.com/sgpushkar/Vulnerability-repo_test");
  const [branch, setBranch] = useState("main");
  const [branchesList, setBranchesList] = useState<string[]>(["main"]);
  const [autoPr, setAutoPr] = useState(false);
  const [fetchingBranches, setFetchingBranches] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customPat, setCustomPat] = useState("");
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);

  // Auto-fetch branches when repoUrl changes
  useEffect(() => {
    if (!repoUrl || !repoUrl.startsWith("http")) return;
    const t = setTimeout(async () => {
      setFetchingBranches(true);
      try {
        const b = await branchesByUrl(repoUrl.trim());
        if (b && b.length > 0) {
          setBranchesList(b);
          if (!b.includes(branch)) {
            setBranch(b[0]);
          }
        }
      } catch {
        setBranchesList(["main", "master"]);
      } finally {
        setFetchingBranches(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [repoUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim() || busy) return;
    const canAutoPr = autoPr && Boolean(user?.has_token || customPat.trim());
    onLaunch(repoUrl.trim(), branch, canAutoPr, customPat.trim() || undefined);
  };

  const selectPreset = (p: typeof PRESETS[number]) => {
    setRepoUrl(p.url);
    setBranch(p.branch);
    setSelectedRepo(null);
  };

  const handleSelectRepo = (r: Repo) => {
    setSelectedRepo(r);
    setRepoUrl(r.html_url);
    if (r.default_branch) {
      setBranch(r.default_branch);
    }
  };

  return (
    <section className="hero-section" id="scanner-hero">
      <div className="hero-pill">
        <Sparkles size={12} color="var(--accent)" />
        <span>Autonomous Multi-Agent Remediation</span>
      </div>

      <h1 className="hero-title">
        Find the flaw. <br />
        <span>Prove the fix.</span>
      </h1>

      <p className="hero-subtitle">
        Clones target repositories to an inspectable local workspace, synthesizes in-place surgical fixes, validates test suites in isolation, and asks if you want to push to remote.
      </p>

      {/* COMMAND CONSOLE CARD */}
      <div className="scan-card" style={{ width: "100%", maxWidth: "860px", textAlign: "left", marginTop: "12px" }}>
        <div className="scan-header">
          <div className="scan-header-left">
            <div className="brand-icon">
              <Shield size={16} />
            </div>
            <div>
              <h2 className="scan-header-title">Target Repository</h2>
              <p className="scan-header-desc">Select from your repositories, local workspaces, or enter a Git URL</p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsExplorerOpen(true)}
              style={{ fontSize: "12px", padding: "6px 14px", gap: 6, background: "rgba(56, 189, 248, 0.08)", borderColor: "rgba(56, 189, 248, 0.3)", color: "var(--accent)" }}
              id="btn-browse-repos"
            >
              <FolderGit2 size={13} />
              <span>Browse All Repositories</span>
            </button>
          </div>
        </div>

        {/* Selected Repo Pill Banner */}
        {selectedRepo && (
          <div
            style={{
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--border-hover)",
              borderRadius: 10,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {selectedRepo.source === "workspace" ? (
                <HardDrive size={15} color="var(--emerald)" />
              ) : selectedRepo.source === "github" ? (
                <Github size={15} color="var(--accent)" />
              ) : (
                <FolderGit2 size={15} color="var(--amber)" />
              )}
              <div>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-main)" }}>
                  {selectedRepo.full_name}
                </span>
                {selectedRepo.description && (
                  <span style={{ fontSize: "12px", color: "var(--fg-muted)", marginLeft: 8 }}>
                    — {selectedRepo.description.slice(0, 70)}...
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsExplorerOpen(true)}
              style={{ fontSize: "11px", color: "var(--accent)", textDecoration: "underline" }}
            >
              Change
            </button>
          </div>
        )}

        {/* Quick Benchmarks */}
        <div className="presets-bar">
          <span className="presets-label">Quick Benchmarks:</span>
          {PRESETS.map((p) => (
            <button
              type="button"
              key={p.label}
              className="preset-chip"
              onClick={() => selectPreset(p)}
              disabled={busy}
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="input-grid">
            <div className="input-group">
              <label className="input-label" htmlFor="repo-url-input">
                <span>Repository URL</span>
                <span style={{ fontSize: "11px", color: "var(--fg-dim)" }}>HTTPS Git URI</span>
              </label>
              <div className="input-box-wrapper">
                <Search size={15} className="input-icon" />
                <input
                  id="repo-url-input"
                  className="text-input"
                  type="url"
                  placeholder="https://github.com/owner/repository"
                  value={repoUrl}
                  onChange={(e) => {
                    setRepoUrl(e.target.value);
                    setSelectedRepo(null);
                  }}
                  disabled={busy}
                  required
                />
              </div>
            </div>

            <div className="input-group">
              <label className="input-label" htmlFor="branch-select">
                <span>Target Branch</span>
                {fetchingBranches && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "11px", color: "var(--accent)" }}>
                    <Loader2 size={10} className="spin" /> detecting
                  </span>
                )}
              </label>
              <div className="input-box-wrapper">
                <GitBranch size={15} className="input-icon" />
                <select
                  id="branch-select"
                  className="select-input"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  disabled={busy || fetchingBranches}
                >
                  {branchesList.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ADVANCED SETTINGS ACCORDION */}
          <div className="settings-drawer">
            <button
              type="button"
              className="settings-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Lock size={13} color="var(--accent)" />
                <span>Options & Credentials</span>
              </span>
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {showAdvanced && (
              <div className="options-row">
                <label className="checkbox-card" htmlFor="check-auto-pr">
                  <input
                    id="check-auto-pr"
                    type="checkbox"
                    checked={autoPr}
                    onChange={(e) => setAutoPr(e.target.checked)}
                    disabled={busy}
                  />
                  <div className="checkbox-text">
                    <b>Autonomous Pull Request</b>
                    <small>Push a verified <code>conduit/*</code> branch and open a PR immediately once review and tests pass.</small>
                  </div>
                </label>

                {user?.has_token ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "13px", color: "var(--emerald)", padding: "10px 4px" }}>
                    <Shield size={15} />
                    <span>Connected as <b>@{user.login}</b> — Full repository access enabled for private cloning &amp; PR creation.</span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                    <div className="input-group">
                      <label className="input-label" htmlFor="custom-pat-input">
                        <span>Personal Access Token</span>
                        <button
                          type="button"
                          onClick={onOpenAuth}
                          style={{ color: "var(--accent)", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <Github size={11} />
                          <span>Continue with GitHub</span>
                        </button>
                      </label>
                      <input
                        id="custom-pat-input"
                        type="password"
                        className="text-input"
                        placeholder="ghp_... (needed for private repos or auto-PR)"
                        value={customPat}
                        onChange={(e) => setCustomPat(e.target.value)}
                        disabled={busy}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LAUNCH BAR */}
          <div className="launch-bar">
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "12px", color: "var(--fg-dim)" }}>
              <GitPullRequest size={14} color="var(--emerald)" />
              <span>Clones to persistent local workspace · writes fixes in place</span>
            </div>

            <button
              id="btn-launch-pipeline"
              type="submit"
              className="btn-primary"
              disabled={busy || !repoUrl.trim()}
            >
              {busy ? (
                <>
                  <Loader2 size={15} className="spin" />
                  <span>Remediating...</span>
                </>
              ) : (
                <>
                  <Play size={14} fill="currentColor" />
                  <span>Launch Remediation</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <RepoExplorerModal
        isOpen={isExplorerOpen}
        onClose={() => setIsExplorerOpen(false)}
        onSelectRepo={handleSelectRepo}
        user={user}
        onOpenAuth={onOpenAuth}
      />
    </section>
  );
}
