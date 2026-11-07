import { useState } from "react";
import { Shield, Github, LogOut, Lock } from "lucide-react";
import { Me, logout } from "../lib/api";

interface NavbarProps {
  user: Me | null | undefined;
  onOpenAuth: () => void;
  onUserUpdate: () => void;
}

export default function Navbar({ user, onOpenAuth, onUserUpdate }: NavbarProps) {
  const [busy, setBusy] = useState(false);

  const handleLogout = async () => {
    setBusy(true);
    try {
      await logout();
      onUserUpdate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <nav className="navbar" id="top-nav">
      <div className="nav-brand">
        <div className="brand-icon">
          <Shield size={16} />
        </div>
        <div className="brand-title">CONDUIT</div>
        <span className="brand-badge">v2.4</span>
      </div>

      <div className="nav-center">
        <div className="status-pill" title="Gemini 3.5 Flash & Semgrep SAST configured">
          <span className="status-dot"></span>
          <span>Pipeline Ready</span>
        </div>
      </div>

      <div className="nav-actions">
        {user?.has_token ? (
          <div className="btn-secondary" style={{ padding: "5px 12px", fontSize: "12px", gap: 8 }}>
            {user.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.login}
                style={{ width: 18, height: 18, borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <Github size={13} color="var(--emerald)" />
            )}
            <span style={{ fontWeight: 600 }}>{user.login}</span>
            <button
              onClick={handleLogout}
              disabled={busy}
              title="Sign out"
              style={{ color: "var(--fg-dim)", display: "flex", alignItems: "center", padding: 2, marginLeft: 2 }}
            >
              <LogOut size={12} />
            </button>
          </div>
        ) : (
          <button
            className="btn-secondary btn-github"
            onClick={onOpenAuth}
            id="btn-connect-github"
            style={{ gap: 8, padding: "6px 14px", fontSize: "13px" }}
          >
            <Github size={14} />
            <span>Continue with GitHub</span>
          </button>
        )}
      </div>
    </nav>
  );
}
