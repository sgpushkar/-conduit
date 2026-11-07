import { useEffect, useRef, useState } from "react";
import Navbar from "./components/Navbar";
import TokenModal from "./components/TokenModal";
import ScannerHero from "./components/ScannerHero";
import PipelineBoard from "./components/PipelineBoard";
import RemediationWorkspace from "./components/RemediationWorkspace";
import ArchitecturePrinciples from "./components/ArchitecturePrinciples";
import {
  Me,
  Run,
  me,
  guestLogin,
  tokenLogin,
  authConfig,
  createRun,
  getRun,
  TERMINAL,
  API,
} from "./lib/api";

export default function App() {
  const [user, setUser] = useState<Me | null | undefined>(undefined);
  const [config, setConfig] = useState({ github_configured: false, pat_supported: true });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [globalError, setGlobalError] = useState("");

  const pollTimer = useRef<number>();

  const initUser = async () => {
    try {
      const u = await me();
      setUser(u);
    } catch {
      // Auto-initialize guest analyst session for instant public repo scanning
      try {
        const guest = await guestLogin();
        setUser(guest);
      } catch (err) {
        setUser(null);
        setGlobalError(`Unable to reach CONDUIT backend at ${API}. Ensure orchestr server is running.`);
      }
    }
  };

  useEffect(() => {
    initUser();
    authConfig()
      .then((cfg) => setConfig({ github_configured: cfg.github_configured, pat_supported: cfg.pat_supported }))
      .catch(() => {});

    // Check for auth callback error query param
    const params = new URLSearchParams(window.location.search);
    const authErr = params.get("auth_error");
    if (authErr) {
      if (authErr === "oauth_not_configured") {
        setGlobalError("GitHub OAuth is not configured in orchestr/.env. Please connect using a Personal Access Token or configure OAuth credentials.");
        setIsAuthModalOpen(true);
      } else if (authErr === "access_denied") {
        setGlobalError("GitHub OAuth sign-in was cancelled.");
      } else {
        setGlobalError(`GitHub sign-in error: ${authErr}`);
      }
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Poll active run telemetry
  useEffect(() => {
    if (!activeRun || TERMINAL.includes(activeRun.state) || activeRun.state === "awaiting_approval") {
      return;
    }

    pollTimer.current = window.setInterval(async () => {
      try {
        const latest = await getRun(activeRun.id);
        setActiveRun(latest);
      } catch {
        window.clearInterval(pollTimer.current);
      }
    }, 1200);

    return () => window.clearInterval(pollTimer.current);
  }, [activeRun?.id, activeRun?.state]);

  const handleLaunch = async (repoUrl: string, branch: string, autoPr: boolean, patToken?: string) => {
    setBusy(true);
    setGlobalError("");
    try {
      // If a custom token was entered in this run, authenticate session first
      if (patToken) {
        const u = await tokenLogin(patToken);
        setUser(u);
      }
      const newRun = await createRun(repoUrl, branch || null, autoPr);
      setActiveRun(newRun);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : "Failed to launch remediation pipeline");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-root">
      <Navbar
        user={user}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onUserUpdate={initUser}
      />

      <main className="app-container">
        {globalError && (
          <div className="alert-error" role="alert" style={{ maxWidth: 980, margin: "0 auto", width: "100%" }}>
            <span>{globalError}</span>
          </div>
        )}

        <ScannerHero
          user={user}
          onLaunch={handleLaunch}
          busy={busy}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />

        {activeRun && (
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            <PipelineBoard run={activeRun} />
            <RemediationWorkspace
              run={activeRun}
              onRunUpdate={setActiveRun}
              onReset={() => setActiveRun(null)}
              onOpenAuth={() => setIsAuthModalOpen(true)}
            />
          </div>
        )}

        <ArchitecturePrinciples />
      </main>

      <TokenModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={initUser}
        oauthConfigured={config.github_configured}
        user={user}
      />
    </div>
  );
}
