/* Report-only renderer. Prepared locally; publication requires reviewed data. */
(function(root){
  'use strict';
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=x=>finite(x)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(x):'Unknown';
  const date=x=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(x));
  function validate(history){
    if(history?.status!=='reviewed'||history.data_kind!=='recorded'||!Array.isArray(history.points)||history.points.length<2)throw Error('Reviewed recorded time series required');
    let last=-Infinity,priorN=-1;
    const names=history.points[0].rows.map(r=>r.name).sort();
    if(names.length!==21||new Set(names).size!==21||!names.includes('immediate_exit_v1'))throw Error('Common frozen rule bank required');
    for(const p of history.points){
      const at=+new Date(p.timestamp);
      if(!Number.isFinite(at)||at<=last)throw Error('Timepoints must be strictly chronological');
      const ids=p.rows.map(r=>r.name).sort();
      if(JSON.stringify(ids)!==JSON.stringify(names))throw Error('Timepoint bank differs');
      const n=p.rows[0].episodes,shares=p.rows[0].starting_shares;
      if(!Number.isInteger(n)||n<priorN||!finite(shares)||shares<0)throw Error('Invalid common cohort');
      for(const r of p.rows){
        if(r.episodes!==n||!finite(r.starting_shares)||Math.abs(r.starting_shares-shares)>1e-7)throw Error('Rule has a different cohort');
        if(!Number.isInteger(r.unknown_episodes)||r.unknown_episodes<0||r.unknown_episodes>n||!finite(r.remaining_shares)||r.remaining_shares<0)throw Error('Invalid inventory count');
        for(const key of ['total_pnl','realized_pnl'])if(r[key]!==null&&!finite(r[key]))throw Error('Invalid P/L value');
        if(r.unknown_episodes>0&&r.total_pnl!==null)throw Error('Unknown inventory hidden in total P/L');
      }
      last=at;priorN=n;
    }
    return names;
  }
  function pathParts(points,name,field,x,y){
    const parts=[];let current=[];
    for(const p of points){
      const value=p.rows.find(r=>r.name===name)[field];
      if(finite(value))current.push([x(+new Date(p.timestamp)),y(value)]);
      else if(current.length){parts.push(current);current=[];}
    }
    if(current.length)parts.push(current);
    return parts;
  }
  function mount(host,history,labels={}){
    const names=validate(history),points=history.points,shown=new Set(names);
    const realizedOnly=history.accounting==='realized_only';
    let field=realizedOnly?'realized_pnl':'total_pnl',index=points.length-1;
    const color=name=>name==='immediate_exit_v1'?'#ffffff':`hsl(${(names.indexOf(name)*137.508)%360} 72% 65%)`;
    const label=name=>labels[name]||name;
    host.innerHTML='<div class="pnl-controls"><label>Measure <select data-measure>'+(realizedOnly?'':'<option value="total_pnl">Trading P/L including open inventory</option>')+'<option value="realized_pnl">Realized P/L only</option></select></label></div><p data-measure-note class="footnote"></p><div data-plot></div><p class="footnote">Historical timepoints in Europe/Paris. Lines join sampled observations; movements between points are not reconstructed. '+(realizedOnly?'Realized simulated exits only: open holdings and their unrecognized cost are excluded. Do not use this curve to rank holding rules. No historical inventory marks were reconstructed. Final assumed sales remain separate in the results table.':'Missing total values break the line. Open inventory uses recorded book-route estimates; uncovered shares remain UNSOLD at the last recorded trade mark. Last-trade report age is not proof of actual trade age.')+' Rewards are excluded.</p><div data-legend class="pnl-legend"></div><label class="pnl-time">Inspect recorded time <input data-time type="range" min="0" max="'+(points.length-1)+'" step="1" value="'+index+'"></label><div data-detail aria-live="polite"></div>';
    const plot=host.querySelector('[data-plot]'),detail=host.querySelector('[data-detail]');
    host.querySelector('[data-legend]').innerHTML=names.map(n=>'<label><input type="checkbox" checked data-rule="'+esc(n)+'"><span style="color:'+color(n)+'">●</span> '+esc(n==='immediate_exit_v1'?'Immediate exit':n)+'</label>'+(n==='immediate_exit_v1'?'<label><input type="checkbox" checked data-select-all> Select all</label>':'')).join('');
    const selectAll=host.querySelector('[data-select-all]');
    function draw(){
      selectAll.checked=shown.size===names.length;
      selectAll.indeterminate=shown.size>0&&shown.size<names.length;
      host.querySelector('[data-measure-note]').textContent=field==='realized_pnl'?'Realized P/L excludes open holdings and their unrecognized cost. A rule can look better simply by holding losses. Do not rank holding rules from this view.':'Includes estimated value of open inventory; UNSOLD marks are not guaranteed sale proceeds.';
      const start=+new Date(points[0].timestamp),end=+new Date(points.at(-1).timestamp);
      const values=points.flatMap(p=>p.rows.filter(r=>shown.has(r.name)).map(r=>r[field])).filter(finite);
      let low=Math.min(0,...values),high=Math.max(0,...values);if(low===high){low-=1;high+=1;}
      const span=high-low;low-=span*.05;high+=span*.05;
      const x=t=>90+(t-start)/(end-start)*860,y=v=>25+(high-v)/(high-low)*290;
      let svg='<svg viewBox="0 0 1000 370" role="img" aria-label="Historical '+(field==='total_pnl'?'total':'realized')+' trading profit and loss by rule">';
      for(let i=0;i<=4;i++){
        const v=low+(high-low)*i/4,yy=y(v);
        svg+='<path d="M90 '+yy+' H950" stroke="#263b43"/><text x="82" y="'+(yy+4)+'" text-anchor="end" fill="#b5c5cb" font-size="13">'+esc(money(v))+'</text>';
        const t=start+(end-start)*i/4;
        svg+='<text x="'+x(t)+'" y="342" text-anchor="middle" fill="#b5c5cb" font-size="12">'+esc(date(t))+'</text>';
      }
      for(const name of names.filter(n=>shown.has(n))){
        for(const part of pathParts(points,name,field,x,y)){
          const d=part.map((xy,i)=>(i?'L':'M')+xy[0]+' '+xy[1]).join(' ');
          svg+='<path d="'+d+'" fill="none" stroke="'+color(name)+'" stroke-width="'+(name==='immediate_exit_v1'?3:1.8)+'"'+(name==='immediate_exit_v1'?' stroke-dasharray="7 4"':'')+'><title>'+esc(label(name))+'</title></path>';
          for(const [xx,yy] of part)svg+='<circle cx="'+xx+'" cy="'+yy+'" r="2" fill="'+color(name)+'"/>';
        }
      }
      svg+='<path d="M'+x(+new Date(points[index].timestamp))+' 20 V320" stroke="#a2afb5" stroke-dasharray="3 4"/></svg>';
      plot.innerHTML=svg;
      const p=points[index];
      if(realizedOnly){
        detail.innerHTML='<p><strong>'+esc(date(p.timestamp))+' Paris</strong> · '+p.rows[0].episodes+' common fills accumulated by this point.</p><div class="table-scroll"><table><thead><tr><th>Rule</th><th>Realized simulated P/L</th><th>Open shares</th><th>Unrecognized entry cost</th><th>Open lots</th></tr></thead><tbody>'+p.rows.filter(r=>shown.has(r.name)).map(r=>'<tr><td>'+esc(label(r.name))+'</td><td>'+money(r.realized_pnl)+'</td><td>'+r.remaining_shares.toLocaleString('en-US',{maximumFractionDigits:3})+'</td><td>'+money(r.open_cost_basis)+'</td><td>'+r.open_lots+'</td></tr>').join('')+'</tbody></table></div>';
      }else{
      detail.innerHTML='<p><strong>'+esc(date(p.timestamp))+' Paris</strong> · '+p.rows[0].episodes+' common fills accumulated by this point.</p><div class="table-scroll"><table><thead><tr><th>Rule</th><th>'+(field==='total_pnl'?'Total P/L':'Realized P/L')+'</th><th>Open before marking</th><th>Book-exit estimate (shares)</th><th>UNSOLD shares</th><th>Unknown lots</th><th>Last-trade report age</th></tr></thead><tbody>'+p.rows.filter(r=>shown.has(r.name)).sort((a,b)=>field==='realized_pnl'?a.name.localeCompare(b.name):(finite(b[field])?b[field]:-Infinity)-(finite(a[field])?a[field]:-Infinity)).map(r=>'<tr><td>'+esc(label(r.name))+'</td><td>'+money(r[field])+'</td><td>'+r.remaining_shares.toLocaleString('en-US',{maximumFractionDigits:3})+'</td><td>'+r.book_exit_shares.toLocaleString('en-US',{maximumFractionDigits:3})+'</td><td><strong>'+r.unsold_shares.toLocaleString('en-US',{maximumFractionDigits:3})+'</strong></td><td>'+r.unknown_episodes+'</td><td>'+(finite(r.oldest_trade_observation_seconds)?(r.oldest_trade_observation_seconds/60).toFixed(1)+' min':'—')+'</td></tr>').join('')+'</tbody></table></div>';
      }
    }
    host.querySelector('[data-measure]').onchange=e=>{field=e.target.value;draw();};
    host.querySelector('[data-time]').oninput=e=>{index=Number(e.target.value);draw();};
    selectAll.onchange=()=>{
      const checked=selectAll.checked;
      shown.clear();
      host.querySelectorAll('[data-rule]').forEach(input=>{input.checked=checked;if(checked)shown.add(input.dataset.rule);});
      draw();
    };
    host.querySelectorAll('[data-rule]').forEach(input=>input.onchange=()=>{input.checked?shown.add(input.dataset.rule):shown.delete(input.dataset.rule);draw();});
    draw();
  }
  const api={validate,pathParts,mount};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ResearchPnlChart=api;
})(typeof window==='undefined'?globalThis:window);

(() => {
  'use strict';
  const FEED='https://gist.githubusercontent.com/maltagamingstore/7f02dc27888b5de7ad0e7290128a4fe6/raw/research1.json';
  const LOCAL_PREVIEW=['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('preview')==='local';
  const $=id=>document.getElementById(id);
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n):'—';
  const names={immediate_exit_v1:'Immediate exit'};
  const byLoss=(a,b)=>{
    const x=Number.isFinite(a.trading_loss)?a.trading_loss:Infinity;
    const y=Number.isFinite(b.trading_loss)?b.trading_loss:Infinity;
    return x===y?0:x-y;
  };
  let data=null;
  let finalSort='loss';
  let selectedRound=null;
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const rateMoney=n=>finite(n)?n.toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:Math.abs(n)>0&&Math.abs(n)<0.01?4:2}):'Unknown';
  function comparisonCharts(s,label){
    if(s.pnl_history?.status!=='reviewed'){
      $('final-charts').innerHTML='<h3>Trading P/L over recorded time</h3><p>Reviewed chronological history is unavailable for this recording. Final results remain below; no curve is inferred from the endpoint.</p>';
      return;
    }
    const realized=s.pnl_history.accounting==='realized_only';
    $('final-charts').innerHTML='<h3>Trading P/L over recorded time</h3><p>'+escape(s.label||'Research1')+' · '+(realized?'<strong>Realized simulated P/L only.</strong> Open holdings are excluded from the curve and shown in the time inspector. Use the inventory-inclusive final table for the rule comparison.':'Trading P/L includes open inventory and estimated fees. The common cohort grows as fills occur; this is not funded-bot equity.')+'</p><div id="pnl-history-chart"></div>';
    window.ResearchPnlChart.mount($('pnl-history-chart'),s.pnl_history,Object.fromEntries(s.rows.map(r=>[r.name,label(r.name)])));
  }
  function farmingRewardReport(){
    const host=$('farming-rewards'),r=data?.farming_rewards?.[selectedRound];
    if(!host)return;
    host.hidden=r?.status!=='reviewed'||r?.alignment?.status!=='reviewed';
    if(host.hidden){host.innerHTML='';return;}
    const n=x=>finite(x)?x.toLocaleString('en-US',{maximumFractionDigits:2}):'Unknown';
    const pct=x=>finite(x)?n(x*100)+'%':'Unknown';
    const when=t=>new Date(t).toLocaleString('en-GB',{timeZone:'Europe/Paris'});
    host.innerHTML='<div class="section-title"><h2>Estimated farming rewards</h2><span>Recorded basket · unlimited funding assumed</span></div>'+
      '<p>Our hypothetical common farming orders across <strong>'+n(r.quoted_markets)+' quoted markets</strong>, including markets that never filled. '+escape(when(r.start))+' → '+escape(when(r.end))+' Paris ('+n(r.duration_hours)+' hours).</p>'+
      '<div class="status-strip"><div><span class="label">ESTIMATED GROSS REWARDS</span><strong>'+money(r.estimated_reward_usd)+'</strong><small>Over this recorded window</small></div><div><span class="label">24-HOUR EQUIVALENT</span><strong>'+money(r.daily_equivalent_usd)+'</strong><small>Rescaled estimate · not a forecast</small></div><div><span class="label">COMPETITION SENSITIVITY</span><strong>'+money(r.side_sum_estimate_usd)+'</strong><small>Same window · side-sum model</small></div></div>'+
      '<p><strong>Hypothetical gross reward estimates. No rewards were earned, accrued or received by this replay.</strong> These are not spendable cash. Both figures are model scenarios; the sensitivity figure is neither a guaranteed minimum nor a confidence bound. Our actual reward share is unmeasured. All handling rules share this farming schedule. Rewards are separate from the trading P/L chart and rule rankings above.</p>'+
      '<p>Matched to the original replay orders: '+n(r.alignment.adverse_fill_markets)+' markets had adverse fills; '+n(r.alignment.quoted_markets_without_adverse_fills)+' other markets had farming orders without adverse fills. Monitored markets with no farming orders contribute no rewards. Exit valuation ends '+escape(when(r.alignment.boundaries.exit_valuation_cutoff))+' Paris; time after the farming cutoff earns no rewards.</p>'+
      (r.alignment.boundaries.explanation?'<p class="footnote">'+escape(r.alignment.boundaries.explanation)+'</p>':'')+
      '<div class="table-scroll"><table><thead><tr><th>Coverage and context</th><th>Value</th></tr></thead><tbody>'+
      '<tr><td>Simulated farming market-hours</td><td>'+n(r.quote_market_hours)+'</td></tr>'+
      '<tr><td>Market-hours with rate and score estimate</td><td>'+n(r.scored_market_hours)+'</td></tr>'+
      '<tr><td>Market-hours excluded from reward estimate: missing inputs</td><td>'+n(r.unknown_estimate_market_hours)+'</td></tr>'+
      '<tr><td>Advertised pool during known-rate farming time · shared by all farmers</td><td>'+money(r.offered_pool_usd)+'</td></tr>'+
      '<tr><td>Modeled pool-weighted reward share · supported intervals</td><td>'+pct(r.modeled_pool_weighted_share)+'</td></tr></tbody></table></div>'+
      '<details><summary>Estimated rewards over recorded time</summary><p>Hourly bins from the stated window start; the last bin may be shorter than an hour. Market-hours sum simultaneous markets.</p><div class="table-scroll"><table><thead><tr><th>From · Paris</th><th>Estimated rewards</th><th>Side-sum sensitivity</th><th>Farming market-hours</th><th>Unknown market-hours</th></tr></thead><tbody>'+r.hours.map(h=>'<tr><td>'+escape(when(h.start))+'</td><td>'+money(h.estimate)+'</td><td>'+money(h.side_sum_estimate)+'</td><td>'+n(h.quote_market_hours)+'</td><td>'+n(h.unknown_market_hours)+'</td></tr>').join('')+'</tbody></table></div></details>'+
      '<details><summary>How the estimate is calculated and what remains uncertain</summary><ul>'+r.limitations.map(t=>'<li>'+escape(t)+'</li>').join('')+'</ul></details>';
  }
  function finalBatchReport(){
    const section=$('final-batch'),s=selectedRound==='research1'?data?.final_batch:data?.[selectedRound];
    if(!section)return;
    farmingRewardReport();
    section.hidden=s?.status!=='reviewed';if(section.hidden)return;
    $('round-title').textContent='Research'+selectedRound.slice(-1)+' · final results';
    $('cohort').textContent='Closed recording · '+s.episodes+' episodes';
    $('entry-admission').textContent=selectedRound!=='research1'?'V4-style quotes at a known positive published reward minimum of 50 shares or fewer. The handling rules are unchanged.':'V4-style quotes at the published reward minimum. No market-selection or reward filter.';
    const count=n=>finite(n)?n.toLocaleString('en-US',{maximumFractionDigits:2}):'Unknown';
    const paris=t=>new Date(t).toLocaleString('en-GB',{timeZone:'Europe/Paris'});
    const lotHours=n=>finite(n)?n.toLocaleString('en-US',{maximumFractionDigits:3}):'Unknown';
    const label=id=>names[id]||(id+' · '+((data.mutations||[]).find(m=>m.id===id)?.name||id));
    const base=s.rows.find(r=>r.name==='immediate_exit_v1');
    const v2=s.valuation_version==='v2';
    const sourceCheck=s.source_reference_review;
    const sourceNote=v2&&sourceCheck?'<details class="footnote"><summary>Data verification limits</summary><p>'+escape(sourceCheck.scope)+' Full chronological source selection and execution are not independently proved by these checks.</p><p>'+count(sourceCheck.partial_ws_references)+' book-update references have only partial depth checks; '+count(sourceCheck.unresolved_metadata_references)+' fee/market-identity references were not directly authenticated. '+count(sourceCheck.planning_excluded_reference_occurrences)+' source-reference occurrences were excluded from the reading plan.</p><p>'+count(sourceCheck.reference_limitation_occurrences)+' limitation annotations remain across the checked references. These overlap; they are not separate failed records:</p><ul>'+Object.entries(sourceCheck.reference_limitations_by_reason||{}).map(([reason,n])=>'<li>'+count(n)+' · '+escape(reason)+'</li>').join('')+'</ul></details>':'';
    const closeDetails=r=>v2
      ? r.normal_completed+' normal completed'+(finite(r.normal_paired_completed)?'<br><small>'+r.normal_paired_completed+' paired completed / '+s.episodes+' common</small>':'')+'<br><small>'+count(r.book_exit_shares)+' shares in book-exit estimates<br><strong>'+count(r.unsold_shares)+' shares UNSOLD</strong> · '+count(r.trade_marked_shares)+' valued at last trade</small>'
      : r.normal_completed+' / '+r.assumed_episodes+'<br><small>'+count(r.assumed_shares)+' shares in assumed sales</small>';
    comparisonCharts(s,label);
    const rows=[...s.rows].sort((a,b)=>{
      if(finalSort==='loss')return byLoss(a,b);
      const field=finalSort==='hour'?'savings_per_held_hour':'held_hours';
      if(!finite(a[field]))return finite(b[field])?1:a.name.localeCompare(b.name);
      if(!finite(b[field]))return -1;
      return (finalSort==='hour'?b[field]-a[field]:a[field]-b[field])||a.name.localeCompare(b.name);
    });
    $('final-table').innerHTML='<div class="sample-banner"><strong>Closed recording · '+s.episodes+' common fills · '+s.episode_markets+' recorded markets</strong><p>'+escape(paris(s.recording_start))+' → '+escape(paris(s.window_end))+' Paris</p><p>'+count(s.common_starting_shares)+' identical starting shares per rule. Common immediate-exit loss: <strong>'+money(base.trading_loss)+'</strong>.</p></div>'+
      (s.farming_end?'<p>New entries end '+escape(paris(s.farming_end))+' Paris, after '+count(s.farming_duration_hours)+' hours. The next six hours are follow-up only; extra recorded time does not guarantee liquidation.</p>':'')+
      '<p>All qualifying fills generated during this recording have been processed chronologically to its end. Earlier recording entries are excluded from this table. '+(v2?'Residual value uses recorded book depth for direct sale or buying the opposite token and merging. Any remaining shares are <strong>UNSOLD</strong>, valued at the last recorded trade. These marks are not sale proceeds.':'Residual shares are included through the agreed assumed sale at the last positive recorded bid, with recorded fee estimates.')+'</p>'+
      '<ul>'+(s.conclusions||[]).map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul>'+
      '<div class="score-controls"><label for="final-sort">Order by </label><select id="final-sort"><option value="loss"'+(finalSort==='loss'?' selected':'')+'>Total loss · lowest first</option><option value="hour"'+(finalSort==='hour'?' selected':'')+'>Saved per holding hour · highest first</option><option value="hours"'+(finalSort==='hours'?' selected':'')+'>Holding hours · lowest first</option></select></div>'+
      '<div class="table-scroll"><table><thead><tr><th>Rule</th><th>Loss incl. final inventory</th><th>Saved vs same control</th><th>'+(v2?'Normal closes / estimated exits / UNSOLD':'Normal / assumed closes')+'</th><th>Holding lot-hours</th><th>Saved per holding hour</th><th>Unknown outcomes</th></tr></thead><tbody>'+rows.map(r=>'<tr data-final-rule="'+escape(r.name)+'"><td>'+escape(label(r.name))+(r.name==='R020'?'<br><small>Reward trigger excluded; same effective rule as R010</small>':'')+'</td><td><strong>'+money(r.trading_loss)+'</strong></td><td>'+money(r.saved_vs_control)+'</td><td>'+closeDetails(r)+'</td><td>'+lotHours(r.held_hours)+' h</td><td>'+(r.held_hours===0?'N/A · zero lot-hours':rateMoney(r.savings_per_held_hour))+'</td><td>'+r.unknown_episodes+'<br><small>'+count(r.unpriced_shares)+' unpriced shares</small></td></tr>').join('')+'</tbody></table></div>'+
      '<p class="footnote">The same complete cohort is used for every row. '+(v2?'Book exits use qualified observations at most 30 seconds old and are estimates, not guaranteed fills. The two routes do not add mirrored liquidity. Merge operational costs and latency are unmeasured. Last-trade marks have no fictional executed exit fee; a recent book report does not prove a recent trade.':'Last-positive-bid sales are accounting assumptions: historical quotes may be stale and may lack enough executable size. A later empty or zero-bid update does not erase an earlier positive quote in this convention.')+' Late fills have shorter follow-up to the common recording end; this is not an equal-age six-hour test. Holding hours sum independent fills, include gaps and can exceed the recording duration. Saved per hour is not measured lost rewards, capital efficiency or bot ROI. Unknown fees/prices remain unknown.</p>';
    $('final-sort').onchange=e=>{finalSort=e.target.value;finalBatchReport();};
    $('final-table').insertAdjacentHTML?.('beforeend',sourceNote);
    if(v2)$('final-table').insertAdjacentHTML('beforeend','<p class="footnote">The frozen model uses public HTTP snapshots and observed prints, zero cancel latency, common-control-gated reentry and independent overlapping lots. No shared capital or competing-lot depth constraint is modeled. Fees use recorded schedules; exact per-match fees and rounding are not independently validated.</p>');
    $('round-supplement').hidden=!s.unsold_zero_sensitivity&&!s.advertised_pools;
    $('round-supplement').open=false;
    $('round-extra').innerHTML='';
    if(s.unsold_zero_sensitivity){
      const stress=Object.fromEntries(s.unsold_zero_sensitivity.map(r=>[r.name,r]));
      const rate=r=>r.savings_per_held_hour===null?'N/A · zero lot-hours':rateMoney(r.savings_per_held_hour);
      $('round-extra').innerHTML='<section class="results"><div class="section-title"><h2>Unsold-inventory sensitivity</h2><span>Same common cohort and control</span></div><p>Separate hypothetical scenario: value every UNSOLD share at zero in both the rule and control, retaining simulated cashflows and holding time. Zero is not an observed price, executed sale or full worst-case bound.</p><div class="table-scroll"><table><thead><tr><th>Rule</th><th>UNSOLD shares</th><th>Saved · trade marks</th><th>Saved · zero recovery</th><th>Saved/lot-hour · marks</th><th>Saved/lot-hour · zero</th></tr></thead><tbody>'+rows.map(r=>'<tr data-stress-rule="'+escape(r.name)+'"><td>'+escape(label(r.name))+'</td><td>'+count(r.unsold_shares)+'</td><td>'+money(r.saved_vs_control)+'</td><td>'+money(stress[r.name].saved_vs_control)+'</td><td>'+rate(r)+'</td><td>'+rate(stress[r.name])+'</td></tr>').join('')+'</tbody></table></div></section>';
    }
    if(s.advertised_pools){
      const p=s.advertised_pools;
      $('round-extra').insertAdjacentHTML('beforeend','<section class="results"><div class="section-title"><h2>Advertised reward pools</h2><span>Separate from trading P/L</span></div><p>'+count(p.quoted_markets)+' simulated quoted markets, including '+count(p.quoted_markets_without_any_recorded_simulated_fill)+' without an adverse fill. Known advertised all-farmer pools integrate to <strong>'+money(p.integrated_known_advertised_pool_usd)+'</strong>, equivalent to <strong>'+money(p.known_pool_daily_equivalent_over_entry_window_usd)+'/day</strong> over the entry window.</p><p>'+count(p.known_rate_market_hours)+' known-rate market-hours; '+count(p.unknown_rate_market_hours)+' unknown-rate market-hours. Actual earned rewards and the required share for profit remain unknown. These pools belong to all farmers; do not add them to bot P/L.</p><ul>'+p.limitations.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul></section>');
    }

  }
  function render(doc,fallback=false){
    if(doc.schema!==1||!Array.isArray(doc.results)||doc.data_kind!=='recorded')throw Error('Unsupported research summary');
    data=doc;$('stage').textContent=doc.state;$('tests').textContent=doc.tests.passed?doc.tests.count+' tests passed':'Needs revalidation';
    const available=['research1',...['research2','research3'].filter(k=>doc[k]?.status==='reviewed')];
    if(selectedRound===null){const requested=new URLSearchParams(location.search).get('round');selectedRound=available.includes(requested)?requested:available.at(-1);finalSort='hour';}
    if(!available.includes(selectedRound))selectedRound='research1';
    for(const option of $('round-select').options)option.disabled=!available.includes(option.value);
    $('round-choice').hidden=available.length===1;
    $('round-select').value=selectedRound;
    $('round-select').onchange=e=>{selectedRound=e.target.value;finalSort='hour';finalBatchReport();};
    $('cohort').textContent=doc.final_batch?.status==='reviewed'?'Closed recording · '+doc.final_batch.episodes+' episodes':'Final results unavailable';
    const mutations=doc.mutations||[];
    $('mutation-status').textContent=mutations.length+' rules · '+(doc.mutation_checks?.passed?'behavior tests passed':'verification pending');
    $('mutation-list').innerHTML=mutations.map(r=>'<li class="mutation"><span class="step">'+escape(r.id)+' / '+escape(r.family.replaceAll('_',' '))+'</span><h3>'+escape(r.name)+'</h3><p>'+escape(r.description)+'</p><span class="mutation-state">'+(doc.final_batch?.status==='reviewed'?(r.id==='R020'?'Recovery/deadline only · reward trigger excluded':'Closed recording result available'):'Awaiting final results')+'</span></li>').join('');
    const stamp=new Date(doc.published_at), age=Date.now()-stamp;
    if(!Number.isFinite(+stamp))throw Error('Missing sync timestamp');
    $('sync-time').textContent=(LOCAL_PREVIEW?'Local preview · not uploaded · ':fallback?'Saved snapshot · ':'Last synced · ')+stamp.toLocaleString()+((age>7*3600000)?' · update overdue':'');
    $('sync-time').classList.toggle('stale',fallback||age>7*3600000);
    $('updated').textContent='Research updated '+new Date(doc.research_updated_at).toLocaleDateString();
    $('next-steps').innerHTML=doc.next_steps.map(s=>'<li>'+escape(s)+'</li>').join('')||'<li>No pending steps in the published summary.</li>';
    finalBatchReport();
  }
  async function refresh(){
    $('refresh').disabled=true;$('load-error').hidden=true;
    try{
      let doc,fallback=false;
      if(LOCAL_PREVIEW){
        const r=await fetch('./data.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
        if(!r.ok)throw Error('Local preview unavailable');
        doc=await r.json();
      }else{
      try{const r=await fetch(FEED+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Feed unavailable');doc=await r.json();}
      catch{const r=await fetch('./data.json',{cache:'no-store'});if(!r.ok)throw Error('Summary unavailable');doc=await r.json();fallback=true;}
      }
      render(doc,fallback);
    }catch{$('load-error').hidden=false;$('load-error').textContent='The research summary could not be refreshed. Any displayed data is the last loaded snapshot.';}
    finally{$('refresh').disabled=false;}
  }
  $('refresh').onclick=refresh;
  // The publisher runs every six hours. An open page checks for that snapshot.
  refresh();setInterval(refresh,5*60*1000);
})();
