import { AGENTS } from "./Landing";
const PRINCIPLES = [
  ["Targeted patches", "The Coder is asked for the smallest diff that addresses a finding. Unrelated edits are a reason to reject."],
  ["Independent review", "The Reviewer sees the findings and the diff, not the Coder's reasoning, and is free to disagree."],
  ["Isolated testing", "Repository code only runs in a container with no network and capped resources. Without Docker, tests are reported as unavailable."],
  ["Traceable evidence", "Every run keeps its state history, findings, diff, review and command output so you can check the verdict yourself."],
];
export default function Principles() {
  return (
    <>
      <section className="doc" id="architecture">
        <h2>Four agents, one job each</h2>
        <div className="cols">{AGENTS.map(([n, d]) => <div key={n}><h3>{n}</h3><p>{d}</p></div>)}</div>
      </section>
      <section className="doc principles">
        <h2>A patch isn't a fix until it's verified.</h2>
        <div className="cols">{PRINCIPLES.map(([n, d]) => <div key={n}><h3>{n}</h3><p>{d}</p></div>)}</div>
      </section>
    </>
  );
}
