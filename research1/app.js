(() => {
  'use strict';
  const FEED='https://gist.githubusercontent.com/maltagamingstore/7f02dc27888b5de7ad0e7290128a4fe6/raw/research1.json';
  const LOCAL_PREVIEW=['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('preview')==='local';
  const $=id=>document.getElementById(id);
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n):'—';
  const pct=n=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(1)+'%':'—';
  const names={immediate_exit_v1:'Immediate exit'};
  const byLoss=(a,b)=>{
    const x=Number.isFinite(a.trading_loss)?a.trading_loss:Infinity;
    const y=Number.isFinite(b.trading_loss)?b.trading_loss:Infinity;
    return x===y?0:x-y;
  };
  let data=null;
  let managementSort='score';
  let maxOpenHours='';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  function managementScores(){
    const target=$('management-score'), score=data?.preliminary?.management_score;
    if(!target)return;
    if(score?.status!=='reviewed'){
      target.innerHTML='<p class="footnote">Holding-time scores are being calculated and checked on this exact recorded batch. The completed-loss comparison above is available now.</p>';
      return;
    }
    const limit=maxOpenHours.trim()===''?null:Number(maxOpenHours);
    const rows=score.rows.filter(r=>limit===null||!Number.isFinite(limit)||limit<0||r.oldest_open_hours<=limit).sort((a,b)=>{
      const field=managementSort==='score'?'savings_per_episode_hour':'oldest_open_hours';
      const x=finite(a[field])?a[field]:-Infinity, y=finite(b[field])?b[field]:-Infinity;
      return x===y?a.name.localeCompare(b.name):y-x;
    });
    const label=id=>names[id]||(id+' · '+((data.mutations||[]).find(m=>m.id===id)?.name||id));
    const hours=n=>finite(n)?n.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
    const rate=n=>finite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:3,maximumFractionDigits:3}).format(n):'—';
    const status=r=>r.status==='zero_episode_hours'?'No elapsed holding time':r.status==='no_comparable_completed'?'No realized benefit measured yet':r.status==='incomplete_unpaired_completed'?'Incomplete dollar comparison':r.realized_savings_usd<0?'More loss than immediate exit':r.open_episodes>0?'Open inventory remains':'All episodes flat';
    target.innerHTML='<div class="score-controls"><label for="management-sort">Order by </label><select id="management-sort"><option value="score"'+(managementSort==='score'?' selected':'')+'>Savings per episode-hour · highest first</option><option value="oldest"'+(managementSort==='oldest'?' selected':'')+'>Oldest open fill · longest first</option></select></div><div class="table-scroll"><table><thead><tr><th>Rule</th><th>Realized $ saved*</th><th>All episode-hours held</th><th>$/episode-hour*</th><th>Open / common episodes</th><th>Oldest open fill</th><th>Inventory status</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+escape(label(r.name))+'</td><td>'+money(r.realized_savings_usd)+'</td><td>'+hours(r.episode_hours)+'</td><td>'+rate(r.savings_per_episode_hour)+'</td><td>'+r.open_episodes+' / '+data.preliminary.episodes+'</td><td>'+hours(r.oldest_open_hours)+' h</td><td>'+escape(status(r))+'<br><small>'+hours(r.remaining_shares)+' shares held</small></td></tr>').join('')+'</tbody></table></div><p class="footnote">* Realized savings = immediate-exit loss minus rule loss on the same fully closed, fee-known episodes. Every common episode contributes holding time, including unfinished fills and recording gaps. Partial exits earn no savings credit until the episode is fully flat. Overlapping fills add separate episode-hours: this is not elapsed bot time or capital-weighted time. Unknown comparisons and zero-hour rates remain unscored. Negative savings mean extra loss; longer waits can move a negative rate toward zero, so the rate alone cannot eliminate rules. Open inventory is not valued in realized savings. No holding-time cutoff has been imposed. Missed rewards remain excluded.</p>';
    $('management-sort').onchange=event=>{managementSort=event.target.value;managementScores();};
    const controls=target.querySelector('.score-controls');
    controls.insertAdjacentHTML('beforeend','<label for="management-max-hours"> Maximum oldest-open age (hours) </label><input id="management-max-hours" type="number" min="0" step="0.25" placeholder="No cutoff" value="'+escape(maxOpenHours)+'"><span> Showing '+rows.length+' of '+score.rows.length+' rules. This filter only changes the view.</span>');
    $('management-max-hours').onchange=event=>{maxOpenHours=event.target.value;managementScores();};
  }
  function comparisons(){
    if(!data)return;
    const rows=[...data.results].sort(byLoss);
    if(!rows.length && data.preliminary){
      const p=data.preliminary, label=id=>names[id]||(id+' · '+((data.mutations||[]).find(m=>m.id===id)?.name||id));
      const cohortText=p.kind==='three_hour_batch'?p.episodes+' common fill episodes across '+p.episode_markets+' recorded markets. Quoted '+p.quoted_markets.toLocaleString('en-US')+' recorded markets; no arbitrary episode cap.':p.episode_markets+' historical initial-fill market episodes from a captured '+p.membership_markets+'-market cohort. This does not cover every market.';
      $('comparison').innerHTML='<div class="sample-banner"><strong>Preliminary · Recorded market data</strong><p>'+escape(new Date(p.window_start).toLocaleString())+' → '+escape(new Date(p.window_end).toLocaleString())+'</p><p>'+escape(cohortText)+'</p><ul>'+p.limitations.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul></div><div class="table-scroll"><table><thead><tr><th>Rule</th><th>Completed / episodes</th><th>Paired for $ comparison</th><th>Episodes still open</th><th>Common starting shares</th><th>Shares still held</th><th aria-sort="ascending">Loss estimate* ↑</th><th>Immediate exit on same episodes*</th></tr></thead><tbody>'+[...p.rows].sort(byLoss).map(r=>'<tr><td>'+escape(label(r.name))+(r.name==='R020'?'<br><small>Recovery/deadline only; reward trigger excluded</small>':'')+'</td><td>'+r.completed+' / '+r.episodes+'</td><td>'+r.paired_completed+'</td><td>'+r.censored+'</td><td>'+(Number.isFinite(p.common_starting_shares)?p.common_starting_shares.toLocaleString('en-US'):'—')+'</td><td>'+Number(r.remaining_shares).toFixed(2)+'</td><td>'+money(r.trading_loss)+'</td><td>'+money(r.paired_control_loss)+'</td></tr>').join('')+'</tbody></table></div><p class="footnote">* Dollars on each rule’s '+ 'completed, fee-estimated paired subset only. Every rule starts with the same fills and starting shares. Shares still held are what remains after that rule’s sales. Unresolved positions are excluded from these dollar totals and remain visible above. Sorted by loss estimate, lowest first; unknown estimates appear last. Rows can contain different completed episodes, so this order does not establish which rule performs best. This comparison measures adverse-fill trading loss only; missed rewards are excluded. This is not whole-bot profit or a winner verdict.</p>';
      return;
    }
    if(!rows.length){$('comparison').innerHTML='<div class="empty"><div class="symbol">∅</div><h3>No recorded-data results yet</h3><p>The handling rules are implemented. Recorded market events still need to be converted into simulated farming fills, with cancellation, inventory and execution fees accounted for.</p><p>Only results calculated from recorded market data will appear here.</p></div>';return;}
    const bars=rows.map(r=>'<div class="bar-row"><span>'+escape(names[r.name]||r.name)+'</span><div class="bar-track"><div class="bar '+(r.name==='immediate_exit_v1'?'baseline':'')+'" style="width:'+Math.min(100,Math.max(0,r.damage_remaining_pct||0))+'%"></div></div><span class="bar-value">'+pct(r.damage_remaining_pct)+'</span></div>').join('');
    $('comparison').innerHTML='<div class="label">DAMAGE REMAINING · IMMEDIATE EXIT = 100%</div><div class="bars">'+bars+'</div><div class="table-scroll"><table><thead><tr><th>Handling rule</th><th>Trading loss</th><th>Damage reduction</th><th>Completed / episodes</th><th>Unresolved</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+escape(names[r.name]||r.name)+'</td><td>'+money(r.trading_loss)+'</td><td>'+pct(r.damage_reduction_pct)+'</td><td>'+escape(r.completed??'—')+' / '+escape(r.episodes??'—')+'</td><td>'+escape(r.censored??'—')+'</td></tr>').join('')+'</tbody></table></div><p class="footnote">Compare trading losses on identical, fully measured episodes. Missed rewards are excluded. Open inventory and unknown fees cannot be scored as completed zero-loss exits.</p>';
  }
  function render(doc,fallback=false){
    if(doc.schema!==1||!Array.isArray(doc.results)||doc.data_kind!=='recorded')throw Error('Unsupported research summary');
    data=doc;$('stage').textContent=doc.state;$('tests').textContent=doc.tests.passed?doc.tests.count+' tests passed':'Needs revalidation';
    $('cohort').textContent=doc.results.length?'Policy comparisons available':doc.preliminary?'Preliminary · '+(doc.preliminary.episodes??doc.preliminary.episode_markets)+' episodes':'Not available yet';
    const mutations=doc.mutations||[];
    $('mutation-status').textContent=mutations.length+' rules · '+(doc.mutation_checks?.passed?'behavior tests passed':'verification pending');
    $('mutation-list').innerHTML=mutations.map(r=>'<li class="mutation"><span class="step">'+escape(r.id)+' / '+escape(r.family.replaceAll('_',' '))+'</span><h3>'+escape(r.name)+'</h3><p>'+escape(r.description)+'</p><span class="mutation-state">'+(doc.preliminary?(r.id==='R020'?'Recovery/deadline check · reward trigger excluded':(doc.preliminary.kind==='three_hour_batch'?'Recorded batch result available':'Recorded snapshot check available')):'Data available · replay integration unfinished')+'</span></li>').join('');
    const stamp=new Date(doc.published_at), age=Date.now()-stamp;
    if(!Number.isFinite(+stamp))throw Error('Missing sync timestamp');
    $('sync-time').textContent=(LOCAL_PREVIEW?'Local preview · not uploaded · ':fallback?'Saved snapshot · ':'Last synced · ')+stamp.toLocaleString()+((age>7*3600000)?' · update overdue':'');
    $('sync-time').classList.toggle('stale',fallback||age>7*3600000);
    $('updated').textContent='Research updated '+new Date(doc.research_updated_at).toLocaleDateString();
    $('next-steps').innerHTML=doc.next_steps.map(s=>'<li>'+escape(s)+'</li>').join('')||'<li>No pending steps in the published summary.</li>';
    comparisons();
    managementScores();
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
