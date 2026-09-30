(() => {
  'use strict';
  const E=window.TrendEngine;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=(v,d=2)=>v==null||!Number.isFinite(+v)?'—':(+v).toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=(v,d=2)=>v==null||!Number.isFinite(+v)?'—':`${v>0?'+':''}${fmt(v*100,d)}%`;
  const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
  const median=a=>{const b=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!b.length)return null;const m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2};
  const std=a=>{const m=mean(a);return m==null?null:Math.sqrt(mean(a.map(x=>(x-m)**2)))};
  const scoreClass=v=>v>=18?'bull':v<=-18?'bear':'flat';
  const valueClass=v=>v>0?'positive':v<0?'negative':'';
  const boardColor={金融股指:'#7c3aed',金融国债:'#2563eb',贵金属:'#d29a17',有色金属:'#d35400',黑色建材:'#606975',能源:'#0d9488',能源化工:'#0891b2',农产品:'#65a30d',橡胶:'#be185d',新能源材料:'#ea580c',林木浆纸:'#8b5e3c',航运指数:'#0369a1',其他:'#64748b'};
  const state={data:null,rows:[],system:'multi',preset:'balanced',params:{},sortKey:'baselineScore',sortDir:-1,charts:{},renderToken:0,selected:'CU',detailRange:756,emergenceLong:252,emergenceShort:60};

  const systems={
    donchian:{name:'收盘价通道突破',short:'价格突破系统',code:'CB / DONCHIAN',structure:'季度通道 + 半年度均线斜率 + ATR标准化',use:'捕捉持续性大趋势',formula:'平衡档：60日收盘通道 + MA120趋势过滤 + 60日斜率',logic:'用不含当日的60日历史最高、最低收盘价定义季度突破，再以120日均线及其60日斜率过滤逆势信号，并用ATR把不同价格尺度转成可比强度。',strength:'规则直接、方向定义清晰；20/60/120日档位分别对应月度、季度、半年度观察。',risk:'震荡市场会出现连续假突破；未复权主力连续的换月跳点可能被误判为突破。',source:'《趋势跟踪》PDF p.561、570–572；唐奇安背景见 p.141–146。季度/半年度参数为网页透明研究口径。',params:[['entry','入场通道',20,500,5,'交易日'],['exit','反转通道',10,500,5,'交易日'],['trendMA','趋势均线',20,500,5,'交易日'],['slopeLookback','斜率观察',5,252,5,'交易日'],['atrPeriod','ATR周期',5,80,1,'交易日'],['volumeLookback','成交量基期',5,120,5,'交易日'],['oiLookback','持仓观察',5,120,5,'交易日']]},
    ma:{name:'多重均线排列',short:'方向与结构系统',code:'MA-STACK',structure:'MA60 / MA120 / MA252排列 + 年线斜率',use:'识别季度至年度趋势结构',formula:'平衡档：价格与MA60、MA120、MA252的有序排列',logic:'以MA60与MA252的风险标准化价差衡量方向，以MA60/120/252有序排列识别结构，并要求MA252斜率同向。',strength:'易解释、对单日噪声不敏感，直接对应季度、半年度和年度层级。',risk:'本质是滞后系统；趋势快速反转时退出较慢，短历史品种可能样本不足。',source:'《趋势跟踪》PDF p.561、570–572；《技术分析》PDF 192–212；周期层级为网页工程化映射。',params:[['fast','快速均线',5,252,5,'交易日'],['medium','中速均线',10,500,5,'交易日'],['slow','慢速均线',30,500,5,'交易日'],['slopeLookback','斜率观察',5,252,5,'交易日'],['atrPeriod','ATR周期',5,80,1,'交易日'],['volumeLookback','成交量基期',5,120,5,'交易日'],['oiLookback','持仓观察',5,120,5,'交易日']]},
    macd:{name:'MACD长周期过滤',short:'动量转折系统',code:'MACD-TREND',structure:'30/65/20 MACD + MA120过滤',use:'观察季度趋势的再加速与衰减',formula:'平衡档：EMA30 − EMA65，20日信号线，MA120约束方向',logic:'快慢指数均线距离刻画季度动量，柱体刻画加速或衰减，再以半年度MA120限制信号方向，避免把短期零轴交叉误认为长趋势。',strength:'能同时表示趋势方向与动量变化，比单一均线更早观察到季度趋势转折。',risk:'震荡区仍可能反复交叉；参数组合多，必须做参数邻域检验。换月跳点会污染指数均线。',source:'《技术分析》PDF 268–271、653–654；30/65/20为季度尺度工程参数。',params:[['fast','快速EMA',5,130,1,'交易日'],['slow','慢速EMA',15,260,1,'交易日'],['signal','信号线',3,80,1,'交易日'],['trendMA','趋势均线',40,500,5,'交易日'],['atrPeriod','ATR周期',5,80,1,'交易日'],['volumeLookback','成交量基期',5,120,5,'交易日'],['oiLookback','持仓观察',5,120,5,'交易日']]},
    adx:{name:'DMI / ADX趋势强度',short:'方向与强度系统',code:'ADX-DMI',structure:'60日DMI/ADX + MA120过滤',use:'区分季度趋势与震荡',formula:'DI决定方向，ADX只度量强弱；平衡档周期60日',logic:'先用60日+DI与-DI的相对位置判断方向，再用ADX判断季度趋势是否足够强，最后用MA120约束半年度结构。',strength:'把“方向”和“强度”明确分开，适合排除方向存在但趋势性不足的品种。',risk:'ADX上升也可能对应强下跌，不能单独理解为看涨；60日平滑使信号更稳定也更滞后。',source:'《技术分析》PDF 302–306；60日周期为季度尺度工程参数。',params:[['period','DMI/ADX周期',5,120,1,'交易日'],['threshold','趋势阈值',10,50,1,'ADX'],['trendMA','趋势均线',40,500,5,'交易日'],['volumeLookback','成交量基期',5,120,5,'交易日'],['oiLookback','持仓观察',5,120,5,'交易日']]},
    boll:{name:'BOLL趋势扩张',short:'位置与波动系统',code:'BOLL-TREND',structure:'BOLL60位置 + MA120斜率 + 波动扩张',use:'识别季度波动扩张中的趋势',formula:'平衡档：MA60中轨 ± 2倍标准差，并由MA120过滤',logic:'价格处于60日布林带方向并伴随MA120同向，视为季度趋势扩张；并不把触及上轨机械地解释为超买卖出。',strength:'把趋势和波动放在同一框架内，可识别从季度收缩到扩张的行情。',risk:'标准差受换月跳点影响显著；沿轨运行与均值回复信号容易混淆。',source:'《技术分析》PDF 217–223；60日平衡档为季度尺度扩展。',params:[['period','BOLL周期',10,252,5,'交易日'],['std','标准差倍数',1,4,.1,'倍'],['trendMA','趋势均线',40,500,5,'交易日'],['slopeLookback','斜率观察',5,252,5,'交易日'],['atrPeriod','ATR周期',5,80,1,'交易日'],['volumeLookback','成交量基期',5,120,5,'交易日'],['oiLookback','持仓观察',5,120,5,'交易日']]},
    longterm:{name:'6/12月均线 + 月度KST',short:'半年度与年度制度系统',code:'SMA6/12-KST',structure:'月线制度 + 长期KST动能 + 量仓确认',use:'识别半年度至两年的主要趋势',formula:'平衡档以6月均线为制度过滤；稳健档使用12月均线',logic:'月收盘位于6个月均线上方且月度KST上升时支持多头制度；位于均线下方且KST下降时支持空头。日频数据先聚合为月末收盘再计算。',strength:'把半年度价格制度和9/12/18/24月长期动能分开；换手低、解释直接。',risk:'月度信号滞后，强趋势中KST可能提前转弱；短历史品种可能没有足够月度观测。',source:'《技术分析》PDF 281–285、653–654；主要趋势周期见 PDF 22–26。',params:[['maMonths','长期均线',6,24,1,'月'],['filterPct','价格过滤带',0,8,.5,'%'],['kstSignal','KST信号线',3,18,1,'月'],['volumeLookback','成交量基期',20,250,10,'交易日'],['oiLookback','持仓观察',20,250,10,'交易日']]},
    multi:{name:'综合趋势评分',short:'季度/半年度多证据融合',code:'MULTI-FACTOR',structure:'60/120/252日动量 + MA60/120 + MACD30/65/20 + RSI60 + BOLL60 + 量仓',use:'全市场横截面趋势比较',formula:'基础分 = 34%动量 + 24%均线 + 16%MACD + 12%RSI + 14%BOLL；量仓最多±24分',logic:'动量内部先按20%×60日、30%×120日、50%×252日合成；五类价格证据分别标准化到−100～100后按固定权重相加。成交量比和持仓变化只能在价格方向确定后做确认调整，最终截断到−100～100。',strength:'季度和半年度是主要识别尺度，同时保留年度背景；分项、权重、标准化与阈值全部公开，可逐项核查。',risk:'多个指标共享同一价格信息，存在重复计量；权重是研究假设而非自然常数，分数不是未来收益概率。',source:'《金融市场技术分析》印刷页128–148、161–224、354；《技术分析》PDF 192–306、360–379；权重与周期为网页公开工程规则。',params:[['returnShort','短期收益',10,120,5,'交易日'],['returnMedium','中期收益',30,300,5,'交易日'],['returnLong','长期收益',60,600,10,'交易日'],['maFast','快速均线',5,150,5,'交易日'],['maSlow','慢速均线',40,500,5,'交易日'],['macdFast','MACD快线',5,60,1,'交易日'],['macdSlow','MACD慢线',15,150,1,'交易日'],['macdSignal','MACD信号',3,40,1,'交易日'],['rsiPeriod','RSI周期',5,120,1,'交易日'],['bollPeriod','BOLL周期',10,250,5,'交易日'],['bollStd','BOLL倍数',1,4,.1,'倍'],['atrPeriod','ATR周期',5,80,1,'交易日'],['volumeLookback','成交量基期',5,120,5,'交易日'],['oiLookback','持仓观察',5,120,5,'交易日']]}
  };
  const presetNames={aggressive:'月季灵敏',balanced:'季半平衡',conservative:'半年稳健'};

  function topBoard(s){
    if(s.startsWith('金融')&&s.includes('国债'))return '金融国债';
    if(s.startsWith('金融'))return '金融股指';
    if(s.includes('农产品')||s==='纺织')return '农产品';
    if(s.includes('黑色')||s.includes('建材'))return '黑色建材';
    if(s.includes('有色'))return '有色金属';
    if(s.includes('贵金属'))return '贵金属';
    if(s.includes('化工')||s.includes('聚酯')||s.includes('芳烃')||s.includes('烯烃')||s.includes('氯碱'))return '能源化工';
    if(s.includes('能源'))return '能源';if(s.includes('橡胶'))return '橡胶';if(s.includes('新能源'))return '新能源材料';if(s.includes('浆纸')||s.includes('林木'))return '林木浆纸';if(s.includes('航运'))return '航运指数';return s||'其他';
  }
  function assetClass(x){if(x.exchange!=='CFFEX')return '商品';return ['IF','IH','IC','IM'].includes(x.symbol)?'股指':'国债'}
  function retAt(series,n){const i=series.c.length-1;return i>=n&&series.c[i-n]?series.c[i]/series.c[i-n]-1:null}
  function natr(series){const a=E.indicators.atr(series,20);const c=series.c[series.c.length-1];return a&&c?100*a/c:null}
  function paramsText(p){return Object.entries(p).filter(([k])=>!k.startsWith('_')&&!['useVolume','useOI'].includes(k)).map(([k,v])=>`${k}=${v}`).join(' · ')}
  function fillSelect(el,vals){vals.sort((a,b)=>a.localeCompare(b,'zh-CN')).forEach(v=>el.insertAdjacentHTML('beforeend',`<option value="${esc(v)}">${esc(v)}</option>`))}

  async function boot(){
    try{
      if(!E)throw new Error('趋势计算引擎未载入');
      const r=await fetch(`data/market.json?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`行情数据 HTTP ${r.status}`);
      state.data=await r.json();
      state.params={...E.presets[state.system][state.preset]};
      state.rows=state.data.universe.map(x=>{
        const s=state.data.series[x.symbol],base=E.evaluate('multi',E.presets.multi.balanced,s);
        return {...x,board:topBoard(x.sector),asset:assetClass(x),ret60:retAt(s,60),ret120:retAt(s,120),ret252:retAt(s,252),volumeRatio60:E.indicators.volumeRatio(s,60),oiChange60:E.indicators.oiChange(s,60),natr:natr(s),baselineScore:base?.score??null,baselineDirection:base?.direction??'—',emergence:null,emergenceCache:{}};
      });
      initFilters();renderOverview();renderSystemCards();initLab();initEmergence();initDetail();updateRelativeStrength();
      const m=state.data.meta;$('#market-clock').textContent=`市场日 ${m.market_date} · 日线源 · 季度/半年度`;$('#footer-meta').textContent=`${m.source} · ${m.universe_count}品种 · ${m.market_date}`;
      $('#loading').classList.add('hidden');
    }catch(err){$('#loading').innerHTML=`<div class="error-box"><b>页面载入失败</b><span>${esc(err.message)}</span><small>请通过 http://127.0.0.1:8765/ 打开，并确认已生成 data/market.json。</small></div>`;console.error(err)}
  }

  function initFilters(){
    const boards=[...new Set(state.rows.map(x=>x.board))],ex=[...new Set(state.rows.map(x=>x.exchange))];
    fillSelect($('#overview-board'),boards);fillSelect($('#rs-board'),boards);fillSelect($('#em-board'),boards);fillSelect($('#overview-exchange'),ex);fillSelect($('#rs-exchange'),ex);
    ['#overview-search','#overview-board','#overview-exchange'].forEach(s=>$(s).addEventListener('input',renderOverviewTable));
    ['#rs-board','#rs-exchange','#rs-fresh'].forEach(s=>$(s).addEventListener('input',updateRelativeStrength));
    ['#em-board','#em-direction','#em-state'].forEach(s=>$(s).addEventListener('input',renderEmergence));
    $$('#overview-table th[data-sort]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.sort;state.sortDir=state.sortKey===k?-state.sortDir:-1;state.sortKey=k;renderOverviewTable()}));
  }
  function renderOverview(){
    const scores=state.rows.map(x=>x.baselineScore).filter(Number.isFinite),bull=scores.filter(x=>x>=18).length,bear=scores.filter(x=>x<=-18).length;
    const confirm=state.rows.filter(x=>x.volumeRatio60>=1.1&&x.oiChange60!=null&&Math.sign(x.oiChange60)===Math.sign(x.baselineScore)).length;
    $('#kpi-total').textContent=state.rows.length;$('#kpi-breadth').textContent=`${fmt(100*bull/scores.length,1)}%`;$('#kpi-bear').textContent=`${fmt(100*bear/scores.length,1)}%`;$('#kpi-dispersion').textContent=fmt(std(scores),1);$('#kpi-confirm').textContent=confirm;$('#kpi-stale').textContent=state.rows.filter(x=>x.stale).length;
    renderSectorOverview();renderOverviewTable();
  }
  function groupedRows(){const g={};state.rows.forEach(x=>(g[x.board]??=[]).push(x));return g}
  function renderSectorOverview(){
    const groups=groupedRows(),stats=Object.entries(groups).map(([name,a])=>{const scores=a.map(x=>x.baselineScore).filter(Number.isFinite);return{name,count:a.length,score:mean(scores),bull:scores.filter(x=>x>=18).length,bear:scores.filter(x=>x<=-18).length,flat:scores.filter(x=>Math.abs(x)<18).length,ret60:median(a.map(x=>x.ret60)),natr:mean(a.map(x=>x.natr).filter(Number.isFinite))}}).sort((a,b)=>b.score-a.score);
    const chart=state.charts.treemap??=echarts.init($('#sector-treemap'));
    chart.setOption({animationDuration:500,tooltip:{formatter:p=>`<b>${esc(p.name)}</b><br>品种 ${p.data.value}<br>平均趋势分 ${fmt(p.data.score,1)}<br>多头 ${p.data.bull} / 空头 ${p.data.bear}`},series:[{type:'treemap',roam:false,nodeClick:false,breadcrumb:{show:false},label:{show:true,formatter:p=>`${p.name}\n${p.data.value}品种  ${p.data.score>0?'+':''}${fmt(p.data.score,1)}`,fontSize:12,lineHeight:20},upperLabel:{show:false},itemStyle:{borderColor:'#fff',borderWidth:2,gapWidth:2},data:stats.map(x=>({...x,value:x.count,itemStyle:{color:scoreColor(x.score)}}))}]},{notMerge:true});
    chart.off('click');chart.on('click',p=>{$('#overview-board').value=p.name;renderOverviewTable()});
  }
  function overviewRows(){const q=$('#overview-search').value.trim().toLowerCase(),b=$('#overview-board').value,e=$('#overview-exchange').value;return state.rows.filter(x=>(!q||`${x.name} ${x.symbol} ${x.sector}`.toLowerCase().includes(q))&&(!b||x.board===b)&&(!e||x.exchange===e))}
  function renderOverviewTable(){
    const rows=overviewRows().sort((a,b)=>{const av=a[state.sortKey],bv=b[state.sortKey];if(av==null)return 1;if(bv==null)return-1;return(typeof av==='string'?av.localeCompare(bv,'zh-CN'):av-bv)*state.sortDir});
    $('#overview-table tbody').innerHTML=rows.map(x=>`<tr data-symbol="${esc(x.symbol)}"><td class="instrument"><strong>${x.stale?'<i class="warning">● </i>':''}${esc(x.name)}</strong><small>${esc(x.symbol)}0 · ${esc(x.sector)}</small></td><td>${esc(x.board)}</td><td>${esc(x.exchange)}</td><td>${fmt(x.latest,x.latest<200?3:2)}</td><td class="${valueClass(x.ret60)}">${pct(x.ret60)}</td><td class="${valueClass(x.ret120)}">${pct(x.ret120)}</td><td><span class="tag ${scoreClass(x.baselineScore)}" title="34%动量 + 24%均线 + 16%MACD + 12%RSI + 14%BOLL；量仓最多±24分">${x.baselineScore>0?'+':''}${fmt(x.baselineScore,1)} · ${esc(x.baselineDirection)}</span></td><td>${fmt(x.volumeRatio60,2)}</td><td class="${valueClass(x.oiChange60)}">${pct(x.oiChange60)}</td><td>${esc(x.latest_date||'—')}</td></tr>`).join('');
    $$('#overview-table tbody tr').forEach(tr=>tr.addEventListener('click',()=>selectDetail(tr.dataset.symbol,true)));
  }

  function renderSystemCards(){
    $('#system-cards').innerHTML=Object.entries(systems).map(([id,s])=>`<article class="system-card ${state.system===id?'active':''}" data-system="${id}"><span class="system-code">${s.code}</span><h3>${esc(s.name)}</h3><p class="subtitle">${esc(s.short)}</p><div class="formula">${esc(s.formula)}</div><dl><dt>使用</dt><dd>${esc(s.use)}</dd><dt>优点</dt><dd>${esc(s.strength)}</dd><dt>风险</dt><dd>${esc(s.risk)}</dd></dl><div class="system-source">${esc(s.source)}</div><button type="button">使用此系统并调参</button></article>`).join('');
    $$('.system-card button').forEach(b=>b.addEventListener('click',()=>{selectSystem(b.closest('.system-card').dataset.system);location.hash='lab'}));
  }
  function initLab(){
    $('#system-select').innerHTML=Object.entries(systems).map(([id,s])=>`<option value="${id}">${esc(s.name)}</option>`).join('');$('#system-select').value=state.system;
    $('#system-select').addEventListener('change',e=>selectSystem(e.target.value));
    $('#use-volume').addEventListener('change',e=>{state.params.useVolume=e.target.checked;updateParamReadout();updateRelativeStrength();renderDetail()});
    $('#use-oi').addEventListener('change',e=>{state.params.useOI=e.target.checked;updateParamReadout();updateRelativeStrength();renderDetail()});
    $('#reset-params').addEventListener('click',()=>applyPreset(state.preset));
    $('#save-custom').addEventListener('click',()=>{localStorage.setItem(`yfTrendParams.${state.system}`,JSON.stringify(state.params));const b=$('#save-custom');b.textContent='已保存';setTimeout(()=>b.textContent='保存为本机自定义参数',1200)});
    renderLab();
  }
  function selectSystem(id){state.system=id;state.preset='balanced';const saved=localStorage.getItem(`yfTrendParams.${id}`);state.params=saved?{...E.presets[id].balanced,...JSON.parse(saved)}:{...E.presets[id].balanced};$('#system-select').value=id;renderSystemCards();renderLab();updateRelativeStrength();renderDetail()}
  function applyPreset(p){state.preset=p;state.params={...E.presets[state.system][p]};renderLab();updateRelativeStrength();renderDetail()}
  function renderLab(){
    const s=systems[state.system];$('#hero-system').textContent=s.name;$('#hero-params').textContent=`${presetNames[state.preset]||'自定义'}参数 · 日线更新`;$('#lab-system-name').textContent=s.name;$('#lab-signal-structure').textContent=s.structure;$('#lab-use-case').textContent=s.use;$('#system-logic').textContent=s.logic;$('#system-strength').textContent=s.strength;$('#system-risk').textContent=s.risk;
    $('#preset-buttons').innerHTML=Object.entries(presetNames).map(([id,n])=>`<button type="button" data-preset="${id}" class="${state.preset===id?'active':''}">${n}</button>`).join('');$$('#preset-buttons button').forEach(b=>b.addEventListener('click',()=>applyPreset(b.dataset.preset)));
    $('#use-volume').checked=state.params.useVolume!==false;$('#use-oi').checked=state.params.useOI!==false;
    $('#parameter-form').innerHTML=s.params.map(([key,label,min,max,step,unit])=>`<div class="param-control"><label><span>${esc(label)}</span><output id="out-${key}">${state.params[key]}</output></label><input type="range" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${state.params[key]}"><small>${min}–${max} ${unit}</small></div>`).join('');
    let timer;$$('#parameter-form input').forEach(i=>i.addEventListener('input',()=>{state.preset='custom';state.params[i.dataset.param]=+i.value;$(`#out-${i.dataset.param}`).textContent=i.value;updateParamReadout();$('#hero-params').textContent='自定义参数 · 日线更新';clearTimeout(timer);timer=setTimeout(()=>{updateRelativeStrength();renderDetail()},80)}));
    updateParamReadout();
  }
  function updateParamReadout(){$('#parameter-code').textContent=paramsText(state.params)}

  function currentRSRows(){
    const b=$('#rs-board').value,e=$('#rs-exchange').value,f=$('#rs-fresh').checked,marketDate=state.data.meta.market_date;
    return state.rows.map(x=>{const s=state.data.series[x.symbol],now=E.evaluate(state.system,state.params,s),prev=E.evaluate(state.system,state.params,s,s.c.length-61);return{...x,systemScore:now?.score??null,systemDirection:now?.direction??'—',accel:now&&prev?now.score-prev.score:null,systemMetrics:now?.metrics||{}}}).filter(x=>x.systemScore!=null&&(!b||x.board===b)&&(!e||x.exchange===e)&&(!f||x.latest_date===marketDate));
  }
  function updateRelativeStrength(){
    if(!state.data)return;const token=++state.renderToken,rows=currentRSRows().sort((a,b)=>b.systemScore-a.systemScore);if(token!==state.renderToken)return;
    rows.forEach((x,i)=>x.rank=i+1);$('#rs-system-label').textContent=`${systems[state.system].name} · ${presetNames[state.preset]||'自定义'}参数`;$('#rs-count').textContent=`${rows.length}个品种`;
    renderScatter(rows);renderRank(rows);renderRSTable(rows);
  }
  function renderScatter(rows){
    const chart=state.charts.scatter??=echarts.init($('#rs-scatter'));
    const shapes={商品:'circle',股指:'diamond',国债:'triangle'};
    const data=rows.map(x=>({name:x.name,value:[x.systemScore,x.accel??0,x.natr??1,x.symbol,x.board,x.asset,x.ret120],symbol:shapes[x.asset],itemStyle:{color:boardColor[x.board]||boardColor.其他,opacity:.82},label:{show:Math.abs(x.systemScore)>70||Math.abs(x.accel??0)>60}}));
    chart.setOption({animationDuration:350,backgroundColor:'transparent',grid:{left:54,right:24,top:28,bottom:48},tooltip:{trigger:'item',formatter:p=>{const v=p.value;return `<b>${esc(p.name)} · ${esc(v[3])}</b><br>${esc(v[5])} / ${esc(v[4])}<br>趋势得分 ${fmt(v[0],1)}<br>60日变化 ${v[1]>0?'+':''}${fmt(v[1],1)}<br>NATR ${fmt(v[2],2)}%<br>120日收益 ${pct(v[6])}`}},xAxis:{type:'value',min:-100,max:100,name:'趋势强度 →',nameLocation:'middle',nameGap:31,nameTextStyle:{color:'#82909e'},axisLine:{lineStyle:{color:'#455362'}},axisLabel:{color:'#8d9aa7'},splitLine:{lineStyle:{color:'#263442'}}},yAxis:{type:'value',name:'趋势加速度',nameTextStyle:{color:'#82909e'},axisLine:{lineStyle:{color:'#455362'}},axisLabel:{color:'#8d9aa7'},splitLine:{lineStyle:{color:'#263442'}}},series:[{type:'scatter',data,symbolSize:v=>Math.max(10,Math.min(34,7+v[2]*2.2)),label:{formatter:p=>p.value[3],position:'top',color:'#dce6f0',fontSize:9},emphasis:{focus:'self',label:{show:true}},markLine:{silent:true,symbol:'none',lineStyle:{color:'#667483',type:'dashed'},data:[{xAxis:0},{yAxis:0}]}}]},{notMerge:true});
  }
  function renderRank(rows){
    const chosen=[...rows.slice(-8).reverse(),...rows.slice(0,8).reverse()],chart=state.charts.rank??=echarts.init($('#rank-chart'));
    chart.setOption({animationDuration:350,grid:{left:80,right:35,top:20,bottom:26},tooltip:{trigger:'axis',axisPointer:{type:'shadow'},formatter:p=>`${esc(p[0].name)}<br>系统得分 ${fmt(p[0].value,1)}`},xAxis:{type:'value',min:-100,max:100,axisLabel:{fontSize:9},splitLine:{lineStyle:{color:'#e4e7eb'}}},yAxis:{type:'category',data:chosen.map(x=>`${x.name} ${x.symbol}`),axisLabel:{fontSize:10}},series:[{type:'bar',data:chosen.map(x=>({value:x.systemScore,itemStyle:{color:x.systemScore>=0?'#c2362b':'#16805d'}})),barWidth:12,label:{show:true,position:'inside',formatter:p=>fmt(p.value,0),color:'#fff',fontSize:9}}]},{notMerge:true});
  }
  function renderRSTable(rows){
    $('#rs-table tbody').innerHTML=rows.map(x=>`<tr data-symbol="${esc(x.symbol)}"><td class="mono">${x.rank}</td><td class="instrument"><strong>${esc(x.name)}</strong><small>${esc(x.symbol)}0 · ${esc(x.exchange)}</small></td><td>${esc(x.asset)}</td><td>${esc(x.board)}</td><td><span class="tag ${scoreClass(x.systemScore)}">${x.systemScore>0?'+':''}${fmt(x.systemScore,1)} · ${esc(x.systemDirection)}</span></td><td class="${valueClass(x.accel)}">${x.accel>0?'+':''}${fmt(x.accel,1)}</td><td class="${valueClass(x.ret120)}">${pct(x.ret120)}</td><td class="${valueClass(x.ret252)}">${pct(x.ret252)}</td><td>${fmt(x.systemMetrics.volumeRatio??x.volumeRatio60,2)}</td><td class="${valueClass(x.systemMetrics.oiChange??x.oiChange60)}">${pct(x.systemMetrics.oiChange??x.oiChange60)}</td><td>${esc(x.latest_date)}</td></tr>`).join('');
    $$('#rs-table tbody tr').forEach(tr=>tr.addEventListener('click',()=>selectDetail(tr.dataset.symbol,true)));
  }

  const horizonLabels={60:'季度（60日）',120:'半年度（120日）',252:'一年（252日）',504:'两年（504日）',756:'三年（756日）',1260:'五年（1260日）'};
  function horizonLabel(days){return horizonLabels[days]||`${days}日`}
  function emergenceFor(row){
    const key=`${state.emergenceLong}:${state.emergenceShort}`,cache=row.emergenceCache??={};
    if(!Object.prototype.hasOwnProperty.call(cache,key))cache[key]=E.evaluateEmergence(state.data.series[row.symbol],undefined,{longHorizon:state.emergenceLong,shortHorizon:state.emergenceShort});
    return cache[key];
  }
  function initEmergence(){
    $('#em-long').value=String(state.emergenceLong);$('#em-short').value=String(state.emergenceShort);
    $('#em-long').addEventListener('change',e=>{state.emergenceLong=+e.target.value;renderEmergence()});
    $('#em-short').addEventListener('change',e=>{state.emergenceShort=+e.target.value;renderEmergence()});
    renderEmergence();
  }
  function renderEmergence(){
    if(!state.data||!$('#emergence-scatter'))return;
    state.rows.forEach(x=>x.emergence=emergenceFor(x));
    const longLabel=horizonLabel(state.emergenceLong),shortLabel=horizonLabel(state.emergenceShort),samePeriod=state.emergenceLong===state.emergenceShort;
    const all=state.rows.filter(x=>x.emergence),candidateStates=['临界突破观察','趋势潜伏'];
    $('#em-valid').textContent=all.length;$('#em-latent').textContent=all.filter(x=>x.emergence.state==='趋势潜伏').length;$('#em-breakout').textContent=all.filter(x=>x.emergence.state==='临界突破观察').length;$('#em-high').textContent=all.filter(x=>candidateStates.includes(x.emergence.state)&&x.emergence.score>=60).length;
    $('#em-valid-note').textContent=all.length===state.rows.length?'全部品种可计算':`历史不足 ${state.rows.length-all.length} 个`;
    $('#em-period-summary').textContent=`横轴 ${longLabel} / 纵轴 ${shortLabel}`;
    $('#em-period-note').textContent=samePeriod?'长短周期均选一年：此时是同窗口不同特征的对照，不属于严格的跨周期错位。':`当前组合以${longLabel}识别长期方向，以${shortLabel}识别整理、弱趋势或启动状态。`;
    $('#em-scatter-title').textContent=`${longLabel}长期方向迹象 × ${shortLabel}趋势状态`;
    $('#em-scatter-note').textContent=`横轴为${longLabel}长期方向迹象，纵轴为${shortLabel}趋势；气泡越大，趋势萌芽观察优先级越高。横轴两端且纵轴靠近0是重点区域。`;
    $('#em-long-col').textContent=`${longLabel}迹象`;$('#em-short-col').textContent=`${shortLabel}趋势`;
    $('#em-method-long').textContent=`所选${longLabel}收益、半窗口收益、价格相对半窗口/全窗口均线的位置，以及半窗口均线斜率，共同形成有方向的长期迹象分。`;
    $('#em-method-short').textContent=`所选${shortLabel}收益、对应均线位置和均线斜率形成短周期趋势分；绝对值越低，越符合“长期已有方向、短周期仍未充分启动”。`;
    $('#em-method-compression').textContent=`所选${shortLabel}价格路径效率越低、ATR20相对该窗口ATR越低，越接近盘整或波动收缩。`;
    $('#em-method-boundary').textContent=`偏多品种看价格接近所选${shortLabel}区间上沿，偏空品种看接近下沿；边界越近，突破观察优先级越高。`;
    $('#em-method-participation').textContent=`按所选${shortLabel}计算成交量比与持仓变化，并依长期方向加减分；只描述参与度，不识别主动多空。`;
    const board=$('#em-board').value,direction=$('#em-direction').value,status=$('#em-state').value;
    const rows=all.filter(x=>(!board||x.board===board)&&(!direction||x.emergence.direction===direction)&&(status==='candidate'?candidateStates.includes(x.emergence.state):!status||x.emergence.state===status)).sort((a,b)=>b.emergence.score-a.emergence.score);
    $('#em-count').textContent=`${rows.length}个品种`;
    const chart=state.charts.emergence??=echarts.init($('#emergence-scatter'));
    const data=rows.map(x=>{const e=x.emergence,c=e.components;return{name:x.name,value:[c.longBias,c.shortTrend,e.score,x.symbol,x.board,e.direction,e.state,c.boundary,c.compression],itemStyle:{color:e.direction==='偏多'?'#c2362b':'#16805d',opacity:.78},label:{show:e.score>=65}}});
    chart.setOption({animationDuration:350,grid:{left:66,right:30,top:28,bottom:62},tooltip:{trigger:'item',formatter:p=>{const v=p.value;return `<b>${esc(p.name)} · ${esc(v[3])}</b><br>${esc(v[4])} / ${esc(v[5])}<br>状态 ${esc(v[6])}<br>萌芽分 ${fmt(v[2],1)}<br>${esc(longLabel)}迹象 ${v[0]>0?'+':''}${fmt(v[0],1)}<br>${esc(shortLabel)}趋势 ${v[1]>0?'+':''}${fmt(v[1],1)}<br>边界 ${fmt(v[7],1)} / 压缩 ${fmt(v[8],1)}`}},xAxis:{type:'value',min:-100,max:100,name:`← 偏空${longLabel}迹象｜偏多${longLabel}迹象 →`,nameLocation:'middle',nameGap:39,axisLabel:{fontSize:9},splitLine:{lineStyle:{color:'#e6e8ec'}}},yAxis:{type:'value',min:-100,max:100,name:`${shortLabel}趋势`,nameGap:48,axisLabel:{fontSize:9},splitLine:{lineStyle:{color:'#e6e8ec'}}},series:[{type:'scatter',data,symbolSize:v=>Math.max(10,Math.min(38,8+v[2]*.36)),label:{formatter:p=>p.value[3],position:'top',fontSize:9,color:'#303844'},emphasis:{focus:'self',label:{show:true}},markArea:{silent:true,itemStyle:{color:'rgba(37,99,235,.06)'},label:{show:true,formatter:`${shortLabel}弱趋势 / 震荡带`,color:'#6b7280',fontSize:10},data:[[{yAxis:-25},{yAxis:25}]]},markLine:{silent:true,symbol:'none',lineStyle:{color:'#9aa1a9',type:'dashed'},data:[{xAxis:0},{yAxis:0},{xAxis:30},{xAxis:-30}]}}]},{notMerge:true});
    $('#emergence-table tbody').innerHTML=rows.length?rows.slice(0,30).map(x=>{const e=x.emergence,c=e.components;return `<tr data-symbol="${esc(x.symbol)}"><td class="instrument"><strong>${esc(x.name)}</strong><small>${esc(x.symbol)}0 · ${esc(x.board)}</small></td><td><span class="tag ${e.direction==='偏多'?'bull':'bear'}">${esc(e.direction)} · ${esc(e.state)}</span></td><td><b class="${e.score>=60?'positive':''}">${fmt(e.score,1)}</b></td><td class="${valueClass(c.longBias)}">${c.longBias>0?'+':''}${fmt(c.longBias,1)}</td><td class="${valueClass(c.shortTrend)}">${c.shortTrend>0?'+':''}${fmt(c.shortTrend,1)}</td><td>${fmt(c.boundary,1)}</td><td>${fmt(c.compression,1)}</td></tr>`}).join(''):`<tr><td colspan="7" class="empty-row">当前筛选和周期组合下没有符合条件的品种。</td></tr>`;
    $$('#emergence-table tbody tr[data-symbol]').forEach(tr=>tr.addEventListener('click',()=>selectDetail(tr.dataset.symbol,true)));
  }

  function initDetail(){
    if(!state.rows.some(x=>x.symbol===state.selected))state.selected=state.rows[0]?.symbol;
    $('#detail-symbol').innerHTML=state.rows.slice().sort((a,b)=>`${a.asset}${a.board}${a.name}`.localeCompare(`${b.asset}${b.board}${b.name}`,'zh-CN')).map(x=>`<option value="${esc(x.symbol)}">${esc(x.name)} · ${esc(x.symbol)}0 · ${esc(x.exchange)}</option>`).join('');
    $('#detail-symbol').value=state.selected;
    $('#detail-symbol').addEventListener('change',e=>selectDetail(e.target.value,false));
    $$('#detail-ranges button').forEach(b=>b.addEventListener('click',()=>{$$('#detail-ranges button').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.detailRange=+b.dataset.days;renderDetail()}));
    renderDetail();
  }
  function selectDetail(symbol,navigate=false){
    if(!state.rows.some(x=>x.symbol===symbol))return;state.selected=symbol;
    if($('#detail-symbol'))$('#detail-symbol').value=symbol;renderDetail();
    if(navigate)document.querySelector('#detail')?.scrollIntoView({behavior:'smooth'});
  }
  function movingAverage(values,period){
    const out=new Array(values.length).fill(null);let sum=0;
    for(let i=0;i<values.length;i++){sum+=values[i];if(i>=period)sum-=values[i-period];if(i>=period-1)out[i]=sum/period}
    return out;
  }
  const componentLabels={channel:'通道位置',maSlope:'均线斜率',confirmation:'量仓确认',spread:'均线价差',stack:'均线排列',slope:'趋势斜率',macdLine:'MACD线',histogram:'MACD柱',trendFilter:'趋势过滤',dmi:'DMI方向',band:'BOLL位置',momentum:'多周期收益',movingAverage:'均线结构',macd:'MACD',rsi:'RSI',boll:'BOLL',priceRegime:'长期均线',kstLevel:'KST水平',kstSignal:'KST信号',kstSlope:'KST斜率'};
  function renderDetail(){
    if(!state.data||!$('#detail-chart'))return;
    const item=state.rows.find(x=>x.symbol===state.selected);if(!item)return;
    const raw=state.data.series[item.symbol],end=raw.c.length-1,res=E.evaluate(state.system,state.params,raw,end);
    const r60=end>=60?raw.c[end]/raw.c[end-60]-1:null,r120=end>=120?raw.c[end]/raw.c[end-120]-1:null;
    const oi60=end>=60&&raw.p[end-60]?raw.p[end]/raw.p[end-60]-1:null,vr=E.indicators.volumeRatio(raw,60,end),na=natr(raw);
    $('#detail-system-label').textContent=`${systems[state.system].name} · ${presetNames[state.preset]||'自定义'}`;
    $('#detail-title').textContent=`${item.name} · ${item.symbol}0`;
    $('#detail-subtitle').textContent=`${item.exchange}｜${item.asset}｜${item.sector}｜最新观测 ${item.latest_date}｜${item.observations.toLocaleString()}个日线观测`;
    const kpis=[['系统得分',res?`${res.score>0?'+':''}${fmt(res.score,1)}`:'样本不足',res?valueClass(res.score):'warning'],['趋势状态',res?.direction||'样本不足',res?valueClass(res.score):'warning'],['季度60日',pct(r60),valueClass(r60)],['半年度120日',pct(r120),valueClass(r120)],['60日量比',fmt(vr,2),''],['60日持仓',pct(oi60),valueClass(oi60)]];
    $('#detail-kpis').innerHTML=kpis.map(([l,v,c])=>`<article><span>${esc(l)}</span><strong class="${c}">${esc(v)}</strong></article>`).join('');
    renderComponents(res?.components||{});
    const phase=oi60==null?'持仓数据不足':r60>0&&oi60>0?'价涨增仓':r60>0?'价涨减仓':oi60>0?'价跌增仓':'价跌减仓';
    const phaseText={价涨增仓:'价格上行且持仓增加，新增仓位参与度提高；但总持仓无法识别新增仓位究竟来自哪一方。',价涨减仓:'价格上涨但持仓下降，行情可能含有空头回补或存量仓位退出，趋势确认弱于增仓上涨。',价跌增仓:'价格下行且持仓增加，新增仓位参与下跌，空头趋势的参与度相对较高。',价跌减仓:'价格下跌且持仓下降，可能以多头减仓或存量仓位退出为主，需警惕下跌动能衰减。',持仓数据不足:'当前序列不足以计算60日持仓变化，不对价仓组合做方向解释。'}[phase];
    $('#detail-interpretation').innerHTML=`<p><b>${phase}</b>：${phaseText}</p><p>季度60日价格变化 <b class="${valueClass(r60)}">${pct(r60)}</b>，60日持仓变化 <b class="${valueClass(oi60)}">${pct(oi60)}</b>，60日成交量比 <b>${fmt(vr,2)}</b>。</p><p>当前NATR约 <b>${fmt(na,2)}%</b>；它衡量跨品种可比波动，不直接表示趋势方向。</p>`;
    $('#detail-quality').innerHTML=`<p><b>行情：</b>新浪 ${esc(item.continuous_symbol||item.symbol+'0')} 主力连续日K，未复权直接拼接。</p><p><b>日期：</b>${esc(item.latest_date)}${item.stale?'，早于全市场最新市场日。':'，与全市场最新市场日一致。'}</p><p>${item.roll_sensitive?'<b class="warning">近期检测到异常跳点，可能受换月影响。</b>':'近期未触发机械换月跳点警报。'}</p><p>成交量和持仓量为主力连续口径，不是全部上市合约汇总。${item.official_url?` <a href="${esc(item.official_url)}" target="_blank" rel="noopener">交易所资料 ↗</a>`:''}</p>`;
    drawDetailChart(raw,item);
  }
  function renderComponents(components){
    const rows=Object.entries(components).filter(([,v])=>Number.isFinite(v));
    $('#component-bars').innerHTML=rows.length?rows.map(([k,v])=>{const w=Math.min(50,Math.abs(v)/2),style=v>=0?`left:50%;width:${w}%`:`right:50%;width:${w}%`;return `<div class="component-row"><label>${esc(componentLabels[k]||k)}</label><span class="component-track"><i class="${v<0?'neg':''}" style="${style}"></i></span><b class="${valueClass(v)}">${v>0?'+':''}${fmt(v,1)}</b></div>`}).join(''):'<p class="warning">该品种历史不足，当前系统无法形成完整分项。</p>';
  }
  function drawDetailChart(raw,item){
    const len=raw.c.length,start=state.detailRange?Math.max(0,len-state.detailRange):0;
    const d=raw.d.slice(start),o=raw.o.slice(start),h=raw.h.slice(start),l=raw.l.slice(start),c=raw.c.slice(start),v=raw.v.slice(start),oi=raw.p.slice(start);
    const ma60=movingAverage(raw.c,60).slice(start),ma120=movingAverage(raw.c,120).slice(start),step=d.length>1800?5:1;
    const scores=d.map((_,j)=>{const i=start+j;if(j%step&&j!==d.length-1)return null;return E.evaluate(state.system,state.params,raw,i)?.score??null});
    const candles=d.map((_,i)=>[o[i],c[i],l[i],h[i]]),vol=d.map((_,i)=>({value:v[i],itemStyle:{color:c[i]>=o[i]?'rgba(194,54,43,.65)':'rgba(22,128,93,.65)'}}));
    const chart=state.charts.detail??=echarts.init($('#detail-chart'));
    chart.setOption({animation:false,legend:{top:5,data:['日K','MA60','MA120','系统评分','成交量','持仓量'],textStyle:{fontSize:10}},tooltip:{trigger:'axis',axisPointer:{type:'cross'}},axisPointer:{link:[{xAxisIndex:[0,1,2]}]},grid:[{left:62,right:62,top:44,height:'43%'},{left:62,right:62,top:'53%',height:'15%'},{left:62,right:62,top:'73%',height:'15%'}],xAxis:[0,1,2].map((_,i)=>({type:'category',gridIndex:i,data:d,boundaryGap:true,axisLine:{lineStyle:{color:'#9aa1a9'}},axisTick:{show:false},axisLabel:{show:i===2,fontSize:9},splitLine:{show:false}})),yAxis:[{gridIndex:0,scale:true,axisLabel:{fontSize:9},splitLine:{lineStyle:{color:'#eaecf0'}}},{gridIndex:1,min:-100,max:100,axisLabel:{fontSize:9},splitLine:{lineStyle:{color:'#eaecf0'}}},{gridIndex:2,scale:true,axisLabel:{fontSize:8},splitLine:{show:false}},{gridIndex:2,scale:true,position:'right',axisLabel:{fontSize:8},splitLine:{show:false}}],dataZoom:[{type:'inside',xAxisIndex:[0,1,2],start:0,end:100},{type:'slider',xAxisIndex:[0,1,2],bottom:5,height:19,start:0,end:100}],series:[{name:'日K',type:'candlestick',xAxisIndex:0,yAxisIndex:0,data:candles,itemStyle:{color:'#c2362b',color0:'#16805d',borderColor:'#c2362b',borderColor0:'#16805d'}},{name:'MA60',type:'line',xAxisIndex:0,yAxisIndex:0,data:ma60,showSymbol:false,lineStyle:{width:1.2,color:'#1d4ed8'}},{name:'MA120',type:'line',xAxisIndex:0,yAxisIndex:0,data:ma120,showSymbol:false,lineStyle:{width:1.2,color:'#7c3aed'}},{name:'系统评分',type:'line',xAxisIndex:1,yAxisIndex:1,data:scores,connectNulls:true,showSymbol:false,lineStyle:{width:1.4,color:'#d97706'},areaStyle:{color:'rgba(217,119,6,.10)'},markLine:{silent:true,symbol:'none',lineStyle:{color:'#9aa1a9',type:'dashed'},data:[{yAxis:0},{yAxis:18},{yAxis:-18}]}},{name:'成交量',type:'bar',xAxisIndex:2,yAxisIndex:2,data:vol,barMaxWidth:7},{name:'持仓量',type:'line',xAxisIndex:2,yAxisIndex:3,data:oi,showSymbol:false,lineStyle:{width:1.2,color:'#374151'}}]},{notMerge:true});
  }
  function scoreColor(v){const x=Math.max(-100,Math.min(100,v||0));if(x>=0){const t=x/100;return `rgb(${Math.round(125+70*t)},${Math.round(150-95*t)},${Math.round(150-105*t)})`}const t=-x/100;return `rgb(${Math.round(115-70*t)},${Math.round(155-25*t)},${Math.round(150-55*t)})`}
  window.addEventListener('resize',()=>Object.values(state.charts).forEach(c=>c.resize()));
  boot();
})();
