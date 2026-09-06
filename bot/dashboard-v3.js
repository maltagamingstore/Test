/* Read-only public telemetry. No wallet connection, controls or executable feed content. */
"use strict";
const FEED = "https://api.github.com/gists/7f02dc27888b5de7ad0e7290128a4fe6";
const $ = id => document.getElementById(id);
const esc = value => String(value ?? "—").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const number = value => typeof value === "number" && Number.isFinite(value);
const money = value => number(value) ? "$" + value.toFixed(2) : "—";
const signed = value => number(value) ? (value >= 0 ? "+" : "−") + "$" + Math.abs(value).toFixed(2) : "—";
const color = value => number(value) ? value < 0 ? "var(--bad)" : "var(--good)" : "var(--muted)";
let lastData = null, range = 14;

function stateFor(doc, now = Date.now()) {
  const pubAge = now - Date.parse(doc.published_at);
  if (!Number.isFinite(pubAge) || pubAge > 360000 || pubAge < -5000) return "STALE";
  if (doc.status && doc.status.mode !== "LIVE") return "INVALID_MODE";
  if (doc.status) {
    const age = now - Date.parse(doc.status.observed_at);
    if (!Number.isFinite(age) || age > 360000 || age < -5000) return "STALE";
  }
  return doc.state;
}

function card(label, value, detail = "") {
  return `<section class="card"><div class="lbl">${esc(label)}</div><div class="big">${value}</div><div class="sub">${detail}</div></section>`;
}

function drawChart(rows) {
  const points = rows.filter(r => number(r.last_equity));
  if (points.length < 2) return '<p class="disclaimer">The trend appears after observations on two UTC days. No synthetic history or DRY results are included.</p>';
  const low = Math.min(...points.map(r => r.last_equity)), high = Math.max(...points.map(r => r.last_equity));
  const times = points.map(r => Date.parse(r.last_at));
  const t0 = Math.min(...times), span = Math.max(...times) - t0 || 1;
  const coords = points.map((p,i) => `${20 + (times[i] - t0) / span * 860},${high === low ? 80 : 140 - (p.last_equity - low) / (high - low) * 120}`).join(" ");
  return `<svg role="img" aria-label="Last observed marked account equity per UTC day, not flow-adjusted profit" viewBox="0 0 900 160" style="width:100%;height:auto"><line x1="20" x2="880" y1="145" y2="145" stroke="var(--line)"/><polyline points="${coords}" fill="none" stroke="var(--accent)" stroke-width="3"/></svg><div class="sub">Observed range ${money(low)} – ${money(high)}. Lines connect observations; gaps are not continuous coverage.</div>`;
}

function marketTable(detail, now = Date.now()) {
  if (!detail || detail.state === "NOT_STARTED") return '<section class="card full"><h2 class="section-title">Markets we are farming</h2><p class="disclaimer">No V3 LIVE farming yet. Market names, paired-plan reward/day and rolling-median repayment will appear here after live quoting starts.</p></section>';
  const fresh = Number.isFinite(Date.parse(detail.observed_at)) && now - Date.parse(detail.observed_at) <= 360000 && now - Date.parse(detail.observed_at) >= -5000;
  if (detail.state !== "CURRENT" || !fresh) return '<section class="card full"><h2 class="section-title">Markets we are farming</h2><p class="disclaimer">No current farming observation — stopped, held, stale or unavailable. Historical plans are not presented as active quotes.</p></section>';
  const days = v => number(v) ? v.toFixed(1) + "d" : "—";
  const rows = Array.isArray(detail.rows) ? detail.rows : [];
  return `<section class="card full"><h2 class="section-title">Markets we are farming</h2><div class="sub">${esc(detail.paired_count)} two-sided pairs observed · ${esc(detail.funded_count)} funded in latest sample · ${esc(new Date(detail.observed_at).toLocaleTimeString())}</div>
    <div class="tablebox"><table><thead><tr><th style="min-width:240px">Market / quote status</th><th>Estimated reward/day</th><th>Rolling median repayment<br><small>${esc(detail.median_window_minutes)}-minute screener window</small></th><th>Actual-sized pair repayment</th><th>Paired collateral</th></tr></thead><tbody>
    ${rows.length ? rows.map(row => `<tr><td style="white-space:normal;min-width:240px;max-width:380px"><div>${esc(row.market)}</div><div class="sub">${esc(row.quote_status)}</div></td><td>${money(row.estimated_reward_day)}<div class="sub">${row.plan_observed_at ? esc(new Date(row.plan_observed_at).toLocaleTimeString()) : 'No current plan'}</div></td><td>${days(row.rolling_median_repayment_days)}<div class="sub">n=${esc(row.rolling_median_samples)} · rounded</div></td><td>${days(row.actual_pair_repayment_days)}</td><td>${money(row.paired_collateral)}</td></tr>`).join("") : '<tr><td colspan="5">No paired quotes or recent paired plans in the latest sample.</td></tr>'}
    </tbody></table></div><p class="disclaimer">${esc(detail.note)} The two repayment columns use different quantities and loss assumptions; the screener median is not the actual-funded selection rule. No wallet or token addresses are displayed.</p></section>`;
}

function render(doc) {
  if (doc.schema !== 3 || doc.read_only !== true) throw new Error("Unsupported dashboard feed");
  lastData = doc;
  const status = doc.status || {}, settings = status.controls?.settings || {};
  const state = stateFor(doc);
  $("health").className = "badge " + (state === "RUNNING" ? "up" : "down");
  $("health").textContent = {NOT_STARTED:"NOT STARTED", RUNNING:"LIVE · RUNNING", STOPPED:"STOPPED", HOLD:"CAPITAL HOLD", HALTED:"STOP LATCHED", STALE:"STALE DATA", TELEMETRY_ERROR:"TELEMETRY ERROR"}[state] || state;
  $("fresh").textContent = "Read-only · publisher " + new Date(doc.published_at).toLocaleString() + (status.observed_at ? " · bot observation " + new Date(status.observed_at).toLocaleString() : " · awaiting first V3 LIVE observation");
  const cutoff = new Date(Date.now() - range * 86400000).toISOString().slice(0,10);
  const rows = (Array.isArray(doc.daily) ? doc.daily : []).filter(r => r.day >= cutoff);
  $("root").innerHTML = `<p class="disclaimer">Local controls only. This page cannot place orders or change bot settings. <a href="/score/">Open screener & scorer →</a></p>
    <div class="grid">
      ${marketTable(doc.market_detail)}
      ${card("Marked account equity", money(status.equity), "Cash " + money(status.cash) + " · positions " + money(status.positions))}
      ${card("Net change since original capital", `<span style="color:${color(status.net_since_original)}">${signed(status.net_since_original)}</span>`, "Includes credited rewards and any external transfers; not flow-adjusted trading profit.")}
      ${card("Capital hard-stop floor", money(status.capital_floor), "Original capital " + money(status.original_capital) + " · loss limit " + esc(settings.loss_limit_pct) + "%")}
      ${card("Distance above hard-stop floor", money(status.kill_cushion), "Stop latched: " + (status.latched === true ? "YES" : status.latched === false ? "no" : "—") + " · confirmation checks retained")}
      <section class="card full"><h2 class="section-title">P/L over days <span style="color:var(--muted);font-weight:400">/ marked account change</span></h2>
        <div style="display:flex;gap:8px">${[7,14,30].map(n => `<button type="button" data-range="${n}" aria-pressed="${range === n}">${n} days</button>`).join("")}</div>
        ${drawChart(rows)}
        <div class="tablebox"><table><thead><tr><th>UTC day</th><th>Last equity</th><th>Within-day change</th><th>Since prior observed close</th><th>Samples</th></tr></thead><tbody>
        ${rows.length ? rows.slice().reverse().map(r => `<tr><td>${esc(r.day)}</td><td>${money(r.last_equity)}</td><td style="color:${color(r.observed_change)}">${signed(r.observed_change)}</td><td style="color:${color(r.since_previous_observation)}">${signed(r.since_previous_observation)}</td><td>${esc(r.samples)}</td></tr>`).join("") : '<tr><td colspan="5">No V3 LIVE history yet. Legacy and DRY records are not relabeled as V3 profit.</td></tr>'}
        </tbody></table></div><p class="disclaimer">Within-day change is last minus first observed equity, not midnight-to-midnight profit. Prior-close change may span missing days. Marked positions are not guaranteed exit proceeds. Uncredited reward estimates are excluded.</p>
      </section>
      ${card("Funded / two-sided resting pairs", `${esc(status.funded)} / ${esc(status.paired)}`, "Resting pairs are not proof of API-confirmed reward scoring. Cooling: " + esc(status.cooling))}
      ${card("Applied local settings", esc(settings.capital_buffer_pct) + "%", "Cash allocation · revision " + esc(status.controls?.revision) + " · weather excluded")}
      <section class="card full"><h2 class="section-title">Evidence diagnostic · monitoring only</h2><div>${esc(status.evidence?.verdict || "UNKNOWN")}</div><p class="disclaimer">${esc(status.evidence?.caveat || "Awaiting observation. This research signal cannot halt or flatten V3; the original-capital hard stop remains active.")}</p></section>
    </div>`;
  document.querySelectorAll("[data-range]").forEach(button => button.addEventListener("click", () => {
    range = Number(button.dataset.range); render(lastData);
  }));
}

async function load() {
  try {
    const response = await fetch(FEED, {cache:"no-store", signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error("Feed HTTP " + response.status);
    const gist = await response.json(), file = gist.files?.["v3.json"];
    if (!file || file.truncated || typeof file.content !== "string") throw new Error("V3 feed missing or truncated");
    render(JSON.parse(file.content));
  } catch (error) {
    $("health").className = "badge down";
    $("health").textContent = "FEED UNAVAILABLE";
    $("fresh").textContent = "Last successful values may be stale. " + error.message;
    if (!lastData) $("root").textContent = "Awaiting the read-only V3 feed. No values are inferred.";
  }
}
if (typeof document !== "undefined") {
  load(); setInterval(load, 120000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
}
if (typeof module !== "undefined") module.exports = {esc, stateFor, drawChart, money, signed, marketTable};
