(() => {
  'use strict';

  const clamp = (x, lo=-100, hi=100) => Math.max(lo, Math.min(hi, x));
  const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
  const last = a => a[a.length-1];
  const sliceTo = (a, end) => a.slice(0, end == null ? a.length : end + 1);
  const pct = (a,b) => a != null && b ? a/b-1 : null;

  function sma(values, period, end=values.length-1){
    if(period < 1 || end+1 < period) return null;
    let s=0; for(let i=end-period+1;i<=end;i++) s+=values[i];
    return s/period;
  }
  function emaSeries(values, period, end=values.length-1){
    if(period < 1 || end+1 < period) return [];
    const k=2/(period+1), out=new Array(end+1).fill(null);
    let e=mean(values.slice(0,period)); out[period-1]=e;
    for(let i=period;i<=end;i++){e=values[i]*k+e*(1-k);out[i]=e}
    return out;
  }
  function std(values, period, end=values.length-1){
    const m=sma(values,period,end); if(m==null)return null;
    let s=0;for(let i=end-period+1;i<=end;i++)s+=(values[i]-m)**2;
    return Math.sqrt(s/period);
  }
  function atr(series, period=20, end=series.c.length-1){
    if(end < period) return null;
    const tr=[];
    for(let i=1;i<=end;i++)tr.push(Math.max(series.h[i]-series.l[i],Math.abs(series.h[i]-series.c[i-1]),Math.abs(series.l[i]-series.c[i-1])));
    let a=mean(tr.slice(0,period));
    for(let i=period;i<tr.length;i++)a=((period-1)*a+tr[i])/period;
    return a;
  }
  function rsi(values, period=14, end=values.length-1){
    if(end < period) return null;
    let gain=0,loss=0;
    for(let i=1;i<=period;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0)}
    gain/=period;loss/=period;
    for(let i=period+1;i<=end;i++){const d=values[i]-values[i-1];gain=((period-1)*gain+Math.max(d,0))/period;loss=((period-1)*loss+Math.max(-d,0))/period}
    if(loss===0)return 100; const rs=gain/loss; return 100-100/(1+rs);
  }
  function macd(values, fast=12, slow=26, signal=9, end=values.length-1){
    if(end+1 < slow+signal) return null;
    const ef=emaSeries(values,fast,end), es=emaSeries(values,slow,end), line=[];
    for(let i=0;i<=end;i++)line.push(ef[i]!=null&&es[i]!=null?ef[i]-es[i]:null);
    const valid=line.map((x,i)=>({x,i})).filter(z=>z.x!=null);
    if(valid.length<signal)return null;
    const vals=valid.map(z=>z.x), sig=emaSeries(vals,signal,vals.length-1);
    const l=last(vals), sg=last(sig); return {line:l,signal:sg,hist:l-sg};
  }
  function dmiAdx(series, period=14, end=series.c.length-1){
    if(end < period*2) return null;
    const tr=[],plus=[],minus=[];
    for(let i=1;i<=end;i++){
      const up=series.h[i]-series.h[i-1], dn=series.l[i-1]-series.l[i];
      tr.push(Math.max(series.h[i]-series.l[i],Math.abs(series.h[i]-series.c[i-1]),Math.abs(series.l[i]-series.c[i-1])));
      plus.push(up>dn&&up>0?up:0); minus.push(dn>up&&dn>0?dn:0);
    }
    let trS=tr.slice(0,period).reduce((a,b)=>a+b,0), pS=plus.slice(0,period).reduce((a,b)=>a+b,0), mS=minus.slice(0,period).reduce((a,b)=>a+b,0);
    const dx=[]; let pdi=0,mdi=0;
    for(let i=period-1;i<tr.length;i++){
      if(i>=period){trS=trS-trS/period+tr[i];pS=pS-pS/period+plus[i];mS=mS-mS/period+minus[i]}
      pdi=trS?100*pS/trS:0;mdi=trS?100*mS/trS:0;dx.push((pdi+mdi)?100*Math.abs(pdi-mdi)/(pdi+mdi):0);
    }
    if(dx.length<period)return null; let adx=mean(dx.slice(0,period));for(let i=period;i<dx.length;i++)adx=((period-1)*adx+dx[i])/period;
    return {plusDI:pdi,minusDI:mdi,adx};
  }
  function volumeRatio(series, lookback=20, end=series.c.length-1){
    if(end<lookback)return null;const base=mean(series.v.slice(end-lookback,end).filter(x=>x!=null));return base?series.v[end]/base:null;
  }
  function oiChange(series, lookback=20, end=series.c.length-1){
    return end>=lookback?pct(series.p[end],series.p[end-lookback]):null;
  }
  function confirmation(series,p,end){
    const vr=volumeRatio(series,p.volumeLookback||20,end),oi=oiChange(series,p.oiLookback||20,end);
    const direction=p._direction||0;
    const vScore=p.useVolume===false||vr==null?0:direction*Math.min(12,Math.max(-6,(vr-1)*18));
    const oiScore=p.useOI===false||oi==null?0:direction*Math.min(12,Math.max(-12,oi*120));
    return {vr,oi,score:vScore+oiScore};
  }
  function result(score,components,metrics){
    score=clamp(score);const direction=score>=55?'强多头':score>=18?'多头':score<=-55?'强空头':score<=-18?'空头':'震荡';
    return {score:+score.toFixed(2),direction,components,metrics};
  }

  function evalDonchian(series,p,end){
    if(end < Math.max(p.entry,p.exit,p.trendMA||1)+2)return null;
    const c=series.c[end],a=atr(series,p.atrPeriod||20,end)||Math.abs(c)*.01;
    const hh=Math.max(...series.c.slice(end-p.entry,end)),ll=Math.min(...series.c.slice(end-p.entry,end));
    const eh=Math.max(...series.c.slice(end-p.exit,end)),el=Math.min(...series.c.slice(end-p.exit,end));
    const mid=(hh+ll)/2,position=(c-mid)/Math.max(a,(hh-ll)/2||a);
    const ma=sma(series.c,p.trendMA,end),maPrev=sma(series.c,p.trendMA,end-(p.slopeLookback||20));
    const trend=ma&&maPrev?Math.tanh((ma-maPrev)/Math.max(a,1))*22:0;
    let base=Math.tanh(position)*58+(c>hh?18:c<ll?-18:0)+(c>eh?7:c<el?-7:0)+trend;
    p._direction=Math.sign(base);const conf=confirmation(series,p,end);base+=conf.score;
    return result(base,{channel:+(Math.tanh(position)*58).toFixed(1),maSlope:+trend.toFixed(1),confirmation:+conf.score.toFixed(1)},{upper:hh,lower:ll,exitUpper:eh,exitLower:el,atr:a,volumeRatio:conf.vr,oiChange:conf.oi});
  }
  function evalMA(series,p,end){
    if(end < Math.max(p.slow,p.fast,p.medium||1)+(p.slopeLookback||20))return null;
    const c=series.c[end],a=atr(series,p.atrPeriod||20,end)||Math.abs(c)*.01;
    const f=sma(series.c,p.fast,end),m=sma(series.c,p.medium||p.fast,end),s=sma(series.c,p.slow,end),s0=sma(series.c,p.slow,end-(p.slopeLookback||20));
    const spread=Math.tanh((f-s)/Math.max(a,1))*48,stack=(c>f&&f>m&&m>s?22:c<f&&f<m&&m<s?-22:0),slope=Math.tanh((s-s0)/Math.max(a,1))*20;
    let base=spread+stack+slope;p._direction=Math.sign(base);const conf=confirmation(series,p,end);base+=conf.score;
    return result(base,{spread:+spread.toFixed(1),stack,slope:+slope.toFixed(1),confirmation:+conf.score.toFixed(1)},{fast:f,medium:m,slow:s,atr:a,volumeRatio:conf.vr,oiChange:conf.oi});
  }
  function evalMACD(series,p,end){
    if(end < Math.max(p.slow+p.signal,p.trendMA))return null;
    const c=series.c[end],a=atr(series,p.atrPeriod||20,end)||Math.abs(c)*.01,m=macd(series.c,p.fast,p.slow,p.signal,end),tm=sma(series.c,p.trendMA,end);
    if(!m)return null;const line=Math.tanh(m.line/Math.max(a,1))*42,hist=Math.tanh(m.hist/Math.max(a*.25,1e-9))*28,filter=c>tm?18:-18;
    let base=line+hist+filter;p._direction=Math.sign(base);const conf=confirmation(series,p,end);base+=conf.score;
    return result(base,{macdLine:+line.toFixed(1),histogram:+hist.toFixed(1),trendFilter:filter,confirmation:+conf.score.toFixed(1)},{...m,trendMA:tm,atr:a,volumeRatio:conf.vr,oiChange:conf.oi});
  }
  function evalADX(series,p,end){
    if(end<Math.max(p.period*3,p.trendMA))return null;const d=dmiAdx(series,p.period,end);if(!d)return null;
    const c=series.c[end],tm=sma(series.c,p.trendMA,end),dir=Math.sign(d.plusDI-d.minusDI),strength=Math.min(70,d.adx/(p.threshold||25)*50),filter=(c>tm?1:-1)*20;
    let base=dir*strength+filter;p._direction=Math.sign(base);const conf=confirmation(series,p,end);base+=conf.score;
    return result(base,{dmi:+(dir*strength).toFixed(1),trendFilter:filter,confirmation:+conf.score.toFixed(1)},{...d,trendMA:tm,volumeRatio:conf.vr,oiChange:conf.oi});
  }
  function evalBoll(series,p,end){
    if(end<Math.max(p.period,p.trendMA)+(p.slopeLookback||20))return null;const c=series.c[end],mid=sma(series.c,p.period,end),sd=std(series.c,p.period,end),z=sd?(c-mid)/sd:0;
    const tm=sma(series.c,p.trendMA,end),tm0=sma(series.c,p.trendMA,end-(p.slopeLookback||20)),a=atr(series,p.atrPeriod||20,end)||Math.abs(c)*.01;
    const band=Math.tanh(z/(p.std||2))*58,slope=Math.tanh((tm-tm0)/Math.max(a,1))*22,filter=(c>tm?1:-1)*12;
    let base=band+slope+filter;p._direction=Math.sign(base);const conf=confirmation(series,p,end);base+=conf.score;
    return result(base,{band:+band.toFixed(1),slope:+slope.toFixed(1),trendFilter:filter,confirmation:+conf.score.toFixed(1)},{mid,upper:mid+(p.std||2)*sd,lower:mid-(p.std||2)*sd,z,trendMA:tm,volumeRatio:conf.vr,oiChange:conf.oi});
  }
  function evalMulti(series,p,end){
    const need=Math.max(p.returnLong,p.maSlow,p.bollPeriod,p.macdSlow+p.macdSignal,p.rsiPeriod,p.oiLookback||1,p.volumeLookback||1);if(end<need)return null;
    const c=series.c[end],a=atr(series,p.atrPeriod||20,end)||Math.abs(c)*.01;
    const r1=pct(c,series.c[end-p.returnShort]),r2=pct(c,series.c[end-p.returnMedium]),r3=pct(c,series.c[end-p.returnLong]);
    const momentum=100*Math.tanh((.2*r1+.3*r2+.5*r3)/Math.max(a/c*.8,.01));
    const mf=sma(series.c,p.maFast,end),ms=sma(series.c,p.maSlow,end),maScore=100*Math.tanh((mf-ms)/Math.max(a*2,1));
    const mc=macd(series.c,p.macdFast,p.macdSlow,p.macdSignal,end),macdScore=mc?100*Math.tanh(mc.hist/Math.max(a*.35,1e-9)):0;
    const rv=rsi(series.c,p.rsiPeriod,end),rsiScore=rv==null?0:clamp((rv-50)*2);
    const bm=sma(series.c,p.bollPeriod,end),bsd=std(series.c,p.bollPeriod,end),bollScore=bsd?clamp((c-bm)/bsd*35):0;
    let base=.34*momentum+.24*maScore+.16*macdScore+.12*rsiScore+.14*bollScore;
    p._direction=Math.sign(base);const conf=confirmation(series,p,end);base+=conf.score;
    return result(base,{momentum:+(.34*momentum).toFixed(1),movingAverage:+(.24*maScore).toFixed(1),macd:+(.16*macdScore).toFixed(1),rsi:+(.12*rsiScore).toFixed(1),boll:+(.14*bollScore).toFixed(1),confirmation:+conf.score.toFixed(1)},{returns:{short:r1,medium:r2,long:r3},maFast:mf,maSlow:ms,macd:mc,rsi:rv,bollZ:bsd?(c-bm)/bsd:null,volumeRatio:conf.vr,oiChange:conf.oi,natr:100*a/c});
  }

  function monthlyCloses(series,end){
    const out=[];let key='';
    for(let i=0;i<=end;i++){
      const k=series.d[i].slice(0,7);
      if(k!==key){out.push(series.c[i]);key=k}else out[out.length-1]=series.c[i];
    }
    return out;
  }
  function smoothedRoc(values,rocPeriod,smoothPeriod,end){
    if(end-rocPeriod-smoothPeriod+2<0)return null;
    let sum=0;
    for(let i=end-smoothPeriod+1;i<=end;i++)sum+=100*(values[i]/values[i-rocPeriod]-1);
    return sum/smoothPeriod;
  }
  function kstAt(values,end){
    const specs=[[9,6,1],[12,6,2],[18,6,3],[24,9,4]];let value=0;
    for(const [r,m,w] of specs){const x=smoothedRoc(values,r,m,end);if(x==null)return null;value+=w*x}
    return value;
  }
  function evalLongterm(series,p,end){
    const monthly=monthlyCloses(series,end),mi=monthly.length-1;
    if(mi<34||monthly.length<p.maMonths)return null;
    const c=series.c[end],ma=mean(monthly.slice(-p.maMonths)),filter=(p.filterPct||0)/100;
    const distance=c/ma-1;
    const priceScore=distance>filter?30*Math.tanh((distance-filter)/.08)+10:distance<-filter?30*Math.tanh((distance+filter)/.08)-10:filter?10*distance/filter:10*Math.sign(distance);
    const kst=kstAt(monthly,mi);if(kst==null)return null;
    const history=[];for(let i=mi-(p.kstSignal||9)+1;i<=mi;i++){const x=kstAt(monthly,i);if(x!=null)history.push(x)}
    const signal=mean(history),prev=kstAt(monthly,mi-1);
    const kstLevel=20*Math.tanh(kst/60),kstCross=kst>=signal?10:-10,kstSlope=prev==null?0:8*Math.tanh((kst-prev)/12);
    let base=priceScore+kstLevel+kstCross+kstSlope;
    p._direction=Math.sign(base);const conf=confirmation(series,p,end);base+=conf.score;
    return result(base,{priceRegime:+priceScore.toFixed(1),kstLevel:+kstLevel.toFixed(1),kstSignal:kstCross,kstSlope:+kstSlope.toFixed(1),confirmation:+conf.score.toFixed(1)},{ma12:ma,distance,kst,kstSignal:signal,monthlyObservations:monthly.length,volumeRatio:conf.vr,oiChange:conf.oi});
  }

  function efficiencyRatio(values,lookback,end=values.length-1){
    if(end<lookback)return null;let path=0;
    for(let i=end-lookback+1;i<=end;i++)path+=Math.abs(values[i]-values[i-1]);
    return path?Math.abs(values[end]-values[end-lookback])/path:0;
  }
  function evaluateEmergence(series,end=series.c.length-1,p={}){
    const longHorizon=Math.max(2,Math.round(p.longHorizon||p.year||252));
    const shortHorizon=Math.max(2,Math.round(p.shortHorizon||p.quarter||60));
    const longMid=Math.max(60,Math.round(longHorizon/2));
    const slopeLookback=Math.max(10,Math.round(shortHorizon/3));
    if(end<Math.max(longHorizon,longMid+slopeLookback,shortHorizon+slopeLookback))return null;
    const c=series.c[end],a20=atr(series,20,end)||Math.abs(c)*.01,aShort=atr(series,shortHorizon,end)||a20;
    const risk=Math.max(a20/c,.004);
    const rShort=pct(c,series.c[end-shortHorizon]),rMid=pct(c,series.c[end-longMid]),rLong=pct(c,series.c[end-longHorizon]);
    const maShort=sma(series.c,shortHorizon,end),maShort0=sma(series.c,shortHorizon,end-slopeLookback);
    const maMid=sma(series.c,longMid,end),maMid0=sma(series.c,longMid,end-slopeLookback),maLong=sma(series.c,longHorizon,end);
    const longBias=clamp(
      30*Math.tanh(rLong/Math.max(risk*Math.sqrt(longHorizon)*1.5,.01))+
      20*Math.tanh(rMid/Math.max(risk*Math.sqrt(longMid)*1.2,.01))+
      20*Math.tanh((c-maMid)/Math.max(a20*4,1e-9))+
      15*Math.tanh((maMid-maMid0)/Math.max(a20*3,1e-9))+
      15*Math.tanh((c-maLong)/Math.max(a20*6,1e-9))
    );
    const shortTrend=clamp(
      50*Math.tanh(rShort/Math.max(risk*Math.sqrt(shortHorizon),.01))+
      25*Math.tanh((c-maShort)/Math.max(a20*3,1e-9))+
      25*Math.tanh((maShort-maShort0)/Math.max(a20*2,1e-9))
    );
    const er=efficiencyRatio(series.c,shortHorizon,end),atrRatio=aShort?a20/aShort:null;
    const volatilityCompression=atrRatio==null?50:clamp(100*(1.1-atrRatio)/.5,0,100);
    const compression=clamp(65*(1-(er??1))+35*volatilityCompression/100,0,100);
    const prior=series.c.slice(end-shortHorizon,end),hi=Math.max(...prior),lo=Math.min(...prior),pos=hi>lo?clamp(100*(c-lo)/(hi-lo),0,100):50;
    const dir=Math.sign(longBias)||Math.sign(rLong)||1,boundary=dir>0?pos:100-pos;
    const participationLookback=Math.max(20,Math.round(p.participationLookback||shortHorizon));
    const vr=volumeRatio(series,participationLookback,end),oi=oiChange(series,participationLookback,end);
    let participation=50;
    if(vr!=null)participation+=dir*clamp((vr-1)*30,-20,20);
    if(oi!=null)participation+=dir*clamp(oi*150,-30,30);
    participation=clamp(participation,0,100);
    const shortPause=clamp(100*(1-Math.abs(shortTrend)/55),0,100);
    let score=.35*Math.abs(longBias)+.25*shortPause+.15*compression+.15*boundary+.10*participation;
    const sameDirection=Math.sign(shortTrend)===dir,established=sameDirection&&Math.abs(shortTrend)>=45,conflict=!sameDirection&&Math.abs(shortTrend)>=35;
    if(Math.abs(longBias)<20)score*=.6;if(established)score*=.65;if(conflict)score*=.55;score=clamp(score,0,100);
    let state='普通震荡';
    if(established)state='趋势已确认';
    else if(conflict)state='长短周期冲突';
    else if(Math.abs(longBias)>=30&&shortPause>=45&&boundary>=72)state='临界突破观察';
    else if(Math.abs(longBias)>=30&&shortPause>=45)state='趋势潜伏';
    else if(Math.abs(longBias)>=20)state='早期线索';
    return {score:+score.toFixed(2),state,direction:dir>0?'偏多':'偏空',periods:{longHorizon,shortHorizon,longMid,slopeLookback},components:{longBias:+longBias.toFixed(1),shortTrend:+shortTrend.toFixed(1),shortPause:+shortPause.toFixed(1),compression:+compression.toFixed(1),boundary:+boundary.toFixed(1),participation:+participation.toFixed(1)},metrics:{returnShort:rShort,returnLongMid:rMid,returnLong:rLong,efficiencyShort:er,atrRatio,rangePosition:pos,volumeRatio:vr,oiChange:oi,maShort,maLongMid:maMid,maLong,participationLookback}};
  }

  const evaluators={donchian:evalDonchian,ma:evalMA,macd:evalMACD,adx:evalADX,boll:evalBoll,longterm:evalLongterm,multi:evalMulti};
  function evaluate(id,params,series,end=series.c.length-1){return evaluators[id]?.(series,{...params},end)||null}

  const presets={
    donchian:{
      aggressive:{entry:20,exit:20,trendMA:60,slopeLookback:20,atrPeriod:20,volumeLookback:20,oiLookback:20,useVolume:true,useOI:true},
      balanced:{entry:60,exit:60,trendMA:120,slopeLookback:60,atrPeriod:20,volumeLookback:60,oiLookback:60,useVolume:true,useOI:true},
      conservative:{entry:120,exit:120,trendMA:252,slopeLookback:60,atrPeriod:20,volumeLookback:120,oiLookback:120,useVolume:true,useOI:true}
    },
    ma:{
      aggressive:{fast:20,medium:60,slow:120,slopeLookback:20,atrPeriod:20,volumeLookback:20,oiLookback:20,useVolume:true,useOI:true},
      balanced:{fast:60,medium:120,slow:252,slopeLookback:60,atrPeriod:20,volumeLookback:60,oiLookback:60,useVolume:true,useOI:true},
      conservative:{fast:120,medium:252,slow:500,slopeLookback:120,atrPeriod:40,volumeLookback:120,oiLookback:120,useVolume:true,useOI:true}
    },
    macd:{
      aggressive:{fast:12,slow:30,signal:9,trendMA:60,atrPeriod:20,volumeLookback:20,oiLookback:20,useVolume:true,useOI:true},
      balanced:{fast:30,slow:65,signal:20,trendMA:120,atrPeriod:20,volumeLookback:60,oiLookback:60,useVolume:true,useOI:true},
      conservative:{fast:60,slow:130,signal:40,trendMA:252,atrPeriod:40,volumeLookback:120,oiLookback:120,useVolume:true,useOI:true}
    },
    adx:{
      aggressive:{period:20,threshold:20,trendMA:60,volumeLookback:20,oiLookback:20,useVolume:true,useOI:true},
      balanced:{period:60,threshold:25,trendMA:120,volumeLookback:60,oiLookback:60,useVolume:true,useOI:true},
      conservative:{period:120,threshold:30,trendMA:252,volumeLookback:120,oiLookback:120,useVolume:true,useOI:true}
    },
    boll:{
      aggressive:{period:20,std:1.5,trendMA:60,slopeLookback:20,atrPeriod:20,volumeLookback:20,oiLookback:20,useVolume:true,useOI:true},
      balanced:{period:60,std:2,trendMA:120,slopeLookback:60,atrPeriod:20,volumeLookback:60,oiLookback:60,useVolume:true,useOI:true},
      conservative:{period:120,std:2.5,trendMA:252,slopeLookback:120,atrPeriod:40,volumeLookback:120,oiLookback:120,useVolume:true,useOI:true}
    },
    longterm:{
      aggressive:{maMonths:3,filterPct:0,kstSignal:3,volumeLookback:20,oiLookback:20,useVolume:true,useOI:true},
      balanced:{maMonths:6,filterPct:0,kstSignal:6,volumeLookback:60,oiLookback:60,useVolume:true,useOI:true},
      conservative:{maMonths:12,filterPct:3,kstSignal:12,volumeLookback:120,oiLookback:60,useVolume:true,useOI:true}
    },
    multi:{
      aggressive:{returnShort:20,returnMedium:60,returnLong:120,maFast:20,maSlow:60,macdFast:12,macdSlow:30,macdSignal:9,rsiPeriod:20,bollPeriod:20,bollStd:1.5,atrPeriod:20,volumeLookback:20,oiLookback:20,useVolume:true,useOI:true},
      balanced:{returnShort:60,returnMedium:120,returnLong:252,maFast:60,maSlow:120,macdFast:30,macdSlow:65,macdSignal:20,rsiPeriod:60,bollPeriod:60,bollStd:2,atrPeriod:20,volumeLookback:60,oiLookback:60,useVolume:true,useOI:true},
      conservative:{returnShort:120,returnMedium:252,returnLong:500,maFast:120,maSlow:252,macdFast:60,macdSlow:130,macdSignal:40,rsiPeriod:120,bollPeriod:120,bollStd:2.5,atrPeriod:40,volumeLookback:120,oiLookback:120,useVolume:true,useOI:true}
    }
  };

  const api={version:'2.2.0',evaluate,evaluateEmergence,presets,indicators:{sma,emaSeries,std,atr,rsi,macd,dmiAdx,volumeRatio,oiChange,efficiencyRatio},utils:{clamp,pct}};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.TrendEngine=api;
})();
