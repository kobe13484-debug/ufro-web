import React, { useState, useMemo, useEffect, useRef } from 'react';

// ────── Helpers ──────
const toNumber = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
function NumInput({ value, onValueChange, style, readOnly }) {
  const [display, setDisplay] = useState(String(value ?? ''));
  const typing = useRef(false);
  useEffect(() => { if (!typing.current) setDisplay(String(value ?? '')); }, [value]);
  const handleChange = (e) => { const raw = e.target.value; setDisplay(raw); typing.current = true; if (raw===''||raw==='-'||raw==='.'||raw.endsWith('.')) return; const n = parseFloat(raw); if (isFinite(n)) onValueChange(n); };
  const handleBlur = () => { typing.current = false; const n = toNumber(display); onValueChange(n); setDisplay(String(n)); };
  return <input type="text" inputMode="decimal" value={display} onChange={handleChange} onBlur={handleBlur} style={style} readOnly={readOnly} />;
}

// ────── Conversion ──────
const TDS_TO_COND = 2, COND_TO_TDS = 0.5;
const tds2cond = t => t * TDS_TO_COND, cond2tds = c => c * COND_TO_TDS;
const REJECT_TDS_LIMIT = 3000, REJECT_COND_LIMIT = 6000;

function validateDischarge(tds) {
  const cond = tds2cond(tds), wR = 0.8;
  const regulatoryAllowed = cond <= REJECT_COND_LIMIT && tds <= REJECT_TDS_LIMIT;
  let severityStatus = !regulatoryAllowed ? 'FAIL' : (cond >= REJECT_COND_LIMIT*wR || tds >= REJECT_TDS_LIMIT*wR) ? 'WARNING' : 'PASS';
  return { regulatoryAllowed, severityStatus, cond, tds, margin: REJECT_COND_LIMIT - cond };
}
function getRejectStatus(tds) { return validateDischarge(tds).severityStatus; }

// ────── Recommendations ──────
function getRecommendations(calc, splitMode) {
  const recs = []; const roV = validateDischarge(calc.roRejectTDS); const totV = validateDischarge(calc.totalRejectTDS);
  if (!roV.regulatoryAllowed && totV.regulatoryAllowed) recs.push({area:'RO Concentrate',status:'WARNING',items:['RO Concentrate เกินเกณฑ์เดี่ยว แต่ Total Reject ยังผ่าน']});
  if (!totV.regulatoryAllowed) recs.push({area:'Total Reject',status:'FAIL',items:['น้ำ Reject รวมไม่ผ่านเกณฑ์','เพิ่มน้ำผสม Cond ต่ำ','ปรับ RO/Bypass split','ลด RO Recovery','พิจารณา Reject treatment']});
  if (splitMode==='manual'&&calc.actualProductTDS>calc.targetTDS) recs.push({area:'Product Quality',status:'FAIL',items:['ลด Bypass %','เพิ่ม To RO %','เพิ่ม Salt Rejection']});
  if (totV.severityStatus==='WARNING') recs.push({area:'ใกล้ขีดจำกัด',status:'WARNING',items:['เฝ้าระวัง Conductivity','เตรียมน้ำผสมไว้เป็น buffer','ตรวจสอบ online meter']});
  return recs;
}

// ────── Export ──────
function exportSVG(el) { if(!el)return;const s=new XMLSerializer().serializeToString(el);const b=new Blob([s],{type:'image/svg+xml'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='ufro-diagram.svg';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u); }
function exportPNG(el) { if(!el)return;const s=new XMLSerializer().serializeToString(el);const c=document.createElement('canvas');const ctx=c.getContext('2d');const img=new Image();const u=URL.createObjectURL(new Blob([s],{type:'image/svg+xml'}));img.onload=()=>{c.width=2200;c.height=960;ctx.fillStyle='#070d1a';ctx.fillRect(0,0,2200,960);ctx.drawImage(img,0,0,2200,960);URL.revokeObjectURL(u);const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='ufro-diagram.png';document.body.appendChild(a);a.click();document.body.removeChild(a);};img.src=u; }

// ────── Collapsible Section ──────
function Section({ title, open, onToggle, accent, children }) {
  return (
    <div style={{marginBottom:10}}>
      <div onClick={onToggle} style={{...S.sectionLabel,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',color:accent?O.accent:O.cyan,borderBottomColor:accent?O.accent+'66':O.border}}>
        <span style={{fontSize:12}}>{title}</span>
        <span style={{fontSize:14,color:O.accent,transition:'transform 0.2s',transform:open?'rotate(0)':'rotate(-90deg)'}}>▾</span>
      </div>
      {open && <div style={{padding:'4px 0',animation:'fadeIn 0.15s ease'}}>{children}</div>}
    </div>
  );
}

// ────── Defaults ──────
const DEFAULT_SOURCES = [
  {id:1,name:'แหล่งน้ำ A',flow:200,ratio:100,tds:1018,enabled:true,costWater:5,costElec:0,costOps:0,costChem:0},
  {id:2,name:'แหล่งน้ำ B',flow:0,ratio:0,tds:800,enabled:false,costWater:8,costElec:0,costOps:0,costChem:0},
  {id:3,name:'แหล่งน้ำ C',flow:0,ratio:0,tds:600,enabled:false,costWater:3,costElec:0,costOps:0,costChem:0},
  {id:4,name:'แหล่งน้ำ D',flow:0,ratio:0,tds:400,enabled:false,costWater:12,costElec:0,costOps:0,costChem:0},
  {id:5,name:'แหล่งน้ำ E',flow:0,ratio:0,tds:1200,enabled:false,costWater:2,costElec:0,costOps:0,costChem:0},
];
const DEFAULT_DILUTION = [
  {id:1,name:'น้ำคลอง A',flow:0,conductivity:500,enabled:false},
  {id:2,name:'น้ำคลอง B',flow:0,conductivity:300,enabled:false},
  {id:3,name:'น้ำประปา',flow:0,conductivity:200,enabled:false},
  {id:4,name:'น้ำบาดาล',flow:0,conductivity:400,enabled:false},
  {id:5,name:'น้ำ Recycle',flow:0,conductivity:600,enabled:false},
];

// ══════════════ MAIN ══════════════
export default function UFROCalculator() {
  // Core state
  const [mode, setMode] = useState('know-output');
  const [strategy, setStrategy] = useState('optimize');
  const [timeUnit, setTimeUnit] = useState('hourly');
  const [opsHours, setOpsHours] = useState(24);
  const [sources, setSources] = useState(DEFAULT_SOURCES.map(s=>({...s})));
  const [targetCond, setTargetCond] = useState(636);
  const [productFlow, setProductFlow] = useState(146);
  const [ufReject, setUfReject] = useState(10);
  const [roReject, setRoReject] = useState(25);
  const [roSaltRejection, setRoSaltRejection] = useState(96.56);
  const [splitMode, setSplitMode] = useState('auto');
  const [manualToRO, setManualToRO] = useState(75);
  const [dilutionMode, setDilutionMode] = useState('auto');
  const [dilutionSources, setDilutionSources] = useState(DEFAULT_DILUTION.map(s=>({...s})));
  const [showDilutionSim, setShowDilutionSim] = useState(false);
  const [safetyMargin, setSafetyMargin] = useState(10);
  const [recTab, setRecTab] = useState('status');

  // Cost state — TOU electricity
  const [peakRate, setPeakRate] = useState(5.7); // ฿/kWh peak
  const [offPeakRate, setOffPeakRate] = useState(2.6); // ฿/kWh off-peak
  const [ftCharge, setFtCharge] = useState(-0.0039); // Ft ฿/kWh
  const [peakHours, setPeakHours] = useState(8); // hours/day peak
  const [secFeed, setSecFeed] = useState(0.614); // kWh/m³
  // Operation cost
  const [staffCount, setStaffCount] = useState(3);
  const [staffSalary, setStaffSalary] = useState(15000); // ฿/month per person
  // Chemical cost placeholder
  const [chemCostPerM3, setChemCostPerM3] = useState(0);

  // Section visibility (ALL collapsible)
  const [sec, setSec] = useState({
    sources:true, target:true, split:true, membrane:false, opsTime:false,
    alloc:true, kpi:true, discharge:true, dashboard:false, diagram:true,
    dilution:false, loss:false, analysis:false, stream:false, cost:true,
    costElec:true, costOps:true, costChem:true,
  });
  const toggle = (k) => setSec(p=>({...p,[k]:!p[k]}));

  const diagramRef = useRef(null);
  const targetTDS = cond2tds(targetCond);
  const manualBypass = 100 - manualToRO;

  const handleReset = () => {
    if (!window.confirm('รีเซ็ตค่าทั้งหมด?')) return;
    setMode('know-output');setStrategy('optimize');setTimeUnit('hourly');setOpsHours(24);
    setSources(DEFAULT_SOURCES.map(s=>({...s})));setTargetCond(636);setProductFlow(146);
    setUfReject(10);setRoReject(25);setRoSaltRejection(96.56);setSplitMode('auto');setManualToRO(75);
    setDilutionMode('auto');setDilutionSources(DEFAULT_DILUTION.map(s=>({...s})));
    setShowDilutionSim(false);setSafetyMargin(10);setRecTab('status');
    setPeakRate(5.7);setOffPeakRate(2.6);setFtCharge(-0.0039);setPeakHours(8);setSecFeed(0.614);
    setStaffCount(3);setStaffSalary(15000);setChemCostPerM3(0);
    setSec({sources:true,target:true,split:true,membrane:false,opsTime:false,alloc:true,kpi:true,discharge:true,dashboard:false,diagram:true,dilution:false,loss:false,analysis:false,stream:false,cost:true,costElec:true,costOps:true,costChem:true});
  };

  // Source optimization
  useEffect(() => {
    if (mode!=='know-output'||strategy==='manual') return;
    const en=sources.filter(s=>s.enabled); if(!en.length) return;
    let nr;
    if (strategy==='equal') {const e=100/en.length;nr=en.map(s=>({id:s.id,ratio:e}));}
    else {const m=Math.min(...en.map(s=>s.tds));if(m<=targetTDS){const l=en.filter(s=>s.tds<=targetTDS);const e=100/l.length;nr=en.map(s=>({id:s.id,ratio:s.tds<=targetTDS?e:0}));}else{const w=en.map(s=>1/Math.max(s.tds,1));const sm=w.reduce((a,b)=>a+b,0);nr=en.map((s,i)=>({id:s.id,ratio:(w[i]/sm)*100}));}}
    setSources(p=>{const u=p.map(s=>{const r=nr.find(x=>x.id===s.id);if(r&&Math.abs(toNumber(s.ratio)-r.ratio)>0.01)return{...s,ratio:Math.round(r.ratio*10)/10};return s;});return u.some((s,i)=>s.ratio!==p[i].ratio)?u:p;});
  }, [mode,strategy,sources.map(s=>`${s.id}-${s.enabled}-${s.tds}`).join(','),targetTDS]);

  // Mixed Feed
  const mixedFeed = useMemo(() => {
    const act=sources.filter(s=>s.enabled);
    if (mode==='know-input') {const tf=act.reduce((s,x)=>s+toNumber(x.flow),0);if(!tf)return{flow:0,tds:0,sources:[]};const tds=act.reduce((s,x)=>s+toNumber(x.flow)*toNumber(x.tds),0)/tf;return{flow:tf,tds,sources:act.map(s=>({...s,actualFlow:toNumber(s.flow),actualRatio:tf>0?(toNumber(s.flow)/tf)*100:0}))};}
    else {const us=act.filter(s=>toNumber(s.ratio)>0);const tr=us.reduce((s,x)=>s+toNumber(x.ratio),0);if(!tr)return{flow:0,tds:0,sources:act,totalRatio:0};const tds=us.reduce((s,x)=>s+toNumber(x.ratio)*toNumber(x.tds),0)/tr;return{flow:0,tds,sources:act,totalRatio:tr};}
  }, [sources, mode]);

  // ══════ Process Calc ══════
  const calc = useMemo(() => {
    const ufR=(100-ufReject)/100,roR=(100-roReject)/100,rej=roSaltRejection/100;
    const feedTDS=mixedFeed.tds,roPermTDS=feedTDS*(1-rej),roRejectTDS=roR<1?(feedTDS-roR*roPermTDS)/(1-roR):feedTDS;
    let feedFlow,ufOut,ufBypass,roIn,roOut,roRejectFlow,ufRejectFlow,totalReject,finalProduct;
    let blendValid=true,blendWarning='',bypassRO=false,actualProductTDS;

    if (splitMode==='manual') {
      const toR=manualToRO/100,byP=1-toR;
      if(mode==='know-output'){finalProduct=productFlow;const f=byP+toR*roR;ufOut=f>0?finalProduct/f:0;feedFlow=ufR>0?ufOut/ufR:0;}else{feedFlow=mixedFeed.flow;ufOut=feedFlow*ufR;}
      ufRejectFlow=feedFlow-ufOut;roIn=ufOut*(manualToRO/100);ufBypass=ufOut-roIn;roOut=roIn*roR;roRejectFlow=roIn-roOut;finalProduct=ufBypass+roOut;totalReject=ufRejectFlow+roRejectFlow;
      actualProductTDS=finalProduct>0?(ufBypass*feedTDS+roOut*roPermTDS)/finalProduct:0;
      if(!feedTDS){blendValid=false;blendWarning='ยังไม่ได้กรอกแหล่งน้ำ';}
    } else {
      let bR=feedTDS>0&&(feedTDS-roPermTDS)!==0?(targetTDS-roPermTDS)/(feedTDS-roPermTDS):0;
      if(!feedTDS){blendValid=false;blendWarning='ยังไม่ได้กรอกแหล่งน้ำ';bR=0;}else if(feedTDS<=targetTDS){bypassRO=true;bR=1;}else if(targetTDS<roPermTDS){blendValid=false;blendWarning=`เป้าหมาย Cond ต่ำกว่า RO permeate`;bR=0;}else{bR=Math.max(0,Math.min(1,bR));}
      if(mode==='know-output'){finalProduct=productFlow;ufBypass=bR*finalProduct;roOut=(1-bR)*finalProduct;roIn=roR>0?roOut/roR:0;roRejectFlow=roIn-roOut;ufOut=ufBypass+roIn;feedFlow=ufR>0?ufOut/ufR:0;ufRejectFlow=feedFlow-ufOut;totalReject=ufRejectFlow+roRejectFlow;}
      else{feedFlow=mixedFeed.flow;ufOut=feedFlow*ufR;ufRejectFlow=feedFlow-ufOut;const d=roR*bR+(1-bR);roIn=d>0?ufOut*(1-bR)/d:0;roOut=roR*roIn;ufBypass=ufOut-roIn;roRejectFlow=roIn-roOut;finalProduct=ufBypass+roOut;totalReject=ufRejectFlow+roRejectFlow;}
      actualProductTDS=bypassRO?feedTDS:(finalProduct>0?(ufBypass*feedTDS+roOut*roPermTDS)/finalProduct:0);
    }
    const overallRecovery=feedFlow>0?(finalProduct/feedFlow)*100:0;
    const tIn=feedFlow*feedTDS,tOut=finalProduct*actualProductTDS;
    const totalRejectTDS=totalReject>0?(tIn-tOut)/totalReject:0;
    const calcToRO=ufOut>0?(roIn/ufOut)*100:0,calcBypass=ufOut>0?(ufBypass/ufOut)*100:0;
    let sourceAllocations=[];
    if(mode==='know-output'&&mixedFeed.totalRatio>0)sourceAllocations=mixedFeed.sources.map(s=>({...s,actualFlow:feedFlow*(toNumber(s.ratio)/mixedFeed.totalRatio),actualRatio:(toNumber(s.ratio)/mixedFeed.totalRatio)*100}));
    else sourceAllocations=mixedFeed.sources;
    const totV=validateDischarge(totalRejectTDS);
    return {feedFlow,ufOut,ufBypass,roIn,roOut,roRejectFlow,ufRejectFlow,totalReject,finalProduct,feedTDS,ufPermTDS:feedTDS,ufRejectTDS:feedTDS,roPermTDS,roRejectTDS,totalRejectTDS,actualProductTDS,overallRecovery,blendValid,blendWarning,bypassRO,sourceAllocations,totalRatio:mixedFeed.totalRatio||0,
      ufRejectStatus:validateDischarge(feedTDS).severityStatus,roRejectStatus:validateDischarge(roRejectTDS).severityStatus,totalRejectStatus:totV.severityStatus,totalRejectAllowed:totV.regulatoryAllowed,totalRejectMargin:totV.margin,targetTDS,calcToRO,calcBypass,productCondStatus:tds2cond(actualProductTDS)>targetCond?'FAIL':'PASS'};
  }, [mixedFeed,targetTDS,targetCond,productFlow,ufReject,roReject,roSaltRejection,mode,splitMode,manualToRO]);

  // Dilution
  const dilution = useMemo(() => {
    const rejectFails=!calc.totalRejectAllowed;if(!rejectFails&&!showDilutionSim)return{needed:false,rejectFails:false};
    const Qr=calc.totalReject,Cr=tds2cond(calc.totalRejectTDS),Ct=REJECT_COND_LIMIT*(1-safetyMargin/100);
    if(dilutionMode==='auto'){
      const src=dilutionSources.find(s=>s.enabled);const Cd=src?toNumber(src.conductivity):500;
      if(Cd>=Ct)return{needed:true,rejectFails,autoMode:true,cannotSolve:true,Cd,Cr,Qr,Ct,msg:'Cond น้ำผสมสูงเกิน'};
      if(Cr<=Ct)return{needed:true,rejectFails,autoMode:true,cannotSolve:false,QdReq:0,Cd,Cr,Qr,Ct,finalFlow:Qr,finalCond:Cr,finalTDS:cond2tds(Cr),finalStatus:getRejectStatus(cond2tds(Cr)),finalV:validateDischarge(cond2tds(Cr)),srcName:src?.name||'น้ำผสม'};
      const QdReq=Qr*(Cr-Ct)/(Ct-Cd);const fF=Qr+QdReq;const fC=(Qr*Cr+QdReq*Cd)/fF;const fT=cond2tds(fC);const fV=validateDischarge(fT);
      return{needed:true,rejectFails,autoMode:true,cannotSolve:false,QdReq,Cd,Cr,Qr,Ct,finalFlow:fF,finalCond:fC,finalTDS:fT,finalStatus:fV.severityStatus,finalAllowed:fV.regulatoryAllowed,finalV:fV,srcName:src?.name||'น้ำผสม'};
    } else {
      const act=dilutionSources.filter(s=>s.enabled&&toNumber(s.flow)>0);const dF=act.reduce((s,x)=>s+toNumber(x.flow),0);const dL=act.reduce((s,x)=>s+toNumber(x.flow)*toNumber(x.conductivity),0);
      const fF=Qr+dF;const fC=fF>0?(Qr*Cr+dL)/fF:Cr;const fT=cond2tds(fC);const fV=validateDischarge(fT);
      return{needed:true,rejectFails,autoMode:false,cannotSolve:false,dilFlow:dF,finalFlow:fF,finalCond:fC,finalTDS:fT,finalStatus:fV.severityStatus,finalAllowed:fV.regulatoryAllowed,finalV:fV,Cr,Qr,sources:act};
    }
  }, [calc,dilutionSources,dilutionMode,showDilutionSim,safetyMargin]);

  const finalDischargeV = useMemo(()=>{if(dilution.needed&&dilution.rejectFails&&!dilution.cannotSolve&&dilution.finalV)return dilution.finalV;return validateDischarge(calc.totalRejectTDS);},[calc,dilution]);
  const finalAllowed=finalDischargeV.regulatoryAllowed,finalSeverity=finalDischargeV.severityStatus,finalMargin=finalDischargeV.margin;
  const recommendations=useMemo(()=>getRecommendations(calc,splitMode),[calc,splitMode]);

  // ══════ COST CALC (TOU) ══════
  const costCalc = useMemo(() => {
    const feedFlow=calc.feedFlow,prodFlow=calc.finalProduct;
    // Raw water
    const allocs=calc.sourceAllocations||[];
    let rawCostH=0,totalSF=0;
    allocs.forEach(s=>{const fl=s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow);const c=toNumber(s.costWater);rawCostH+=fl*c;totalSF+=fl;});
    const avgWaterCost=totalSF>0?rawCostH/totalSF:0;
    const rawCostPerM3Prod=prodFlow>0?rawCostH/prodFlow:0;
    // Electricity TOU
    const kwPerH=feedFlow*toNumber(secFeed);
    const offPeakH=opsHours-toNumber(peakHours);
    const peakH=Math.min(toNumber(peakHours),opsHours);
    const peakCostPerKwh=toNumber(peakRate)+toNumber(ftCharge);
    const offPeakCostPerKwh=toNumber(offPeakRate)+toNumber(ftCharge);
    const elecCostDay=kwPerH*(peakH*peakCostPerKwh+offPeakH*offPeakCostPerKwh);
    const elecCostH=opsHours>0?elecCostDay/opsHours:0;
    const elecCostPerM3Prod=prodFlow>0?elecCostH/prodFlow:0;
    const avgElecRate=opsHours>0?(peakH*peakCostPerKwh+offPeakH*offPeakCostPerKwh)/opsHours:0;
    // Operation cost
    const opsCostMonth=toNumber(staffCount)*toNumber(staffSalary);
    const opsCostDay=opsCostMonth/30;
    const opsCostH=opsCostDay/(opsHours||24);
    const opsCostPerM3Prod=prodFlow>0?opsCostH/prodFlow:0;
    // Chemical
    const chemCostH=prodFlow*toNumber(chemCostPerM3);
    const chemCostPerM3Prod=toNumber(chemCostPerM3);
    // Total
    const totalPerH=rawCostH+elecCostH+opsCostH+chemCostH;
    const totalPerM3=rawCostPerM3Prod+elecCostPerM3Prod+opsCostPerM3Prod+chemCostPerM3Prod;
    const totalPerDay=totalPerH*opsHours;
    const totalPerMonth=totalPerDay*30;
    return{avgWaterCost,rawCostH,rawCostPerM3Prod,kwPerH,elecCostH,elecCostDay,elecCostPerM3Prod,avgElecRate,peakCostPerKwh,offPeakCostPerKwh,opsCostMonth,opsCostDay,opsCostH,opsCostPerM3Prod,chemCostH,chemCostPerM3Prod,totalPerH,totalPerM3,totalPerDay,totalPerMonth};
  }, [calc,opsHours,secFeed,peakRate,offPeakRate,ftCharge,peakHours,staffCount,staffSalary,chemCostPerM3]);

  const updateSource=(id,f,v)=>{setSources(sources.map(s=>s.id===id?{...s,[f]:v}:s));if(mode==='know-output'&&f==='ratio')setStrategy('manual');};
  const updateDilution=(id,f,v)=>{setDilutionSources(dilutionSources.map(s=>s.id===id?{...s,[f]:v}:s));};

  const vol=(h)=>timeUnit==='daily'?h*opsHours:h;
  const volUnit=timeUnit==='daily'?'m³/day':'m³/h';
  const fmt=(n,d=1)=>isFinite(n)&&!isNaN(n)?n.toFixed(d):'—';
  const fmtC=(tds)=>isFinite(tds)&&!isNaN(tds)?Math.round(tds2cond(tds)).toLocaleString():'—';
  const fmtB=(n,d=2)=>isFinite(n)&&!isNaN(n)?n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):'—';

  return (
    <div style={S.root}><style>{globalCSS}</style>

      {/* ═══ HEADER ═══ */}
      <header style={S.header} className="ufro-header">
        <div style={S.headerLeft}>
          <div style={S.logoMark}>◉</div>
          <div><div style={S.title}>UF · RO CALCULATOR</div><div style={S.subtitle}>JYN Reuse Water v7.0 — Ocean</div></div>
        </div>
        <div style={S.headerCenter} className="ufro-mode-toggle">
          <div style={S.modeToggle}>
            <button style={{...S.modeBtn,...(mode==='know-input'?S.modeBtnActive:{})}} onClick={()=>setMode('know-input')}>FEED → ?</button>
            <button style={{...S.modeBtn,...(mode==='know-output'?S.modeBtnActive:{})}} onClick={()=>setMode('know-output')}>? → PRODUCT</button>
          </div>
        </div>
        <div style={S.headerRight} className="ufro-header-right">
          <div style={S.timeToggle}>
            <button style={{...S.timeBtn,...(timeUnit==='hourly'?S.timeBtnActive:{})}} onClick={()=>setTimeUnit('hourly')}>h</button>
            <button style={{...S.timeBtn,...(timeUnit==='daily'?S.timeBtnActive:{})}} onClick={()=>setTimeUnit('daily')}>day</button>
          </div>
          <button onClick={handleReset} style={S.resetBtn}>↺</button>
        </div>
      </header>

      <div style={S.grid} className="ufro-grid">
        {/* ═══ LEFT ═══ */}
        <aside style={S.sidebar}>
          {/* Sources */}
          <Section title="แหล่งน้ำดิบ (Feed Sources)" open={sec.sources} onToggle={()=>toggle('sources')}>
            {mode==='know-output' && <div style={S.strategyTabs}>{['optimize','equal','manual'].map(s=>(
              <button key={s} style={{...S.stratTab,...(strategy===s?S.stratTabActive:{})}} onClick={()=>setStrategy(s)}>{s==='optimize'?'Optimize':s==='equal'?'Equal':'Manual'}</button>))}</div>}
            <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
              {sources.map((s,i)=>(
                <div key={s.id} style={{...S.srcCard,...(s.enabled?S.srcCardOn:{})}}>
                  <div style={S.srcHeader}>
                    <button style={{...S.srcToggle,...(s.enabled?S.srcToggleOn:{})}} onClick={()=>updateSource(s.id,'enabled',!s.enabled)}>{s.enabled?'●':'○'}</button>
                    <input type="text" value={s.name} onChange={e=>updateSource(s.id,'name',e.target.value)} style={S.srcName} disabled={!s.enabled}/>
                    <span style={S.srcIdx}>S{i+1}</span>
                  </div>
                  {s.enabled && (<div style={{display:'flex',flexDirection:'column',gap:5,marginTop:8}}>
                    <div style={S.srcInputs}>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>Cond (µS/cm)</label>
                        <div style={S.srcInputWrap}><NumInput value={Math.round(tds2cond(s.tds))} onValueChange={v=>updateSource(s.id,'tds',cond2tds(v))} style={S.srcInput}/><span style={S.srcUnit}>µS/cm</span></div></div>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>{mode==='know-input'?'Flow':'Ratio'}</label>
                        <div style={{...S.srcInputWrap,...(mode==='know-output'&&strategy!=='manual'?S.srcInputRO:{})}}>
                          <NumInput value={mode==='know-input'?s.flow:parseFloat((s.ratio||0).toFixed(1))} onValueChange={v=>updateSource(s.id,mode==='know-input'?'flow':'ratio',v)} style={S.srcInput} readOnly={mode==='know-output'&&strategy!=='manual'}/>
                          <span style={S.srcUnit}>{mode==='know-input'?'m³/h':'%'}</span></div></div>
                    </div>
                    {/* Cost fields */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:4}}>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>ค่าน้ำ</label>
                        <div style={{...S.srcInputWrap,borderColor:O.accent+'44'}}><NumInput value={s.costWater||0} onValueChange={v=>updateSource(s.id,'costWater',v)} style={S.srcInput}/><span style={{...S.srcUnit,color:O.accent}}>฿/m³</span></div></div>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>ค่าไฟ</label>
                        <div style={{...S.srcInputWrap,borderColor:O.accent+'44'}}><NumInput value={s.costElec||0} onValueChange={v=>updateSource(s.id,'costElec',v)} style={S.srcInput}/><span style={{...S.srcUnit,color:O.accent}}>฿/m³</span></div></div>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>ค่าดำเนินการ</label>
                        <div style={{...S.srcInputWrap,borderColor:O.accent+'44'}}><NumInput value={s.costOps||0} onValueChange={v=>updateSource(s.id,'costOps',v)} style={S.srcInput}/><span style={{...S.srcUnit,color:O.accent}}>฿/m³</span></div></div>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>ค่าเคมี</label>
                        <div style={{...S.srcInputWrap,borderColor:O.accent+'44'}}><NumInput value={s.costChem||0} onValueChange={v=>updateSource(s.id,'costChem',v)} style={S.srcInput}/><span style={{...S.srcUnit,color:O.accent}}>฿/m³</span></div></div>
                    </div>
                  </div>)}
                </div>))}
            </div>
            <div style={S.mixBox}>
              <div style={S.mixHead}>MIXED FEED</div>
              <div style={S.mixRow}><span>Flow</span><span style={S.mixVal}>{fmt(vol(calc.feedFlow),1)} {volUnit}</span></div>
              <div style={S.mixRow}><span>Conductivity</span><span style={S.mixVal}>{fmtC(calc.feedTDS)} µS/cm</span></div>
            </div>
          </Section>

          {/* Target */}
          <Section title="เป้าหมายน้ำผลิต (Target)" open={sec.target} onToggle={()=>toggle('target')}>
            <div style={S.inputRow}><div style={S.inputLabel}>Conductivity เป้าหมาย</div>
              <div style={{...S.inputWrap,...S.inputWrapAccent}}><NumInput value={targetCond} onValueChange={setTargetCond} style={S.input}/><span style={S.inputUnit}>µS/cm</span></div></div>
            {mode==='know-output' && <div style={S.inputRow}><div style={S.inputLabel}>ปริมาณน้ำผลิต</div>
              <div style={{...S.inputWrap,...S.inputWrapAccent}}><NumInput value={timeUnit==='daily'?productFlow*opsHours:productFlow} onValueChange={v=>setProductFlow(timeUnit==='daily'?v/opsHours:v)} style={S.input}/><span style={S.inputUnit}>{volUnit}</span></div></div>}
          </Section>

          {/* Split */}
          <Section title="สัดส่วน UF Split" open={sec.split} onToggle={()=>toggle('split')}>
            <div style={{...S.strategyTabs,gridTemplateColumns:'1fr 1fr'}}>
              <button style={{...S.stratTab,...(splitMode==='auto'?S.stratTabActive:{})}} onClick={()=>setSplitMode('auto')}>Auto Blend</button>
              <button style={{...S.stratTab,...(splitMode==='manual'?S.stratTabActive:{})}} onClick={()=>setSplitMode('manual')}>Manual Split</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:8}}>
              <div><div style={S.srcFieldLabel}>To RO (%)</div><div style={{...S.srcInputWrap,...(splitMode==='auto'?S.srcInputRO:{})}}>
                <NumInput value={splitMode==='manual'?manualToRO:parseFloat(calc.calcToRO.toFixed(1))} onValueChange={v=>setManualToRO(Math.max(0,Math.min(100,v)))} style={S.srcInput} readOnly={splitMode==='auto'}/><span style={S.srcUnit}>%</span></div></div>
              <div><div style={S.srcFieldLabel}>Bypass (%)</div><div style={{...S.srcInputWrap,...(splitMode==='auto'?S.srcInputRO:{})}}>
                <NumInput value={splitMode==='manual'?manualBypass:parseFloat(calc.calcBypass.toFixed(1))} onValueChange={v=>setManualToRO(Math.max(0,Math.min(100,100-v)))} style={S.srcInput} readOnly={splitMode==='auto'}/><span style={S.srcUnit}>%</span></div></div>
            </div>
          </Section>

          {/* Membrane */}
          <Section title="ตั้งค่าเมมเบรนขั้นสูง" open={sec.membrane} onToggle={()=>toggle('membrane')}>
            <SliderRow label="UF Reject" value={ufReject} onChange={setUfReject} min={2} max={30} step={0.5} unit="%"/>
            <SliderRow label="RO Reject" value={roReject} onChange={setRoReject} min={10} max={50} step={0.5} unit="%"/>
            <SliderRow label="RO Salt Rejection" value={roSaltRejection} onChange={setRoSaltRejection} min={90} max={99.9} step={0.1} unit="%"/>
          </Section>

          {/* Operating Hours */}
          <Section title="ชั่วโมงเดินเครื่อง" open={sec.opsTime} onToggle={()=>toggle('opsTime')}>
            <SliderRow label="ชั่วโมง/วัน" value={opsHours} onChange={setOpsHours} min={1} max={24} step={1} unit="h/d"/>
          </Section>

          {!calc.blendValid && <div style={S.warnBox}><div style={S.warnTitle}>⚠ {calc.blendWarning}</div></div>}
        </aside>

        {/* ═══ RIGHT ═══ */}
        <main style={S.main}>
          {/* KPIs */}
          <Section title="ตัวชี้วัดหลัก (KPI)" open={sec.kpi} onToggle={()=>toggle('kpi')}>
            <div style={S.kpiStrip} className="ufro-kpi-strip">
              <KPI label="น้ำดิบ" value={fmt(vol(calc.feedFlow),1)} unit={volUnit} sub={`Cond ${fmtC(calc.feedTDS)}`} highlight={mode==='know-output'}/>
              <KPI label="น้ำผลิต" value={fmt(vol(calc.finalProduct),1)} unit={volUnit} sub={`Cond ${fmtC(calc.actualProductTDS)}`} highlight={mode==='know-input'}/>
              <KPI label="น้ำทิ้งรวม" value={fmt(vol(calc.totalReject),1)} unit={volUnit} sub={`Cond ${fmtC(calc.totalRejectTDS)}`} badge={calc.totalRejectStatus} warning={!calc.totalRejectAllowed}/>
              <KPI label="Recovery" value={fmt(calc.overallRecovery,1)} unit="%"/>
              <KPI label="RO/Bypass" value={`${fmt(calc.calcToRO,0)}/${fmt(calc.calcBypass,0)}`} unit="%"/>
            </div>
          </Section>

          {/* Discharge */}
          <Section title="สถานะการปล่อยทิ้ง" open={sec.discharge} onToggle={()=>toggle('discharge')}>
            <div style={{...S.dischargeCard,...(finalAllowed?(finalSeverity==='WARNING'?S.dischargeWarn:S.dischargePass):S.dischargeFail)}}>
              <span className={!finalAllowed?'status-blink-fail':finalSeverity==='WARNING'?'status-blink-warn':'status-blink-pass'} style={S.dischargeBadge}>
                {finalAllowed?(finalSeverity==='WARNING'?'⚠ ผ่านเกณฑ์แต่ใกล้ขีดจำกัด':'✓ ผ่านเกณฑ์ปล่อยทิ้ง'):'✗ ไม่ผ่านเกณฑ์ — REJECT'}
              </span>
              <span style={S.dischargeMeta}>{finalMargin>=0?`Margin ${Math.round(finalMargin).toLocaleString()} µS/cm`:`เกิน ${Math.round(Math.abs(finalMargin)).toLocaleString()} µS/cm`} · Limit {REJECT_COND_LIMIT.toLocaleString()}</span>
            </div>
          </Section>

          {/* Diagram */}
          <Section title="แผนผังกระบวนการ (Process Diagram)" open={sec.diagram} onToggle={()=>toggle('diagram')}>
            <div style={{display:'flex',gap:6,marginBottom:8}}><button onClick={()=>exportSVG(diagramRef.current)} style={S.exportBtn}>⬇ SVG</button><button onClick={()=>exportPNG(diagramRef.current)} style={S.exportBtn}>⬇ PNG</button></div>
            <div style={{overflowX:'auto'}}>
              <ProcessDiagram ref={diagramRef} calc={calc} sources={calc.sourceAllocations} fmtC={fmtC} fmt={fmt} vol={vol} volUnit={volUnit} dilution={dilution} finalAllowed={finalAllowed} finalSeverity={finalSeverity}/>
            </div>
          </Section>

          {/* Dilution */}
          <Section title={`น้ำผสมลด Cond (Dilution) ${!calc.totalRejectAllowed?'⚠':''}`} open={sec.dilution||!calc.totalRejectAllowed} onToggle={()=>toggle('dilution')} accent={!calc.totalRejectAllowed}>
            {(!calc.totalRejectAllowed||showDilutionSim) ? (<div>
              <div style={{...S.strategyTabs,gridTemplateColumns:'1fr 1fr'}}><button style={{...S.stratTab,...(dilutionMode==='auto'?S.stratTabActive:{})}} onClick={()=>setDilutionMode('auto')}>Auto</button><button style={{...S.stratTab,...(dilutionMode==='manual'?S.stratTabActive:{})}} onClick={()=>setDilutionMode('manual')}>Manual</button></div>
              <div style={{marginTop:8,padding:'6px 8px',background:O.bg2,borderRadius:3,border:`1px solid ${O.border}`}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}><span style={{color:O.text2}}>Safety Margin</span><span style={{color:O.accent,fontWeight:600}}>{safetyMargin}%</span></div>
                <input type="range" min={0} max={30} step={1} value={safetyMargin} onChange={e=>setSafetyMargin(parseFloat(e.target.value))} style={S.slider}/>
                <div style={{fontSize:10,color:O.text3}}>Target: {Math.round(REJECT_COND_LIMIT*(1-safetyMargin/100)).toLocaleString()} µS/cm</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>
                {dilutionSources.map((ds,i)=>(
                  <div key={ds.id} style={{...S.srcCard,...(ds.enabled?S.srcCardOn:{})}}>
                    <div style={S.srcHeader}>
                      <button style={{...S.srcToggle,...(ds.enabled?S.srcToggleOn:{})}} onClick={()=>updateDilution(ds.id,'enabled',!ds.enabled)}>{ds.enabled?'●':'○'}</button>
                      <input type="text" value={ds.name} onChange={e=>updateDilution(ds.id,'name',e.target.value)} style={S.srcName} disabled={!ds.enabled}/>
                      <span style={S.srcIdx}>D{i+1}</span>
                    </div>
                    {ds.enabled && <div style={S.srcInputs}>
                      {dilutionMode==='manual' && <div style={S.srcField}><label style={S.srcFieldLabel}>Flow</label><div style={S.srcInputWrap}><NumInput value={ds.flow} onValueChange={v=>updateDilution(ds.id,'flow',v)} style={S.srcInput}/><span style={S.srcUnit}>m³/h</span></div></div>}
                      <div style={S.srcField}><label style={S.srcFieldLabel}>Cond</label><div style={S.srcInputWrap}><NumInput value={ds.conductivity} onValueChange={v=>updateDilution(ds.id,'conductivity',v)} style={S.srcInput}/><span style={S.srcUnit}>µS/cm</span></div></div>
                    </div>}
                  </div>))}
              </div>
              {dilution.cannotSolve && <div style={S.warnBox}><div style={S.warnTitle}>⚠ {dilution.msg}</div></div>}
              {!dilution.cannotSolve && dilution.QdReq!==undefined && dilution.QdReq>0 && (
                <div style={{...S.mixBox,marginTop:10,borderColor:O.accent}}>
                  <div style={S.mixHead}>AUTO RESULT</div>
                  <div style={S.mixRow}><span>Required Dilution</span><span style={{...S.mixVal,color:O.gold,fontSize:13}}>{fmt(vol(dilution.QdReq),1)} {volUnit}</span></div>
                  <div style={S.mixRow}><span>Final Discharge Cond</span><span style={S.mixVal}>{Math.round(dilution.finalCond).toLocaleString()} µS/cm</span></div>
                  <div style={S.mixRow}><span>Status</span><StatusBadge status={dilution.finalStatus}/></div>
                </div>)}
              {!dilution.cannotSolve && dilution.finalFlow>0 && dilutionMode==='manual' && (
                <div style={{...S.mixBox,marginTop:10,borderColor:O.accent}}>
                  <div style={S.mixHead}>FINAL DISCHARGE</div>
                  <div style={S.mixRow}><span>Flow</span><span style={{...S.mixVal,color:O.gold}}>{fmt(vol(dilution.finalFlow),1)} {volUnit}</span></div>
                  <div style={S.mixRow}><span>Cond</span><span style={S.mixVal}>{Math.round(dilution.finalCond).toLocaleString()} µS/cm</span></div>
                  <div style={S.mixRow}><span>Status</span><StatusBadge status={dilution.finalStatus}/></div>
                </div>)}
              {calc.totalRejectAllowed && <button onClick={()=>setShowDilutionSim(false)} style={{...S.exportBtn,marginTop:6}}>ซ่อน</button>}
            </div>) : (
              <button onClick={()=>setShowDilutionSim(true)} style={{...S.exportBtn,width:'100%',padding:'8px 0',fontSize:11}}>จำลองการผสมน้ำเพิ่มเติม</button>
            )}
          </Section>

          {/* Dashboard */}
          <Section title="Water Balance Dashboard" open={sec.dashboard} onToggle={()=>toggle('dashboard')}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}} className="ufro-dash-grid">
              <div style={{textAlign:'center'}}><div style={{fontSize:11,color:O.text3,marginBottom:4}}>Product vs Reject</div>
                <DonutChart segments={[{label:'Product',value:calc.finalProduct,color:O.accent},{label:'Reject',value:calc.totalReject,color:O.warn}]} centerLabel={`${fmt(calc.overallRecovery,0)}%`} centerSub="Recovery"/></div>
              <div style={{textAlign:'center'}}><div style={{fontSize:11,color:O.text3,marginBottom:4}}>UF vs RO Reject</div>
                <DonutChart segments={[{label:'UF',value:calc.ufRejectFlow,color:O.warn},{label:'RO',value:calc.roRejectFlow,color:O.gold}]} centerLabel={fmt(vol(calc.totalReject),0)} centerSub={volUnit}/></div>
              <div style={{textAlign:'center'}}><div style={{fontSize:11,color:O.text3,marginBottom:4}}>Flow Split</div>
                <DonutChart segments={[{label:'RO Feed',value:calc.roIn,color:O.cyan},{label:'Bypass',value:calc.ufBypass,color:O.accent},{label:'UF Rej',value:calc.ufRejectFlow,color:O.warn},{label:'RO Rej',value:calc.roRejectFlow,color:'#a8624a'}]} centerLabel={fmt(vol(calc.feedFlow),0)} centerSub="Feed"/></div>
            </div>
          </Section>

          {/* Loss */}
          <Section title="Water Loss Breakdown" open={sec.loss} onToggle={()=>toggle('loss')}>
            <LossBreakdown calc={calc} fmtC={fmtC} vol={vol} volUnit={volUnit}/>
          </Section>

          {/* Analysis */}
          <Section title="Discharge Analysis" open={sec.analysis} onToggle={()=>toggle('analysis')}>
            <div style={{display:'flex',gap:4,marginBottom:8,overflowX:'auto'}}>
              {['status','howToFix','engineering'].map(t=>(
                <button key={t} onClick={()=>setRecTab(t)} style={{...S.stratTab,padding:'6px 12px',fontSize:10,...(recTab===t?S.stratTabActive:{})}}>{t==='status'?'Status':t==='howToFix'?'How to fix':'Engineering'}</button>))}
            </div>
            {recTab==='status' && <div style={S.mixBox}>
              <div style={S.mixRow}><span>Total Reject Cond</span><span style={S.mixVal}>{fmtC(calc.totalRejectTDS)} µS/cm</span></div>
              <div style={S.mixRow}><span>Limit</span><span style={S.mixVal}>{REJECT_COND_LIMIT.toLocaleString()} µS/cm</span></div>
              <div style={S.mixRow}><span>Margin</span><span style={{...S.mixVal,color:calc.totalRejectMargin>=0?O.pass:O.fail}}>{calc.totalRejectMargin>=0?`${Math.round(calc.totalRejectMargin).toLocaleString()} below`:`${Math.round(Math.abs(calc.totalRejectMargin)).toLocaleString()} above`}</span></div>
            </div>}
            {recTab==='howToFix' && (recommendations.length===0?<div style={{color:O.pass,fontSize:12}}>ไม่มีปัญหา ✓</div>:recommendations.map((r,i)=>(
              <div key={i} style={{marginBottom:10}}><StatusBadge status={r.status}/><span style={{marginLeft:8,color:O.warn,fontWeight:600,fontSize:12}}>{r.area}</span>
                <ul style={{margin:'4px 0 0 18px',listStyleType:'disc'}}>{r.items.map((it,j)=><li key={j} style={{color:O.text2,fontSize:11,lineHeight:1.8}}>{it}</li>)}</ul></div>)))}
            {recTab==='engineering' && <div style={{fontSize:11,color:O.text2,lineHeight:2,fontFamily:mono}}>
              <div>Final Cond = (Qr×Cr + ΣQd×Cd) / (Qr + ΣQd)</div>
              <div>Required Qd = Qr × (Cr − Ct) / (Ct − Cd)</div>
              <div>TDS = Cond × {COND_TO_TDS}</div>
            </div>}
          </Section>

          {/* Stream Table */}
          <Section title="Stream Table" open={sec.stream} onToggle={()=>toggle('stream')}>
            <div style={{overflowX:'auto'}}>
              <table style={S.table}><thead><tr>
                <th style={S.th}>Stream</th><th style={{...S.th,textAlign:'right'}}>Flow</th><th style={{...S.th,textAlign:'right'}}>Cond</th><th style={{...S.th,textAlign:'right'}}>TDS</th><th style={{...S.th,textAlign:'right'}}>%Feed</th><th style={{...S.th,textAlign:'center'}}>Status</th>
              </tr></thead><tbody>
                {calc.sourceAllocations.map(s=>{const fl=s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow);return<StreamRow key={s.id} name={`├ ${s.name}`} flow={vol(fl)} tds={s.tds} pct={s.actualRatio||0} sub/>;})}
                <StreamRow name="① Mixed Feed" flow={vol(calc.feedFlow)} tds={calc.feedTDS} pct={100} bold/>
                <StreamRow name="② UF Permeate" flow={vol(calc.ufOut)} tds={calc.ufPermTDS} pct={calc.ufOut/calc.feedFlow*100}/>
                <StreamRow name="③ UF Reject" flow={vol(calc.ufRejectFlow)} tds={calc.ufRejectTDS} pct={calc.ufRejectFlow/calc.feedFlow*100} loss status={calc.ufRejectStatus}/>
                <StreamRow name="④ RO Feed" flow={vol(calc.roIn)} tds={calc.feedTDS} pct={calc.roIn/calc.feedFlow*100}/>
                <StreamRow name="⑤ Bypass" flow={vol(calc.ufBypass)} tds={calc.feedTDS} pct={calc.ufBypass/calc.feedFlow*100} accent/>
                <StreamRow name="⑥ RO Perm" flow={vol(calc.roOut)} tds={calc.roPermTDS} pct={calc.roOut/calc.feedFlow*100}/>
                <StreamRow name="⑦ RO Conc" flow={vol(calc.roRejectFlow)} tds={calc.roRejectTDS} pct={calc.roRejectFlow/calc.feedFlow*100} loss status={calc.roRejectStatus}/>
                <StreamRow name="⑧ Total Rej" flow={vol(calc.totalReject)} tds={calc.totalRejectTDS} pct={calc.totalReject/calc.feedFlow*100} loss status={calc.totalRejectStatus}/>
                <StreamRow name="⑨ PRODUCT" flow={vol(calc.finalProduct)} tds={calc.actualProductTDS} pct={calc.finalProduct/calc.feedFlow*100} highlight/>
                {dilution.needed&&!dilution.cannotSolve&&(dilution.finalFlow||0)>0&&(<>
                  {dilutionMode==='auto'&&(dilution.QdReq||0)>0&&<StreamRow name={`├ Dilution: ${dilution.srcName}`} flow={vol(dilution.QdReq)} tds={cond2tds(dilution.Cd)} pct={0} sub/>}
                  {dilutionMode==='manual'&&dilution.sources?.map(ds=><StreamRow key={`d-${ds.id}`} name={`├ ${ds.name}`} flow={vol(toNumber(ds.flow))} tds={cond2tds(toNumber(ds.conductivity))} pct={0} sub/>)}
                  <StreamRow name="⑩ DISCHARGE" flow={vol(dilution.finalFlow)} tds={dilution.finalTDS} pct={0} highlight status={dilution.finalStatus}/>
                </>)}
              </tbody></table>
            </div>
          </Section>

          {/* ═══ COST ═══ */}
          <Section title="ประมาณการค่าใช้จ่าย (Cost Estimation)" open={sec.cost} onToggle={()=>toggle('cost')} accent>
            {/* Summary */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:8,marginBottom:14}}>
              <CostKPI label="ค่าน้ำดิบ" value={fmtB(costCalc.rawCostPerM3Prod)} unit="฿/m³" color={O.cyan}/>
              <CostKPI label="ค่าไฟฟ้า" value={fmtB(costCalc.elecCostPerM3Prod)} unit="฿/m³" color={O.accent}/>
              <CostKPI label="ค่าดำเนินการ" value={fmtB(costCalc.opsCostPerM3Prod)} unit="฿/m³" color={O.gold}/>
              <CostKPI label="ค่าเคมี" value={fmtB(costCalc.chemCostPerM3Prod)} unit="฿/m³" color={O.text3}/>
              <CostKPI label="รวมต่อ m³" value={fmtB(costCalc.totalPerM3)} unit="฿/m³" accent/>
              <CostKPI label="OPEX/Day" value={fmtB(costCalc.totalPerDay,0)} unit="฿/day"/>
              <CostKPI label="OPEX/Month" value={fmtB(costCalc.totalPerMonth,0)} unit="฿/mo"/>
            </div>

            {/* 1. Electricity TOU */}
            <Section title="1. ค่าไฟฟ้า (TOU + Ft)" open={sec.costElec} onToggle={()=>toggle('costElec')}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                <div style={S.srcField}><label style={S.srcFieldLabel}>Peak Rate</label><div style={S.srcInputWrap}><NumInput value={peakRate} onValueChange={setPeakRate} style={S.srcInput}/><span style={S.srcUnit}>฿/kWh</span></div></div>
                <div style={S.srcField}><label style={S.srcFieldLabel}>Off-Peak Rate</label><div style={S.srcInputWrap}><NumInput value={offPeakRate} onValueChange={setOffPeakRate} style={S.srcInput}/><span style={S.srcUnit}>฿/kWh</span></div></div>
                <div style={S.srcField}><label style={S.srcFieldLabel}>Ft Charge</label><div style={S.srcInputWrap}><NumInput value={ftCharge} onValueChange={setFtCharge} style={S.srcInput}/><span style={S.srcUnit}>฿/kWh</span></div></div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:6}}>
                <div style={S.srcField}><label style={S.srcFieldLabel}>Peak Hours/Day</label><div style={S.srcInputWrap}><NumInput value={peakHours} onValueChange={v=>setPeakHours(Math.max(0,Math.min(opsHours,v)))} style={S.srcInput}/><span style={S.srcUnit}>h</span></div></div>
                <div style={S.srcField}><label style={S.srcFieldLabel}>SEC (kWh/m³ feed)</label><div style={S.srcInputWrap}><NumInput value={secFeed} onValueChange={setSecFeed} style={S.srcInput}/><span style={S.srcUnit}>kWh/m³</span></div></div>
              </div>
              <div style={{...S.mixBox,marginTop:8}}>
                <div style={S.mixRow}><span>Peak Rate (inc Ft)</span><span style={S.mixVal}>{fmtB(costCalc.peakCostPerKwh)} ฿/kWh</span></div>
                <div style={S.mixRow}><span>Off-Peak Rate (inc Ft)</span><span style={S.mixVal}>{fmtB(costCalc.offPeakCostPerKwh)} ฿/kWh</span></div>
                <div style={S.mixRow}><span>Avg Rate (weighted)</span><span style={{...S.mixVal,color:O.accent}}>{fmtB(costCalc.avgElecRate)} ฿/kWh</span></div>
                <div style={S.mixRow}><span>Power</span><span style={S.mixVal}>{fmt(costCalc.kwPerH,1)} kW</span></div>
                <div style={S.mixRow}><span>Cost/Day</span><span style={{...S.mixVal,color:O.gold}}>{fmtB(costCalc.elecCostDay,0)} ฿</span></div>
              </div>
            </Section>

            {/* 2. Operation */}
            <Section title="2. ค่าดำเนินการ (Operation)" open={sec.costOps} onToggle={()=>toggle('costOps')}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                <div style={S.srcField}><label style={S.srcFieldLabel}>จำนวนพนักงาน</label><div style={S.srcInputWrap}><NumInput value={staffCount} onValueChange={setStaffCount} style={S.srcInput}/><span style={S.srcUnit}>คน</span></div></div>
                <div style={S.srcField}><label style={S.srcFieldLabel}>เงินเดือน/คน</label><div style={S.srcInputWrap}><NumInput value={staffSalary} onValueChange={setStaffSalary} style={S.srcInput}/><span style={S.srcUnit}>฿/เดือน</span></div></div>
              </div>
              <div style={{...S.mixBox,marginTop:8}}>
                <div style={S.mixRow}><span>รวม/เดือน</span><span style={{...S.mixVal,color:O.gold}}>{fmtB(costCalc.opsCostMonth,0)} ฿</span></div>
                <div style={S.mixRow}><span>ต่อ m³ product</span><span style={S.mixVal}>{fmtB(costCalc.opsCostPerM3Prod)} ฿/m³</span></div>
              </div>
            </Section>

            {/* 3. Chemical placeholder */}
            <Section title="3. ค่าเคมี (Chemical) — เตรียมไว้" open={sec.costChem} onToggle={()=>toggle('costChem')}>
              <div style={S.srcField}><label style={S.srcFieldLabel}>ค่าเคมีต่อ m³ product</label>
                <div style={S.srcInputWrap}><NumInput value={chemCostPerM3} onValueChange={setChemCostPerM3} style={S.srcInput}/><span style={S.srcUnit}>฿/m³</span></div></div>
              <div style={{fontSize:10,color:O.text3,marginTop:6,fontStyle:'italic'}}>* รอข้อมูลจริง — ใส่ค่าประมาณได้</div>
            </Section>

            <div style={{fontSize:10,color:O.text3,textAlign:'center',marginTop:8,fontStyle:'italic'}}>* ค่าใช้จ่ายเบื้องต้น อาจไม่รวมค่าบำรุงรักษา/เปลี่ยนเมมเบรน</div>
          </Section>

          <footer style={S.footer}>
            <span style={{color:O.text3}}>Cond = TDS × {TDS_TO_COND} · Limit: {REJECT_COND_LIMIT.toLocaleString()} µS/cm</span>
            <span style={{color:O.accent}}>v7.0 — Ocean</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

// ════════════ SUB COMPONENTS ════════════
function SliderRow({label,value,onChange,min,max,step,unit}) {
  return (<div style={S.sliderRow}><div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
    <span style={{fontSize:11,color:O.text2}}>{label}</span><span style={{fontSize:11,color:O.accent,fontWeight:600,fontFamily:mono}}>{value}{unit}</span></div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))} style={S.slider}/></div>);
}
function KPI({label,value,unit,sub,highlight,warning,badge}) {
  return (<div style={{...S.kpi,...(highlight?S.kpiHi:{}),...(warning?S.kpiWarn:{})}}>
    <div style={{fontSize:10,color:O.text3,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4,fontFamily:mono,display:'flex',alignItems:'center',gap:6}}>{label} {badge&&<StatusBadge status={badge} small/>}</div>
    <div style={{display:'flex',alignItems:'baseline',gap:4}}><span style={{fontSize:24,fontWeight:700,color:O.text1,fontFamily:serif}}>{value}</span><span style={{fontSize:10,color:O.cyan,fontFamily:mono}}>{unit}</span></div>
    {sub&&<div style={{fontSize:9,color:O.text3,marginTop:3,fontFamily:mono}}>{sub}</div>}</div>);
}
function CostKPI({label,value,unit,color,accent}) {
  return (<div style={{background:accent?O.accent+'14':O.bg2,border:`1px solid ${accent?O.accent:color||O.border}`,borderRadius:4,padding:'10px 12px'}}>
    <div style={{fontSize:9,color:color||O.text3,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:4,fontFamily:mono}}>{label}</div>
    <div style={{display:'flex',alignItems:'baseline',gap:4}}>
      <span style={{fontSize:accent?22:18,fontWeight:700,color:accent?O.gold:O.text1,fontFamily:serif}}>{value}</span>
      <span style={{fontSize:9,color:O.text3,fontFamily:mono}}>{unit}</span></div></div>);
}
function StatusBadge({status,small}) {
  const c={PASS:O.pass,WARNING:O.gold,FAIL:O.fail};
  const bg={PASS:O.pass+'22',WARNING:O.gold+'22',FAIL:O.fail+'22'};
  return <span style={{display:'inline-block',padding:small?'1px 5px':'2px 8px',borderRadius:2,fontSize:small?8:10,fontWeight:700,letterSpacing:'0.1em',color:c[status]||O.text3,background:bg[status]||'transparent',border:`1px solid ${c[status]||O.border}`,fontFamily:mono}}>{status}</span>;
}
function DonutChart({segments,centerLabel,centerSub}) {
  const total=segments.reduce((s,x)=>s+(x.value||0),0);
  if(!total)return<div style={{width:140,height:140,display:'flex',alignItems:'center',justifyContent:'center',color:O.text3,fontSize:11}}>—</div>;
  const size=140,cx=70,cy=70,r=52,stroke=16,circ=2*Math.PI*r;let offset=0;
  return(<div style={{position:'relative',width:size,height:size,margin:'0 auto'}}>
    <svg viewBox={`0 0 ${size} ${size}`} style={{width:'100%',height:'100%',transform:'rotate(-90deg)'}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={O.bg2} strokeWidth={stroke}/>
      {segments.map((seg,i)=>{const p=seg.value/total,d=circ*p,g=circ-d;const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={stroke} strokeDasharray={`${d} ${g}`} strokeDashoffset={-offset} style={{transition:'all 0.3s'}}/>;offset+=d;return el;})}</svg>
    <div style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
      <div style={{fontSize:18,fontWeight:700,color:O.text1,fontFamily:serif}}>{centerLabel}</div>
      <div style={{fontSize:9,color:O.text3,fontFamily:mono}}>{centerSub}</div></div>
    <div style={{display:'flex',flexDirection:'column',gap:2,marginTop:6}}>
      {segments.map((seg,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:5,fontSize:10,color:O.text2,fontFamily:mono}}><div style={{width:8,height:8,borderRadius:2,background:seg.color}}/>{seg.label} {total>0?`${((seg.value/total)*100).toFixed(0)}%`:''}</div>)}</div>
  </div>);
}
function StreamRow({name,flow,tds,pct,highlight,loss,accent,sub,bold,status}) {
  const cond=tds2cond(tds);const cc=cond<200?O.pass:cond>6000?O.fail:O.text1;
  const rs={...S.tr,...(highlight?S.trHi:{}),...(loss?S.trLoss:{}),...(accent?S.trAcc:{}),...(sub?S.trSub:{}),...(bold?S.trBold:{})};
  return(<tr style={rs}><td style={S.td}>{name}</td>
    <td style={{...S.td,textAlign:'right'}}>{isFinite(flow)?flow.toFixed(1):'—'}</td>
    <td style={{...S.td,textAlign:'right',color:cc}}>{isFinite(cond)?Math.round(cond).toLocaleString():'—'}</td>
    <td style={{...S.td,textAlign:'right',opacity:0.5}}>{isFinite(tds)?tds.toFixed(0):'—'}</td>
    <td style={{...S.td,textAlign:'right',color:O.text3}}>{isFinite(pct)?pct.toFixed(1):'—'}%</td>
    <td style={{...S.td,textAlign:'center'}}>{status?<StatusBadge status={status} small/>:''}</td></tr>);
}
function LossBreakdown({calc,fmtC,vol,volUnit}) {
  const t=calc.totalReject,uP=t>0?(calc.ufRejectFlow/t)*100:0,rP=t>0?(calc.roRejectFlow/t)*100:0;
  const f=(n)=>isFinite(n)?n.toFixed(1):'—';
  return(<div>
    <div style={{display:'flex',height:40,borderRadius:4,overflow:'hidden',background:O.bg2}}>
      <div style={{width:`${uP}%`,background:`linear-gradient(180deg,${O.warn},#a8624a)`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontFamily:mono,fontWeight:600,minWidth:uP>10?'auto':0}}>{uP>10&&`UF ${uP.toFixed(0)}%`}</div>
      <div style={{width:`${rP}%`,background:`linear-gradient(180deg,${O.gold},${O.accent})`,display:'flex',alignItems:'center',justifyContent:'center',color:O.bg1,fontSize:11,fontFamily:mono,fontWeight:700,minWidth:rP>10?'auto':0}}>{rP>10&&`RO ${rP.toFixed(0)}%`}</div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:10}} className="ufro-loss-grid">
      <div style={{background:O.bg2,border:`1px solid ${O.border}`,borderRadius:4,padding:10}}>
        <div style={{fontSize:10,color:O.text3,fontFamily:mono}}>UF Loss <StatusBadge status={calc.ufRejectStatus} small/></div>
        <div style={{fontSize:18,color:O.text1,fontWeight:600,fontFamily:serif,marginTop:4}}>{f(vol(calc.ufRejectFlow))} {volUnit}</div>
        <div style={{fontSize:10,color:O.text3,fontFamily:mono}}>Cond {fmtC(calc.ufRejectTDS)}</div></div>
      <div style={{background:O.bg2,border:`1px solid ${O.border}`,borderRadius:4,padding:10}}>
        <div style={{fontSize:10,color:O.text3,fontFamily:mono}}>RO Loss <StatusBadge status={calc.roRejectStatus} small/></div>
        <div style={{fontSize:18,color:O.text1,fontWeight:600,fontFamily:serif,marginTop:4}}>{f(vol(calc.roRejectFlow))} {volUnit}</div>
        <div style={{fontSize:10,color:O.text3,fontFamily:mono}}>Cond {fmtC(calc.roRejectTDS)}</div></div>
    </div></div>);
}

// ════════════ PROCESS DIAGRAM ════════════
const ProcessDiagram = React.forwardRef(function ProcessDiagram({calc,sources,fmtC,fmt,vol,volUnit,dilution,finalAllowed,finalSeverity},ref) {
  const f=(n)=>fmt(vol(n),1);const fc=(t)=>fmtC(t);
  const act=sources.filter(s=>(s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow))>0.01);
  const rejectFails=!calc.totalRejectAllowed;
  const hasDil=dilution?.needed&&!dilution?.cannotSolve&&((dilution.finalFlow||0)>0||(dilution.QdReq||0)>0);
  const dilFlow=hasDil?(dilution.autoMode?dilution.QdReq:dilution.dilFlow):0;
  const dilOp=rejectFails?1:0.25;
  const showFinalCond=hasDil&&dilution.finalCond?Math.round(dilution.finalCond).toLocaleString():fmtC(calc.totalRejectTDS);
  const fColor={PASS:O.pass,WARNING:O.gold,FAIL:O.fail}[finalSeverity]||O.pass;
  const sH=32,sY=(i,t)=>{const sp=sH+6;return 180-((t-1)*sp)/2-sH/2+i*sp;};
  const mf=mono;

  return (
    <svg ref={ref} viewBox="0 0 1100 540" style={{width:'100%',height:'auto',minWidth:700}} xmlns="http://www.w3.org/2000/svg">
      <rect width="1100" height="540" fill="#070d1a" rx="6"/>
      <defs>
        <marker id="a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={O.cyan}/></marker>
        <marker id="a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={O.warn}/></marker>
        <marker id="a3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={O.accent}/></marker>
      </defs>

      {/* Sources */}
      {act.map((s,i)=>{const y=sY(i,act.length),fl=s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow);return(
        <g key={s.id}><rect x="15" y={y} width="125" height={sH} rx="4" fill="#0c1a2e" stroke="#1e3a5f" strokeWidth="1"/>
          <text x="78" y={y+13} textAnchor="middle" fill={O.text2} fontSize="10" fontFamily={mf} fontWeight="600">{s.name}</text>
          <text x="78" y={y+26} textAnchor="middle" fill={O.text3} fontSize="9" fontFamily={mf}>{f(fl)} · {fc(s.tds)}</text>
          <line x1="140" y1={y+sH/2} x2="185" y2="180" stroke="#1e3a5f" strokeWidth="1"/></g>);})}

      {/* Mix */}
      <circle cx="195" cy="180" r="13" fill="#0c1a2e" stroke={O.cyan} strokeWidth="1.5"/>
      <text x="195" y="184" textAnchor="middle" fill={O.cyan} fontSize="12" fontFamily={mf}>⊕</text>

      {/* → UF */}
      <line x1="208" y1="180" x2="285" y2="180" stroke={O.cyan} strokeWidth="2" markerEnd="url(#a1)"/>
      <text x="247" y="172" textAnchor="middle" fill={O.text1} fontSize="11" fontFamily={mf} fontWeight="600">{f(calc.feedFlow)}</text>
      <text x="247" y="196" textAnchor="middle" fill={O.accent} fontSize="9" fontFamily={mf}>{fc(calc.feedTDS)} µS/cm</text>

      {/* UF */}
      <rect x="285" y="150" width="115" height="60" rx="5" fill="#0c1a2e" stroke={O.cyan} strokeWidth="2"/>
      <text x="343" y="172" textAnchor="middle" fill={O.text1} fontSize="14" fontWeight="700" fontFamily={mf}>UF</text>
      <text x="343" y="190" textAnchor="middle" fill={O.text2} fontSize="10" fontFamily={mf}>{f(calc.ufOut)} out</text>
      <text x="343" y="222" textAnchor="middle" fill={O.text3} fontSize="9" fontFamily={mf}>rej {(calc.feedFlow>0?(calc.ufRejectFlow/calc.feedFlow*100):0).toFixed(1)}%</text>

      {/* UF Reject ↓ */}
      <line x1="343" y1="215" x2="343" y2="305" stroke={O.warn} strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#a2)"/>
      <rect x="300" y="305" width="86" height="42" rx="4" fill="#1a1020" stroke={O.warn} strokeWidth="1"/>
      <text x="343" y="322" textAnchor="middle" fill={O.warn} fontSize="10" fontWeight="600" fontFamily={mf}>UF Reject</text>
      <text x="343" y="338" textAnchor="middle" fill={O.text1} fontSize="11" fontWeight="700" fontFamily={mf}>{f(calc.ufRejectFlow)}</text>

      {/* UF Perm → Split */}
      <line x1="400" y1="180" x2="485" y2="180" stroke={O.cyan} strokeWidth="2" markerEnd="url(#a1)"/>
      <text x="443" y="172" textAnchor="middle" fill={O.text1} fontSize="11" fontFamily={mf} fontWeight="600">{f(calc.ufOut)}</text>

      {/* Split */}
      <circle cx="495" cy="180" r="9" fill="#0c1a2e" stroke={O.cyan} strokeWidth="1.5"/>
      <text x="495" y="184" textAnchor="middle" fill={O.text1} fontSize="10" fontFamily={mf} fontWeight="700">⋔</text>

      {/* Bypass ↑ */}
      <path d="M 495 171 L 495 65 L 905 65" fill="none" stroke={O.accent} strokeWidth="2" markerEnd="url(#a3)"/>
      <rect x="590" y="42" width="240" height="44" rx="5" fill="#0c1a2e" stroke={O.accent} strokeWidth="1.5"/>
      <text x="710" y="58" textAnchor="middle" fill={O.accent} fontSize="11" fontWeight="700" fontFamily={mf}>BYPASS ({fmt(calc.calcBypass,1)}%)</text>
      <text x="710" y="76" textAnchor="middle" fill={O.text1} fontSize="11" fontFamily={mf}>{f(calc.ufBypass)} {volUnit} · {fc(calc.feedTDS)} µS/cm</text>

      {/* → RO */}
      <line x1="504" y1="180" x2="600" y2="180" stroke={O.cyan} strokeWidth="2" markerEnd="url(#a1)"/>
      <text x="552" y="172" textAnchor="middle" fill={O.text1} fontSize="11" fontFamily={mf} fontWeight="600">{f(calc.roIn)}</text>
      <text x="552" y="198" textAnchor="middle" fill={O.text3} fontSize="9" fontFamily={mf}>To RO ({fmt(calc.calcToRO,1)}%)</text>

      {/* RO */}
      <rect x="600" y="148" width="115" height="65" rx="5" fill="#0c1a2e" stroke={O.cyan} strokeWidth="2"/>
      <text x="658" y="170" textAnchor="middle" fill={O.text1} fontSize="14" fontWeight="700" fontFamily={mf}>RO</text>
      <text x="658" y="190" textAnchor="middle" fill={O.text2} fontSize="10" fontFamily={mf}>{f(calc.roOut)} perm</text>
      <text x="658" y="204" textAnchor="middle" fill={O.accent} fontSize="9" fontFamily={mf}>{fc(calc.roPermTDS)} µS/cm</text>
      <text x="658" y="226" textAnchor="middle" fill={O.text3} fontSize="9" fontFamily={mf}>rej {(calc.roIn>0?(calc.roRejectFlow/calc.roIn*100):0).toFixed(1)}%</text>

      {/* RO Reject ↓ */}
      <line x1="658" y1="220" x2="658" y2="305" stroke={O.warn} strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#a2)"/>
      <rect x="610" y="305" width="96" height="50" rx="4" fill="#1a1020" stroke={O.warn} strokeWidth="1"/>
      <text x="658" y="322" textAnchor="middle" fill={O.warn} fontSize="10" fontWeight="600" fontFamily={mf}>RO Conc.</text>
      <text x="658" y="338" textAnchor="middle" fill={O.text1} fontSize="11" fontWeight="700" fontFamily={mf}>{f(calc.roRejectFlow)}</text>
      <text x="658" y="350" textAnchor="middle" fill={O.accent} fontSize="9" fontFamily={mf}>{fc(calc.roRejectTDS)} µS/cm</text>

      {/* RO Perm → Blend */}
      <line x1="715" y1="180" x2="905" y2="180" stroke={O.cyan} strokeWidth="2" markerEnd="url(#a1)"/>
      <text x="810" y="172" textAnchor="middle" fill={O.text1} fontSize="11" fontFamily={mf} fontWeight="600">{f(calc.roOut)}</text>
      <text x="810" y="198" textAnchor="middle" fill={O.accent} fontSize="9" fontFamily={mf}>{fc(calc.roPermTDS)} µS/cm</text>

      {/* Blend */}
      <circle cx="915" cy="180" r="13" fill="#1a1a10" stroke={O.accent} strokeWidth="2"/>
      <text x="915" y="184" textAnchor="middle" fill={O.accent} fontSize="13" fontFamily={mf} fontWeight="700">⊕</text>
      <line x1="928" y1="180" x2="985" y2="180" stroke={O.accent} strokeWidth="2.5" markerEnd="url(#a3)"/>

      {/* Product */}
      <rect x="985" y="145" width="105" height="72" rx="6" fill="#0c1a2e" stroke={O.accent} strokeWidth="2.5"/>
      <text x="1038" y="164" textAnchor="middle" fill={O.gold} fontSize="12" fontWeight="700" fontFamily={mf}>PRODUCT</text>
      <text x="1038" y="185" textAnchor="middle" fill={O.text1} fontSize="16" fontFamily={mf} fontWeight="700">{f(calc.finalProduct)}</text>
      <text x="1038" y="198" textAnchor="middle" fill={O.text3} fontSize="9" fontFamily={mf}>{volUnit}</text>
      <text x="1038" y="212" textAnchor="middle" fill={O.accent} fontSize="10" fontFamily={mf}>{fc(calc.actualProductTDS)} µS/cm</text>

      {/* Total Reject */}
      <rect x="440" y="365" width="240" height="55" rx="5" fill="#1a1020" stroke={O.warn} strokeWidth="1.5"/>
      <text x="560" y="383" textAnchor="middle" fill={O.warn} fontSize="11" fontWeight="700" fontFamily={mf}>TOTAL REJECT</text>
      <text x="560" y="401" textAnchor="middle" fill={O.text1} fontSize="14" fontFamily={mf} fontWeight="700">{f(calc.totalReject)} {volUnit}</text>
      <text x="560" y="415" textAnchor="middle" fill={O.accent} fontSize="10" fontFamily={mf}>{fc(calc.totalRejectTDS)} µS/cm</text>
      <line x1="343" y1="347" x2="440" y2="385" stroke={O.warn} strokeWidth="1" strokeDasharray="3,2"/>
      <line x1="658" y1="355" x2="680" y2="385" stroke={O.warn} strokeWidth="1" strokeDasharray="3,2"/>

      {/* Dilution zone */}
      <g opacity={dilOp}>
        <line x1="560" y1="420" x2="560" y2="458" stroke={O.warn} strokeWidth="1.5" markerEnd="url(#a2)"/>
        <rect x="460" y="458" width="200" height="40" rx="5" fill={rejectFails?'#0c1a2e':'#070d1a'} stroke={rejectFails?O.accent:O.border} strokeWidth={rejectFails?2:1}/>
        <text x="560" y="474" textAnchor="middle" fill={rejectFails?O.accent:O.text3} fontSize="10" fontWeight="700" fontFamily={mf}>{rejectFails?'DILUTION / MIXING':'ไม่จำเป็น'}</text>
        <text x="560" y="490" textAnchor="middle" fill={rejectFails?O.text1:O.text3} fontSize="10" fontFamily={mf}>
          {hasDil?`${fmt(vol(dilution.finalFlow),1)} ${volUnit}`:''}</text>
        {/* Dilution water arrow with flow */}
        <line x1="400" y1="478" x2="460" y2="478" stroke={rejectFails?O.cyan:O.border} strokeWidth={rejectFails?2:1} strokeDasharray={rejectFails?'':'4,3'} markerEnd="url(#a1)"/>
        <text x="388" y="470" textAnchor="end" fill={rejectFails?O.text2:O.text3} fontSize="10" fontFamily={mf} fontWeight="600">
          {hasDil&&dilFlow>0?`${fmt(vol(dilFlow),1)} ${volUnit}`:'น้ำผสม'}</text>
        <text x="388" y="486" textAnchor="end" fill={rejectFails?O.text3:O.border} fontSize="9" fontFamily={mf}>
          {hasDil&&dilution.Cd?`Cond ${Math.round(dilution.Cd)} µS/cm`:'Cond ต่ำ'}</text>
        {/* → Final */}
        <line x1="660" y1="478" x2="750" y2="478" stroke={fColor} strokeWidth={rejectFails?2.5:1} markerEnd="url(#a1)"/>
        <rect x="750" y="455" width="155" height="48" rx="5" fill={finalAllowed?'#0c1a2e':'#1a1020'} stroke={fColor} strokeWidth={rejectFails?2.5:1}/>
        <text x="828" y="473" textAnchor="middle" fill={fColor} fontSize="10" fontWeight="700" fontFamily={mf}>FINAL DISCHARGE</text>
        <text x="828" y="490" textAnchor="middle" fill={finalAllowed?O.text2:O.warn} fontSize="11" fontWeight="600" fontFamily={mf}>{showFinalCond} µS/cm</text>
        <text x="828" y="500" textAnchor="middle" fill={O.text3} fontSize="8" fontFamily={mf}>{hasDil?`${fmt(vol(dilution.finalFlow),1)} ${volUnit}`:''}</text>
        <rect x="910" y="461" width="42" height="16" rx="3" fill={fColor+'33'} stroke={fColor} strokeWidth="0.5"/>
        <text x="931" y="472" textAnchor="middle" fill={fColor} fontSize="8" fontWeight="700" fontFamily={mf}>{finalAllowed?(finalSeverity==='WARNING'?'WARN':'PASS'):'REJECT'}</text>
      </g>
    </svg>
  );
});

// ════════════ STYLES (OCEAN THEME) ════════════
const mono="'JetBrains Mono',ui-monospace,monospace";
const thai="'IBM Plex Sans Thai','JetBrains Mono',sans-serif";
const serif="'Fraunces',serif";

// Ocean palette
const O = {
  bg1:'#070d1a', bg2:'#0c1a2e', bg3:'#111f38',
  border:'#1e3a5f', borderLight:'#2a5080',
  cyan:'#22d3ee', accent:'#38bdf8', gold:'#fbbf24', teal:'#06b6d4',
  text1:'#e0f2fe', text2:'#94a3b8', text3:'#64748b',
  pass:'#34d399', warn:'#f97316', fail:'#ef4444',
};

const globalCSS=`
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,700&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap');
*{box-sizing:border-box}
input[type="range"]{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;width:100%}
input[type="range"]::-webkit-slider-runnable-track{height:3px;background:${O.border};border-radius:2px}
input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;height:16px;width:16px;border-radius:3px;background:${O.accent};margin-top:-7px;border:1px solid ${O.bg1}}
input[type="range"]::-moz-range-track{height:3px;background:${O.border}}
input[type="range"]::-moz-range-thumb{height:16px;width:16px;border-radius:3px;background:${O.accent};border:1px solid ${O.bg1}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
@keyframes blinkPass{0%,100%{opacity:1;box-shadow:0 0 12px ${O.pass}88}50%{opacity:0.7;box-shadow:0 0 3px ${O.pass}33}}
@keyframes blinkWarn{0%,100%{opacity:1;box-shadow:0 0 12px ${O.gold}88}50%{opacity:0.7;box-shadow:0 0 3px ${O.gold}33}}
@keyframes blinkFail{0%,100%{opacity:1;box-shadow:0 0 12px ${O.fail}88}50%{opacity:0.7;box-shadow:0 0 3px ${O.fail}33}}
.status-blink-pass{animation:blinkPass 1.5s infinite}
.status-blink-warn{animation:blinkWarn 1.2s infinite}
.status-blink-fail{animation:blinkFail 1s infinite}
@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:768px){
  .ufro-header{flex-direction:column!important;align-items:flex-start!important;gap:10px!important}
  .ufro-mode-toggle{align-self:stretch!important}
  .ufro-header-right{align-self:stretch!important;justify-content:space-between!important}
  .ufro-grid{grid-template-columns:1fr!important}
  .ufro-kpi-strip{grid-template-columns:repeat(2,1fr)!important}
  .ufro-dash-grid{grid-template-columns:1fr!important}
  .ufro-loss-grid{grid-template-columns:1fr!important}
}
@media(max-width:480px){.ufro-kpi-strip{grid-template-columns:1fr!important}}
`;

const S={
  root:{minHeight:'100vh',background:`radial-gradient(ellipse at top,${O.bg2},${O.bg1})`,color:O.text1,fontFamily:thai,padding:20,fontSize:12,
    backgroundImage:`radial-gradient(ellipse at top,${O.bg2},${O.bg1}),repeating-linear-gradient(0deg,${O.border}11 0px,${O.border}11 1px,transparent 1px,transparent 28px),repeating-linear-gradient(90deg,${O.border}11 0px,${O.border}11 1px,transparent 1px,transparent 28px)`,backgroundBlendMode:'normal,overlay,overlay'},
  header:{display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:16,borderBottom:`1px solid ${O.border}`,marginBottom:22,gap:16,flexWrap:'wrap'},
  headerLeft:{display:'flex',alignItems:'center',gap:14},
  logoMark:{fontSize:30,color:O.cyan,lineHeight:1},
  title:{fontFamily:serif,fontSize:24,fontWeight:500,color:O.text1},
  subtitle:{fontSize:11,color:O.text3,letterSpacing:'0.15em',textTransform:'uppercase',marginTop:3},
  headerCenter:{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flex:1,minWidth:200},
  modeToggle:{display:'inline-flex',background:O.bg2,border:`1px solid ${O.border}`,borderRadius:5,padding:3},
  modeBtn:{background:'transparent',border:'none',padding:'8px 16px',cursor:'pointer',color:O.text3,fontFamily:mono,fontSize:12,fontWeight:600,borderRadius:3,transition:'all 0.2s'},
  modeBtnActive:{background:`${O.accent}20`,color:O.accent,boxShadow:`inset 0 0 0 1px ${O.accent}`},
  headerRight:{display:'flex',alignItems:'center',gap:8},
  timeToggle:{display:'inline-flex',background:O.bg2,border:`1px solid ${O.border}`,borderRadius:4,padding:2},
  timeBtn:{background:'transparent',border:'none',padding:'5px 10px',cursor:'pointer',color:O.text3,fontFamily:mono,fontSize:10,fontWeight:600,borderRadius:3},
  timeBtnActive:{background:`${O.accent}20`,color:O.accent,boxShadow:`inset 0 0 0 1px ${O.accent}`},
  resetBtn:{background:'transparent',border:`1px solid ${O.warn}`,color:O.warn,fontSize:14,width:32,height:32,borderRadius:4,cursor:'pointer',fontFamily:mono,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'},
  grid:{display:'grid',gridTemplateColumns:'380px 1fr',gap:22},
  sidebar:{background:`${O.bg2}cc`,border:`1px solid ${O.border}`,borderRadius:6,padding:18,height:'fit-content',backdropFilter:'blur(8px)'},
  sectionLabel:{fontSize:12,color:O.cyan,letterSpacing:'0.1em',fontWeight:600,margin:'14px 0 8px',paddingBottom:6,borderBottom:`1px dashed ${O.border}`,fontFamily:mono,textTransform:'uppercase'},
  strategyTabs:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:2,background:O.bg1,padding:3,borderRadius:4},
  stratTab:{background:'transparent',border:'none',padding:'6px 4px',cursor:'pointer',color:O.text3,fontFamily:mono,fontSize:10,borderRadius:3,transition:'all 0.15s'},
  stratTabActive:{background:`${O.accent}18`,color:O.accent,boxShadow:`inset 0 0 0 1px ${O.accent}`},
  srcCard:{background:O.bg2,border:`1px solid ${O.border}`,borderRadius:4,padding:'8px 10px',transition:'all 0.2s'},
  srcCardOn:{background:`${O.cyan}08`,borderColor:O.borderLight},
  srcHeader:{display:'flex',alignItems:'center',gap:7},
  srcToggle:{background:'transparent',border:'none',color:O.border,fontSize:16,cursor:'pointer',padding:0,lineHeight:1,width:16},
  srcToggleOn:{color:O.cyan},
  srcName:{flex:1,background:'transparent',border:'none',color:O.text1,fontSize:12,fontFamily:'inherit',outline:'none',padding:'2px 4px'},
  srcIdx:{fontSize:9,color:O.cyan,letterSpacing:'0.1em',fontWeight:600,fontFamily:mono},
  srcInputs:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6},
  srcField:{},
  srcFieldLabel:{fontSize:10,color:O.text3,letterSpacing:'0.08em',textTransform:'uppercase',display:'block',marginBottom:3,fontFamily:mono},
  srcInputWrap:{display:'flex',alignItems:'center',background:O.bg1,border:`1px solid ${O.border}`,borderRadius:3,padding:'0 6px'},
  srcInputRO:{background:O.bg2,borderStyle:'dashed',borderColor:`${O.accent}44`},
  srcInput:{flex:1,background:'transparent',border:'none',color:O.text1,padding:'5px 0',fontSize:12,fontFamily:mono,outline:'none',width:'100%',minWidth:0},
  srcUnit:{fontSize:9,color:O.text3},
  srcPct:{fontSize:10,color:O.accent,fontWeight:600,fontFamily:mono,background:`${O.accent}14`,padding:'1px 6px',borderRadius:3},
  mixBox:{marginTop:10,padding:10,background:`${O.accent}08`,border:`1px solid ${O.accent}33`,borderRadius:4},
  mixHead:{fontSize:10,color:O.accent,letterSpacing:'0.15em',fontWeight:700,paddingBottom:6,borderBottom:`1px dashed ${O.accent}33`,marginBottom:6,fontFamily:mono},
  mixRow:{display:'flex',justifyContent:'space-between',fontSize:11,padding:'3px 0',color:O.text2},
  mixVal:{color:O.accent,fontWeight:600,fontFamily:mono},
  inputRow:{marginBottom:10},
  inputLabel:{fontSize:12,color:O.text2,marginBottom:5},
  inputWrap:{display:'flex',alignItems:'center',background:O.bg1,border:`1px solid ${O.border}`,borderRadius:4,padding:'0 10px'},
  inputWrapAccent:{borderColor:O.accent,background:`${O.accent}08`},
  input:{flex:1,background:'transparent',border:'none',color:O.text1,padding:'8px 0',fontSize:14,fontFamily:mono,outline:'none'},
  inputUnit:{fontSize:11,color:O.text3,letterSpacing:'0.1em'},
  sliderRow:{marginBottom:12},
  slider:{width:'100%'},
  warnBox:{marginTop:10,padding:10,background:`${O.warn}14`,border:`1px solid ${O.warn}`,borderRadius:4},
  warnTitle:{fontSize:12,fontWeight:700,color:O.warn},
  main:{display:'flex',flexDirection:'column',gap:10},
  kpiStrip:{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10},
  kpi:{background:O.bg2,border:`1px solid ${O.border}`,borderRadius:5,padding:'12px 14px'},
  kpiHi:{borderColor:O.accent,background:`${O.accent}0a`},
  kpiWarn:{borderColor:O.warn,background:`${O.warn}0a`},
  dischargeCard:{borderRadius:6,padding:'16px 22px',display:'flex',flexDirection:'column',alignItems:'center',gap:6},
  dischargePass:{background:`${O.pass}10`,border:`2px solid ${O.pass}`},
  dischargeWarn:{background:`${O.gold}10`,border:`2px solid ${O.gold}`},
  dischargeFail:{background:`${O.fail}10`,border:`2px solid ${O.fail}`},
  dischargeBadge:{fontSize:16,fontWeight:700,letterSpacing:'0.1em',fontFamily:mono,padding:'8px 20px',borderRadius:5},
  dischargeMeta:{fontSize:11,color:O.text2,fontFamily:mono,textAlign:'center'},
  exportBtn:{background:'transparent',border:`1px solid ${O.border}`,color:O.text2,fontSize:10,padding:'4px 10px',borderRadius:3,cursor:'pointer',fontFamily:mono,fontWeight:600},
  table:{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:550},
  th:{textAlign:'left',padding:'10px 14px',fontSize:10,color:O.text3,letterSpacing:'0.12em',fontWeight:600,borderBottom:`1px solid ${O.border}`,fontFamily:mono},
  tr:{borderBottom:`1px solid ${O.border}44`},
  trHi:{background:`${O.accent}0a`},trLoss:{background:`${O.warn}06`},trAcc:{background:`${O.cyan}06`},trSub:{opacity:0.6,fontSize:11},trBold:{fontWeight:700,background:`${O.cyan}0a`},
  td:{padding:'10px 14px',color:O.text1,fontFamily:mono,fontSize:12},
  footer:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 18px',background:O.bg2,border:`1px solid ${O.border}`,borderRadius:5,fontSize:10,fontFamily:mono,flexWrap:'wrap',gap:8,marginTop:8},
};
