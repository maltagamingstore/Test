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
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  function finalBatchReport(){
    const section=$('final-batch'),s=data?.final_batch;
    if(!section)return;
    section.hidden=s?.status!=='reviewed';if(section.hidden)return;
    const count=n=>finite(n)?n.toLocaleString('en-US',{maximumFractionDigits:2}):'Unknown';
    const label=id=>names[id]||(id+' · '+((data.mutations||[]).find(m=>m.id===id)?.name||id));
    const base=s.rows.find(r=>r.name==='immediate_exit_v1');
    const rows=[...s.rows].sort((a,b)=>{
      if(finalSort==='loss')return byLoss(a,b);
      const field=finalSort==='hour'?'savings_per_held_hour':'held_hours';
      if(!finite(a[field]))return finite(b[field])?1:a.name.localeCompare(b.name);
      if(!finite(b[field]))return -1;
      return (finalSort==='hour'?b[field]-a[field]:a[field]-b[field])||a.name.localeCompare(b.name);
    });
    $('final-table').innerHTML='<div class="sample-banner"><strong>Closed recording · '+s.episodes+' common fills · '+s.episode_markets+' recorded markets</strong><p>'+escape(new Date(s.recording_start).toLocaleString())+' → '+escape(new Date(s.window_end).toLocaleString())+'</p><p>'+count(s.common_starting_shares)+' identical starting shares per rule. Common immediate-exit loss: <strong>'+money(base.trading_loss)+'</strong>.</p></div>'+
      '<p>All qualifying fills generated during this recording have been processed chronologically to its end. Earlier recording entries are excluded from this table. Residual shares are included through the agreed assumed sale at the last positive recorded bid, with recorded fee estimates.</p>'+
      '<ul>'+s.conclusions.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul>'+
      '<div class="score-controls"><label for="final-sort">Order by </label><select id="final-sort"><option value="loss"'+(finalSort==='loss'?' selected':'')+'>Total loss · lowest first</option><option value="hour"'+(finalSort==='hour'?' selected':'')+'>Saved per holding hour · highest first</option><option value="hours"'+(finalSort==='hours'?' selected':'')+'>Holding hours · lowest first</option></select></div>'+
      '<div class="table-scroll"><table><thead><tr><th>Rule</th><th>Loss incl. final inventory</th><th>Saved vs same control</th><th>Normal / assumed closes</th><th>Holding lot-hours</th><th>Saved per holding hour</th><th>Unknown outcomes</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+escape(label(r.name))+(r.name==='R020'?'<br><small>Reward trigger excluded; same effective rule as R010</small>':'')+'</td><td><strong>'+money(r.trading_loss)+'</strong></td><td>'+money(r.saved_vs_control)+'</td><td>'+r.normal_completed+' / '+r.assumed_episodes+'<br><small>'+count(r.assumed_shares)+' shares in assumed sales</small></td><td>'+count(r.held_hours)+' h</td><td>'+money(r.savings_per_held_hour)+'</td><td>'+r.unknown_episodes+'<br><small>'+count(r.unpriced_shares)+' unpriced shares</small></td></tr>').join('')+'</tbody></table></div>'+
      '<p class="footnote">The same complete cohort is used for every row. Last-positive-bid sales are accounting assumptions: historical quotes may be stale and may lack enough executable size. A later empty or zero-bid update does not erase an earlier positive quote in this convention. Late fills have shorter follow-up to the common recording end; this is not an equal-age six-hour test. Holding hours sum independent fills, include gaps and can exceed the recording duration. Saved per hour is not measured lost rewards, capital efficiency or bot ROI. Unknown fees/prices remain unknown.</p>';
    $('final-sort').onchange=e=>{finalSort=e.target.value;finalBatchReport();};
  }
  function render(doc,fallback=false){
    if(doc.schema!==1||!Array.isArray(doc.results)||doc.data_kind!=='recorded')throw Error('Unsupported research summary');
    data=doc;$('stage').textContent=doc.state;$('tests').textContent=doc.tests.passed?doc.tests.count+' tests passed':'Needs revalidation';
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
