import { useState } from "react";
import {
  X,
  Github,
  Key,
  ExternalLink,
  ShieldCheck,
  Loader2,
  Info,
  ChevronDown,
  ChevronUp,
  LogOut,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { API, tokenLogin, logout, Me } from "../lib/api";

interface TokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  oauthConfigured: boolean;
  user?: Me | null | undefined;
}

export default function TokenModal({
  isOpen,
  onClose,
  onSuccess,
  oauthConfigured,
  user,
}: TokenModalProps) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showOAuthHelp, setShowOAuthHelp] = useState(false);

  if (!isOpen) return null;

  const handleSubmitToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError("");
    try {
      await tokenLogin(token.trim());
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to authenticate with GitHub token");
    } finally {
      setBusy(false);
    }
  };

  const handleOAuthClick = () => {
    if (oauthConfigured) {
      window.location.href = `${API}/auth/github/login`;
    } else {
      setShowOAuthHelp(true);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await logout();
      onSuccess();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} id="modal-auth-overlay">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        id="modal-auth-card"
        style={{ maxWidth: 480 }}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
              }}
            >
              <Github size={18} />
            </div>
            <div>
              <h3 className="modal-title" style={{ fontSize: "16px", fontWeight: 700 }}>
                GitHub Authentication
              </h3>
              <p style={{ fontSize: "12px", color: "var(--fg-muted)" }}>
                Sign in to scan private repositories and create remediation PRs
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} id="btn-close-modal">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="alert-error" role="alert" style={{ fontSize: "12px" }}>
            <span>{error}</span>
          </div>
        )}

        {/* If user is already authenticated */}
        {user?.has_token ? (
          <div
            style={{
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid var(--emerald-border)",
              borderRadius: 12,
              padding: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.login}
                  style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "var(--emerald-soft)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--emerald)",
                  }}
                >
                  <CheckCircle2 size={18} />
                </div>
              )}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg-main)" }}>
                    {user.login}
                  </span>
                  <span
                    style={{
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "var(--emerald)",
                      background: "var(--emerald-soft)",
                      padding: "1px 6px",
                      borderRadius: 4,
                    }}
                  >
                    Connected
                  </span>
                </div>
                <p style={{ fontSize: "12px", color: "var(--fg-muted)", marginTop: 2 }}>
                  Authenticated with full repository access
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-danger"
              onClick={handleLogout}
              disabled={busy}
              style={{ fontSize: "12px", padding: "6px 12px", gap: 5 }}
            >
              <LogOut size={12} />
              <span>Sign Out</span>
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Primary OAuth Action: Continue with GitHub */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                id="btn-oauth-continue"
                onClick={handleOAuthClick}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "12px 18px",
                  borderRadius: 10,
                  background: "#24292f",
                  color: "#ffffff",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  fontSize: "14px",
                  fontWeight: 600,
                  transition: "all 0.2s ease",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.3)",
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "#2f363d")}
                onMouseOut={(e) => (e.currentTarget.style.background = "#24292f")}
              >
                <Github size={18} />
                <span>Continue with GitHub</span>
              </button>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  color: "var(--fg-dim)",
                  padding: "0 4px",
                }}
              >
                <span>
                  {oauthConfigured ? "1-Click OAuth Authorization" : "OAuth App not configured in .env"}
                </span>
                {!oauthConfigured && (
                  <button
                    type="button"
                    onClick={() => setShowOAuthHelp(!showOAuthHelp)}
                    style={{
                      color: "var(--accent)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    <span>Setup OAuth</span>
                    {showOAuthHelp ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </button>
                )}
              </div>

              {/* Informative Help Drawer if OAuth is not yet configured in orchestr/.env */}
              {showOAuthHelp && !oauthConfigured && (
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 8,
                    padding: 12,
                    fontSize: "12px",
                    color: "var(--fg-muted)",
                    lineHeight: 1.5,
                  }}
                >
                  <p style={{ fontWeight: 600, color: "var(--fg-main)", marginBottom: 4 }}>
                    To enable 1-click OAuth:
                  </p>
                  <ol style={{ paddingLeft: 18, margin: "4px 0" }}>
                    <li>Create a GitHub OAuth App with callback URL:</li>
                    <code
                      style={{
                        display: "block",
                        background: "rgba(0,0,0,0.5)",
                        padding: "3px 6px",
                        borderRadius: 4,
                        color: "var(--accent)",
                        fontSize: "11px",
                        margin: "4px 0",
                      }}
                    >
                      http://localhost:8000/auth/github/callback
                    </code>
                    <li>
                      Add <code>GITHUB_CLIENT_ID</code> &amp; <code>GITHUB_CLIENT_SECRET</code> to{" "}
                      <code>orchestr/.env</code>.
                    </li>
                  </ol>
                  <p style={{ color: "var(--accent)", marginTop: 6 }}>
                    Or authenticate instantly below using a Personal Access Token!
                  </p>
                </div>
              )}
            </div>

            {/* Divider */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: "var(--fg-dim)",
                fontSize: "12px",
              }}
            >
              <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
              <span>or enter Personal Access Token</span>
              <div style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
            </div>

            {/* Token Form */}
            <form onSubmit={handleSubmitToken} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="input-group">
                <label className="input-label" htmlFor="input-gh-pat">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <Key size={12} color="var(--accent)" />
                    <span>Personal Access Token (Classic or Fine-Grained)</span>
                  </span>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=CONDUIT-Security-Remediation"
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "var(--accent)",
                      fontSize: "11px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                    }}
                  >
                    Generate token <ExternalLink size={10} />
                  </a>
                </label>
                <input
                  id="input-gh-pat"
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx or github_pat_..."
                  className="text-input"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={busy}
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={busy || !token.trim()}
                  id="btn-submit-token"
                >
                  {busy ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                  <span>{busy ? "Authenticating..." : "Connect Token"}</span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
