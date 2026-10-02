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
    if (doc.paper && (doc.paper.schema !== 1 || doc.paper.mode !== 'PAPER_SIMULATION_NO_ORDERS' || doc.paper.read_only !== true || doc.paper.real_orders !== 0 || doc.paper.received_rewards !== null || doc.paper.spendable_reward_cash !== 0)) throw new Error('Paper simulation boundary rejected');
    return doc;
  }

  function paperRender(p, now=Date.now()) {
    if(p.stopped_by_owner===true) return `<section class="card pilot-card" aria-labelledby="paper-title"><div class="pilot-header"><div><div class="lbl">Preserved partial experiment · read-only</div><h2 id="paper-title">MM Bot V5 · paper test stopped</h2></div><span class="pill w" role="status">STOPPED BY OWNER</span></div><p class="disclaimer">Stopped ${escape(clock(p.stopped_at))}. The full paper test is no longer running. Its recording and simulation state are preserved. This interrupted run did not complete the 24-hour farming period or 6½-hour follow-up. No real orders were placed.</p></section>`;
    const money=v=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:4}).format(v):'Unavailable';
    const metric=(name,value,detail='')=>`<div class="pilot-metric"><dt>${escape(name)}</dt><dd>${escape(value)}</dd>${detail?`<small>${escape(detail)}</small>`:''}</div>`;
    const stale=failed||!numeric(p.observed_at)||now-p.observed_at*1000>360000||p.observed_at*1000-now>5000;
    const ended=p.completed===true, label=p.failed?'CHECK REQUIRED':ended?'PAPER RUN COMPLETED':stale?'UPDATE OVERDUE':'PAPER · SIMULATED ORDERS ONLY';
    const elapsed=numeric(p.start)&&numeric(p.observed_at)?Math.max(0,p.observed_at-p.start):null;
    const total=numeric(p.start)&&numeric(p.end)?p.end-p.start:null;
    const percentage=elapsed!==null&&total>0?Math.min(100,elapsed/total*100):null;
    const phase={preparing:'Preparing ranked portfolio',farming:'Farming',liquidation_followup:'Liquidation follow-up',completed:'Common cutoff reached'}[p.phase]||'Unknown';
    const markets=(p.markets||[]).map(m=>`<div class="paper-market"><strong>${escape(m.title)}</strong><div>${(m.quotes||[]).map(q=>`${escape(count(q.shares))} shares at ${escape(money(q.price))}`).join(' · ')}</div></div>`).join('');
    return `<section class="card pilot-card" aria-labelledby="paper-title">
      <div class="pilot-header"><div><div class="lbl">Current V5 candidate · read-only</div><h2 id="paper-title">MM Bot V5 · V3 allocation paper test</h2></div><span class="pill w" role="status">${label}</span></div>
      <p class="disclaimer">V3 exact-pair reward ranking and risk-based share sizing are restored. Portfolio size follows simulated cash, event limits and the $100 loss guard. Quotes, fills and exits are simulated. Funded startup remains on hold.</p>
      <div class="pilot-progress"><strong>${percentage===null?'Preparing':percentage.toFixed(1)+'%'}</strong><span>${elapsed===null?'Not started':(elapsed/3600).toFixed(2)+' h'} / 30.5 h · ${escape(phase)}</span></div>
      <progress max="100" ${percentage===null?'':`value="${percentage.toFixed(3)}"`} aria-label="Paper test duration"></progress>
      <p class="sub">24 h farming ends ${escape(numeric(p.farm_end)?clock(p.farm_end*1000):'Unavailable')}<br>6½ h common follow-up ends ${escape(numeric(p.end)?clock(p.end*1000):'Unavailable')}</p>
      <p class="pilot-updated ${stale&&!ended?'stale':''}">Observation ${escape(numeric(p.observed_at)?clock(p.observed_at*1000):'Unavailable')}${stale&&!ended?' · Last snapshot only; current progress is unverified.':''}</p>
      <dl class="pilot-metrics">
        ${metric('Simulated farming markets',count(p.farming_markets),'Actual candidate portfolio')}
        ${metric('Simulated fills',count(p.simulated_fills),'Public-trade queue model')}
        ${metric('Estimated accrued rewards',money(p.modeled_rewards),'Conditional estimate; not received cash')}
        ${metric('Conservative reward model',money(p.conservative_reward_model),'Separate denominator assumption')}
        ${metric('Simulated realized trading P/L',money(p.simulated_realized_trading_pl),'Includes simulated exit fees; excludes rewards')}
        ${metric('UNSOLD cost exposure',money(p.remaining_cost_exposure),count(p.unsold_shares)+' remaining shares')}
        ${metric('Simulated cash',money(p.simulated_cash),'Reward estimates never credited to cash')}
        ${metric('Real orders',count(p.real_orders),'No funded trading enabled')}
      </dl>
      <details class="paper-details"><summary>Selected markets, quote sizes and coverage</summary>${markets||'<p class="disclaimer">No current entry quotes.</p>'}<dl class="pilot-metrics">
        ${metric('Simulated starting cash',money(p.initial_cash))}
        ${metric('Reserved quote cash',money(p.cash_committed))}
        ${metric('Reward-market discovery',count(p.discovery_markets),'Separate from selected farming markets')}
        ${metric('Valid scored candidates',count(p.scored_candidates),'All cheap-fundable candidates evaluated')}
        ${metric('Recorded source inputs',count(p.source_inputs))}
        ${metric('Coverage gaps',count(p.gaps),'Gaps remain unknown; no placeholder fills')}
        ${metric('Observed quote market-hours',numeric(p.quote_market_seconds)?(p.quote_market_seconds/3600).toFixed(2):'Unavailable')}
        ${metric('Unknown quote market-hours',numeric(p.unknown_quote_seconds)?(p.unknown_quote_seconds/3600).toFixed(2):'Unavailable')}
        ${metric('Paper private memory',gib(p.private_bytes))}
        ${metric('Available RAM',gib(p.free_ram))}
        ${metric('SSD free space',gib(p.free_ssd))}
        ${metric('Pending tape frames',count(p.pending_tape_events))}
      </dl></details>
      <p class="disclaimer">Public-book reward estimates and counterfactual fills are preliminary model outputs. They do not establish received rewards, spendable cash or profitability. No-bid and partial exits retain inventory through the shared cutoff.</p>
      <div class="pilot-actions"><button type="button" id="paper-refresh">Refresh paper test</button><span class="sub">Status uploads every 2½ minutes</span></div>
    </section>`;
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
    return `${doc.paper?paperRender(doc.paper,now)+'<details class="infra-details"><summary>Separate infrastructure commissioning · original frozen run</summary>':''}<section class="card pilot-card" aria-labelledby="pilot-title">
      <div class="pilot-header"><div><div class="lbl">Infrastructure commissioning · read-only</div><h2 id="pilot-title">MM Bot V5 · shadow commissioning</h2></div><span class="pill w" role="status">${label}</span></div>
      <p class="disclaimer">Funded startup is on hold. This separate frozen run checks capture, account reconciliation and resource use.${doc.paper?' The portfolio strategy test is shown above.':' V3 reward allocation restoration is pending.'}</p>
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
    </section>${doc.paper?'</details>':''}`;
  }

  function paint() {
    const root=document.getElementById('pilot-monitor');
    const expanded=root.querySelector('.pilot-details')?.open;
    const paperExpanded=root.querySelector('.paper-details')?.open, infraExpanded=root.querySelector('.infra-details')?.open;
    if (latest) root.innerHTML=render(latest);
    else root.innerHTML='<section class="card pilot-card"><h2>MM Bot V5 · pilot monitor</h2><p class="disclaimer">Pilot status unavailable. No current capture, trading or earnings state is inferred.</p><button type="button" id="pilot-refresh">Try again</button></section>';
    document.getElementById('pilot-refresh')?.addEventListener('click',load);
    document.getElementById('paper-refresh')?.addEventListener('click',load);
    if(expanded&&root.querySelector('.pilot-details'))root.querySelector('.pilot-details').open=true;
    if(paperExpanded&&root.querySelector('.paper-details'))root.querySelector('.paper-details').open=true;
    if(infraExpanded&&root.querySelector('.infra-details'))root.querySelector('.infra-details').open=true;
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
  if(typeof module!=='undefined')module.exports={validate,freshness,render,paperRender,escape};
})();
