import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, CircleDashed, Loader2, X } from "lucide-react";
import { API, approve, authConfig, branches, cancelRun, createRun, demoLogin, getRun, logout, me, Me, reject, repos, Repo, Run, State, TERMINAL } from "../lib/api";

const STEPS: [State, string, string][] = [
  ["scanning", "Scanner", "Find vulnerabilities"], ["patching", "Coder", "Generate patches"],
  ["reviewing", "Reviewer", "Inspect the fix"], ["testing", "Tester", "Run tests"],
];
const URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/;

function Step({ run, s }: { run: Run; s: (typeof STEPS)[number] }) {
  const reached = run.history.some((h) => h.state === s[0]);
  const active = run.state === s[0];
  const status = active ? "running" : reached ? "done" : TERMINAL.includes(run.state) ? "not reached" : "waiting";
  const Icon = active ? Loader2 : reached ? Check : status === "not reached" ? X : CircleDashed;
  return (
    <li className={`step ${status.replace(" ", "-")}`}><Icon size={18} className={active ? "spin" : ""} />
      <div><b>{s[1]} Agent</b><small>{s[2]}</small></div><em>{status}</em></li>
  );
}

function Diff({ text }: { text: string }) {
  return <pre className="diff">{text.split("\n").map((l, i) =>
    <span key={i} className={l.startsWith("+") && !l.startsWith("+++") ? "add" : l.startsWith("-") && !l.startsWith("---") ? "del" : ""}>{l + "\n"}</span>)}</pre>;
}

const msg = (x: unknown) => (x instanceof Error && x.message !== "Failed to fetch" ? x.message : `Can't reach the backend at ${API}. Start orchestr first.`);

function Account({ user, onOut }: { user: Me; onOut: () => void }) {
  return <p className="muted">Signed in as {user.login}. {user.demo && "Demo mode: local fixture repo, no GitHub operations. "}
    <button className="ghost" onClick={async () => { await logout(); onOut(); }}>Sign out</button></p>;
}

function Approval({ run, onDone }: { run: Run; onDone: (r: Run) => void }) {
  const [branch, setBranch] = useState(`conduit/fix-${run.id.slice(0, 8)}`);
  const [message, setMessage] = useState("fix: security remediation by CONDUIT");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setErr(""); try { await fn(); onDone(await getRun(run.id)); } catch (x) { setErr(msg(x)); } finally { setBusy(false); } };
  const [owner, repo] = run.repo_url.split("/").slice(-2);
  return (
    <div className="approval"><h3>Approve changes</h3>
      <dl><dt>Repository</dt><dd>{owner}/{repo}</dd><dt>Base commit</dt><dd>{run.base_sha.slice(0, 10)}</dd>
        <dt>Files changed</dt><dd>{run.files.join(", ") || "none"}</dd></dl>
      <label>Branch (must start with conduit/)<input value={branch} onChange={(e) => setBranch(e.target.value)} /></label>
      <label>Commit message and PR title<input value={message} onChange={(e) => setMessage(e.target.value)} /></label>
      <p className="muted">Approving pushes only to this branch and opens a pull request. Tests re-run before the push. The default branch is never modified.</p>
      {run.demo && <p className="muted">Demo run: pull request creation is disabled. Download the patch instead.</p>}
      <div className="row">
        <button disabled={busy || run.demo} onClick={() => act(() => approve(run.id, branch, message))}>Approve &amp; Create Pull Request</button>
        <a className="cta alt" href={`${API}/api/runs/${run.id}/diff?download=true`}>Download Patch</a>
        <button className="ghost" disabled={busy} onClick={() => act(() => reject(run.id))}>Reject Changes</button></div>
      {err && <p className="error" role="alert">{err}</p>}</div>
  );
}

export default function RunConsole() {
  const [user, setUser] = useState<Me | null | undefined>(undefined);
  const [cfg, setCfg] = useState({ github_configured: false, demo_available: false });
  const [list, setList] = useState<Repo[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Repo | null>(null);
  const [brs, setBrs] = useState<string[]>([]);
  const [br, setBr] = useState("");
  const [auto, setAuto] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const timer = useRef<number>();

  const load = async () => { try { setUser(await me()); } catch { setUser(null); authConfig().then(setCfg).catch(() => setErr(`Can't reach the backend at ${API}. Start orchestr first.`)); } };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (user) repos(q).then(setList).catch((x) => setErr(msg(x))); }, [user, q]);
  useEffect(() => { if (sel) branches(sel.full_name).then((b) => { setBrs(b); setBr(sel.default_branch); }).catch((x) => setErr(msg(x))); }, [sel]);
  useEffect(() => () => window.clearInterval(timer.current), []);
  useEffect(() => {
    if (!run || TERMINAL.includes(run.state) || run.state === "awaiting_approval") return;
    timer.current = window.setInterval(async () => {
      try { setRun(await getRun(run.id)); } catch { setErr("Lost connection to the backend."); window.clearInterval(timer.current); }
    }, 1500);
    return () => window.clearInterval(timer.current);
  }, [run?.id, run?.state]);

  async function start() {
    if (!sel) return;
    setBusy(true); setErr("");
    try { setRun(await createRun(sel.html_url, br || null, auto)); } catch (x) { setErr(msg(x)); } finally { setBusy(false); }
  }

  const done = !!run && TERMINAL.includes(run.state);
  const waiting = run?.state === "awaiting_approval";
  return (
    <section className="doc console" id="run">
      <h2>Run the pipeline</h2>
      {err && <p className="error" role="alert">{err}</p>}
      {user === undefined && <p className="muted">Loading…</p>}
      {user === null && (<div className="signin">
        {cfg.github_configured && <a className="cta" href={`${API}/auth/github/login`}>Sign in with GitHub</a>}
        {cfg.demo_available && <><button onClick={async () => { await demoLogin(); load(); }}>Start demo mode</button>
          <p className="muted">GitHub OAuth isn't configured on this server. Demo mode scans a bundled fixture repo and never touches GitHub.</p></>}
        <p className="muted">CONDUIT asks GitHub for the repo scope so it can clone private repositories and open pull requests on a conduit/* branch. It never pushes to your default branch.</p></div>)}
      {user && (<>
        <Account user={user} onOut={() => { setUser(null); setRun(null); setSel(null); load(); }} />
        {!run && (<div className="picker">
          <input aria-label="Search repositories" placeholder="Search repositories" value={q} onChange={(e) => setQ(e.target.value)} />
          {list.length === 0 && <p className="muted">No repositories found.</p>}
          <ul className="repos">{list.map((r) => <li key={r.full_name}><button className={sel?.full_name === r.full_name ? "pick on" : "pick"} onClick={() => setSel(r)}>
            <b>{r.full_name}</b><small>{r.private ? "private" : "public"} · {r.language ?? "n/a"} · {r.default_branch}</small><small>{r.description}</small></button></li>)}</ul>
          {sel && (<div className="launch"><label>Branch<select value={br} onChange={(e) => setBr(e.target.value)}>{brs.map((b) => <option key={b}>{b}</option>)}</select></label>
            <label className="check"><input type="checkbox" checked={auto} disabled={user.demo} onChange={(e) => setAuto(e.target.checked)} />
              Pre-authorize automatic PR for verified patches (off by default; failed or unverified patches are never committed)</label>
            <button disabled={busy} onClick={start}>{busy ? "Starting…" : `Scan ${sel.full_name}`}</button></div>)}</div>)}
      </>)}

      {run && (<div className="results">
        <p className="muted">{run.repo_url} at {run.base_sha ? run.base_sha.slice(0, 10) : "…"} · attempt {run.attempts || 0}</p>
        <ol className="steps">{STEPS.map((s) => <Step key={s[0]} run={run} s={s} />)}</ol>
        {!done && !waiting && <button className="ghost" onClick={() => cancelRun(run.id)}>Cancel run</button>}
        {(done || waiting) && (<div className={`verdict ${run.verified ? "ok" : run.state}`}>
          <b>{run.pr_url ? "Pull request created" : waiting ? "Verified, awaiting your approval" : run.state === "rejected" ? "Rejected" : run.state === "failed" ? "Run failed" : run.state === "cancelled" ? "Cancelled" : "Not verified"}</b>
          <span>{run.error || run.history[run.history.length - 1]?.note}</span>
          {run.pr_url && <a href={run.pr_url} target="_blank" rel="noreferrer">{run.pr_url}</a>}</div>)}
        {waiting && <Approval run={run} onDone={setRun} />}
        {run.policy.actions.length > 0 && <p className="muted">Policy log: {run.policy.actions.join("; ")}</p>}
        {done && <button className="ghost" onClick={() => setRun(null)}>Start another run</button>}
        {run.scan && (<><h3>Findings ({run.scan.findings.length})</h3>
          {run.scan.note && <p className="muted">{run.scan.note}</p>}
          <ul className="findings">{run.scan.findings.map((f) => <li key={f.id}><i className={`sev ${f.severity}`}>{f.severity}</i>
            <div><b>{f.file}:{f.line}</b><small>{f.rule}</small><p>{f.message}</p></div></li>)}</ul></>)}
        {run.patch && (<><h3>Proposed patch</h3>{run.patch.note && <p className="muted">{run.patch.note}</p>}
          {run.patch.diff && <Diff text={run.patch.diff} />}{run.patch.explanation && <p>{run.patch.explanation}</p>}</>)}
        {run.review && (<><h3>Review</h3><p className="muted">{run.review.status !== "ok" ? `Review ${run.review.status}. ` : run.review.verdict === "approved" ? "Approved. " : run.review.verdict === "changes_requested" ? "Changes requested. " : "Rejected. "}{run.review.summary}</p>
          <ul>{run.review.issues.map((i, k) => <li key={k}>{i}</li>)}</ul></>)}
        {run.tests && (<><h3>Tests</h3>{run.tests.checks.map((c) => <details key={c.name} open={c.status !== "passed"}>
          <summary><i className={`chk ${c.status}`}>{c.status}</i> {c.name} {c.exit_code !== null && <small>exit {c.exit_code}</small>}</summary>
          <pre>{c.command && `$ ${c.command}\n`}{c.output}</pre></details>)}</>)}
        {done && <p className="muted"><a href={`${API}/api/runs/${run.id}/report`} target="_blank" rel="noreferrer">Open JSON report</a>.</p>}
      </div>)}
    </section>
  );
}
