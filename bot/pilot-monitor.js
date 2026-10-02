/* Read-only, explicitly shadow-only pilot feed. Never connects to a wallet. */
"use strict";
(function () {
  const FEED = 'https://gist.githubusercontent.com/maltagamingstore/7f02dc27888b5de7ad0e7290128a4fe6/raw/pilot.json';
  const escape = value => String(value ?? 'Unavailable').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const numeric = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const count = value => numeric(value) ? value.toLocaleString() : 'Unavailable';
  const gib = value => numeric(value) ? (value / 1073741824).toFixed(2) + ' GiB' : 'Unavailable';
  const clock = value => Number.isFinite(typeof value==='number'?value:Date.parse(value)) ? new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Paris',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(new Date(value)) : 'Unavailable';
  let latest = null, failed = false, generation = 0;

  function validate(doc) {
    if (!doc || doc.schema !== 1 || doc.kind !== 'v5_pilot_monitor' || doc.mode !== 'SHADOW' || doc.read_only !== true || doc.funded_start !== 'HOLD') throw new Error('Pilot mode could not be verified');
    if (!Number.isFinite(Date.parse(doc.observed_at)) || !Number.isFinite(Date.parse(doc.published_at))) throw new Error('Pilot timestamps missing');
    if (doc.trading_pl !== null || doc.received_rewards !== null) throw new Error('Shadow earnings rejected');
    return doc;
  }

  function freshness(doc, now = Date.now()) {
    const observed = now-Date.parse(doc.observed_at), published=now-Date.parse(doc.published_at);
    if (failed || observed < -5000 || published < -5000 || (doc.state !== 'ENDED' && (published > 360000 || observed > 360000)) || doc.state === 'STALE') return 'STALE';
    if (doc.state === 'ENDED') return 'ENDED';
    if (doc.real_orders !== 0 || doc.source_error_present || doc.state === 'REVIEW_REQUIRED') return 'REVIEW_REQUIRED';
    return 'SHADOW';
  }

  function render(doc, now = Date.now()) {
    validate(doc);
    const state=freshness(doc,now), elapsed=numeric(doc.duration_seconds)?doc.duration_seconds:null;
    const total=numeric(doc.required_seconds)&&doc.required_seconds>0?doc.required_seconds:null;
    const percent=elapsed!==null&&total ? Math.min(100,elapsed/total*100):null;
    const metric=(name,value,detail='')=>`<div class="pilot-metric"><dt>${escape(name)}</dt><dd>${escape(value)}</dd>${detail?`<small>${escape(detail)}</small>`:''}</div>`;
    const label=state==='STALE'?'UPDATE OVERDUE':state==='ENDED'?'SHADOW RUN ENDED':state==='REVIEW_REQUIRED'?'CHECK REQUIRED':'SHADOW · NO ORDERS';
    const remaining=elapsed!==null&&total?Math.max(0,total-elapsed):null;
    const end=total&&elapsed!==null?clock(Date.parse(doc.observed_at)+(total-elapsed)*1000):'Unavailable';
    return `<section class="card pilot-card" aria-labelledby="pilot-title">
      <div class="pilot-header"><div><div class="lbl">Current pilot · read-only</div><h2 id="pilot-title">MM Bot V5 · shadow commissioning</h2></div><span class="pill w" role="status">${label}</span></div>
      <p class="disclaimer">Funded startup is on hold. V3 reward allocation restoration is pending. This run checks capture, account reconciliation and resource use.</p>
      <div class="pilot-progress"><strong>${percent===null?'Progress unavailable':percent.toFixed(1)+'%'}</strong><span>${elapsed===null?'Unavailable':(elapsed/3600).toFixed(2)+' h'} / ${total?(total/3600).toFixed(0)+' h':'Unavailable'}</span></div>
      <progress max="100" ${percent===null?'':`value="${percent.toFixed(3)}"`} aria-label="Recorded shadow duration"></progress>
      <p class="sub">${state==='ENDED'?'Terminal receipt recorded · trading approval remains pending':`Recorded duration remaining ${remaining===null?'Unavailable':Math.floor(remaining/3600)+' h '+Math.ceil((remaining%3600)/60)+' min'} · scheduled end ${escape(end)}`}</p>
      <p class="pilot-updated ${state==='STALE'?'stale':''}">Observation ${escape(clock(doc.observed_at))} · published ${escape(clock(doc.published_at))}${state==='STALE'?' · Last snapshot only; current status is unverified.':''}</p>
      <dl class="pilot-metrics">
        ${metric('Public capture markets',count(doc.capture_markets),'Detailed monitored cohort')}
        ${metric('Hypothetical farming markets',count(doc.hypothetical_farming_markets),'Shadow quotes only')}
        ${metric('Real order intents',count(doc.real_orders),'No funded trading enabled')}
        ${metric('Account reconciliation',doc.account_status, count(doc.account_failed_cycles)+' failed cycles')}
        ${metric('Pilot private memory',gib(doc.private_bytes))}
        ${metric('Available system RAM',gib(doc.available_ram_bytes))}
        ${metric('SSD free space',gib(doc.ssd_free_bytes))}
        ${metric('Writer queue',gib(doc.queue_bytes),count(doc.queue_waits)+' waits since start')}
      </dl>
      <details class="pilot-details"><summary>Recording coverage and system details</summary><dl class="pilot-metrics">
        ${metric('Fresh HTTP market pairs',count(doc.fresh_http_pairs),'Latest snapshot; not continuous coverage')}
        ${metric('Qualified socket tokens',count(doc.socket_qualified_tokens)+' / '+count(doc.socket_target_tokens),count(doc.socket_unqualified_tokens)+' currently unqualified')}
        ${metric('Committed / acquired records',count(doc.committed_sequence)+' / '+count(doc.journal_sequence),'Live samples can contain pending commits')}
        ${metric('Supported shadow quote cycles',count(doc.supported_quote_cycles),'Not API-confirmed reward scoring')}
        ${metric('Host CPU',numeric(doc.host_cpu_percent)?doc.host_cpu_percent.toFixed(1)+'%':'Unavailable')}
        ${metric('SSD write latency',numeric(doc.disk_write_latency_seconds)?(doc.disk_write_latency_seconds*1000).toFixed(2)+' ms':'Unavailable')}
        ${metric('Paging reads',numeric(doc.paging_reads_per_second)?doc.paging_reads_per_second.toFixed(2)+' / sec':'Unavailable')}
      </dl></details>
      <p class="disclaimer">Trading P/L and received pilot rewards are unavailable during shadow commissioning. Public market counts are separate from farming exposure. Missing socket history is not reconstructed by a later HTTP snapshot. Completion does not enable trading.</p>
      <div class="pilot-actions"><button type="button" id="pilot-refresh">Refresh now</button><span class="sub">Status uploads every 2½ minutes · page checks every 30 seconds</span></div>
    </section>`;
  }

  function paint() {
    const root=document.getElementById('pilot-monitor');
    const expanded=root.querySelector('.pilot-details')?.open;
    if (latest) root.innerHTML=render(latest);
    else root.innerHTML='<section class="card pilot-card"><h2>MM Bot V5 · pilot monitor</h2><p class="disclaimer">Pilot status unavailable. No current capture, trading or earnings state is inferred.</p><button type="button" id="pilot-refresh">Try again</button></section>';
    document.getElementById('pilot-refresh')?.addEventListener('click',load);
    if(expanded&&root.querySelector('.pilot-details'))root.querySelector('.pilot-details').open=true;
  }

  async function load() {
    const current=++generation;
    try {
      const response=await fetch(FEED+'?t='+Math.floor(Date.now()/30000),{cache:'no-store',signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('Pilot feed unavailable');
      const doc=validate(await response.json());
      if(current!==generation)return;
      latest=doc; failed=false;
    } catch (_) { if(current!==generation)return; failed=true; }
    paint();
  }

  if(typeof document!=='undefined') {
    load();setInterval(load,30000);setInterval(()=>{if(latest)paint();},15000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  }
  if(typeof module!=='undefined')module.exports={validate,freshness,render,escape};
})();
