const $=id=>document.getElementById(id), css=n=>getComputedStyle(document.body).getPropertyValue(n).trim(),
  C={get shale(){return css('--shale')},get gas(){return css('--gas')},get oil(){return css('--oil')},get wet(){return css('--wet')}};
$('newFaciesColor').value=C.shale;
const post=async(u,b)=>{try{const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return r.ok?await r.json():{detail:`HTTP ${r.status}`}}catch(e){return{detail:e.message}}};
const deb=(f,ms=150)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>f(...a),ms)}};
const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function field(host,id,txt,val,unit,step){host.insertAdjacentHTML('beforeend',`<label>${txt}<input id="${id}" type="number" value="${val}" step="${step||'any'}"><u>${unit}</u></label>`)}
function canvas(c){
  if(!c.dataset.h) c.dataset.h = c.getAttribute('height') || '300';
  const d = window.devicePixelRatio || 1;
  const w = c.clientWidth || 300;
  const h = +c.dataset.h;
  c.style.height = h + 'px';
  c.width = Math.round(w * d);
  c.height = Math.round(h * d);
  const x = c.getContext('2d');
  x.setTransform(d, 0, 0, d, 0, 0);
  x.clearRect(0, 0, w, h);
  x.font = '12px system-ui';
  return [x, w, h];
}
function axes(x,w,h,[x0,x1,y0,y1],xl,yl,m={l:52,r:12,t:10,b:38}){
  const X=v=>m.l+(v-x0)/(x1-x0)*(w-m.l-m.r),Y=v=>h-m.b-(v-y0)/(y1-y0)*(h-m.t-m.b),line=css('--line'),mut=css('--mut');
  x.strokeStyle=line;x.fillStyle=mut;x.textAlign='center';x.lineWidth=1;
  const tick=(a,b)=>{const s=(b-a)/6,p=Math.pow(10,Math.floor(Math.log10(s))),n=[1,2,5,10].find(k=>k*p>=s)*p,r=[];for(let v=Math.ceil((a-1e-9)/n)*n;v<=b+1e-9;v+=n)r.push(+v.toFixed(6));return r};
  tick(x0,x1).forEach(v=>{x.beginPath();x.moveTo(X(v),Y(y0));x.lineTo(X(v),Y(y1));x.stroke();x.fillText(v,X(v),Y(y0)+15)});
  x.textAlign='right';tick(y0,y1).forEach(v=>{x.beginPath();x.moveTo(X(x0),Y(v));x.lineTo(X(x1),Y(v));x.stroke();x.fillText(v,X(x0)-6,Y(v)+4)});
  x.strokeStyle=css('--ink');x.beginPath();
  if(0>=y0&&0<=y1){x.moveTo(X(x0),Y(0));x.lineTo(X(x1),Y(0))}
  if(0>=x0&&0<=x1){x.moveTo(X(0),Y(y0));x.lineTo(X(0),Y(y1))}
  x.stroke();
  x.strokeRect(X(x0),Y(y1),X(x1)-X(x0),Y(y0)-Y(y1));x.fillStyle=css('--ink');x.textAlign='center';x.fillText(xl,(X(x0)+X(x1))/2,h-6);
  x.save();x.translate(13,(Y(y0)+Y(y1))/2);x.rotate(-Math.PI/2);x.fillText(yl,0,0);x.restore();return{X,Y}}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button').forEach(k=>k.setAttribute('aria-selected',k===b));
  ['fluid','model'].forEach(s=>$(s).hidden=s!==b.dataset.t);b.dataset.t=='model'?runModel():runFluid()});

/* ---------- Fluids and AVO ---------- */
$('rockIn').insertAdjacentHTML('beforeend','<label>Mineral<select id="min"><option>quartz</option><option>calcite</option><option>dolomite</option><option>clay</option></select><u></u></label>');
field($('rockIn'),'phi','Porosity',35,'%');field($('rockIn'),'vp','Rock P-wave velocity',2350,'m/s');field($('rockIn'),'vs','Rock S-wave velocity',1300,'m/s');
field($('upIn'),'uR','ρ',2.2,'g/cc');field($('upIn'),'uP','Vp',2700,'m/s');field($('upIn'),'uS','Vs',1100,'m/s');
field($('f0In'),'sw0','Water saturation',25,'%');field($('f0In'),'vw','Water P-wave velocity',1520,'m/s');field($('f0In'),'rw','Water density',1.05,'g/cc');field($('f0In'),'vh0','HC P-wave velocity (oil)',1000,'m/s');field($('f0In'),'rh0','HC density (oil)',0.8,'g/cc');
field($('f1In'),'sw1','Water saturation',25,'%');
$('sw1').parentElement.insertAdjacentHTML('afterend','<div class="fluid-mirror"><span>Water P-wave velocity</span><output id="vw1">1520</output><small>m/s</small></div><div class="fluid-mirror"><span>Water density</span><output id="rw1">1.05</output><small>g/cc</small></div>');
field($('f1In'),'vh1','HC P-wave velocity (gas)',500,'m/s');field($('f1In'),'rh1','HC density (gas)',0.3,'g/cc');
for(const [id,color] of [['sw0','initial'],['sw1','modeled']]){
  $(id).parentElement.insertAdjacentHTML('afterend',`<div class="sat-bar ${color}-bar"><span class="sat-water" id="${id}Water"></span><span class="sat-hc" id="${id}HC"></span></div><div class="sat-label"><span>water</span><span>HC</span></div>`);
}
document.querySelectorAll('#fluid input,#fluid select').forEach(i=>{i.oninput=deb(()=>runFluid());i.onchange=()=>runFluid()});
let FL=null;
async function runFluid(){
  const v=i=>+$(i).value;
  for(const id of ['sw0','sw1']){
    const water=Math.max(0,Math.min(100,v(id)));
    $(`${id}Water`).style.width=water+'%';
    $(`${id}HC`).style.width=(100-water)+'%';
  }
  $('vw1').textContent=v('vw');$('rw1').textContent=v('rw');
  const kw=v('rw')*v('vw')**2/1e6,kh0=v('rh0')*v('vh0')**2/1e6,kh1=v('rh1')*v('vh1')**2/1e6;
  $('waterK0').textContent=kw.toFixed(3);$('waterK1').textContent=kw.toFixed(3);
  $('hcK0').textContent=kh0.toFixed(3);$('hcK1').textContent=kh1.toFixed(3);
  FL=await post('/api/fluid',{mineral:$('min').value,phi:v('phi')/100,modeled_phi:v('modeledPhi')/100,vp:v('vp'),vs:v('vs'),upper:{rho:v('uR'),vp:v('uP'),vs:v('uS')},
    initial:{sw:v('sw0')/100,vw:v('vw'),rw:v('rw'),vh:v('vh0'),rh:v('rh0')},modeled:{sw:v('sw1')/100,vw:v('vw'),rw:v('rw'),vh:v('vh1'),rh:v('rh1')}});
  if(!FL.states)return;const S=FL.states,U=FL.upper,dot=c=>`<i class="sw" style="background:${c}"></i>`;
  $('fluidK0').textContent=FL.fluid_k.initial.toFixed(3);$('fluidK1').textContent=FL.fluid_k.modeled.toFixed(3);
  const init=S.initial,modeled=S.modeled;
  $('initialRho').textContent=init.rho.toFixed(3);$('initialIp').textContent=init.ip.toFixed(0);$('initialPr').textContent=init.pr.toFixed(3);$('initialColor').style.background=C.oil;
  $('modeledVp').textContent=modeled.vp.toFixed(0);$('modeledVs').textContent=modeled.vs.toFixed(0);
  $('modeledRho').textContent=modeled.rho.toFixed(3);$('modeledIp').textContent=modeled.ip.toFixed(0);$('modeledPr').textContent=modeled.pr.toFixed(3);$('modeledColor').style.background=C.gas;
  const rows=[['ρ (g/cc)','rho',3],['Vp (m/s)','vp',0],['Vs (m/s)','vs',0],['Poisson ratio','pr',3],['Impedance','ip',0],['R10','r10',3],['R30','r30',3]];
  $('tbl').innerHTML=`<table><tr><th></th><th>${dot(C.oil)}Initial</th><th>${dot(C.gas)}Modeled</th><th>${dot(C.wet)}Sw 100 %</th><th>Shale</th></tr>`+
   rows.map(([n,k,d])=>`<tr><td>${n}</td>${['initial','modeled','wet'].map(s=>`<td>${S[s][k].toFixed(d)}</td>`).join('')}<td>${U[k]!==undefined?U[k].toFixed(d):''}</td></tr>`).join('')+'</table>';
  const col={initial:C.oil,modeled:C.gas,wet:C.wet};
  let [x,w,h]=canvas($('cx'));const m=Math.max(.1,...Object.values(S).flatMap(s=>[Math.abs(s.r10),Math.abs(s.r30)]))*1.4,a=axes(x,w,h,[-m,m,-m,m],'R10','R30');
  x.save();x.setLineDash([4,4]);x.strokeStyle=css('--mut');x.beginPath();x.moveTo(a.X(-m),a.Y(-m));x.lineTo(a.X(m),a.Y(m));x.stroke();x.restore();
  for(const k in S){x.fillStyle=col[k];const px=a.X(S[k].r10),py=a.Y(S[k].r30);x.beginPath();x.moveTo(px,py-7);x.lineTo(px+6,py+5);x.lineTo(px-6,py+5);x.fill()}
  const useAbs=$('rcMod')?.checked;
  [x,w,h]=canvas($('rc'));
  const curves=Object.values(S).map(s=>useAbs&&s.curve_abs?s.curve_abs:s.curve);
  const ym=Math.min(1,Math.max(.2,...curves.flatMap(c=>c.map(Math.abs)))*1.1),b=axes(x,w,h,[0,60,-ym,ym],'Angle (°)','Reflectivity');
  for(const k in S){x.strokeStyle=col[k];x.lineWidth=2;x.beginPath();const crv=useAbs&&S[k].curve_abs?S[k].curve_abs:S[k].curve;crv.forEach((r,i)=>i?x.lineTo(b.X(FL.angles[i]),b.Y(r)):x.moveTo(b.X(0),b.Y(r)));x.stroke()}
}
$('send').onclick=()=>{if(!FL)return;const S=FL.states,f=(n,s)=>({rho:+s.rho.toFixed(3),vp:Math.round(s.vp),vs:Math.round(s.vs)});
  const builtins=new Set(['shale','gas sand','oil sand','wet sand']);
  const custom=Object.fromEntries(Object.entries(FAC).filter(([name])=>!builtins.has(name)));
  FAC={shale:{c:C.shale,...f('',FL.upper)},'gas sand':{c:C.gas,...f('',S.modeled)},'oil sand':{c:C.oil,...f('',S.initial)},'wet sand':{c:C.wet,...f('',S.wet)},...custom};
  buildModelUI();document.querySelector('[data-t=model]').click()};

/* ---------- Layered model ---------- */
let FAC={shale:{c:C.shale,rho:2.2,vp:2700,vs:1100},'gas sand':{c:C.gas,rho:1.893,vp:2222,vs:1344},'oil sand':{c:C.oil,rho:2.024,vp:2350,vs:1300},'wet sand':{c:C.wet,rho:2.09,vp:2590,vs:1279}};
let LAY=['shale','gas sand','shale','oil sand','shale'].map(f=>({f,h:50}));
let selectedLayer=0;
const OB=[[400,1500],[900,2000],[1250,2300]];
let customWavelet=null,customWaveletName='';
function buildModelUI(){
  $('facies').innerHTML='';Object.entries(FAC).forEach(([n,o])=>{const d=document.createElement('div');d.className='fac';
    d.innerHTML=`<b title="${escapeHTML(n)}">${escapeHTML(n)}</b><input type="color" value="${o.c}" data-k="c">`+['rho','vp','vs'].map(k=>`<input type="number" step="any" value="${o[k]}" data-k="${k}">`).join('')+'<button class="btn alt fac-remove" type="button" title="Delete facies" aria-label="Delete facies">×</button>';
    d.querySelectorAll('input').forEach(i=>i.oninput=()=>{o[i.dataset.k]=i.dataset.k=='c'?i.value:+i.value;runModel()});
    d.querySelector('.fac-remove').onclick=()=>{
      const users=LAY.flatMap((layer,i)=>layer.f===n?[i+1]:[]);
      if(users.length){$('faciesErr').textContent=`Cannot delete "${n}": used by layer${users.length>1?'s':''} ${users.join(', ')}.`;return}
      if(Object.keys(FAC).length<=1){$('faciesErr').textContent='At least one facies type is required.';return}
      delete FAC[n];$('faciesErr').textContent='';buildModelUI();runModel();
    };
    $('facies').append(d)});
  const options=Object.keys(FAC).map(n=>`<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
  const addChoice=$('newLayerFacies').value;
  $('newLayerFacies').innerHTML=options;
  $('newLayerFacies').value=FAC[addChoice]?addChoice:Object.keys(FAC)[0];
  drawLayers()}
function drawLayers(){
  selectedLayer=Math.max(0,Math.min(selectedLayer,LAY.length-1));
  $('modelLayer').innerHTML=LAY.map((l,i)=>`<option value="${i}">Layer ${i+1} · ${escapeHTML(l.f)}</option>`).join('');
  $('modelLayer').value=selectedLayer;
  $('layerFacies').innerHTML=Object.keys(FAC).map(n=>`<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join('');
  $('layerFacies').value=LAY[selectedLayer].f;
  $('layerThickness').value=LAY[selectedLayer].h;
  $('moveLayerUp').disabled=selectedLayer===0;
  $('moveLayerDown').disabled=selectedLayer===LAY.length-1;
  $('deleteLayer').disabled=LAY.length<=2;
}
$('modelLayer').onchange=()=>{selectedLayer=+$('modelLayer').value;drawLayers();runModel()};
$('layerFacies').onchange=()=>{LAY[selectedLayer].f=$('layerFacies').value;drawLayers();runModel()};
$('layerThickness').oninput=()=>{LAY[selectedLayer].h=Math.max(1,+$('layerThickness').value);runModel()};
$('moveLayerUp').onclick=()=>{if(selectedLayer>0){[LAY[selectedLayer-1],LAY[selectedLayer]]=[LAY[selectedLayer],LAY[selectedLayer-1]];selectedLayer--;drawLayers();runModel()}};
$('moveLayerDown').onclick=()=>{if(selectedLayer<LAY.length-1){[LAY[selectedLayer+1],LAY[selectedLayer]]=[LAY[selectedLayer],LAY[selectedLayer+1]];selectedLayer++;drawLayers();runModel()}};
$('deleteLayer').onclick=()=>{if(LAY.length>2){LAY.splice(selectedLayer,1);selectedLayer=Math.min(selectedLayer,LAY.length-1);drawLayers();runModel()}};
$('addFaciesForm').onsubmit=e=>{
  e.preventDefault();
  const name=$('newFaciesName').value.trim(),err=$('faciesErr');
  const values=['newFaciesRho','newFaciesVp','newFaciesVs'].map(id=>+$(id).value);
  if(!name||name==='__proto__'||Object.keys(FAC).some(n=>n.toLowerCase()===name.toLowerCase())){
    err.textContent='Enter a unique facies name.';
    return;
  }
  if(values.some(v=>!Number.isFinite(v)||v<=0)){
    err.textContent='Density, Vp, and Vs must be positive numbers.';
    return;
  }
  const [rho,vp,vs]=values;
  FAC[name]={c:$('newFaciesColor').value,rho,vp,vs};
  err.textContent='';
  $('newFaciesName').value='';
  buildModelUI();
  runModel();
};
$('addL').onclick=()=>{LAY.push({f:$('newLayerFacies').value,h:50});selectedLayer=LAY.length-1;drawLayers();runModel()};
OB.forEach(([h,v],i)=>{field($('obRows'),'oh'+i,'Thickness '+(i+1),h,'m');field($('obRows'),'ov'+i,'Vp '+(i+1),v,'m/s')});
$('ob').onchange=()=>runModel();
['freq','gain','windowSize','modelProperty','phase','oh0','oh1','oh2','ov0','ov1','ov2','showLayerBox'].forEach(i=>$(i).oninput=deb(()=>runModel()));
document.querySelectorAll('[data-model-panel]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('[data-model-panel]').forEach(k=>k.setAttribute('aria-selected',k===b));
  document.querySelectorAll('.model-settings').forEach(p=>p.hidden=p.dataset.panel!==b.dataset.modelPanel);
  if(b.dataset.modelPanel==='wavelet')drawWaveletPreview();
});
let avoHoverIndex=null;
function gatherAmplitude(trace,timeSeconds){
  const dt=MOD.t[1]-MOD.t[0],index=Math.max(0,Math.min(trace.length-1,(timeSeconds-MOD.t[0])/dt));
  const lower=Math.floor(index),upper=Math.min(trace.length-1,lower+1),fraction=index-lower;
  return trace[lower]*(1-fraction)+trace[upper]*fraction;
}
function drawLayerAvo(){
  const [x,w,h]=canvas($('layerAvo')),m={l:48,r:16,t:12,b:34};
  const title=$('avoTitle'),readout=$('avoReadout');
  if(!MOD||!MOD.traces||!MOD.tops){
    title.textContent='Layer AVO';
    readout.textContent='Select a layer in the log or gather to view its AVO response.';
    return;
  }
  const layer=LAY[selectedLayer];
  const top=selectedLayer>0?MOD.traces.map(trace=>gatherAmplitude(trace,MOD.tops[selectedLayer])):null;
  const base=selectedLayer<LAY.length-1?MOD.traces.map(trace=>gatherAmplitude(trace,MOD.tops[selectedLayer+1])):null;
  const angles=MOD.angles,curves=[top,base].filter(Boolean);
  title.textContent=`Layer ${selectedLayer+1} · ${layer.f} AVO`;
  if(!curves.length){readout.textContent='This layer has no interfaces to display.';return}
  const min=Math.min(-.05,...curves.flat()),max=Math.max(.05,...curves.flat()),pad=(max-min)*.12,y0=min-pad,y1=max+pad;
  const X=i=>m.l+i/(angles.length-1)*(w-m.l-m.r),Y=v=>h-m.b-(v-y0)/(y1-y0)*(h-m.t-m.b);
  x.strokeStyle=css('--line');x.fillStyle=css('--mut');x.lineWidth=1;x.textAlign='right';
  for(let i=0;i<=4;i++){
    const value=y0+(y1-y0)*i/4,y=Y(value);
    x.beginPath();x.moveTo(m.l,y);x.lineTo(w-m.r,y);x.stroke();
    x.fillText(value.toFixed(2),m.l-6,y+4);
  }
  x.textAlign='center';
  angles.forEach((angle,i)=>{if(i%2===0||i===angles.length-1){const px=X(i);x.beginPath();x.moveTo(px,m.t);x.lineTo(px,h-m.b);x.stroke();x.fillText(angle,px,h-m.b+16)}});
  x.strokeStyle=css('--ink');x.beginPath();x.moveTo(m.l,Y(0));x.lineTo(w-m.r,Y(0));x.stroke();
  x.strokeStyle=css('--mut');x.strokeRect(m.l,m.t,w-m.l-m.r,h-m.t-m.b);
  x.fillStyle=css('--ink');x.textAlign='center';x.font='bold 12px system-ui';x.fillText('Angle (°)',(m.l+w-m.r)/2,h-4);x.font='12px system-ui';
  x.save();x.translate(13,(m.t+h-m.b)/2);x.rotate(-Math.PI/2);x.fillText('Gather amplitude',0,0);x.restore();
  const drawCurve=(values,color)=>{
    if(!values)return;
    x.beginPath();values.forEach((value,i)=>i?x.lineTo(X(i),Y(value)):x.moveTo(X(i),Y(value)));
    x.strokeStyle=color;x.lineWidth=2;x.stroke();
  };
  drawCurve(top,css('--wet'));drawCurve(base,css('--gas'));
  if(avoHoverIndex!==null&&avoHoverIndex<angles.length){
    const i=avoHoverIndex,px=X(i);
    x.save();x.setLineDash([3,3]);x.strokeStyle=css('--mut');x.beginPath();x.moveTo(px,m.t);x.lineTo(px,h-m.b);x.stroke();x.restore();
    for(const [values,color] of [[top,css('--wet')],[base,css('--gas')]]){
      if(!values)continue;
      x.beginPath();x.arc(px,Y(values[i]),4,0,Math.PI*2);x.fillStyle=color;x.fill();
    }
    readout.textContent=`Angle ${angles[i]}° · Top: ${top?top[i].toFixed(4):'—'} · Base: ${base?base[i].toFixed(4):'—'}`;
  }else{
    readout.textContent=`Hover over the plot for amplitudes. Top: ${top?'available':'no interface above'} · Base: ${base?'available':'no interface below'}`;
  }
}
$('layerAvo').onpointermove=e=>{
  if(!MOD||!MOD.traces)return;
  const rect=$('layerAvo').getBoundingClientRect(),width=$('layerAvo').width/(window.devicePixelRatio||1);
  const px=(e.clientX-rect.left)*width/rect.width,m={l:48,r:16},count=MOD.angles.length;
  if(px<m.l||px>width-m.r){avoHoverIndex=null;drawLayerAvo();return}
  avoHoverIndex=Math.max(0,Math.min(count-1,Math.round((px-m.l)/(width-m.l-m.r)*(count-1))));
  drawLayerAvo();
};
$('layerAvo').onpointerleave=()=>{avoHoverIndex=null;drawLayerAvo()};
function parseWaveletASCII(text){
  const rows=[];
  let columns=0;
  for(const [index,source] of text.split(/\r?\n/).entries()){
    const line=source.replace(/[#;].*$/,'').trim();
    if(!line)continue;
    const values=line.split(/[,\s]+/).filter(Boolean).map(Number);
    if(values.some(value=>!Number.isFinite(value))){
      if(!rows.length)continue;
      throw new Error(`Non-numeric wavelet data on line ${index+1}.`);
    }
    if(values.length!==1&&values.length!==2)throw new Error(`Line ${index+1} must contain one or two numeric columns.`);
    if(columns&&values.length!==columns)throw new Error('Use one consistent ASCII column format throughout the file.');
    columns=values.length;
    rows.push(values);
    if(rows.length>4001)throw new Error('Wavelet files may contain at most 4001 numeric rows.');
  }
  if(rows.length<3)throw new Error('The ASCII file must contain at least three wavelet samples.');
  let samples;
  if(columns===1){
    if(rows.length%2===0)throw new Error('Amplitude-only wavelets must have an odd number of samples so the centre sample is at time zero.');
    samples=rows.map(row=>row[0]);
  }else{
    const times=rows.map(row=>row[0]),amplitudes=rows.map(row=>row[1]);
    if(times.some((time,index)=>index>0&&time<=times[index-1]))throw new Error('Time values must be strictly increasing.');
    if(times[0]>=0||times[times.length-1]<=0)throw new Error('Two-column wavelets must span time zero (in milliseconds).');
    const span=Math.max(1,Math.ceil(Math.max(-times[0],times[times.length-1])));
    if(2*span+1>4001)throw new Error('Resampled wavelets may span no more than 4001 samples at 1 ms.');
    samples=[];
    let upper=1;
    for(let i=0;i<2*span+1;i++){
      const time=i-span;
      if(time<times[0]||time>times[times.length-1]){samples.push(0);continue}
      while(upper<times.length-1&&times[upper]<time)upper++;
      const lower=upper-1,fraction=(time-times[lower])/(times[upper]-times[lower]);
      samples.push(amplitudes[lower]*(1-fraction)+amplitudes[upper]*fraction);
    }
  }
  if(!samples.some(value=>value!==0))throw new Error('The imported wavelet must contain a nonzero sample.');
  return samples;
}
function drawWaveletPreview(){
  const [x,w,h]=canvas($('waveletPreview'));
  if(!MOD||!MOD.wavelet||!MOD.wavelet.length)return;
  const times=MOD.wavelet_times.map(time=>time*1000),peak=Math.max(1e-8,...MOD.wavelet.map(Math.abs));
  const {X,Y}=axes(x,w,h,[times[0],times[times.length-1],-peak*1.1,peak*1.1],'Time (ms)','Amplitude',{l:48,r:8,t:8,b:30});
  const baseline=Y(0);
  x.fillStyle=css('--gas');x.globalAlpha=.3;
  let positive=false;
  for(let i=0;i<MOD.wavelet.length;i++){
    const amplitude=MOD.wavelet[i],time=times[i];
    if(amplitude>0){
      if(!positive){
        let startTime=time;
        if(i>0&&MOD.wavelet[i-1]<0){
          const previousTime=times[i-1],previousAmplitude=MOD.wavelet[i-1];
          startTime=previousTime+(time-previousTime)*(-previousAmplitude)/(amplitude-previousAmplitude);
        }
        x.beginPath();x.moveTo(X(startTime),baseline);x.lineTo(X(time),Y(amplitude));positive=true;
      }else x.lineTo(X(time),Y(amplitude));
    }else if(positive){
      const previousTime=times[i-1],previousAmplitude=MOD.wavelet[i-1];
      const zeroTime=previousTime+(time-previousTime)*previousAmplitude/(previousAmplitude-amplitude);
      x.lineTo(X(zeroTime),baseline);x.closePath();x.fill();positive=false;
    }
  }
  if(positive){x.lineTo(X(times[times.length-1]),baseline);x.closePath();x.fill()}
  x.globalAlpha=1;
  x.beginPath();
  MOD.wavelet.forEach((amplitude,index)=>index?x.lineTo(X(times[index]),Y(amplitude)):x.moveTo(X(times[index]),Y(amplitude)));
  x.strokeStyle=css('--ink');x.lineWidth=1.5;x.stroke();
  $('waveletStatus').textContent=customWaveletName?`Imported ${customWaveletName} · ${MOD.wavelet.length} samples`:`Generated ${+$('freq').value} Hz Ricker wavelet · ${MOD.wavelet.length} samples`;
  $('clearWavelet').disabled=!customWavelet;
}
const waveletFile=$('waveletFile');
waveletFile.onchange=async()=>{
  const file=waveletFile.files[0];
  if(!file)return;
  $('waveletErr').textContent='';
  if(file.size>1024*1024){
    $('waveletErr').textContent='Wavelet ASCII files must be no larger than 1 MB.';
    waveletFile.value='';
    return;
  }
  let samples;
  try{
    samples=parseWaveletASCII(await file.text());
  }catch(error){
    $('waveletErr').textContent=error.message;
    waveletFile.value='';
    return;
  }
  customWavelet=samples;
  customWaveletName=file.name;
  runModel();
};
$('clearWavelet').onclick=()=>{
  customWavelet=null;
  customWaveletName='';
  waveletFile.value='';
  $('waveletErr').textContent='';
  runModel();
};
async function runModel(){
  const f=+$('freq').value,err=$('freqErr');
  if(!(f>=5&&f<=150)){err.textContent='Enter a frequency between 5 and 150 Hz.';return}
  const phase=+$('phase').value,windowMs=+$('windowSize').value;
  if(!(phase>=0&&phase<=360)){err.textContent='Phase rotation must be between 0 and 360 degrees.';return}
  if(!(windowMs>=10&&windowMs<=10000)){err.textContent='Window size must be between 10 and 10000 ms.';return}
  err.textContent='';
  const fac={};for(const n in FAC){const{rho,vp,vs}=FAC[n];fac[n]={rho,vp,vs}}
  const ob=$('ob').checked?OB.map((_,i)=>[+$('oh'+i).value,+$('ov'+i).value]):[];
  const R=await post('/api/model',{facies:fac,layers:LAY.map(l=>[l.f,l.h]),overburden:ob,freq:f,phase,wavelet:customWavelet});if(!R.traces){err.textContent=typeof R.detail==='string'?R.detail:'The model could not be computed. Check the layer and facies values.';return}
  MOD=R;
  if(!document.querySelector('[data-panel="wavelet"]').hidden)drawWaveletPreview();
  const prop=$('modelProperty').value,propertyNames={ip:'Ip',is:'Is','vpvs':'Vp/Vs'};
  const propertyUnits={ip:'g/cc·m/s',is:'g/cc·m/s','vpvs':''};
  const values=LAY.map(l=>{const{rho,vp,vs}=FAC[l.f];return prop==='is'?rho*vs:prop==='vpvs'?vp/vs:rho*vp});
  const propertyMax=Math.max(.001,...values)*1.15;
  const[x,w,h]=canvas($('gt')),timeStart=R.t0*1000,timeEnd=timeStart+windowMs,ipw=110,m={l:50,r:52,t:42,b:34},Y=ms=>m.t+(ms-timeStart)/windowMs*(h-m.t-m.b);
  x.fillStyle=css('--ink');x.textAlign='center';x.font='bold 12px system-ui';x.fillText(`${propertyNames[prop]} (${propertyUnits[prop]||'unitless'})`,m.l+ipw/2,14);x.font='12px system-ui';
  x.strokeStyle=css('--line');x.fillStyle=css('--mut');x.textAlign='right';
  const st=[10,20,50,100,200,500,1000].find(s=>windowMs/s<=10)||1000;
  const overburdenDepth=ob.reduce((sum,[thickness])=>sum+thickness,0);
  const depthAtTime=ms=>{
    let startTime=0,startDepth=0,lastVelocity=LAY[LAY.length-1]?FAC[LAY[LAY.length-1].f].vp:1500;
    for(const [thickness,vp] of ob){
      const endTime=startTime+2*thickness/vp*1000,endDepth=startDepth+thickness;
      if(ms<=endTime&&endTime>startTime)return startDepth+(ms-startTime)/(endTime-startTime)*thickness;
      startTime=endTime;startDepth=endDepth;lastVelocity=vp;
    }
    for(const layer of LAY){
      const vp=FAC[layer.f].vp,endTime=startTime+2*layer.h/vp*1000,endDepth=startDepth+layer.h;
      if(ms<=endTime&&endTime>startTime)return startDepth+(ms-startTime)/(endTime-startTime)*layer.h;
      startTime=endTime;startDepth=endDepth;lastVelocity=vp;
    }
    return startDepth+Math.max(0,ms-startTime)*lastVelocity/2000;
  };
  const timeAtDepth=depth=>{
    let elapsedTime=0,currentDepth=0,lastVelocity=LAY[LAY.length-1]?FAC[LAY[LAY.length-1].f].vp:1500;
    for(const [thickness,vp] of ob){
      const endDepth=currentDepth+thickness;
      if(depth<=endDepth)return (elapsedTime+2*(depth-currentDepth)/vp)*1000;
      currentDepth=endDepth;elapsedTime+=2*thickness/vp;lastVelocity=vp;
    }
    for(const layer of LAY){
      const vp=FAC[layer.f].vp,endDepth=currentDepth+layer.h;
      if(depth<=endDepth)return (elapsedTime+2*(depth-currentDepth)/vp)*1000;
      currentDepth=endDepth;elapsedTime+=2*layer.h/vp;lastVelocity=vp;
    }
    return (elapsedTime+Math.max(0,depth-currentDepth)*2/lastVelocity)*1000;
  };
  for(let v=Math.ceil(timeStart/st)*st;v<=timeEnd;v+=st){
    const y=Y(v);x.beginPath();x.moveTo(m.l,y);x.lineTo(w-m.r,y);x.stroke();
    x.textAlign='left';x.fillText(v,w-m.r+6,y+4);
  }
  const depthStart=depthAtTime(timeStart),depthEnd=depthAtTime(timeEnd),rawDepthInterval=(depthEnd-depthStart)/6;
  const depthMagnitude=10**Math.floor(Math.log10(rawDepthInterval));
  const depthInterval=[1,2,5,10].find(value=>value*depthMagnitude>=rawDepthInterval)*depthMagnitude;
  const depthDecimals=Math.max(0,Math.min(3,Math.ceil(-Math.log10(depthInterval))));
  for(let tick=Math.ceil((depthStart-1e-9)/depthInterval);tick*depthInterval<=depthEnd+1e-9;tick++){
    const depth=tick*depthInterval,time=timeAtDepth(depth);
    if(time<timeStart-1e-6||time>timeEnd+1e-6)continue;
    const y=Y(time);
    x.beginPath();x.moveTo(m.l-4,y);x.lineTo(m.l,y);x.stroke();
    x.textAlign='right';x.fillText(Number(depth.toFixed(depthDecimals)).toString(),m.l-6,y+4);
  }
  x.strokeStyle=css('--ink');x.beginPath();x.moveTo(m.l,m.t);x.lineTo(m.l,h-m.b);x.moveTo(w-m.r,m.t);x.lineTo(w-m.r,h-m.b);x.stroke();
  x.save();x.fillStyle=css('--ink');x.textAlign='center';x.translate(13,(m.t+h-m.b)/2);x.rotate(-Math.PI/2);x.fillText(`Depth (m; top ${overburdenDepth} m)`,0,0);x.restore();
  x.save();x.fillStyle=css('--ink');x.textAlign='center';x.translate(w-10,(m.t+h-m.b)/2);x.rotate(-Math.PI/2);x.fillText('Time (ms)',0,0);x.restore();
  const propertyTicks=[0,propertyMax/3,propertyMax*2/3,propertyMax];
  x.textAlign='center';propertyTicks.forEach(v=>x.fillText(v.toFixed(prop==='vpvs'?1:0),m.l+v/propertyMax*ipw,m.t-5));
  x.save();x.beginPath();x.rect(m.l,m.t,ipw,h-m.t-m.b);x.clip();
  LAY.forEach((l,i)=>{const y0=Y(R.tops[i]*1000),y1=Y(R.tops[i+1]*1000),barWidth=Math.min(ipw,values[i]/propertyMax*ipw);x.fillStyle=FAC[l.f].c;x.fillRect(m.l,y0,barWidth,y1-y0);x.strokeStyle=i===selectedLayer?css('--ink'):css('--layer-outline');x.lineWidth=i===selectedLayer?2:1;x.strokeRect(m.l,y0,barWidth,y1-y0)});
  x.restore();
  const gx=m.l+ipw+30,gw=w-gx-m.r,n=R.angles.length,sp=gw/n,mx=Math.max(...R.traces.flat().map(Math.abs))||1,sc=Math.abs(+$('gain').value)*.48*sp/mx;
  x.fillStyle=css('--mut');x.textAlign='center';R.angles.forEach((angle,k)=>x.fillText(angle,gx+(k+.5)*sp,m.t-8));
  x.save();x.beginPath();x.rect(gx,m.t,gw,h-m.t-m.b);x.clip();
  const sample=(tr,time)=>{
    const dt=R.t[1]-R.t[0],index=Math.max(0,Math.min(tr.length-1,(time/1000-R.t[0])/dt));
    const lo=Math.floor(index),hi=Math.min(tr.length-1,lo+1),fraction=index-lo;
    return tr[lo]*(1-fraction)+tr[hi]*fraction;
  };
  R.traces.forEach((tr,k)=>{
    const cx=gx+(k+.5)*sp,points=[{time:timeStart,a:sample(tr,timeStart)}];
    tr.forEach((a,j)=>{const time=R.t[j]*1000;if(time>timeStart&&time<timeEnd)points.push({time,a})});
    points.push({time:timeEnd,a:sample(tr,timeEnd)});
    const offset=a=>Math.max(-.48*sp,Math.min(.48*sp,a*sc));
    x.beginPath();points.forEach(({time,a},i)=>{const px=cx+offset(a),py=Y(time);i?x.lineTo(px,py):x.moveTo(px,py)});x.strokeStyle=css('--ink');x.lineWidth=1;x.stroke();
    x.beginPath();x.moveTo(cx,Y(timeStart));points.forEach(({time,a})=>x.lineTo(cx+Math.max(0,offset(a)),Y(time)));x.lineTo(cx,Y(timeEnd));x.closePath();x.fillStyle=css('--ink');x.fill();
  });
  if($('showLayerBox').checked){
    const selectedTop=Y(R.tops[selectedLayer]*1000),selectedBase=Y(R.tops[selectedLayer+1]*1000);
    x.strokeStyle=css('--wet');x.lineWidth=2;x.strokeRect(gx,selectedTop,gw,selectedBase-selectedTop);
  }
  x.restore();
  x.fillStyle=css('--ink');x.textAlign='center';x.font='bold 12px system-ui';x.fillText('Angle (°)',gx+gw/2,14);x.font='12px system-ui';
  $('gt').style.cursor='pointer';
  $('gt').onclick=e=>{
    const rect=$('gt').getBoundingClientRect(),px=(e.clientX-rect.left)*w/rect.width,py=(e.clientY-rect.top)*h/rect.height;
    const plotStart=gx,plotEnd=gx+gw,logStart=m.l,logEnd=m.l+ipw;
    if(py<m.t||py>h-m.b||!((px>=logStart&&px<=logEnd)||(px>=plotStart&&px<=plotEnd)))return;
    const time=timeStart+(py-m.t)/((h-m.t-m.b))*windowMs;
    const layer=LAY.findIndex((_,i)=>time>=R.tops[i]*1000&&(time<R.tops[i+1]*1000||i===LAY.length-1&&time<=R.tops[i+1]*1000));
    if(layer<0||layer===selectedLayer)return;
    selectedLayer=layer;avoHoverIndex=null;drawLayers();runModel();
  };
  drawLayerAvo();
  $('offt').innerHTML=ob.length?`<h2>Overburden angle-to-offset table</h2><div class="overburden-table-scroll"><table aria-label="Overburden angle-to-offset results"><tr><th>Angle at model top (°)</th>${R.angles.map(angle=>`<td>${angle}</td>`).join('')}</tr><tr><th>Offset (m)</th>${R.offset.map(offset=>`<td>${offset==null?'–':Math.round(offset)}</td>`).join('')}</tr><tr><th>Surface angle (°)</th>${R.surface_angle.map(angle=>`<td>${angle==null?'–':angle.toFixed(1)}</td>`).join('')}</tr></table></div><small>Two-way time and depth of model top: ${(R.t0*1000).toFixed(0)} ms, ${overburdenDepth} m.</small>`:'';
}
let MOD=null;
function downloadCSV(filename,text){
  const b=new Blob([text],{type:'text/csv;charset=utf-8;'}),u=URL.createObjectURL(b),a=document.createElement('a');
  a.href=u;a.download=filename;a.click();URL.revokeObjectURL(u);
}
$('exportFluid').onclick=()=>{
  if(!FL||!FL.states)return;const S=FL.states,U=FL.upper;
  let csv='PARAMETER,INITIAL_OIL,MODELED_GAS,WET_SW100,SHALE\n';
  const rows=[['Density_g_cc','rho',3],['Vp_m_s','vp',1],['Vs_m_s','vs',1],['Poisson_ratio','pr',4],['Impedance','ip',1],['R10','r10',4],['R30','r30',4]];
  rows.forEach(([label,k,d])=>{csv+=`${label},${S.initial[k].toFixed(d)},${S.modeled[k].toFixed(d)},${S.wet[k].toFixed(d)},${U[k]!==undefined?U[k].toFixed(d):''}\n`});
  csv+='\nANGLE_DEG,INITIAL_R,MODELED_R,WET_R,INITIAL_ABS_R,MODELED_ABS_R,WET_ABS_R\n';
  FL.angles.forEach((ang,i)=>{csv+=`${ang},${S.initial.curve[i].toFixed(6)},${S.modeled.curve[i].toFixed(6)},${S.wet.curve[i].toFixed(6)},${S.initial.curve_abs?S.initial.curve_abs[i].toFixed(6):''},${S.modeled.curve_abs?S.modeled.curve_abs[i].toFixed(6):''},${S.wet.curve_abs?S.wet.curve_abs[i].toFixed(6):''}\n`});
  downloadCSV('club_amplitude_fluid_avo.csv',csv);
};
$('exportModel').onclick=()=>{
  if(!MOD||!MOD.traces)return;
  let csv='Time_ms,'+MOD.angles.map(a=>`Angle_${a}deg`).join(',')+'\n';
  MOD.t.forEach((t_sec,j)=>{const row=[(t_sec*1000).toFixed(1)];MOD.traces.forEach(tr=>row.push(tr[j].toFixed(6)));csv+=row.join(',')+'\n'});
  downloadCSV('club_amplitude_synthetic_gathers.csv',csv);
};
buildModelUI();runFluid();addEventListener('resize',deb(()=>{$('fluid').hidden?runModel():runFluid()},200));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{$('fluid').hidden?runModel():runFluid()});
