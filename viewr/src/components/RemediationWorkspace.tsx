import { useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  FileCode,
  XCircle,
  Copy,
  Download,
  GitPullRequest,
  Terminal,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Lock,
  HardDrive,
  GitBranch,
  CheckCircle2,
  Folder,
  Github,
} from "lucide-react";
import { Run, approve, reject, getRun } from "../lib/api";

interface RemediationWorkspaceProps {
  run: Run;
  onRunUpdate: (updated: Run) => void;
  onReset: () => void;
  onOpenAuth?: () => void;
}

export default function RemediationWorkspace({ run, onRunUpdate, onReset, onOpenAuth }: RemediationWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"findings" | "diff" | "review" | "tests">("findings");
  const [copiedDiff, setCopiedDiff] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [branch, setBranch] = useState(run.branch || `conduit/fix-${run.id.slice(0, 8)}`);
  const [commitMsg, setCommitMsg] = useState("fix: automated security remediation by CONDUIT");
  const [patToken, setPatToken] = useState("");
  const [approving, setApproving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [showPrOptions, setShowPrOptions] = useState(false);

  const isAwaitingApproval = run.state === "awaiting_approval";
  const isTerminal = ["completed", "failed", "rejected", "cancelled"].includes(run.state);

  const handleCopyDiff = () => {
    if (!run.patch?.diff) return;
    navigator.clipboard.writeText(run.patch.diff);
    setCopiedDiff(true);
    setTimeout(() => setCopiedDiff(false), 2000);
  };

  const handleCopyPath = () => {
    if (!run.local_path) return;
    navigator.clipboard.writeText(run.local_path);
    setCopiedPath(true);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  const handleDownloadPatch = () => {
    if (!run.patch?.diff) return;
    const blob = new Blob([run.patch.diff], { type: "text/x-diff;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `conduit-${run.id.slice(0, 8)}.patch`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleAction = async (action: "pr" | "branch" | "local" | "discard") => {
    setApproving(true);
    setActionError("");
    try {
      if (action === "discard") {
        await reject(run.id);
      } else {
        await approve(run.id, action, branch, commitMsg, patToken.trim() || undefined);
      }
      const refreshed = await getRun(run.id);
      onRunUpdate(refreshed);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `Failed to execute ${action} action`);
    } finally {
      setApproving(false);
    }
  };

  return (
    <section className="results-card" id="remediation-workspace">
      {/* VERDICT BANNER */}
      <div className={`verdict-banner ${run.verified ? "verified" : run.state === "failed" || run.state === "rejected" ? "failed" : "neutral"}`}>
        <div className="verdict-left">
          <div className="verdict-icon">
            {run.pr_url ? (
              <GitPullRequest size={18} />
            ) : run.verified ? (
              <ShieldCheck size={18} />
            ) : run.state === "rejected" ? (
              <XCircle size={18} />
            ) : (
              <ShieldAlert size={18} />
            )}
          </div>
          <div>
            <h3 className="verdict-title">
              {run.pr_url
                ? "Pull Request Successfully Created"
                : isAwaitingApproval
                  ? "Remediation Applied & Verified Locally"
                  : run.state === "rejected"
                    ? "Remediation Rejected by User"
                    : run.state === "failed"
                      ? "Pipeline Run Failed"
                      : run.state === "completed"
                        ? "Pipeline Run Completed"
                        : "Remediation in Progress"}
            </h3>
            <p className="verdict-subtitle">
              {run.pr_url ? (
                <a href={run.pr_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {run.pr_url} <ExternalLink size={11} />
                </a>
              ) : isAwaitingApproval ? (
                "Fixes applied to local repository workspace. Review changes below and choose your push action."
              ) : run.error ? (
                run.error
              ) : (
                run.history[run.history.length - 1]?.note || "Executing active pipeline stage."
              )}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {run.patch?.diff && (
            <button
              className="btn-secondary"
              onClick={handleDownloadPatch}
              id="btn-download-patch"
              type="button"
            >
              <Download size={13} />
              <span>Download .patch</span>
            </button>
          )}

          {isTerminal && (
            <button className="btn-secondary" onClick={onReset} id="btn-start-another">
              <RefreshCw size={12} />
              <span>New Scan</span>
            </button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="alert-error" role="alert">
          <AlertTriangle size={15} />
          <span>{actionError}</span>
        </div>
      )}

      {/* "READY TO PUSH?" INTERACTIVE DECISION CARD */}
      {isAwaitingApproval && !run.pr_url && (
        <div className="approval-panel" id="panel-push-decision" style={{ gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={16} color="var(--emerald)" />
              <h4 style={{ fontSize: "15px", fontWeight: 600 }}>Ready to Push Changes?</h4>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "12px", color: "var(--fg-muted)" }}>
              <span>Branch:</span>
              <code style={{ color: "var(--accent)", background: "rgba(255, 255, 255, 0.05)", padding: "2px 7px", borderRadius: 4 }}>
                {run.branch || branch}
              </code>
              {run.commit_sha && (
                <code style={{ color: "var(--fg-dim)", background: "rgba(255, 255, 255, 0.03)", padding: "2px 6px", borderRadius: 4 }}>
                  {run.commit_sha.slice(0, 7)}
                </code>
              )}
            </div>
          </div>

          {/* Local Workspace Path on Disk */}
          {run.local_path && (
            <div
              style={{
                background: "rgba(0, 0, 0, 0.35)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Folder size={14} color="var(--emerald)" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: "var(--fg-dim)" }}>Cloned Workspace on Disk:</div>
                  <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--fg-main)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {run.local_path}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCopyPath}
                style={{ fontSize: "11px", padding: "4px 8px", gap: 4, flexShrink: 0 }}
              >
                <Copy size={11} />
                <span>{copiedPath ? "Copied" : "Copy Path"}</span>
              </button>
            </div>
          )}

          {/* Interactive Decision Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 4 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {/* Option 1: Push & Open PR */}
              <button
                id="btn-confirm-approve"
                className="btn-primary"
                disabled={approving}
                onClick={() => handleAction("pr")}
              >
                {approving ? <Loader2 size={14} className="spin" /> : <GitPullRequest size={14} />}
                <span>Push & Open PR</span>
              </button>

              {/* Option 2: Push Branch Only */}
              <button
                id="btn-push-branch-only"
                className="btn-secondary"
                disabled={approving}
                onClick={() => handleAction("branch")}
              >
                <GitBranch size={13} />
                <span>Push Branch Only</span>
              </button>

              {/* Option 3: Keep Local Only */}
              <button
                id="btn-keep-local"
                className="btn-secondary"
                disabled={approving}
                onClick={() => handleAction("local")}
              >
                <HardDrive size={13} color="var(--emerald)" />
                <span>Keep Local Only</span>
              </button>

              {/* Option 4: Discard Changes */}
              <button
                id="btn-reject-patch"
                className="btn-danger"
                disabled={approving}
                onClick={() => handleAction("discard")}
              >
                <XCircle size={13} />
                <span>Discard</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPrOptions(!showPrOptions)}
                style={{ color: "var(--accent)", fontSize: "12px", marginLeft: "auto", textDecoration: "underline" }}
              >
                {showPrOptions ? "Hide PR Details" : "Edit PR Branch & Title"}
              </button>
            </div>

            {/* Expandable PR Options */}
            {showPrOptions && (
              <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <div className="approval-grid">
                  <div className="input-group">
                    <label className="input-label" htmlFor="input-pr-branch">
                      <span>Remediation Branch</span>
                    </label>
                    <input
                      id="input-pr-branch"
                      className="text-input"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      disabled={approving}
                    />
                  </div>

                  <div className="input-group">
                    <label className="input-label" htmlFor="input-pr-title">
                      <span>Commit & PR Title</span>
                    </label>
                    <input
                      id="input-pr-title"
                      className="text-input"
                      value={commitMsg}
                      onChange={(e) => setCommitMsg(e.target.value)}
                      disabled={approving}
                    />
                  </div>
                </div>

                {!run.policy.actions.some((a) => a.includes("token")) && (
                  <div className="input-group">
                    <label className="input-label" htmlFor="input-approval-pat">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <Lock size={12} color="var(--accent)" />
                        <span>GitHub Token (Required if pushing without session login)</span>
                      </span>
                      {onOpenAuth ? (
                        <button
                          type="button"
                          onClick={onOpenAuth}
                          style={{ color: "var(--accent)", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          <Github size={11} />
                          <span>Continue with GitHub</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: "11px", color: "var(--fg-dim)" }}>repo scope required</span>
                      )}
                    </label>
                    <input
                      id="input-approval-pat"
                      type="password"
                      className="text-input"
                      placeholder="ghp_... (used only for this push)"
                      value={patToken}
                      onChange={(e) => setPatToken(e.target.value)}
                      disabled={approving}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* DASHBOARD TABS */}
      <div className="dashboard-tabs">
        <button
          className={`tab-btn ${activeTab === "findings" ? "active" : ""}`}
          onClick={() => setActiveTab("findings")}
          id="tab-findings"
        >
          <AlertTriangle size={13} />
          <span>Findings</span>
          {run.scan && <span className="tab-count">{run.scan.findings.length}</span>}
        </button>

        <button
          className={`tab-btn ${activeTab === "diff" ? "active" : ""}`}
          onClick={() => setActiveTab("diff")}
          id="tab-diff"
        >
          <FileCode size={13} />
          <span>Unified Diff</span>
          {run.patch && <span className="tab-count">{run.files.length || 1}</span>}
        </button>

        <button
          className={`tab-btn ${activeTab === "review" ? "active" : ""}`}
          onClick={() => setActiveTab("review")}
          id="tab-review"
        >
          <ShieldCheck size={13} />
          <span>Reviewer Audit</span>
        </button>

        <button
          className={`tab-btn ${activeTab === "tests" ? "active" : ""}`}
          onClick={() => setActiveTab("tests")}
          id="tab-tests"
        >
          <Terminal size={13} />
          <span>Sandbox Tests</span>
          {run.tests && <span className="tab-count">{run.tests.checks.length}</span>}
        </button>
      </div>

      {/* TAB 1: FINDINGS */}
      {activeTab === "findings" && (
        <div className="findings-list">
          {(!run.scan || run.scan.findings.length === 0) && (
            <p style={{ color: "var(--fg-muted)", fontSize: "13px", padding: "12px 0" }}>
              {run.scan?.note || "Scanning repository with Semgrep SAST..."}
            </p>
          )}

          {run.scan?.findings.map((f) => (
            <div key={f.id} className="finding-item" id={`finding-${f.id}`}>
              <div className={`sev-badge ${f.severity.toLowerCase()}`}>
                {f.severity}
              </div>
              <div className="finding-content">
                <div className="finding-title">
                  {f.file}:{f.line}
                </div>
                <div className="finding-rule">
                  {f.rule}
                </div>
                <p className="finding-msg">{f.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: DIFF VIEWER */}
      {activeTab === "diff" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {run.patch?.explanation && (
            <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: 10, padding: "12px 16px", fontSize: "13px", color: "var(--fg-main)" }}>
              <span style={{ color: "var(--accent)", fontWeight: 600, display: "block", marginBottom: 2 }}>Coder Rationale:</span>
              <span style={{ color: "var(--fg-muted)" }}>{run.patch.explanation}</span>
            </div>
          )}

          {run.patch?.diff ? (
            <div className="diff-container">
              <div className="diff-header">
                <span>{run.files.join(", ")}</span>
                <button
                  onClick={handleCopyDiff}
                  style={{ color: "var(--fg-muted)", display: "inline-flex", alignItems: "center", gap: 4, fontSize: "12px" }}
                >
                  <Copy size={12} />
                  <span>{copiedDiff ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <div className="diff-code">
                {run.patch.diff.split("\n").map((line, idx) => {
                  const isAdd = line.startsWith("+") && !line.startsWith("+++");
                  const isDel = line.startsWith("-") && !line.startsWith("---");
                  const isHunk = line.startsWith("@@");
                  return (
                    <span
                      key={idx}
                      className={`diff-line ${isAdd ? "add" : isDel ? "del" : isHunk ? "hunk" : ""}`}
                    >
                      {line || " "}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--fg-muted)", fontSize: "13px", padding: "12px 0" }}>
              {run.patch?.note || "Awaiting Coder Agent to synthesize patch..."}
            </p>
          )}
        </div>
      )}

      {/* TAB 3: REVIEWER AUDIT */}
      {activeTab === "review" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {run.review ? (
            <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: 12, padding: "18px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "13px", color: "var(--fg-dim)" }}>Verdict:</span>
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    borderRadius: 5,
                    background: run.review.verdict === "approved" ? "var(--emerald-soft)" : "var(--crimson-soft)",
                    color: run.review.verdict === "approved" ? "var(--emerald)" : "var(--crimson)",
                    border: `1px solid ${run.review.verdict === "approved" ? "var(--emerald-border)" : "var(--crimson-border)"}`,
                  }}
                >
                  {run.review.verdict}
                </span>
              </div>

              <div>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--fg-main)", display: "block", marginBottom: 2 }}>Review Summary:</span>
                <p style={{ fontSize: "13px", color: "var(--fg-muted)", lineHeight: 1.5 }}>{run.review.summary}</p>
              </div>

              {run.review.issues.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 10 }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--amber)", display: "block", marginBottom: 4 }}>Identified Concerns:</span>
                  <ul style={{ paddingLeft: 16, fontSize: "12px", color: "var(--fg-muted)", display: "flex", flexDirection: "column", gap: 3 }}>
                    {run.review.issues.map((issue, idx) => (
                      <li key={idx}>{issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: "var(--fg-muted)", fontSize: "13px", padding: "12px 0" }}>
              Awaiting Reviewer Agent audit pass...
            </p>
          )}
        </div>
      )}

      {/* TAB 4: SANDBOX TESTS */}
      {activeTab === "tests" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {(!run.tests || run.tests.checks.length === 0) && (
            <p style={{ color: "var(--fg-muted)", fontSize: "13px", padding: "12px 0" }}>
              Tests execute in an isolated container sandbox without network access.
            </p>
          )}

          {run.tests?.checks.map((chk, idx) => (
            <div
              key={idx}
              style={{
                background: "#06070a",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 14px",
                  background: "rgba(255, 255, 255, 0.02)",
                  borderBottom: "1px solid var(--border-subtle)",
                  fontSize: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "1px 6px",
                      borderRadius: 4,
                      background: chk.status === "passed" ? "var(--emerald-soft)" : "var(--crimson-soft)",
                      color: chk.status === "passed" ? "var(--emerald)" : "var(--crimson)",
                    }}
                  >
                    {chk.status}
                  </span>
                  <b>{chk.name}</b>
                </div>
                {chk.exit_code !== null && (
                  <span style={{ fontSize: "11px", color: "var(--fg-dim)", fontFamily: "var(--font-mono)" }}>
                    code {chk.exit_code}
                  </span>
                )}
              </div>

              <pre
                style={{
                  margin: 0,
                  padding: "12px 14px",
                  fontSize: "12px",
                  fontFamily: "var(--font-mono)",
                  color: "#94a3b8",
                  maxHeight: "240px",
                  overflow: "auto",
                  lineHeight: 1.5,
                }}
              >
                {chk.command && `$ ${chk.command}\n`}
                {chk.output || "No console output recorded."}
              </pre>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
