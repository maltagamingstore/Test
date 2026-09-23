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
  let rewardDay='';
  let horizonSort='score';
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const range=(low,high)=>!finite(low)||!finite(high)?'Unknown':Math.abs(low-high)<.005?money(low):money(low)+' to '+money(high);
  function sixHourComparison(){
    const p=data?.preliminary,s=p?.six_hour_score;
    if(s?.status!=='reviewed')return false;
    const daily=rewardDay.trim()===''?null:Number(rewardDay);
    const hasRate=finite(daily)&&daily>=0;
    const base=s.rows.find(r=>r.name==='immediate_exit_v1');
    const label=id=>names[id]||(id+' · '+((data.mutations||[]).find(m=>m.id===id)?.name||id));
    const hours=n=>finite(n)?n.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
    const scored=s.rows.map(r=>{
      const penalty=hasRate?daily*r.extra_farming_hours/24:null;
      return {...r,penalty,low:finite(r.saved_low)?r.saved_low-(penalty??0):null,high:finite(r.saved_high)?r.saved_high-(penalty??0):null};
    }).sort((a,b)=>{
      const key=horizonSort==='loss'?'loss_high':horizonSort==='hours'?'extra_farming_hours':'low';
      if(!finite(a[key]))return finite(b[key])?1:a.name.localeCompare(b.name);
      if(!finite(b[key]))return -1;
      return (horizonSort==='score'?b[key]-a[key]:a[key]-b[key])||a.name.localeCompare(b.name);
    });
    $('comparison').innerHTML='<div class="sample-banner"><strong>Same '+s.episodes+' simulated fills · six hours after each fill</strong><p>'+s.episode_markets+' recorded markets · '+hours(s.common_starting_shares)+' common starting shares per rule.</p><p>Immediate-exit control: <strong>'+range(base.loss_low,base.loss_high)+'</strong> on this entire same cohort. Control savings = $0.</p><p>Entry window: '+escape(new Date(s.entry_window_start).toLocaleString())+' → '+escape(new Date(s.entry_window_end).toLocaleString())+'. Every fill receives six hours of follow-up; later recorded inputs are included.</p></div>'+
      '<div class="score-controls"><label for="reward-day">Reward assumption: $ per day for one market allocation </label><input id="reward-day" type="number" min="0" step="0.01" placeholder="Not set" value="'+escape(rewardDay)+'"><label for="horizon-sort"> Order by </label><select id="horizon-sort"><option value="score"'+(horizonSort==='score'?' selected':'')+'>Conservative '+(hasRate?'net':'trading')+' savings · highest first</option><option value="loss"'+(horizonSort==='loss'?' selected':'')+'>Conservative trading loss · lowest first</option><option value="hours"'+(horizonSort==='hours'?' selected':'')+'>Extra farming hours · lowest first</option></select></div>'+
      '<p class="footnote">'+(hasRate?'Scenario only: '+money(daily)+'/day per market allocation. Net saved = control loss − rule loss − '+money(daily)+' × extra farming hours ÷ 24. This is not a measured reward rate.':'Reward assumption not set: ordering uses trading-loss bounds only. Reward-adjusted savings remain unknown. Enter a daily assumption to include the cost of waiting.')+'</p>'+
      '<div class="table-scroll"><table><thead><tr><th>Rule</th><th>'+ (hasRate?'Net saved vs control':'Trading saved vs control')+'</th><th>Trading loss incl. open inventory</th><th>Extra reward cost · scenario</th><th>Extra farming hours lost vs control</th><th>Flat at 6h / all fills</th><th>Shares still held at 6h</th><th>Unpriced shares</th></tr></thead><tbody>'+scored.map(r=>'<tr><td>'+escape(label(r.name))+(r.name==='R020'?'<br><small>Recovery/deadline only; reward trigger excluded</small>':'')+'</td><td><strong>'+range(r.low,r.high)+'</strong></td><td>'+range(r.loss_low,r.loss_high)+'</td><td>'+money(r.penalty)+'</td><td>'+hours(r.extra_farming_hours)+' h</td><td>'+r.completed+' / '+r.episodes+'</td><td>'+hours(r.remaining_shares)+'</td><td>'+hours(r.unpriced_shares)+'<br><small>'+r.unpriced_episodes+' fills without a complete mark</small></td></tr>').join('')+'</tbody></table></div>'+
      '<p class="footnote">Every row includes all common fills, partial sales, estimated fees and residual inventory. Open shares use fresh recorded executable depth remaining after that rule’s sales. Where depth is missing, the range allows $0–$1 net recovery per unpriced share; it is not a fabricated exit. Conservative ordering uses the lower savings bound (or upper loss bound). Overlapping ranges do not establish a winner. Six hours is a reporting cutoff, not a new forced-sale rule. A six-hour hold can still be open here because its first executable observation after the deadline is outside this window.</p><p class="footnote">Farming hours count only periods when the frozen V4 quote logic could quote from fresh two-sided recorded books. Recording gaps contribute no reward cost. Farming on that market stays paused until fully flat. Each fill is a separate simulation; holding hours from overlapping fills are added. These are preliminary handling comparisons, not a shared-capital bot profit estimate.</p>'+
      '<details class="comparison-extra"><summary>Earlier cumulative results · completed-only subsets and their matching control</summary><p>These are the original '+p.episodes+'-fill results at the common recording cutoff, not the six-hour score. Each completed subset can differ. The matching control column below is extra diagnostic information.</p><div class="table-scroll"><table><thead><tr><th>Rule</th><th>Completed / all</th><th>Paired completed</th><th>Completed loss only</th><th>Immediate exit on that completed subset</th><th>Shares still held at recording cutoff</th></tr></thead><tbody>'+[...p.rows].sort((a,b)=>a.name.localeCompare(b.name)).map(r=>'<tr><td>'+escape(label(r.name))+'</td><td>'+r.completed+' / '+r.episodes+'</td><td>'+r.paired_completed+'</td><td>'+money(r.trading_loss)+'</td><td>'+money(r.paired_control_loss)+'</td><td>'+hours(r.remaining_shares)+'</td></tr>').join('')+'</tbody></table></div></details>';
    $('reward-day').onchange=e=>{rewardDay=e.target.value;sixHourComparison();};
    $('horizon-sort').onchange=e=>{horizonSort=e.target.value;sixHourComparison();};
    return true;
  }
  function managementScores(){
    const target=$('management-score'), score=data?.preliminary?.management_score;
    if(!target)return;
    if(data?.preliminary?.six_hour_score?.status==='reviewed'){
      $('management').hidden=true;return;
    }
    $('management').hidden=false;
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
    if(sixHourComparison())return;
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
