(() => {
  'use strict';
  const FEED='https://gist.githubusercontent.com/maltagamingstore/7f02dc27888b5de7ad0e7290128a4fe6/raw/research1.json';
  const $=id=>document.getElementById(id);
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>typeof n==='number'&&Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n):'—';
  const pct=n=>typeof n==='number'&&Number.isFinite(n)?n.toFixed(1)+'%':'—';
  const names={immediate_exit_v1:'Immediate exit',fixed_1h_example:'Hold 1 hour',fixed_2h_example:'Hold 2 hours',recovery_or_2h_example:'Recover early / max 2h'};
  const duration=n=>typeof n==='number'?(n===0?'Immediately':n%3600===0?(n/3600)+'h':Math.round(n/60)+'m'):'Unresolved';
  const ruleText=r=>r.name==='immediate_exit_v1'?'Exit as soon as executable':r.recovery_loss_per_share!=null?'Exit if net loss ≤ '+(r.recovery_loss_per_share*100).toFixed(0)+'¢/share, otherwise at '+duration(r.hold_seconds):'Wait '+duration(r.hold_seconds)+', then exit';
  let data=null,example=false;
  function comparisons(){
    if(!data)return;
    $('real-tab').classList.toggle('active',!example);$('example-tab').classList.toggle('active',example);
    $('real-tab').setAttribute('aria-pressed',String(!example));$('example-tab').setAttribute('aria-pressed',String(example));
    const rows=[...(example?data.synthetic:data.results)].sort((a,b)=>(a.name==='immediate_exit_v1'?-1:b.name==='immediate_exit_v1'?1:0));
    if(!rows.length){$('comparison').innerHTML='<div class="empty"><div class="symbol">∅</div><h3>No recorded-data comparison yet</h3><p>The episode engine has been tested. Connecting complete farming orders, cancellation, inventory and fees to the recording is the next step.</p><p>Open “Synthetic example” to see how the comparison will work.</p></div>';return;}
    const bars=rows.map(r=>'<div class="bar-row"><span>'+escape(names[r.name]||r.name)+'</span><div class="bar-track"><div class="bar '+(r.name==='immediate_exit_v1'?'baseline':'')+'" style="width:'+Math.min(100,Math.max(0,r.damage_remaining_pct||0))+'%"></div></div><span class="bar-value">'+pct(r.damage_remaining_pct)+'</span></div>').join('');
    const recovery=rows.find(r=>r.name==='recovery_or_2h_example'),fixed=rows.find(r=>r.name==='fixed_2h_example');
    const sameExit=example&&recovery&&fixed&&recovery.exit_after_seconds===fixed.exit_after_seconds;
    $('comparison').innerHTML=(example?'<div class="sample-banner"><strong>SYNTHETIC EXAMPLE · Not market results.</strong> Invented prices from the saved engineering test. The example includes a data gap; no rewards are lost during bot-off time.</div>':'')+
      (sameExit?'<div class="sample-banner"><strong>Same outcome in this example:</strong> the recovery threshold is not reached before 2h, so “Recover early” and “Hold 2 hours” exit together. They are different rules, not two independent successes.</div>':'')+
      '<div class="label">DAMAGE REMAINING · IMMEDIATE EXIT = 100%</div><div class="bars">'+bars+'</div><div class="table-scroll"><table><thead><tr><th>Handling rule</th>'+(example?'<th>Actual exit</th>':'')+'<th>Trading loss</th><th>Missed rewards</th><th>Total cost</th><th>Damage reduction</th>'+(example?'':'<th>Completed / episodes</th><th>Unresolved</th>')+'</tr></thead><tbody>'+rows.map(r=>'<tr><td>'+escape(names[r.name]||r.name)+(example?'<br><small>'+escape(ruleText(r))+'</small>':'')+'</td>'+(example?'<td>'+duration(r.exit_after_seconds)+'</td>':'')+'<td>'+money(r.trading_loss)+'</td><td>'+money(r.missed_reward)+'</td><td>'+money(r.total_cost)+'</td><td>'+pct(r.damage_reduction_pct)+'</td>'+(example?'':'<td>'+escape(r.completed??'—')+' / '+escape(r.episodes??'—')+'</td><td>'+escape(r.censored??'—')+'</td>')+'</tr>').join('')+'</tbody></table></div><p class="footnote">Lower total cost is preferable on comparable, fully measured episodes. Open inventory and unknown fees cannot be scored as completed zero-loss exits.</p>';
  }
  function render(doc,fallback=false){
    if(doc.schema!==1||!Array.isArray(doc.results)||!Array.isArray(doc.synthetic))throw Error('Unsupported research summary');
    data=doc;$('stage').textContent=doc.state;$('tests').textContent=doc.tests.passed?doc.tests.count+' tests passed':'Needs revalidation';
    $('cohort').textContent=doc.results.length?'Policy comparisons available':'Not available yet';
    const stamp=new Date(doc.published_at), age=Date.now()-stamp;
    if(!Number.isFinite(+stamp))throw Error('Missing sync timestamp');
    $('sync-time').textContent=(fallback?'Saved snapshot · ':'Last synced · ')+stamp.toLocaleString()+((age>7*3600000)?' · update overdue':'');
    $('sync-time').classList.toggle('stale',fallback||age>7*3600000);
    $('updated').textContent='Research updated '+new Date(doc.research_updated_at).toLocaleDateString();
    $('next-steps').innerHTML=doc.next_steps.map(s=>'<li>'+escape(s)+'</li>').join('')||'<li>No pending steps in the published summary.</li>';
    comparisons();
  }
  async function refresh(){
    $('refresh').disabled=true;$('load-error').hidden=true;
    try{
      let doc,fallback=false;
      try{const r=await fetch(FEED+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Feed unavailable');doc=await r.json();}
      catch{const r=await fetch('./data.json',{cache:'no-store'});if(!r.ok)throw Error('Summary unavailable');doc=await r.json();fallback=true;}
      render(doc,fallback);
    }catch{$('load-error').hidden=false;$('load-error').textContent='The research summary could not be refreshed. Any displayed data is the last loaded snapshot.';}
    finally{$('refresh').disabled=false;}
  }
  $('real-tab').onclick=()=>{example=false;comparisons();};$('example-tab').onclick=()=>{example=true;comparisons();};$('refresh').onclick=refresh;
  // The publisher runs every six hours. An open page checks for that snapshot.
  refresh();setInterval(refresh,5*60*1000);
})();
