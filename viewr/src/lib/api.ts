export const API = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type State =
  | "queued"
  | "cloning"
  | "awaiting_approval"
  | "cancelled"
  | "scanning"
  | "patching"
  | "reviewing"
  | "testing"
  | "completed"
  | "failed"
  | "rejected";

export interface Finding {
  id: string;
  rule: string;
  severity: "critical" | "high" | "medium" | "low" | string;
  file: string;
  line: number;
  message: string;
}

export interface Check {
  name: string;
  command: string;
  status: "passed" | "failed" | "skipped" | "unavailable";
  exit_code: number | null;
  output: string;
}

export interface Run {
  id: string;
  repo_url: string;
  base_sha: string;
  attempts: number;
  files: string[];
  local_path?: string | null;
  branch?: string | null;
  commit_sha?: string | null;
  demo: boolean;
  policy: { auto_pr: boolean; actions: string[] };
  state: State;
  verified: boolean;
  error: string;
  pr_url: string | null;
  history: { state: State; at: string; note: string }[];
  scan: { status: string; note: string; findings: Finding[] } | null;
  patch: { status: string; diff: string; explanation: string; note: string } | null;
  review: { status: string; verdict: string | null; approved: boolean | null; issues: string[]; summary: string } | null;
  tests: { checks: Check[] } | null;
}

export const TERMINAL: State[] = ["completed", "failed", "rejected", "cancelled"];

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    const d = b.detail;
    throw new Error(
      typeof d === "string" ? d : Array.isArray(d) ? d.map((x: { msg: string }) => x.msg).join("; ") : `Request failed (${r.status})`
    );
  }
  return r.json();
}

export interface Me {
  login: string;
  user_id?: string;
  avatar_url?: string;
  demo: boolean;
  has_token?: boolean;
  csrf: string;
}

export interface Repo {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  default_branch: string;
  private: boolean;
  updated_at: string | null;
  source?: "github" | "workspace" | "benchmark";
  local_path?: string;
}

let csrf = "";

const f = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  const doFetch = (token: string) =>
    fetch(`${API}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
        ...(init.headers ?? {}),
      },
    });

  let r = await doFetch(csrf);
  // Auto-recover if CSRF token expired or is empty
  if (r.status === 403 && init.method === "POST") {
    try {
      const u = await fetch(`${API}/api/me`, { credentials: "include" });
      if (u.ok) {
        const data = await u.json();
        csrf = data.csrf;
      } else {
        const g = await fetch(`${API}/auth/guest`, { method: "POST", credentials: "include" });
        if (g.ok) {
          const gData = await g.json();
          csrf = gData.csrf;
        }
      }
      r = await doFetch(csrf);
    } catch {
      // Pass original response if recovery fails
    }
  }
  return j<T>(r);
};

const post = <T,>(path: string, body?: unknown) =>
  f<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const authConfig = () =>
  f<{ github_configured: boolean; pat_supported: boolean; direct_scan: boolean; demo_available: boolean }>("/api/auth-config");

export const me = async () => {
  const m = await f<Me>("/api/me");
  csrf = m.csrf;
  return m;
};

export const guestLogin = async () => {
  const m = await post<Me>("/auth/guest");
  csrf = m.csrf;
  return m;
};

export const tokenLogin = async (token: string) => {
  const m = await post<Me>("/auth/token", { token });
  csrf = m.csrf;
  return m;
};

export const demoLogin = () => post<Me>("/auth/demo");
export const logout = () => post<{ ok: boolean }>("/auth/logout");

export const repos = (q = "") => f<Repo[]>(`/api/repositories?q=${encodeURIComponent(q)}`);
export const branches = (full: string) => f<string[]>(`/api/repositories/${full}/branches`);
export const branchesByUrl = (repo_url: string) =>
  f<string[]>(`/api/repositories/branches-by-url?repo_url=${encodeURIComponent(repo_url)}`);

export const createRun = async (repo_url: string, ref: string | null, auto_pr: boolean) => {
  if (!csrf) {
    try {
      const u = await me();
      csrf = u.csrf;
    } catch {
      const g = await guestLogin();
      csrf = g.csrf;
    }
  }
  return post<Run>("/api/runs", { repo_url, ref, auto_pr });
};

export const getRun = (id: string) => f<Run>(`/api/runs/${id}`);
export const cancelRun = (id: string) => post<{ cancelled: boolean }>(`/api/runs/${id}/cancel`);

export const approve = (
  id: string,
  actionOrBranch: "pr" | "branch" | "local" | "discard" | string = "pr",
  branchOrMessage?: string,
  messageOrToken?: string,
  token?: string
) => {
  let action: "pr" | "branch" | "local" | "discard" = "pr";
  let branch: string | undefined = undefined;
  let message: string | undefined = undefined;
  let customToken: string | undefined = token;

  if (["pr", "branch", "local", "discard"].includes(actionOrBranch)) {
    action = actionOrBranch as "pr" | "branch" | "local" | "discard";
    branch = branchOrMessage;
    message = messageOrToken;
  } else {
    // Legacy signature: approve(id, branch, message, token)
    action = "pr";
    branch = actionOrBranch;
    message = branchOrMessage;
    customToken = messageOrToken;
  }

  return post<{ pr_url?: string; branch?: string; status?: string; local_path?: string; pushed?: boolean }>(
    `/api/runs/${id}/approve`,
    { confirm: true, action, branch, message, token: customToken }
  );
};

export const reject = (id: string) => post<{ ok: boolean }>(`/api/runs/${id}/reject`);
