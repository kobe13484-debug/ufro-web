import React, { useState, useMemo, useEffect, useRef } from 'react';

// ────── Helpers ──────
const toNumber = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
function NumInput({ value, onValueChange, style, readOnly, forceSync }) {
  const [display, setDisplay] = useState(String(value ?? ''));
  const typing = useRef(false);
  useEffect(() => { if (forceSync || !typing.current) setDisplay(String(value ?? '')); }, [value, forceSync]);
  const handleChange = (e) => { const raw = e.target.value; setDisplay(raw); typing.current = true; if (raw===''||raw==='-'||raw==='.'||raw.endsWith('.')) return; const n = parseFloat(raw); if (isFinite(n)) onValueChange(n); };
  const handleBlur = () => { typing.current = false; const n = toNumber(display); onValueChange(n); setDisplay(String(n)); };
  return <input type="text" inputMode="decimal" value={display} onChange={handleChange} onBlur={handleBlur} style={style} readOnly={readOnly} />;
}

// ────── Conversion ──────
const TDS_TO_COND = 2, COND_TO_TDS = 0.5;
const tds2cond = t => t * TDS_TO_COND, cond2tds = c => c * COND_TO_TDS;
const REJECT_TDS_LIMIT = 3000, REJECT_COND_LIMIT = 6000;
const DIAGRAM_BASE_W = 1700, DIAGRAM_BASE_H = 800;
const clampDiagramZoom = (v) => Math.max(0.5, Math.min(2.5, Math.round(v * 10) / 10));

function validateDischarge(tds) {
  const cond = tds2cond(tds), wR = 0.8;
  const regulatoryAllowed = cond <= REJECT_COND_LIMIT && tds <= REJECT_TDS_LIMIT;
  let severityStatus = !regulatoryAllowed ? 'FAIL' : (cond >= REJECT_COND_LIMIT*wR || tds >= REJECT_TDS_LIMIT*wR) ? 'WARNING' : 'PASS';
  return { regulatoryAllowed, severityStatus, cond, tds, margin: REJECT_COND_LIMIT - cond };
}
function getRejectStatus(tds) { return validateDischarge(tds).severityStatus; }

function getRecommendations(calc, splitMode) {
  const recs = []; const roV = validateDischarge(calc.roRejectTDS); const totV = validateDischarge(calc.totalRejectTDS);
  if (!roV.regulatoryAllowed && totV.regulatoryAllowed) recs.push({area:'RO Concentrate',status:'WARNING',items:['RO Concentrate เกินเกณฑ์เดี่ยว แต่ Total Reject ยังผ่าน']});
  if (!totV.regulatoryAllowed) recs.push({area:'Total Reject',status:'FAIL',items:['น้ำ Reject รวมไม่ผ่านเกณฑ์','เพิ่มน้ำผสม Cond ต่ำ','ปรับ RO/Bypass split','ลด RO Recovery','พิจารณา Reject treatment']});
  if (splitMode==='manual'&&calc.hasTargetCond&&calc.actualProductTDS>calc.targetTDS) recs.push({area:'Product Quality',status:'FAIL',items:['ลด Bypass %','เพิ่ม To RO %','เพิ่ม Salt Rejection']});
  if (totV.severityStatus==='WARNING') recs.push({area:'ใกล้ขีดจำกัด',status:'WARNING',items:['เฝ้าระวัง Conductivity','เตรียมน้ำผสมไว้เป็น buffer','ตรวจสอบ online meter']});
  return recs;
}

function exportSVG(el) { if(!el)return;const s=new XMLSerializer().serializeToString(el);const b=new Blob([s],{type:'image/svg+xml'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='ufro-diagram.svg';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(u); }
function exportPNG(el) { if(!el)return;const s=new XMLSerializer().serializeToString(el);const c=document.createElement('canvas');const ctx=c.getContext('2d');const img=new Image();const u=URL.createObjectURL(new Blob([s],{type:'image/svg+xml'}));img.onload=()=>{c.width=2400;c.height=1070;ctx.fillStyle='#070d1a';ctx.fillRect(0,0,2400,1070);ctx.drawImage(img,0,0,2400,1070);URL.revokeObjectURL(u);const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='ufro-diagram.png';document.body.appendChild(a);a.click();document.body.removeChild(a);};img.src=u; }

function Section({ title, open, onToggle, accent, children }) {
  return (
    <div style={S.section}>
      <div onClick={onToggle} style={{...S.sectionLabel,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',color:accent?O.accent:O.cyan,borderBottomColor:accent?O.accent+'66':O.border}}>
        <span style={{fontSize:12}}>{title}</span>
        <span style={{fontSize:14,color:O.accent,transition:'transform 0.2s',transform:open?'rotate(0)':'rotate(-90deg)'}}>▾</span>
      </div>
      {open && <div style={S.sectionBody}>{children}</div>}
    </div>
  );
}

// ────── PDF Preset Equipment (Section E) ──────
const PDF_EQUIPMENT_PRESET = [
  {id:1,name:'Raw Water Pump',kw:11,qty:2,hoursDay:22,enabled:true},
  {id:2,name:'Self-cleaning Filter',kw:0.37,qty:1,hoursDay:22,enabled:true},
  {id:3,name:'Ultrafiltration (UF) Unit',kw:0.05,qty:2,hoursDay:24,enabled:true},
  {id:4,name:'UF Backwash Pump',kw:18.5,qty:1,hoursDay:2,enabled:true},
  {id:5,name:'UF Product Water Transfer Pump',kw:5.5,qty:1,hoursDay:22,enabled:true},
  {id:6,name:'1st-stage RO Booster Pump',kw:22,qty:1,hoursDay:22,enabled:true},
  {id:7,name:'1st-stage RO High-pressure Pump',kw:75,qty:1,hoursDay:22,enabled:true},
  {id:8,name:'Reverse Osmosis (RO) Unit',kw:0.05,qty:1,hoursDay:24,enabled:true},
  {id:9,name:'RO Flushing Water Pump',kw:18.5,qty:1,hoursDay:1,enabled:true},
  {id:10,name:'Chemical Cleaning Water Pump',kw:18.5,qty:1,hoursDay:0.3,enabled:true},
  {id:11,name:'Control Cabinet',kw:5.5,qty:1,hoursDay:24,enabled:true},
  {id:12,name:'Bactericide Dosing Pump',kw:0.75,qty:1,hoursDay:22,enabled:true},
  {id:13,name:'UF Backwash Acid Dosing Pump',kw:0.55,qty:1,hoursDay:0.2,enabled:true},
  {id:14,name:'UF Backwash Alkali Dosing Pump',kw:0.55,qty:1,hoursDay:0.5,enabled:true},
  {id:15,name:'Non-oxidizing Bactericide Dosing',kw:0.25,qty:1,hoursDay:22,enabled:true},
  {id:16,name:'Scale Inhibitor Dosing Pump',kw:0.25,qty:1,hoursDay:22,enabled:true},
  {id:17,name:'Reducing Agent Dosing Pump',kw:0.25,qty:1,hoursDay:22,enabled:true},
  {id:18,name:'Reducing Agent Mixer',kw:0.75,qty:1,hoursDay:22,enabled:true},
];

// ────── Defaults ──────
const DEFAULT_SOURCES = [
  {id:1,name:'RIL Main Feed',flow:200,ratio:100,tds:1018,enabled:true,costWater:5,costElec:0,costChem:0,costOps:0},
  {id:2,name:'แหล่งน้ำ B',flow:0,ratio:0,tds:800,enabled:false,costWater:8,costElec:0,costChem:0,costOps:0},
  {id:3,name:'แหล่งน้ำ C',flow:0,ratio:0,tds:600,enabled:false,costWater:3,costElec:0,costChem:0,costOps:0},
  {id:4,name:'แหล่งน้ำ D',flow:0,ratio:0,tds:400,enabled:false,costWater:12,costElec:0,costChem:0,costOps:0},
  {id:5,name:'แหล่งน้ำ E',flow:0,ratio:0,tds:1200,enabled:false,costWater:2,costElec:0,costChem:0,costOps:0},
];
const DEFAULT_DILUTION = [
  {id:1,name:'น้ำคลอง A',flow:0,conductivity:500,enabled:false,costWater:0,costElec:0,costChem:0,costOps:0},
  {id:2,name:'น้ำคลอง B',flow:0,conductivity:300,enabled:false,costWater:0,costElec:0,costChem:0,costOps:0},
  {id:3,name:'น้ำประปา',flow:0,conductivity:200,enabled:false,costWater:0,costElec:0,costChem:0,costOps:0},
  {id:4,name:'น้ำบาดาล',flow:0,conductivity:400,enabled:false,costWater:0,costElec:0,costChem:0,costOps:0},
  {id:5,name:'น้ำ Recycle',flow:0,conductivity:600,enabled:false,costWater:0,costElec:0,costChem:0,costOps:0},
];

const DEFAULT_CHEMICALS = [
  {id:1,name:'HCl',system:'RO',service:'pH adjust / acid wash',kgEvent:41.07,dosageKgM3:0.0086,unitPrice:40,enabled:true},
  {id:2,name:'NaOH',system:'UF/RO',service:'alkali wash',kgEvent:23.47,dosageKgM3:0.0049,unitPrice:100,enabled:true},
  {id:3,name:'NaClO',system:'UF',service:'UF disinfection / CEB',kgEvent:41.95,dosageKgM3:0.0087,unitPrice:4.6,enabled:true},
  {id:4,name:'EDTA',system:'UF/RO',service:'UF/RO chemical cleaning',kgEvent:0.34,dosageKgM3:0.0001,unitPrice:300,enabled:true},
  {id:5,name:'NaHSO3',system:'RO',service:'chlorine reducing agent',kgEvent:16.53,dosageKgM3:0.0034,unitPrice:80,enabled:true},
  {id:6,name:'Antiscalant',system:'RO',service:'RO scale inhibitor',kgEvent:8.1,dosageKgM3:0.0017,unitPrice:250,enabled:true},
];

const DEFAULT_CLEANING_EVENTS = [
  {id:1,name:'UF Online Chemical Cleaning',kw:18.5,qty:1,hoursEvent:1,intervalDays:7,enabled:true},
  {id:2,name:'RO CIP / Reverse Osmosis Cleaning',kw:18.5,qty:1,hoursEvent:3,intervalDays:60,enabled:true},
];

const COST_GROUPS = [
  {id:'group_uf_ro_plan_A',label:'ระบบ UFRO / Plan A',size:'large',basis:'Plan A product'},
  {id:'group_tss',label:'ระบบ TSS',size:'large',basis:'TSS treated flow'},
  {id:'group_water_treatment_system_after_ufro',label:'ระบบบำบัดหลัง UFRO',size:'large',basis:'Treated reject flow'},
  {id:'group_final_from_p15',label:'Final from P1.5',size:'large',basis:'Final P1.5 product'},
  {id:'group_p15_plan_B',label:'P1.5 Plan B',size:'small',basis:'Plan B product'},
  {id:'group_p15_plan_C',label:'P1.5 Plan C',size:'small',basis:'Plan C product'},
];

const DEFAULT_GROUP_MACHINES = COST_GROUPS.filter(group=>group.id!=='group_uf_ro_plan_A').map((group,idx)=>({
  id:idx+1,groupId:group.id,name:'New Machine',kw:0,qty:1,hoursDay:0,enabled:true,
}));

const DEFAULT_GROUP_CHEMICALS = COST_GROUPS.filter(group=>group.id!=='group_uf_ro_plan_A').map((group,idx)=>({
  id:idx+1,groupId:group.id,name:'New Chemical',dosageKgM3:0,unitPrice:0,enabled:true,
}));

const PHASE15_ROUTES = {
  C: {label:'Plan 1.5 C',short:'C',desc:'Mixed feed bypasses treatment and goes directly to final tank.'},
  B: {label:'Plan 1.5 B',short:'B',desc:'Mixed feed passes TSS treatment, then bypasses UF/RO to final tank.'},
  A: {label:'Plan 1.5 A',short:'A',desc:'Mixed feed passes TSS treatment, then UF/RO before final tank.'},
};

// ══════════════ MAIN ══════════════
export default function UFROCalculator() {
  const [activeTab, setActiveTab] = useState('phase15');
  const [phase15Routes, setPhase15Routes] = useState({A:true,B:false,C:false});
  const [phase15RouteRatios, setPhase15RouteRatios] = useState({A:100,B:0,C:0});
  const [phase15RouteInputMode, setPhase15RouteInputMode] = useState('percent');
  const [phase15RouteAutoNote, setPhase15RouteAutoNote] = useState('');
  const [mode, setMode] = useState('know-output');
  const [strategy, setStrategy] = useState('optimize');
  const [timeUnit, setTimeUnit] = useState('hourly');
  const [opsHours, setOpsHours] = useState(22);
  const [sources, setSources] = useState(DEFAULT_SOURCES.map(s=>({...s})));
  const [manualSourceRatios, setManualSourceRatios] = useState(()=>Object.fromEntries(DEFAULT_SOURCES.map(s=>[s.id,s.ratio])));
  const [hasTargetCond, setHasTargetCond] = useState(true);
  const [targetCond, setTargetCond] = useState(636);
  const [roPermCondLimit, setRoPermCondLimit] = useState(50);
  const [productFlow, setProductFlow] = useState(146);
  const [ufReject, setUfReject] = useState(10);
  const [roReject, setRoReject] = useState(25);
  const [roSaltRejection, setRoSaltRejection] = useState(96.56);
  const [tssReject, setTssReject] = useState(10);
  const [sludgeWaterRecovery, setSludgeWaterRecovery] = useState(70);
  const [splitMode, setSplitMode] = useState('auto');
  const [manualToRO, setManualToRO] = useState(75);
  const [finalToRilPct, setFinalToRilPct] = useState(100);
  const [treatedToWastePct, setTreatedToWastePct] = useState(100);
  const [phase10ToSalePct, setPhase10ToSalePct] = useState(100);
  const [phase10HasTargetCond, setPhase10HasTargetCond] = useState(true);
  const [phase10TargetCond, setPhase10TargetCond] = useState(600);
  const [phase10HasTargetFlow, setPhase10HasTargetFlow] = useState(true);
  const [phase10TargetFlow, setPhase10TargetFlow] = useState(180);
  const [dilutionMode, setDilutionMode] = useState('auto');
  const [dilutionSources, setDilutionSources] = useState(DEFAULT_DILUTION.map(s=>({...s})));
  const [showDilutionSim, setShowDilutionSim] = useState(false);
  const [safetyMargin, setSafetyMargin] = useState(10);
  const [recTab, setRecTab] = useState('status');

  // Cost: TOU electricity (Section C)
  const [peakRate, setPeakRate] = useState(5.7982);
  const [offPeakRate, setOffPeakRate] = useState(2.396);
  const [ftCharge, setFtCharge] = useState(-0.0039);
  const [peakHoursDay, setPeakHoursDay] = useState(13);
  const [offPeakHoursDay, setOffPeakHoursDay] = useState(9);
  // Equipment table (Section B)
  const [equipments, setEquipments] = useState(PDF_EQUIPMENT_PRESET.map(e=>({...e})));
  const [cleaningEvents, setCleaningEvents] = useState(DEFAULT_CLEANING_EVENTS.map(e=>({...e})));
  const [chemicalRows, setChemicalRows] = useState(DEFAULT_CHEMICALS.map(e=>({...e})));
  const [groupMachines, setGroupMachines] = useState(DEFAULT_GROUP_MACHINES.map(e=>({...e})));
  const [groupChemicals, setGroupChemicals] = useState(DEFAULT_GROUP_CHEMICALS.map(e=>({...e})));
  const [costGroupTab, setCostGroupTab] = useState('group_uf_ro_plan_A');
  // Operation cost
  const [staffCount, setStaffCount] = useState(3);
  const [staffSalary, setStaffSalary] = useState(15000);

  const [sec, setSec] = useState({
    sources:true,target:true,split:true,membrane:false,opsTime:true,
    kpi:true,discharge:true,diagram:true,dilution:false,dashboard:false,
    waterControl:true,loss:false,analysis:false,stream:false,cost:true,costElec:true,costChem:true,costOps:true,costGroups:true,
  });
  const toggle = (k) => setSec(p=>({...p,[k]:!p[k]}));

  const diagramRef = useRef(null);
  const fullscreenDiagramRef = useRef(null);
  const [diagramFullscreen, setDiagramFullscreen] = useState(false);
  const [diagramZoom, setDiagramZoom] = useState(1);
  const targetTDS = hasTargetCond ? cond2tds(targetCond) : null;
  const manualBypass = 100 - manualToRO;
  const adjustDiagramZoom = (delta) => setDiagramZoom(z => clampDiagramZoom(z + delta));
  const resetDiagramZoom = () => setDiagramZoom(1);

  useEffect(() => {
    if (!diagramFullscreen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setDiagramFullscreen(false);
      if (e.key === '+' || e.key === '=') setDiagramZoom(z => clampDiagramZoom(z + 0.1));
      if (e.key === '-') setDiagramZoom(z => clampDiagramZoom(z - 0.1));
      if (e.key === '0') setDiagramZoom(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [diagramFullscreen]);
  const routeIds = ['A','B','C'];
  const normalizeRouteRatios = (ratios, routes = phase15Routes) => {
    const active = routeIds.filter(id => routes[id]);
    const next = {...ratios};
    routeIds.forEach(id => { if (!routes[id]) next[id] = 0; });
    if (!active.length) return next;
    const sum = active.reduce((s,id)=>s+Math.max(0,toNumber(next[id])),0);
    if (sum <= 0) {
      const equal = 100 / active.length;
      active.forEach(id => { next[id] = equal; });
    } else {
      active.forEach(id => { next[id] = Math.max(0,toNumber(next[id])) / sum * 100; });
    }
    const rounded = {...next};
    active.forEach(id => { rounded[id] = Math.round(rounded[id] * 10) / 10; });
    const partial = active.slice(0,-1).reduce((s,id)=>s+rounded[id],0);
    rounded[active[active.length-1]] = Math.max(0, Math.round((100 - partial) * 10) / 10);
    routeIds.forEach(id => { if (!routes[id]) rounded[id] = 0; });
    return rounded;
  };
  const distributeRoutePercent = (id, value, ratios = phase15RouteRatios, routes = phase15Routes) => {
    const active = routeIds.filter(rid => routes[rid]);
    if (!routes[id]) return normalizeRouteRatios(ratios, routes);
    if (active.length === 1) return normalizeRouteRatios({...ratios,[id]:100}, routes);
    const pct = Math.max(0, Math.min(100, toNumber(value)));
    const others = active.filter(rid => rid !== id);
    const otherSum = others.reduce((s,rid)=>s+Math.max(0,toNumber(ratios[rid])),0);
    const remaining = Math.max(0, 100 - pct);
    const next = {...ratios,[id]:pct};
    others.forEach(rid => { next[rid] = otherSum > 0 ? Math.max(0,toNumber(ratios[rid])) / otherSum * remaining : remaining / others.length; });
    return normalizeRouteRatios(next, routes);
  };
  const togglePhase15Route = (id) => {
    const enabling = !phase15Routes[id];
    const nextRoutes={...phase15Routes,[id]:enabling};
    if(!Object.values(nextRoutes).some(Boolean)) nextRoutes[id]=true;
    setPhase15Routes(nextRoutes);
    setPhase15RouteRatios(prev => {
      if (enabling) {
        const activeBefore = routeIds.filter(rid => phase15Routes[rid]);
        const newActive = routeIds.filter(rid => nextRoutes[rid]);
        const next = {...prev};
        if (activeBefore.length === 1) {
          newActive.forEach(rid => { next[rid] = 100 / newActive.length; });
          return normalizeRouteRatios(next, nextRoutes);
        }
        next[id] = 0;
        return distributeRoutePercent(id, 100 / newActive.length, next, nextRoutes);
      }
      return normalizeRouteRatios({...prev,[id]:0}, nextRoutes);
    });
  };
  const updateRoutePercent = (id, value) => setPhase15RouteRatios(prev => distributeRoutePercent(id, value, prev, phase15Routes));
  const autoBlendPhase15Routes = () => {
    const selected = routeIds.filter(id => phase15Routes[id]);
    const feedTDS = toNumber(mixedFeed.tds);
    const target = hasTargetCond ? toNumber(targetTDS) : feedTDS;
    const capacity = Math.max(0, routeCapacityHourly);
    if (!selected.length || !feedTDS || !capacity) {
      setPhase15RouteAutoNote('Auto blend ต้องมีแผนที่เลือก, Feed และ Flow เป้าหมายก่อน');
      return;
    }

    const setSingleRoute = (id, note) => {
      setPhase15Routes({A:id==='A',B:id==='B',C:id==='C'});
      setPhase15RouteRatios({A:id==='A'?100:0,B:id==='B'?100:0,C:id==='C'?100:0});
      setPhase15RouteInputMode('percent');
      setPhase15RouteAutoNote(note);
    };

    if (!hasTargetCond || feedTDS <= target) {
      const preferred = selected.includes('C') ? 'C' : selected.includes('B') ? 'B' : 'A';
      setSingleRoute(preferred, `Auto blend: Cond น้ำเข้า ${Math.round(tds2cond(feedTDS)).toLocaleString()} µS/cm ผ่านเป้าหมาย จึงเลือก Plan ${preferred} 100%`);
      return;
    }

    if (!selected.includes('A')) {
      const next = {A:0,B:selected.includes('B')?100:0,C:selected.includes('C')&&!selected.includes('B')?100:0};
      setPhase15RouteRatios(next);
      setPhase15RouteInputMode('percent');
      setPhase15RouteAutoNote('Auto blend: แผนที่เลือกไม่มี Plan A จึงลด Cond ให้ถึงเป้าหมายไม่ได้');
      return;
    }

    const roR = (100 - toNumber(roReject)) / 100;
    const roPermTDS = feedTDS * (1 - toNumber(roSaltRejection) / 100);
    let planATDS = toNumber(calc?.routes?.A?.actualProductTDS);
    let noteExtra = '';
    if (!planATDS || planATDS >= target) {
      planATDS = roPermTDS;
      setSplitMode('manual');
      setManualToRO(100);
      noteExtra = ' · ปรับ UF Split เป็น RO 100% เพื่อให้ Plan A เป็นน้ำ Cond ต่ำสำหรับ blend';
    }

    if (target <= planATDS) {
      setSingleRoute('A', `Auto blend: Plan A ต่ำสุดประมาณ ${Math.round(tds2cond(planATDS)).toLocaleString()} µS/cm ยังสูงกว่าเป้าหมาย จึงเลือก Plan A 100%`);
      return;
    }

    const untreated = selected.filter(id => id !== 'A');
    if (!untreated.length) {
      setSingleRoute('A', 'Auto blend: เลือกเฉพาะ Plan A จึงตั้ง Plan A 100%');
      return;
    }

    const aShare = Math.max(0, Math.min(1, (feedTDS - target) / (feedTDS - planATDS)));
    const aPct = Math.round(aShare * 1000) / 10;
    const remainPct = Math.max(0, Math.round((100 - aPct) * 10) / 10);
    const currentUntreatedSum = untreated.reduce((sum,id)=>sum+Math.max(0,toNumber(phase15RouteRatios[id])),0);
    const next = {A:aPct,B:0,C:0};
    untreated.forEach(id => {
      next[id] = currentUntreatedSum > 0
        ? Math.round((Math.max(0,toNumber(phase15RouteRatios[id])) / currentUntreatedSum) * remainPct * 10) / 10
        : Math.round((remainPct / untreated.length) * 10) / 10;
    });
    const roundedSum = next.A + next.B + next.C;
    const last = untreated[untreated.length - 1] || 'A';
    next[last] = Math.max(0, Math.round((next[last] + (100 - roundedSum)) * 10) / 10);

    setPhase15RouteRatios(next);
    setPhase15RouteInputMode('percent');
    setPhase15RouteAutoNote(`Auto blend: Flow ${Math.round(vol(capacity)).toLocaleString()} ${volUnit}, Cond เป้าหมาย ${Math.round(targetCond).toLocaleString()} µS/cm -> A ${next.A.toFixed(1)}%, B ${next.B.toFixed(1)}%, C ${next.C.toFixed(1)}%${noteExtra}`);
  };
  const handleStrategyChange = (nextStrategy) => {
    setStrategy(nextStrategy);
    if (nextStrategy === 'manual') {
      setSources(prev => prev.map(s => ({...s, ratio: manualSourceRatios[s.id] ?? s.ratio})));
    }
  };

  const handleReset = () => {
    if (!window.confirm('รีเซ็ตค่าทั้งหมด?')) return;
    setActiveTab('phase15');setPhase15Routes({A:true,B:false,C:false});setPhase15RouteRatios({A:100,B:0,C:0});setPhase15RouteInputMode('percent');setPhase15RouteAutoNote('');setMode('know-output');setStrategy('optimize');setTimeUnit('hourly');setOpsHours(22);
    setSources(DEFAULT_SOURCES.map(s=>({...s})));setManualSourceRatios(Object.fromEntries(DEFAULT_SOURCES.map(s=>[s.id,s.ratio])));setHasTargetCond(true);setTargetCond(636);setRoPermCondLimit(50);setProductFlow(146);
    setUfReject(10);setRoReject(25);setRoSaltRejection(96.56);setTssReject(10);setSludgeWaterRecovery(70);setSplitMode('auto');setManualToRO(75);setFinalToRilPct(100);setTreatedToWastePct(100);setPhase10ToSalePct(100);
    setPhase10HasTargetCond(true);setPhase10TargetCond(600);setPhase10HasTargetFlow(true);setPhase10TargetFlow(180);
    setDilutionMode('auto');setDilutionSources(DEFAULT_DILUTION.map(s=>({...s})));
    setShowDilutionSim(false);setSafetyMargin(10);setRecTab('status');
    setPeakRate(5.7982);setOffPeakRate(2.396);setFtCharge(-0.0039);setPeakHoursDay(13);setOffPeakHoursDay(9);
    setEquipments(PDF_EQUIPMENT_PRESET.map(e=>({...e})));setCleaningEvents(DEFAULT_CLEANING_EVENTS.map(e=>({...e})));setChemicalRows(DEFAULT_CHEMICALS.map(e=>({...e})));
    setGroupMachines(DEFAULT_GROUP_MACHINES.map(e=>({...e})));setGroupChemicals(DEFAULT_GROUP_CHEMICALS.map(e=>({...e})));setCostGroupTab('group_uf_ro_plan_A');setStaffCount(3);setStaffSalary(15000);
    setSec({sources:true,target:true,split:true,membrane:false,opsTime:true,kpi:true,discharge:true,diagram:true,dilution:false,dashboard:false,waterControl:true,loss:false,analysis:false,stream:false,cost:true,costElec:true,costChem:true,costOps:true,costGroups:true});
  };

  // Source optimization
  useEffect(() => {
    if (mode!=='know-output'||strategy==='manual') return;
    const en=sources.filter(s=>s.enabled); if(!en.length) return;
    let nr;
    if (strategy==='equal') {const e=100/en.length;nr=en.map(s=>({id:s.id,ratio:e}));}
    else {const m=Math.min(...en.map(s=>s.tds));if(m<=targetTDS){const l=en.filter(s=>s.tds<=targetTDS);const e=100/l.length;nr=en.map(s=>({id:s.id,ratio:s.tds<=targetTDS?e:0}));}else{const w=en.map(s=>1/Math.max(s.tds,1));const sm=w.reduce((a,b)=>a+b,0);nr=en.map((s,i)=>({id:s.id,ratio:(w[i]/sm)*100}));}}
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSources(p=>{const u=p.map(s=>{const r=nr.find(x=>x.id===s.id);if(r&&Math.abs(toNumber(s.ratio)-r.ratio)>0.01)return{...s,ratio:Math.round(r.ratio*10)/10};return s;});return u.some((s,i)=>s.ratio!==p[i].ratio)?u:p;});
  }, [mode,strategy,sources.map(s=>`${s.id}-${s.enabled}-${s.tds}`).join(','),targetTDS]);

  // Mixed Feed
  const mixedFeed = useMemo(() => {
    const act=sources.filter(s=>s.enabled);
    if (mode==='know-input') {const tf=act.reduce((s,x)=>s+toNumber(x.flow),0);if(!tf)return{flow:0,tds:0,sources:[]};const tds=act.reduce((s,x)=>s+toNumber(x.flow)*toNumber(x.tds),0)/tf;return{flow:tf,tds,sources:act.map(s=>({...s,actualFlow:toNumber(s.flow),actualRatio:tf>0?(toNumber(s.flow)/tf)*100:0}))};}
    else {const us=act.filter(s=>toNumber(s.ratio)>0);const tr=us.reduce((s,x)=>s+toNumber(x.ratio),0);if(!tr)return{flow:0,tds:0,sources:act,totalRatio:0};const tds=us.reduce((s,x)=>s+toNumber(x.ratio)*toNumber(x.tds),0)/tr;return{flow:0,tds,sources:act,totalRatio:tr};}
  }, [sources, mode]);

  // Process Calc
  const baseCalc = useMemo(() => {
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
      let bR;
      if(!hasTargetCond){bR=1-(manualToRO/100);}
      else {
        bR=feedTDS>0&&(feedTDS-roPermTDS)!==0?(targetTDS-roPermTDS)/(feedTDS-roPermTDS):0;
        if(!feedTDS){blendValid=false;blendWarning='ยังไม่ได้กรอกแหล่งน้ำ';bR=0;}else if(feedTDS<=targetTDS){bypassRO=true;bR=1;}else if(targetTDS<roPermTDS){blendValid=false;blendWarning='เป้าหมาย Cond ต่ำกว่า RO permeate';bR=0;}else{bR=Math.max(0,Math.min(1,bR));}
      }
      if(mode==='know-output'){finalProduct=productFlow;ufBypass=bR*finalProduct;roOut=(1-bR)*finalProduct;roIn=roR>0?roOut/roR:0;roRejectFlow=roIn-roOut;ufOut=ufBypass+roIn;feedFlow=ufR>0?ufOut/ufR:0;ufRejectFlow=feedFlow-ufOut;totalReject=ufRejectFlow+roRejectFlow;}
      else{feedFlow=mixedFeed.flow;ufOut=feedFlow*ufR;ufRejectFlow=feedFlow-ufOut;const d=roR*bR+(1-bR);roIn=d>0?ufOut*(1-bR)/d:0;roOut=roR*roIn;ufBypass=ufOut-roIn;roRejectFlow=roIn-roOut;finalProduct=ufBypass+roOut;totalReject=ufRejectFlow+roRejectFlow;}
      actualProductTDS=bypassRO?feedTDS:(finalProduct>0?(ufBypass*feedTDS+roOut*roPermTDS)/finalProduct:0);
    }
    const overallRecovery=feedFlow>0?(finalProduct/feedFlow)*100:0;
    const tIn=feedFlow*feedTDS,tOut=finalProduct*actualProductTDS;
    const totalRejectTDS=totalReject>0?(tIn-tOut)/totalReject:0;
    const calcToRO=ufOut>0?(roIn/ufOut)*100:0,calcBypass=ufOut>0?(ufBypass/ufOut)*100:0;
    const sourceAllocations=mode==='know-output'&&mixedFeed.totalRatio>0
      ? mixedFeed.sources.map(s=>({...s,actualFlow:feedFlow*(toNumber(s.ratio)/mixedFeed.totalRatio),actualRatio:(toNumber(s.ratio)/mixedFeed.totalRatio)*100}))
      : mixedFeed.sources;
    const totV=validateDischarge(totalRejectTDS);
    const roPermCond = tds2cond(roPermTDS);
    return {feedFlow,ufOut,ufBypass,roIn,roOut,roRejectFlow,ufRejectFlow,totalReject,finalProduct,feedTDS,ufPermTDS:feedTDS,ufRejectTDS:feedTDS,roPermTDS,roRejectTDS,totalRejectTDS,actualProductTDS,overallRecovery,blendValid,blendWarning,bypassRO,sourceAllocations,totalRatio:mixedFeed.totalRatio||0,
      ufRejectStatus:validateDischarge(feedTDS).severityStatus,roRejectStatus:validateDischarge(roRejectTDS).severityStatus,totalRejectStatus:totV.severityStatus,totalRejectAllowed:totV.regulatoryAllowed,totalRejectMargin:totV.margin,targetTDS,hasTargetCond,calcToRO,calcBypass,productCondStatus:hasTargetCond&&tds2cond(actualProductTDS)>targetCond?'FAIL':'PASS',roPermCond,roPermCondLimit,roPermCondStatus:roPermCond<=roPermCondLimit?'PASS':'FAIL'};
  }, [mixedFeed,targetTDS,hasTargetCond,targetCond,roPermCondLimit,productFlow,ufReject,roReject,roSaltRejection,mode,splitMode,manualToRO]);
  void baseCalc;

  const calc = useMemo(() => {
    const active=['A','B','C'].filter(id=>phase15Routes[id]);
    const ratioSum=active.reduce((sum,id)=>sum+Math.max(0,toNumber(phase15RouteRatios[id])),0);
    const share=(id)=>phase15Routes[id]?(ratioSum>0?Math.max(0,toNumber(phase15RouteRatios[id]))/ratioSum:1/active.length):0;
    const feedTDS=mixedFeed.tds,roR=(100-roReject)/100,ufR=(100-ufReject)/100,rej=roSaltRejection/100,tssR=(100-tssReject)/100,sludgeWaterR=sludgeWaterRecovery/100;
    const roPermTDS=feedTDS*(1-rej),roRejectTDS=roR<1?(feedTDS-roR*roPermTDS)/(1-roR):feedTDS;
    const solveUfRoFromProduct=(prod)=>{
      let ufOut=0,ufBypass=0,roIn=0,roOut=0,roRejectFlow=0,ufRejectFlow=0,actualProductTDS=feedTDS,calcToRO=0,calcBypass=100,bypassRO=false,blendValid=true,blendWarning='';
      if(splitMode==='manual'){
        const toR=manualToRO/100,byP=1-toR,f=byP+toR*roR;
        ufOut=f>0?prod/f:0;ufRejectFlow=ufR>0?ufOut/ufR-ufOut:0;roIn=ufOut*toR;ufBypass=ufOut-roIn;roOut=roIn*roR;roRejectFlow=roIn-roOut;
      } else {
        let bR;
        if(!hasTargetCond){bR=1-(manualToRO/100);}
        else {
          bR=feedTDS>0&&(feedTDS-roPermTDS)!==0?(targetTDS-roPermTDS)/(feedTDS-roPermTDS):0;
          if(!feedTDS){blendValid=false;blendWarning='ยังไม่ได้กรอกแหล่งน้ำ';bR=0;}else if(feedTDS<=targetTDS){bypassRO=true;bR=1;}else if(targetTDS<roPermTDS){blendValid=false;blendWarning='เป้าหมาย Cond ต่ำกว่า RO permeate';bR=0;}else bR=Math.max(0,Math.min(1,bR));
        }
        ufBypass=bR*prod;roOut=(1-bR)*prod;roIn=roR>0?roOut/roR:0;roRejectFlow=roIn-roOut;ufOut=ufBypass+roIn;ufRejectFlow=ufR>0?ufOut/ufR-ufOut:0;
      }
      actualProductTDS=bypassRO?feedTDS:(prod>0?(ufBypass*feedTDS+roOut*roPermTDS)/prod:0);
      calcToRO=ufOut>0?(roIn/ufOut)*100:0;calcBypass=ufOut>0?(ufBypass/ufOut)*100:100;
      return{prod,product:prod,ufOut,ufBypass,roIn,roOut,roRejectFlow,ufRejectFlow,actualProductTDS,calcToRO,calcBypass,blendValid,blendWarning};
    };
    const solveUfRoFromFeed=(tssOut)=>{
      let ufOut=tssOut*ufR,ufBypass=0,roIn=0,roOut=0,roRejectFlow=0,ufRejectFlow=tssOut-ufOut,actualProductTDS=feedTDS,calcToRO=0,calcBypass=100,bypassRO=false,blendValid=true,blendWarning='';
      if(splitMode==='manual'){roIn=ufOut*(manualToRO/100);ufBypass=ufOut-roIn;roOut=roIn*roR;roRejectFlow=roIn-roOut;}
      else{
        let bR;
        if(!hasTargetCond){bR=1-(manualToRO/100);}
        else {
          bR=feedTDS>0&&(feedTDS-roPermTDS)!==0?(targetTDS-roPermTDS)/(feedTDS-roPermTDS):0;
          if(!feedTDS){blendValid=false;blendWarning='ยังไม่ได้กรอกแหล่งน้ำ';bR=0;}else if(feedTDS<=targetTDS){bypassRO=true;bR=1;}else if(targetTDS<roPermTDS){blendValid=false;blendWarning='เป้าหมาย Cond ต่ำกว่า RO permeate';bR=0;}else bR=Math.max(0,Math.min(1,bR));
        }
        const d=roR*bR+(1-bR);roIn=d>0?ufOut*(1-bR)/d:0;roOut=roR*roIn;ufBypass=ufOut-roIn;roRejectFlow=roIn-roOut;
      }
      const prod=ufBypass+roOut;actualProductTDS=bypassRO?feedTDS:(prod>0?(ufBypass*feedTDS+roOut*roPermTDS)/prod:0);
      calcToRO=ufOut>0?(roIn/ufOut)*100:0;calcBypass=ufOut>0?(ufBypass/ufOut)*100:100;
      return{prod,product:prod,ufOut,ufBypass,roIn,roOut,roRejectFlow,ufRejectFlow,actualProductTDS,calcToRO,calcBypass,blendValid,blendWarning};
    };

    const branch={A:{enabled:phase15Routes.A,share:share('A')},B:{enabled:phase15Routes.B,share:share('B')},C:{enabled:phase15Routes.C,share:share('C')}};
    if(mode==='know-output'){
      branch.C.product=productFlow*branch.C.share;branch.C.feedFlow=branch.C.product;
      branch.B.product=productFlow*branch.B.share;branch.B.feedFlow=tssR>0?branch.B.product/tssR:0;branch.B.tssOutFlow=branch.B.product;branch.B.tssRejectFlow=branch.B.feedFlow-branch.B.tssOutFlow;
      branch.A.product=productFlow*branch.A.share;const aUF=solveUfRoFromProduct(branch.A.product);Object.assign(branch.A,aUF);branch.A.tssOutFlow=ufR>0?branch.A.ufOut/ufR:0;branch.A.feedFlow=tssR>0?branch.A.tssOutFlow/tssR:0;branch.A.tssRejectFlow=branch.A.feedFlow-branch.A.tssOutFlow;
    } else {
      branch.C.feedFlow=mixedFeed.flow*branch.C.share;branch.C.product=branch.C.feedFlow;
      branch.B.feedFlow=mixedFeed.flow*branch.B.share;branch.B.tssOutFlow=branch.B.feedFlow*tssR;branch.B.product=branch.B.tssOutFlow;branch.B.tssRejectFlow=branch.B.feedFlow-branch.B.tssOutFlow;
      branch.A.feedFlow=mixedFeed.flow*branch.A.share;branch.A.tssOutFlow=branch.A.feedFlow*tssR;branch.A.tssRejectFlow=branch.A.feedFlow-branch.A.tssOutFlow;Object.assign(branch.A,solveUfRoFromFeed(branch.A.tssOutFlow));
    }
    ['A','B','C'].forEach(id=>{const b=branch[id];b.feedFlow=b.enabled?toNumber(b.feedFlow):0;b.product=b.enabled?toNumber(b.product):0;b.tssOutFlow=toNumber(b.tssOutFlow);b.tssRejectFlow=toNumber(b.tssRejectFlow);b.sludgeWaterRecycle=b.tssRejectFlow*sludgeWaterR;b.sludgeWasteFlow=b.tssRejectFlow*(1-sludgeWaterR);});
    const feedFlow=branch.A.feedFlow+branch.B.feedFlow+branch.C.feedFlow;
    const tssOutFlow=branch.A.tssOutFlow+branch.B.tssOutFlow;
    const tssRejectFlow=branch.A.tssRejectFlow+branch.B.tssRejectFlow;
    const sludgeWaterRecycle=branch.A.sludgeWaterRecycle+branch.B.sludgeWaterRecycle;
    const sludgeWasteFlow=branch.A.sludgeWasteFlow+branch.B.sludgeWasteFlow;
    const ufOut=toNumber(branch.A.ufOut),ufBypass=toNumber(branch.A.ufBypass),roIn=toNumber(branch.A.roIn),roOut=toNumber(branch.A.roOut),ufRejectFlow=toNumber(branch.A.ufRejectFlow),roRejectFlow=toNumber(branch.A.roRejectFlow);
    const planAProduct=branch.A.enabled?(toNumber(branch.A.product)>0?toNumber(branch.A.product):ufBypass+roOut):0;
    branch.A.product=planAProduct;
    const finalProduct=planAProduct+branch.B.product+branch.C.product;
    const productLoad=planAProduct*toNumber(branch.A.actualProductTDS)+branch.B.product*feedTDS+branch.C.product*feedTDS;
    const actualProductTDS=finalProduct>0?productLoad/finalProduct:0;
    const totalReject=tssRejectFlow+ufRejectFlow+roRejectFlow;
    const totalRejectTDS=totalReject>0?Math.max(0,(feedFlow*feedTDS-productLoad)/totalReject):0;
    const sourceAllocations=mode==='know-output'&&mixedFeed.totalRatio>0
      ? mixedFeed.sources.map(s=>({...s,actualFlow:feedFlow*(toNumber(s.ratio)/mixedFeed.totalRatio),actualRatio:(toNumber(s.ratio)/mixedFeed.totalRatio)*100}))
      : mixedFeed.sources.map(s=>({...s,actualFlow:s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow)}));
    const totV=validateDischarge(totalRejectTDS),roPermCond=tds2cond(roPermTDS);
    return {route:active.join('+'),routes:branch,routeShares:{A:share('A'),B:share('B'),C:share('C')},tssEnabled:branch.A.enabled||branch.B.enabled,ufroEnabled:branch.A.enabled,feedFlow,tssOutFlow,tssRejectFlow,sludgeWaterRecycle,sludgeWasteFlow,ufOut,ufBypass,roIn,roOut,roRejectFlow,ufRejectFlow,totalReject,finalProduct,feedTDS,ufPermTDS:feedTDS,ufRejectTDS:feedTDS,tssRejectTDS:feedTDS,roPermTDS,roRejectTDS,totalRejectTDS,actualProductTDS,overallRecovery:feedFlow>0?(finalProduct/feedFlow)*100:0,blendValid:branch.A.blendValid!==false,blendWarning:branch.A.blendWarning||'',sourceAllocations,totalRatio:mixedFeed.totalRatio||0,
      tssRejectStatus:validateDischarge(feedTDS).severityStatus,ufRejectStatus:validateDischarge(feedTDS).severityStatus,roRejectStatus:validateDischarge(roRejectTDS).severityStatus,totalRejectStatus:totV.severityStatus,totalRejectAllowed:totV.regulatoryAllowed,totalRejectMargin:totV.margin,targetTDS,hasTargetCond,calcToRO:toNumber(branch.A.calcToRO),calcBypass:toNumber(branch.A.calcBypass),productCondStatus:hasTargetCond&&tds2cond(actualProductTDS)>targetCond?'FAIL':'PASS',roPermCond,roPermCondLimit,roPermCondStatus:branch.A.enabled?(roPermCond<=roPermCondLimit?'PASS':'FAIL'):'PASS'};
  }, [mixedFeed,phase15Routes,phase15RouteRatios,mode,productFlow,tssReject,sludgeWaterRecovery,ufReject,roReject,roSaltRejection,splitMode,manualToRO,targetTDS,hasTargetCond,targetCond,roPermCondLimit]);

  // IMPORTANT MASS BALANCE LOGIC:
  // Final Discharge Flow = Total Reject Flow + Sum(Dilution Source Flows)
  // Final Discharge Conductivity must be calculated using flow-weighted average.
  // Do NOT ignore individual dilution source flows.
  const dilution = useMemo(() => {
    const rejectFails=!calc.totalRejectAllowed;if(!rejectFails&&!showDilutionSim)return{needed:false,rejectFails:false};
    const Qr=calc.totalReject,Cr=tds2cond(calc.totalRejectTDS),Ct=REJECT_COND_LIMIT*(1-safetyMargin/100);
    if(dilutionMode==='auto'){
      const activeSrc=dilutionSources.filter(s=>s.enabled);
      const Cd=activeSrc.length>0?activeSrc.reduce((s,x)=>s+toNumber(x.conductivity),0)/activeSrc.length:500;
      const srcName=activeSrc.length===0?'น้ำผสม':activeSrc.length===1?activeSrc[0].name:`${activeSrc.length} sources`;
      if(Cd>=Ct)return{needed:true,rejectFails,autoMode:true,cannotSolve:true,Cd,Cr,Qr,Ct,msg:'Cond น้ำผสมสูงเกิน',activeSrc};
      if(Cr<=Ct){return{needed:true,rejectFails,autoMode:true,cannotSolve:false,QdReq:0,Cd,Cr,Qr,Ct,finalFlow:Qr,finalCond:Cr,finalTDS:cond2tds(Cr),finalStatus:getRejectStatus(cond2tds(Cr)),finalV:validateDischarge(cond2tds(Cr)),srcName,activeSrc,
        // IMPORTANT ENGINEERING DISPLAY: individual source flows
        sourceFlows:activeSrc.map(s=>({...s,actualFlow:0}))};}
      const QdReq=Qr*(Cr-Ct)/(Ct-Cd);const fF=Qr+QdReq;const fC=(Qr*Cr+QdReq*Cd)/fF;const fT=cond2tds(fC);const fV=validateDischarge(fT);
      // Each source gets equal share of required dilution flow
      const perSrc=activeSrc.length>0?QdReq/activeSrc.length:QdReq;
      const sourceFlows=activeSrc.map(s=>({...s,actualFlow:perSrc}));
      return{needed:true,rejectFails,autoMode:true,cannotSolve:false,QdReq,Cd,Cr,Qr,Ct,finalFlow:fF,finalCond:fC,finalTDS:fT,finalStatus:fV.severityStatus,finalAllowed:fV.regulatoryAllowed,finalV:fV,srcName,activeSrc,sourceFlows};
    } else {
      const act=dilutionSources.filter(s=>s.enabled&&toNumber(s.flow)>0);
      const dF=act.reduce((s,x)=>s+toNumber(x.flow),0);const dL=act.reduce((s,x)=>s+toNumber(x.flow)*toNumber(x.conductivity),0);
      const fF=Qr+dF;const fC=fF>0?(Qr*Cr+dL)/fF:Cr;const fT=cond2tds(fC);const fV=validateDischarge(fT);
      const sourceFlows=act.map(s=>({...s,actualFlow:toNumber(s.flow)}));
      return{needed:true,rejectFails,autoMode:false,cannotSolve:false,dilFlow:dF,finalFlow:fF,finalCond:fC,finalTDS:fT,finalStatus:fV.severityStatus,finalAllowed:fV.regulatoryAllowed,finalV:fV,Cr,Qr,sources:act,sourceFlows};
    }
  }, [calc,dilutionSources,dilutionMode,showDilutionSim,safetyMargin]);

  const finalDischargeV = useMemo(()=>{if(dilution.needed&&dilution.rejectFails&&!dilution.cannotSolve&&dilution.finalV)return dilution.finalV;return validateDischarge(calc.totalRejectTDS);},[calc,dilution]);
  const finalAllowed=finalDischargeV.regulatoryAllowed,finalSeverity=finalDischargeV.severityStatus,finalMargin=finalDischargeV.margin;
  const waterControl = useMemo(() => {
    const pct = (n) => Math.max(0, Math.min(100, toNumber(n)));
    const ufToRO = splitMode === 'manual' ? pct(manualToRO) : pct(calc.calcToRO);
    const finalToRil = pct(finalToRilPct);
    const treatedToWaste = pct(treatedToWastePct);
    const rejectCond = tds2cond(calc.totalRejectTDS);
    const rejectNeedsMix = rejectCond > REJECT_COND_LIMIT;
    const treatedFlow = rejectNeedsMix ? (dilution?.finalFlow ?? calc.totalReject) : calc.totalReject;
    return {
      ufToRO,
      ufToBypass: 100 - ufToRO,
      finalToRil,
      finalToP10: 100 - finalToRil,
      treatedToWaste,
      treatedToReturn: 100 - treatedToWaste,
      roFeedFlow: calc.roIn,
      bypassFlow: calc.ufBypass,
      sendRilFlow: calc.finalProduct * finalToRil / 100,
      sendP10Flow: calc.finalProduct * (100 - finalToRil) / 100,
      treatedFlow,
      wastewaterFlow: treatedFlow * treatedToWaste / 100,
      returnFlow: treatedFlow * (100 - treatedToWaste) / 100,
      rejectCond,
      rejectNeedsMix,
      rejectRoute: rejectNeedsMix ? 'MIX REQUIRED' : 'DIRECT OK',
      ufControlMode: splitMode === 'manual' ? 'manual' : 'auto',
    };
  }, [calc, dilution, splitMode, manualToRO, finalToRilPct, treatedToWastePct]);
  const phase10Calc = useMemo(() => {
    const processRecovery = 1 - Math.max(0, Math.min(0.95, toNumber(tssReject) / 100));
    const targetProductFlow = phase10HasTargetFlow ? phase10TargetFlow : 0;
    const feedFlow = mode==='know-output'
      ? (phase10HasTargetFlow && processRecovery > 0 ? targetProductFlow / processRecovery : 0)
      : mixedFeed.flow;
    const feedTDS = mixedFeed.tds;
    const rejectFrac = 1 - processRecovery;
    const returnFrac = Math.max(0, Math.min(1, toNumber(sludgeWaterRecovery) / 100));
    const processOut = feedFlow * (1 - rejectFrac);
    const rejectFlow = feedFlow * rejectFrac;
    const sludgeWaterReturn = rejectFlow * returnFrac;
    const sludgeWaste = rejectFlow * (1 - returnFrac);
    const salePct = Math.max(0, Math.min(100, toNumber(phase10ToSalePct)));
    const sourceAllocations = mode==='know-output'&&mixedFeed.totalRatio>0
      ? mixedFeed.sources.map(s=>({...s,actualFlow:feedFlow*(toNumber(s.ratio)/mixedFeed.totalRatio),actualRatio:(toNumber(s.ratio)/mixedFeed.totalRatio)*100}))
      : mixedFeed.sources;
    return {
      feedFlow,
      feedTDS,
      processOut,
      rejectFlow,
      sludgeWaterReturn,
      sludgeWaste,
      salePct,
      toSaleFlow: processOut * salePct / 100,
      toPhase15Flow: processOut * (100 - salePct) / 100,
      recovery: feedFlow > 0 ? processOut / feedFlow * 100 : 0,
      targetCondStatus: !phase10HasTargetCond ? 'OFF' : tds2cond(feedTDS) <= phase10TargetCond ? 'PASS' : 'FAIL',
      targetFlowStatus: !phase10HasTargetFlow ? 'OFF' : processOut >= targetProductFlow ? 'PASS' : 'FAIL',
      sourceAllocations,
    };
  }, [mixedFeed,tssReject,sludgeWaterRecovery,phase10ToSalePct,phase10HasTargetCond,phase10TargetCond,phase10HasTargetFlow,phase10TargetFlow,mode]);
  const recommendations=useMemo(()=>getRecommendations(calc,splitMode),[calc,splitMode]);

  // ══════ ELECTRICITY COST CALC (Equipment Table + TOU) ══════
  const elecCalc = useMemo(() => {
    const prodFlow=calc.finalProduct;const feedFlow=calc.feedFlow;
    const prodVolDay=prodFlow*opsHours;const feedVolDay=feedFlow*opsHours;
    // Equipment daily kWh
    const eqRows = equipments.filter(e=>e.enabled&&(calc.ufroEnabled||!/UF|RO|Osmosis|High-pressure|Booster|Backwash|Flushing|Chemical Cleaning|Dosing|Scale|Reducing|Bactericide/i.test(e.name))).map(e => {
      const dailyKwh = toNumber(e.kw) * toNumber(e.qty) * toNumber(e.hoursDay);
      return { ...e, dailyKwh };
    });
    const regularDailyKwh = eqRows.reduce((s,e)=>s+e.dailyKwh,0);
    // TOU split
    const touTotal = toNumber(peakHoursDay)+toNumber(offPeakHoursDay);
    const peakFrac = touTotal>0?toNumber(peakHoursDay)/touTotal:0.5;
    const offPeakFrac = 1-peakFrac;
    const peakKwh = regularDailyKwh * peakFrac;
    const offPeakKwh = regularDailyKwh * offPeakFrac;
    const peakCostKwh = toNumber(peakRate)+toNumber(ftCharge);
    const offPeakCostKwh = toNumber(offPeakRate)+toNumber(ftCharge);
    const peakCost = peakKwh * peakCostKwh;
    const offPeakCost = offPeakKwh * offPeakCostKwh;
    const regularElecCostDay = peakCost + offPeakCost;
    const avgCostKwh = peakFrac*peakCostKwh + offPeakFrac*offPeakCostKwh;
    const cleaningRows = (calc.ufroEnabled?cleaningEvents.filter(e=>e.enabled):[]).map(e => {
      const eventKwh = toNumber(e.kw) * toNumber(e.qty) * toNumber(e.hoursEvent);
      const intervalDays = Math.max(1,toNumber(e.intervalDays));
      const eventCost = eventKwh * avgCostKwh;
      const periodQ = prodVolDay * intervalDays;
      const costPerM3 = periodQ>0?eventCost/periodQ:0;
      const dailyCostEq = eventCost/intervalDays;
      const dailyKwhEq = eventKwh/intervalDays;
      return {...e,eventKwh,eventCost,intervalDays,periodQ,costPerM3,dailyCostEq,dailyKwhEq};
    });
    const cleaningCostDayEq = cleaningRows.reduce((s,e)=>s+e.dailyCostEq,0);
    const cleaningKwhDayEq = cleaningRows.reduce((s,e)=>s+e.dailyKwhEq,0);
    const totalElecCostDay = regularElecCostDay + cleaningCostDayEq;
    const totalDailyKwh = regularDailyKwh + cleaningKwhDayEq;
    const elecPerM3Prod = prodVolDay>0?totalElecCostDay/prodVolDay:0;
    const elecPerM3Feed = feedVolDay>0?totalElecCostDay/feedVolDay:0;
    const secActual = feedVolDay>0?totalDailyKwh/feedVolDay:0;
    // Per-equipment cost
    const eqWithCost = eqRows.map(e => {
      const eqPeakKwh=e.dailyKwh*peakFrac;const eqOffPeakKwh=e.dailyKwh*offPeakFrac;
      const eqCostDay=eqPeakKwh*peakCostKwh+eqOffPeakKwh*offPeakCostKwh;
      const eqCostPerM3=prodVolDay>0?eqCostDay/prodVolDay:0;
      const pctTotal=regularElecCostDay>0?(eqCostDay/regularElecCostDay)*100:0;
      return{...e,eqCostDay,eqCostPerM3,pctTotal};
    });
    return{eqWithCost,cleaningRows,regularDailyKwh,totalDailyKwh,cleaningKwhDayEq,cleaningCostDayEq,peakKwh,offPeakKwh,peakCost,offPeakCost,regularElecCostDay,totalElecCostDay,elecPerM3Prod,elecPerM3Feed,secActual,peakCostKwh,offPeakCostKwh,avgCostKwh,prodVolDay,feedVolDay,prodVolWeek:prodVolDay*7,prodVolTwoMonths:prodVolDay*60};
  }, [equipments,cleaningEvents,peakRate,offPeakRate,ftCharge,peakHoursDay,offPeakHoursDay,calc,opsHours]);

  const chemCalc = useMemo(() => {
    if(!calc.ufroEnabled)return {rows:[],ufCleanings:0,roCleanings:0,prodVolTwoMonths:calc.finalProduct*opsHours*60,ufPeriodCost:0,roPeriodCost:0,chemPeriodCost:0,chemCostPerM3Prod:0,chemCostDay:0};
    const prodVolTwoMonths=calc.finalProduct*opsHours*60;
    const ufCleanings=8;
    const roCleanings=1;
    const rows=chemicalRows.filter(c=>c.enabled).map(c=>{
      const system=c.system||'RO';
      const kgEvent=toNumber(c.kgEvent);
      const costEvent=kgEvent*toNumber(c.unitPrice);
      const ufUses=system.includes('UF')?ufCleanings:0;
      const roUses=system.includes('RO')?roCleanings:0;
      const ufCost=costEvent*ufUses;
      const roCost=costEvent*roUses;
      const periodCost=ufCost+roCost;
      const costPerM3=prodVolTwoMonths>0?periodCost/prodVolTwoMonths:0;
      return {...c,system,kgEvent,costEvent,ufUses,roUses,ufCost,roCost,periodCost,costPerM3};
    });
    const ufPeriodCost=rows.reduce((s,c)=>s+c.ufCost,0);
    const roPeriodCost=rows.reduce((s,c)=>s+c.roCost,0);
    const chemPeriodCost=ufPeriodCost+roPeriodCost;
    const chemCostPerM3Prod=prodVolTwoMonths>0?chemPeriodCost/prodVolTwoMonths:0;
    const chemCostDay=chemPeriodCost/60;
    return {rows,ufCleanings,roCleanings,prodVolTwoMonths,ufPeriodCost,roPeriodCost,chemPeriodCost,chemCostPerM3Prod,chemCostDay};
  }, [chemicalRows,calc,opsHours]);

  const groupFlowBasis = useMemo(() => ({
    group_tss: calc.tssOutFlow,
    group_uf_ro_plan_A: calc.routes?.A?.product || 0,
    group_water_treatment_system_after_ufro: waterControl.treatedFlow,
    group_final_from_p15: calc.finalProduct,
    group_p15_plan_B: calc.routes?.B?.product || 0,
    group_p15_plan_C: calc.routes?.C?.product || 0,
  }), [calc, waterControl]);

  const groupCostCalc = useMemo(() => {
    const touTotal = toNumber(peakHoursDay) + toNumber(offPeakHoursDay);
    const peakFrac = touTotal > 0 ? toNumber(peakHoursDay) / touTotal : 0.5;
    const avgCostKwh = peakFrac * (toNumber(peakRate) + toNumber(ftCharge)) + (1 - peakFrac) * (toNumber(offPeakRate) + toNumber(ftCharge));
    const rows = COST_GROUPS.filter(group=>group.id!=='group_uf_ro_plan_A').map(group => {
      const hourlyFlow = toNumber(groupFlowBasis[group.id]);
      const volumeDay = hourlyFlow * opsHours;
      const machines = groupMachines.filter(row => row.groupId === group.id && row.enabled).map(row => {
        const dailyKwh = toNumber(row.kw) * toNumber(row.qty) * toNumber(row.hoursDay);
        const costDay = dailyKwh * avgCostKwh;
        return {...row,dailyKwh,costDay};
      });
      const chemicals = groupChemicals.filter(row => row.groupId === group.id && row.enabled).map(row => {
        const kgDay = toNumber(row.dosageKgM3) * volumeDay;
        const costDay = kgDay * toNumber(row.unitPrice);
        return {...row,kgDay,costDay};
      });
      const machineCostDay = machines.reduce((s,row)=>s+row.costDay,0);
      const chemicalCostDay = chemicals.reduce((s,row)=>s+row.costDay,0);
      const totalCostDay = machineCostDay + chemicalCostDay;
      return {
        ...group,
        hourlyFlow,
        volumeDay,
        machines,
        chemicals,
        machineCostDay,
        chemicalCostDay,
        totalCostDay,
        costPerM3: volumeDay > 0 ? totalCostDay / volumeDay : 0,
      };
    });
    return {
      rows,
      totalCostDay: rows.reduce((s,row)=>s+row.totalCostDay,0),
    };
  }, [groupFlowBasis,groupMachines,groupChemicals,opsHours,peakRate,offPeakRate,ftCharge,peakHoursDay,offPeakHoursDay]);

  // Raw water + Ops cost
  const costCalc = useMemo(() => {
    const prodFlow=calc.finalProduct;const allocs=calc.sourceAllocations||[];
    let rawCostH=0,sourceInputCostH=0;
    allocs.forEach(s=>{const fl=s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow);const unit=toNumber(s.costWater)+toNumber(s.costElec)+toNumber(s.costChem)+toNumber(s.costOps);rawCostH+=fl*toNumber(s.costWater);sourceInputCostH+=fl*unit;});
    let dilutionWaterCostH=0,dilutionElecCostH=0,dilutionChemCostH=0,dilutionOpsCostH=0;
    if(dilution.needed&&!dilution.cannotSolve&&dilution.sourceFlows){
      dilution.sourceFlows.forEach(s=>{const fl=toNumber(s.actualFlow);dilutionWaterCostH+=fl*toNumber(s.costWater);dilutionElecCostH+=fl*toNumber(s.costElec);dilutionChemCostH+=fl*toNumber(s.costChem);dilutionOpsCostH+=fl*toNumber(s.costOps);});
    }
    const rawCostPerM3Prod=prodFlow>0?sourceInputCostH/prodFlow:0;
    const sourceInputUnitCost=calc.feedFlow>0?sourceInputCostH/calc.feedFlow:0;
    const dilutionCostPerM3Prod=prodFlow>0?dilutionWaterCostH/prodFlow:0;
    const opsCostMonth=toNumber(staffCount)*toNumber(staffSalary);
    const opsCostDay=opsCostMonth/30;const opsCostH=opsCostDay/(opsHours||22);
    const opsCostPerM3Prod=prodFlow>0?opsCostH/prodFlow:0;
    const elecPerM3Prod=elecCalc.elecPerM3Prod+(prodFlow>0?dilutionElecCostH/prodFlow:0);
    const chemPerM3Prod=chemCalc.chemCostPerM3Prod+(prodFlow>0?dilutionChemCostH/prodFlow:0);
    const opsPerM3Prod=opsCostPerM3Prod+(prodFlow>0?dilutionOpsCostH/prodFlow:0);
    const totalPerM3=rawCostPerM3Prod+dilutionCostPerM3Prod+elecPerM3Prod+chemPerM3Prod+opsPerM3Prod;
    const totalPerDay=(sourceInputCostH+dilutionWaterCostH+dilutionElecCostH+dilutionChemCostH+dilutionOpsCostH)*opsHours+elecCalc.totalElecCostDay+chemCalc.chemCostDay+opsCostDay;
    return{rawCostH,sourceInputCostH,sourceInputUnitCost,rawCostPerM3Prod,dilutionWaterCostH,dilutionCostPerM3Prod,elecPerM3Prod,chemPerM3Prod,opsCostMonth,opsCostDay,opsCostPerM3Prod,opsPerM3Prod,totalPerM3,totalPerDay,totalPerMonth:totalPerDay*30};
  }, [calc,dilution,opsHours,staffCount,staffSalary,elecCalc,chemCalc]);

  const sectionCostRows = useMemo(() => {
    const ufroVolumeDay = (calc.routes?.A?.product || 0) * opsHours;
    const ufroTotalCostDay = elecCalc.totalElecCostDay + chemCalc.chemCostDay;
    const ufroRow = {
      ...COST_GROUPS.find(group=>group.id==='group_uf_ro_plan_A'),
      hourlyFlow: calc.routes?.A?.product || 0,
      volumeDay: ufroVolumeDay,
      machineCostDay: elecCalc.totalElecCostDay,
      chemicalCostDay: chemCalc.chemCostDay,
      totalCostDay: ufroTotalCostDay,
      costPerM3: ufroVolumeDay > 0 ? ufroTotalCostDay / ufroVolumeDay : 0,
    };
    return COST_GROUPS.map(group => group.id === 'group_uf_ro_plan_A'
      ? ufroRow
      : groupCostCalc.rows.find(row=>row.id===group.id));
  }, [calc,opsHours,elecCalc,chemCalc,groupCostCalc]);

  const costDashboard = useMemo(() => {
    const sectionElecCostDay = sectionCostRows.reduce((s,row)=>s+toNumber(row?.machineCostDay),0);
    const sectionChemCostDay = sectionCostRows.reduce((s,row)=>s+toNumber(row?.chemicalCostDay),0);
    const productVolDay = calc.finalProduct * opsHours;
    const totalCostDay = sectionElecCostDay + sectionChemCostDay + costCalc.opsCostDay;
    return {
      sectionElecCostDay,
      sectionChemCostDay,
      opsCostDay: costCalc.opsCostDay,
      totalCostDay,
      totalCostMonth: totalCostDay * 30,
      productVolDay,
      sectionElecPerM3: productVolDay > 0 ? sectionElecCostDay / productVolDay : 0,
      sectionChemPerM3: productVolDay > 0 ? sectionChemCostDay / productVolDay : 0,
      opsPerM3: productVolDay > 0 ? costCalc.opsCostDay / productVolDay : 0,
      totalPerM3Product: productVolDay > 0 ? totalCostDay / productVolDay : 0,
    };
  }, [sectionCostRows,costCalc.opsCostDay,calc.finalProduct,opsHours]);

  const updateSource=(id,f,v)=>{
    if(mode==='know-output'&&f==='ratio'){setManualSourceRatios(p=>({...p,[id]:v}));setStrategy('manual');}
    setSources(prev=>prev.map(s=>s.id===id?{...s,[f]:v}:s));
  };
  const updateDilution=(id,f,v)=>{setDilutionSources(dilutionSources.map(s=>s.id===id?{...s,[f]:v}:s));};
  const updateEquip=(id,f,v)=>{setEquipments(equipments.map(e=>e.id===id?{...e,[f]:v}:e));};
  const updateCleaning=(id,f,v)=>{setCleaningEvents(cleaningEvents.map(e=>e.id===id?{...e,[f]:v}:e));};
  const updateChemical=(id,f,v)=>{setChemicalRows(chemicalRows.map(e=>e.id===id?{...e,[f]:v}:e));};
  const updateGroupMachine=(id,f,v)=>{setGroupMachines(groupMachines.map(e=>e.id===id?{...e,[f]:v}:e));};
  const updateGroupChemical=(id,f,v)=>{setGroupChemicals(groupChemicals.map(e=>e.id===id?{...e,[f]:v}:e));};
  const addEquip=()=>{const mx=equipments.reduce((m,e)=>Math.max(m,e.id),0);setEquipments([...equipments,{id:mx+1,name:'New Equipment',kw:1,qty:1,hoursDay:22,enabled:true}]);};
  const removeEquip=(id)=>{if(equipments.length<=1)return;setEquipments(equipments.filter(e=>e.id!==id));};
  const addGroupMachine=(groupId)=>{const mx=groupMachines.reduce((m,e)=>Math.max(m,e.id),0);setGroupMachines([...groupMachines,{id:mx+1,groupId,name:'New Machine',kw:0,qty:1,hoursDay:0,enabled:true}]);};
  const removeGroupMachine=(id)=>{setGroupMachines(groupMachines.filter(e=>e.id!==id));};
  const addGroupChemical=(groupId)=>{const mx=groupChemicals.reduce((m,e)=>Math.max(m,e.id),0);setGroupChemicals([...groupChemicals,{id:mx+1,groupId,name:'New Chemical',dosageKgM3:0,unitPrice:0,enabled:true}]);};
  const removeGroupChemical=(id)=>{setGroupChemicals(groupChemicals.filter(e=>e.id!==id));};
  const loadPreset=()=>{if(window.confirm('โหลด UFRO Electricity Preset?'))setEquipments(PDF_EQUIPMENT_PRESET.map(e=>({...e})));};

  const vol=(h)=>timeUnit==='daily'?h*opsHours:h;
  const volUnit=timeUnit==='daily'?'m³/day':'m³/h';
  const routeCapacityHourly = mode==='know-input' ? mixedFeed.flow : productFlow;
  const updateRouteFlow = (id, displayFlow) => {
    const hourly = timeUnit==='daily' ? toNumber(displayFlow)/(opsHours||1) : toNumber(displayFlow);
    const capacity = Math.max(0, routeCapacityHourly);
    const pct = capacity > 0 ? Math.min(capacity, Math.max(0, hourly)) / capacity * 100 : 0;
    updateRoutePercent(id, pct);
  };
  const routeInputValue = (id) => phase15RouteInputMode==='flow'
    ? parseFloat(vol(routeCapacityHourly * (toNumber(phase15RouteRatios[id]) / 100)).toFixed(1))
    : parseFloat((phase15RouteRatios[id]||0).toFixed(1));
  const routeInputUnit = phase15RouteInputMode==='flow' ? volUnit : '%';
  const fmt=(n,d=1)=>isFinite(n)&&!isNaN(n)?n.toFixed(d):'—';
  const fmtC=(tds)=>isFinite(tds)&&!isNaN(tds)?Math.round(tds2cond(tds)).toLocaleString():'—';
  const fmtB=(n,d=2)=>isFinite(n)&&!isNaN(n)?n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):'—';
  const sourceUnitCost=(s)=>toNumber(s.costWater)+toNumber(s.costElec)+toNumber(s.costChem)+toNumber(s.costOps);
  const activeCostGroup = sectionCostRows.find(group=>group.id===costGroupTab) || sectionCostRows[0];
  const activeAuxGroup = groupCostCalc.rows.find(group=>group.id===costGroupTab);
  const diagramSources = sources.map(s => {
    const alloc = calc.sourceAllocations?.find(a => String(a.id) === String(s.id));
    return {...s, actualFlow: alloc?.actualFlow ?? (s.enabled ? toNumber(s.flow) : 0), actualRatio: alloc?.actualRatio ?? 0};
  });
  const diagramDilutionSources = dilutionSources.slice(0, 5).map(s => {
    const flow = dilution?.sourceFlows?.find(x => String(x.id) === String(s.id));
    return {...s, actualFlow: flow?.actualFlow ?? (dilutionMode === 'manual' ? toNumber(s.flow) : 0)};
  });
  const zoomLabel = `${Math.round(diagramZoom * 100)}%`;
  const diagramSvgStyle = {width:DIAGRAM_BASE_W,height:DIAGRAM_BASE_H,minWidth:0,maxWidth:'none'};
  const renderDiagram = (ref, zoom = diagramZoom) => (
    <div style={{...S.diagramZoomStage,width:DIAGRAM_BASE_W*zoom,height:DIAGRAM_BASE_H*zoom}}>
      <div style={{width:DIAGRAM_BASE_W,height:DIAGRAM_BASE_H,transform:`scale(${zoom})`,transformOrigin:'top left'}}>
        <ProcessDiagram ref={ref} calc={calc} sources={diagramSources} dilutionSources={diagramDilutionSources} waterControl={waterControl} fmtC={fmtC} fmt={fmt} vol={vol} volUnit={volUnit} dilution={dilution} finalAllowed={finalAllowed} finalSeverity={finalSeverity} svgStyle={diagramSvgStyle}/>
      </div>
    </div>
  );

  return (
    <div style={S.root}><style>{globalCSS}</style>
      {/* HEADER */}
      <header style={S.header} className="ufro-header">
        <div style={S.headerLeft}>
          <div style={S.logoMark}>◉</div>
          <div><div style={S.title}>UF · RO CALCULATOR</div><div style={S.subtitle}>JYN Reuse Water v8.0</div></div>
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
          {/* A1: Operating hours always visible when day mode */}
          {timeUnit==='daily' && <div style={{display:'flex',alignItems:'center',gap:4,background:O.bg2,border:`1px solid ${O.border}`,borderRadius:4,padding:'0 6px'}}>
            <NumInput value={opsHours} onValueChange={v=>setOpsHours(Math.max(1,Math.min(24,v)))} style={{...S.srcInput,width:28,textAlign:'center',fontSize:12,padding:'4px 0'}}/>
            <span style={{fontSize:9,color:O.text3}}>h/d</span></div>}
          <button onClick={handleReset} style={S.resetBtn}>↺</button>
        </div>
      </header>

      <div style={S.projectTabs}>
        {[
          ['phase15','Phase 1.5'],
          ['phase10','Phase 1.0'],
          ['diagram','Project Diagram'],
          ['financial','Project Financial'],
        ].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveTab(id)} style={{...S.projectTab,...(activeTab===id?S.projectTabActive:{})}}>{label}</button>
        ))}
      </div>

      {activeTab==='phase15' ? <div style={S.grid} className="ufro-grid">
        {/* ═══ LEFT ═══ */}
        <aside style={S.sidebar}>
          <Section title="Phase 1.5 Route" open>
            <div style={{...S.strategyTabs,gridTemplateColumns:'repeat(3,1fr)'}}>
              {Object.entries(PHASE15_ROUTES).map(([id,r])=>(
                <button key={id} style={{...S.stratTab,...(phase15Routes[id]?S.stratTabActive:{})}} onClick={()=>togglePhase15Route(id)}>{r.label}</button>
              ))}
            </div>
            <div style={S.routeDesc}>เปิดได้หลายแผนพร้อมกัน ระบบจะ normalize สัดส่วนของแผนที่เปิดอยู่และคำนวณทางน้ำให้อัตโนมัติ</div>
            <button onClick={autoBlendPhase15Routes} style={{...S.exportBtn,width:'100%',marginTop:8,color:O.gold,borderColor:O.gold}}>Auto blend by selected plan</button>
            {phase15RouteAutoNote && <div style={{...S.routeDesc,color:O.gold,marginTop:6}}>{phase15RouteAutoNote}</div>}
            <div style={{...S.strategyTabs,gridTemplateColumns:'1fr 1fr',marginTop:8}}>
              <button style={{...S.stratTab,...(phase15RouteInputMode==='percent'?S.stratTabActive:{})}} onClick={()=>setPhase15RouteInputMode('percent')}>Percent</button>
              <button style={{...S.stratTab,...(phase15RouteInputMode==='flow'?S.stratTabActive:{})}} onClick={()=>setPhase15RouteInputMode('flow')}>Flow</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginTop:8}}>
              {Object.entries(PHASE15_ROUTES).map(([id,r])=>(
                <div key={id} style={{...S.srcInputWrap,...(!phase15Routes[id]?S.srcInputRO:{})}}>
                  <span style={{...S.srcUnit,color:phase15Routes[id]?O.accent:O.text3}}>{r.short}</span>
                  <NumInput key={`${id}-${phase15RouteInputMode}-${routeInputValue(id)}`} value={routeInputValue(id)} onValueChange={v=>phase15RouteInputMode==='flow'?updateRouteFlow(id,v):updateRoutePercent(id,v)} style={{...S.srcInput,textAlign:'right'}} readOnly={!phase15Routes[id]} forceSync/>
                  <span style={S.srcUnit}>{routeInputUnit}</span>
                </div>
              ))}
            </div>
            <div style={S.routeDesc}>Route total = 100% · Flow ถูกจำกัดไม่เกิน {mode==='know-input'?'น้ำเข้าจริง':'เป้าหมายน้ำผลิต'} {fmt(vol(routeCapacityHourly),1)} {volUnit}</div>
            {calc.tssEnabled && <div style={{marginTop:10}}>
              <SliderRow label="TSS Process Reject" value={tssReject} onChange={setTssReject} min={0} max={30} step={0.5} unit="%"/>
              <SliderRow label="Sludge Pond Water Return" value={sludgeWaterRecovery} onChange={setSludgeWaterRecovery} min={0} max={100} step={1} unit="%"/>
            </div>}
            <div style={S.mixBox}>
              <div style={S.mixHead}>PHASE 1.5 ROUTE BALANCE</div>
              <div style={S.mixRow}><span>Raw / Mixed Feed</span><span style={S.mixVal}>{fmt(vol(calc.feedFlow),1)} {volUnit}</span></div>
              {calc.tssEnabled && <div style={S.mixRow}><span>After TSS</span><span style={S.mixVal}>{fmt(vol(calc.tssOutFlow),1)} {volUnit}</span></div>}
              {calc.ufroEnabled && <div style={S.mixRow}><span>UF/RO Product</span><span style={S.mixVal}>{fmt(vol(calc.finalProduct),1)} {volUnit}</span></div>}
              {!calc.ufroEnabled && <div style={S.mixRow}><span>Bypass To Final Tank</span><span style={S.mixVal}>{fmt(vol(calc.finalProduct),1)} {volUnit}</span></div>}
              <div style={S.mixRow}><span>Wastewater / Reject Tank</span><span style={{...S.mixVal,color:O.warn}}>{fmt(vol(calc.totalReject),1)} {volUnit}</span></div>
              {calc.tssEnabled && <div style={S.mixRow}><span>Sludge Water Return</span><span style={S.mixVal}>{fmt(vol(calc.sludgeWaterRecycle),1)} {volUnit}</span></div>}
              {['A','B','C'].map(id=>calc.routes?.[id]?.enabled&&<div key={id} style={S.mixRow}><span>Plan {id} product</span><span style={S.mixVal}>{fmt(vol(calc.routes[id].product),1)} {volUnit}</span></div>)}
            </div>
          </Section>
          <Section title="Water Control" open={sec.waterControl} onToggle={()=>toggle('waterControl')}>
            <div style={S.routeDesc}>ปรับจุดแยกน้ำสีแดงใน Diagram จากน้ำ 100% ให้แบ่งไปแต่ละทางตามสัดส่วนที่ต้องการ</div>
            <SliderRow
              label={`UF Tank -> RO System (${waterControl.ufControlMode})`}
              value={Math.round(waterControl.ufToRO * 10) / 10}
              onChange={v=>{setSplitMode('manual');setManualToRO(Math.max(0,Math.min(100,v)));}}
              min={0}
              max={100}
              step={0.5}
              unit="%"
            />
            <div style={S.mixBox}>
              <div style={S.mixHead}>UF SPLIT CONTROL</div>
              <div style={S.mixRow}><span>To RO System</span><span style={S.mixVal}>{fmt(vol(waterControl.roFeedFlow),1)} {volUnit} / {fmt(waterControl.ufToRO,1)}%</span></div>
              <div style={S.mixRow}><span>To Bypass Tank</span><span style={S.mixVal}>{fmt(vol(waterControl.bypassFlow),1)} {volUnit} / {fmt(waterControl.ufToBypass,1)}%</span></div>
            </div>
            <SliderRow label="Final Tank -> Send to RIL" value={finalToRilPct} onChange={v=>setFinalToRilPct(Math.max(0,Math.min(100,v)))} min={0} max={100} step={1} unit="%"/>
            <div style={S.mixBox}>
              <div style={S.mixHead}>FINAL WATER CONTROL</div>
              <div style={S.mixRow}><span>Send to RIL</span><span style={S.mixVal}>{fmt(vol(waterControl.sendRilFlow),1)} {volUnit} / {fmt(waterControl.finalToRil,0)}%</span></div>
              <div style={S.mixRow}><span>Mixed with P10</span><span style={S.mixVal}>{fmt(vol(waterControl.sendP10Flow),1)} {volUnit} / {fmt(waterControl.finalToP10,0)}%</span></div>
            </div>
            <SliderRow label="Mixed UF/RO -> Wastewater" value={treatedToWastePct} onChange={v=>setTreatedToWastePct(Math.max(0,Math.min(100,v)))} min={0} max={100} step={1} unit="%"/>
            <div style={S.mixBox}>
              <div style={S.mixHead}>TREATED WATER CONTROL</div>
              <div style={S.mixRow}><span>Reject Cond</span><span style={S.mixVal}>{Math.round(waterControl.rejectCond).toLocaleString()} µS/cm</span></div>
              <div style={S.mixRow}><span>Reject Route</span><span style={{...S.mixVal,color:waterControl.rejectNeedsMix?O.warn:O.pass}}>{waterControl.rejectRoute}</span></div>
              <div style={S.mixRow}><span>To Wastewater</span><span style={S.mixVal}>{fmt(vol(waterControl.wastewaterFlow),1)} {volUnit} / {fmt(waterControl.treatedToWaste,0)}%</span></div>
              <div style={S.mixRow}><span>Return to Junction Inlet</span><span style={S.mixVal}>{fmt(vol(waterControl.returnFlow),1)} {volUnit} / {fmt(waterControl.treatedToReturn,0)}%</span></div>
            </div>
          </Section>
          <Section title="แหล่งน้ำดิบ (Feed Sources)" open={sec.sources} onToggle={()=>toggle('sources')}>
            {mode==='know-output' && <div style={S.strategyTabs}>{['optimize','equal','manual'].map(s=>(
              <button key={s} style={{...S.stratTab,...(strategy===s?S.stratTabActive:{})}} onClick={()=>handleStrategyChange(s)}>{s==='optimize'?'Optimize':s==='equal'?'Equal':'Manual'}</button>))}</div>}
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
                    <div style={S.srcField}><label style={S.srcFieldLabel}>ค่าน้ำดิบ</label>
                      <div style={{...S.srcInputWrap,borderColor:O.accent+'44'}}><NumInput value={s.costWater||0} onValueChange={v=>updateSource(s.id,'costWater',v)} style={S.srcInput}/><span style={{...S.srcUnit,color:O.accent}}>฿/m³</span></div></div>
                    <div style={S.srcInputs}>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>ค่าไฟฟ้า</label><div style={S.srcInputWrap}><NumInput value={s.costElec||0} onValueChange={v=>updateSource(s.id,'costElec',v)} style={S.srcInput}/><span style={S.srcUnit}>฿/m³</span></div></div>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>ค่าเคมี</label><div style={S.srcInputWrap}><NumInput value={s.costChem||0} onValueChange={v=>updateSource(s.id,'costChem',v)} style={S.srcInput}/><span style={S.srcUnit}>฿/m³</span></div></div>
                    </div>
                    <div style={S.srcField}><label style={S.srcFieldLabel}>ค่า Operation</label><div style={S.srcInputWrap}><NumInput value={s.costOps||0} onValueChange={v=>updateSource(s.id,'costOps',v)} style={S.srcInput}/><span style={S.srcUnit}>฿/m³</span></div></div>
                    <div style={{fontSize:10,color:O.gold,fontFamily:mono,background:O.bg2,border:`1px solid ${O.border}`,borderRadius:3,padding:'5px 7px',display:'flex',justifyContent:'space-between'}}>
                      <span>Auto source cost / Q</span><b>{fmtB(sourceUnitCost(s),2)} ฿/m³</b>
                    </div>
                  </div>)}
                </div>))}
            </div>
            <div style={S.mixBox}>
              <div style={S.mixHead}>MIXED FEED</div>
              <div style={S.mixRow}><span>Flow</span><span style={S.mixVal}>{fmt(vol(calc.feedFlow),1)} {volUnit}</span></div>
              <div style={S.mixRow}><span>Conductivity</span><span style={S.mixVal}>{fmtC(calc.feedTDS)} µS/cm</span></div>
              <div style={S.mixRow}><span>Feed Cost</span><span style={{...S.mixVal,color:O.gold}}>{fmtB(costCalc.sourceInputUnitCost,2)} ฿/m³</span></div>
            </div>
          </Section>

          <Section title="เป้าหมาย (Target)" open={sec.target} onToggle={()=>toggle('target')}>
            <label style={{...S.routeDesc,display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
              <input type="checkbox" checked={!hasTargetCond} onChange={e=>setHasTargetCond(!e.target.checked)} />
              <span>ไม่มี Cond เป้าหมายปลายทาง</span>
            </label>
            <div style={S.inputRow}><div style={S.inputLabel}>Conductivity เป้าหมาย</div>
              <div style={{...S.inputWrap,...S.inputWrapAccent,...(!hasTargetCond?S.srcInputRO:{})}}><NumInput value={targetCond} onValueChange={setTargetCond} style={S.input} readOnly={!hasTargetCond}/><span style={S.inputUnit}>µS/cm</span></div></div>
            <div style={S.inputRow}><div style={S.inputLabel}>RO Outlet Cond Limit</div>
              <div style={{...S.inputWrap,borderColor:calc.roPermCondStatus==='PASS'?O.pass:O.fail}}><NumInput value={roPermCondLimit} onValueChange={setRoPermCondLimit} style={S.input}/><span style={S.inputUnit}>µS/cm</span></div></div>
            <div style={{fontSize:10,color:calc.roPermCondStatus==='PASS'?O.pass:O.fail,fontFamily:mono,marginTop:-4,marginBottom:6}}>
              RO permeate: {fmt(calc.roPermCond,1)} µS/cm / limit {fmt(roPermCondLimit,0)} µS/cm
            </div>
            {mode==='know-output' && <div style={S.inputRow}><div style={S.inputLabel}>ปริมาณน้ำผลิต</div>
              <div style={{...S.inputWrap,...S.inputWrapAccent}}><NumInput value={timeUnit==='daily'?productFlow*opsHours:productFlow} onValueChange={v=>setProductFlow(timeUnit==='daily'?v/opsHours:v)} style={S.input}/><span style={S.inputUnit}>{volUnit}</span></div></div>}
          </Section>

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

          <Section title="เมมเบรน (Advanced)" open={sec.membrane} onToggle={()=>toggle('membrane')}>
            <SliderRow label="UF Reject" value={ufReject} onChange={setUfReject} min={2} max={30} step={0.5} unit="%"/>
            <SliderRow label="RO Reject" value={roReject} onChange={setRoReject} min={10} max={50} step={0.5} unit="%"/>
            <SliderRow label="RO Salt Rejection" value={roSaltRejection} onChange={setRoSaltRejection} min={90} max={99.9} step={0.1} unit="%"/>
          </Section>

          <Section title="ชั่วโมงเดินเครื่อง" open={sec.opsTime} onToggle={()=>toggle('opsTime')}>
            <SliderRow label="Operating Hours/Day" value={opsHours} onChange={setOpsHours} min={1} max={24} step={1} unit=" h/d"/>
          </Section>

          {!calc.blendValid && <div style={S.warnBox}><div style={S.warnTitle}>⚠ {calc.blendWarning}</div></div>}
        </aside>

        {/* ═══ RIGHT ═══ */}
        <main style={S.main}>
          <Section title="KPI" open={sec.kpi} onToggle={()=>toggle('kpi')}>
            <div style={S.kpiStrip} className="ufro-kpi-strip">
              <KPI label="น้ำดิบ" value={fmt(vol(calc.feedFlow),1)} unit={volUnit} sub={`Cond ${fmtC(calc.feedTDS)}`} highlight={mode==='know-output'}/>
              <KPI label="น้ำผลิต" value={fmt(vol(calc.finalProduct),1)} unit={volUnit} sub={`Cond ${fmtC(calc.actualProductTDS)}`} highlight={mode==='know-input'}/>
              <KPI label="น้ำทิ้ง" value={fmt(vol(calc.totalReject),1)} unit={volUnit} sub={`Cond ${fmtC(calc.totalRejectTDS)}`} badge={calc.totalRejectStatus} warning={!calc.totalRejectAllowed}/>
              <KPI label="RO Outlet" value={fmt(calc.roPermCond,0)} unit="µS/cm" sub={`Limit ${fmt(roPermCondLimit,0)}`} badge={calc.roPermCondStatus} warning={calc.roPermCondStatus!=='PASS'}/>
              <KPI label="Recovery" value={fmt(calc.overallRecovery,1)} unit="%"/>
              <KPI label="RO/Bypass" value={`${fmt(calc.calcToRO,0)}/${fmt(calc.calcBypass,0)}`} unit="%"/>
            </div>
          </Section>

          <Section title="สถานะปล่อยทิ้ง" open={sec.discharge} onToggle={()=>toggle('discharge')}>
            <div style={{...S.dischargeCard,...(finalAllowed?(finalSeverity==='WARNING'?S.dischargeWarn:S.dischargePass):S.dischargeFail)}}>
              <span className={!finalAllowed?'status-blink-fail':finalSeverity==='WARNING'?'status-blink-warn':'status-blink-pass'} style={S.dischargeBadge}>
                {finalAllowed?(finalSeverity==='WARNING'?'⚠ ผ่านเกณฑ์แต่ใกล้ขีดจำกัด':'✓ ผ่านเกณฑ์ปล่อยทิ้ง'):'✗ ไม่ผ่านเกณฑ์ — REJECT'}
              </span>
              <span style={S.dischargeMeta}>{finalMargin>=0?`Margin ${Math.round(finalMargin).toLocaleString()} µS/cm`:`เกิน ${Math.round(Math.abs(finalMargin)).toLocaleString()} µS/cm`}</span>
            </div>
          </Section>

          <Section title="Process Diagram" open={sec.diagram} onToggle={()=>toggle('diagram')}>
            <div style={S.diagramToolbar}>
              <button onClick={()=>setDiagramFullscreen(true)} style={{...S.exportBtn,color:O.cyan,borderColor:O.cyan}}>FULL</button>
              <span style={S.diagramToolbarSpacer}/>
              <button onClick={()=>adjustDiagramZoom(-0.1)} style={S.zoomBtn}>-</button>
              <button onClick={resetDiagramZoom} style={S.zoomValue}>{zoomLabel}</button>
              <button onClick={()=>adjustDiagramZoom(0.1)} style={S.zoomBtn}>+</button>
            </div>
            <div style={{display:'flex',gap:6,marginBottom:8}}><button onClick={()=>exportSVG(diagramRef.current)} style={S.exportBtn}>⬇ SVG</button><button onClick={()=>exportPNG(diagramRef.current)} style={S.exportBtn}>⬇ PNG</button></div>
            <div style={S.diagramScrollWrapper} className="ufro-scroll-x">
              {renderDiagram(diagramRef)}
            </div>
          </Section>

          {diagramFullscreen && (
            <div style={S.fullscreenBackdrop} role="dialog" aria-modal="true" aria-label="Process diagram fullscreen">
              <div style={S.fullscreenHeader}>
                <div>
                  <div style={S.fullscreenTitle}>Process Diagram</div>
                  <div style={S.fullscreenMeta}>Zoom {zoomLabel} · drag scroll inside canvas</div>
                </div>
                <div style={S.fullscreenActions}>
                  <button onClick={()=>exportSVG(fullscreenDiagramRef.current || diagramRef.current)} style={S.exportBtn}>SVG</button>
                  <button onClick={()=>exportPNG(fullscreenDiagramRef.current || diagramRef.current)} style={S.exportBtn}>PNG</button>
                  <button onClick={()=>adjustDiagramZoom(-0.1)} style={S.zoomBtn}>-</button>
                  <button onClick={resetDiagramZoom} style={S.zoomValue}>{zoomLabel}</button>
                  <button onClick={()=>adjustDiagramZoom(0.1)} style={S.zoomBtn}>+</button>
                  <button onClick={()=>setDiagramFullscreen(false)} style={{...S.exportBtn,color:O.fail,borderColor:O.fail}}>CLOSE</button>
                </div>
              </div>
              <div style={S.fullscreenCanvas} className="ufro-scroll-x">
                {renderDiagram(fullscreenDiagramRef)}
              </div>
            </div>
          )}

          {/* DILUTION with source-level flow display (A2) */}
          <Section title={`Dilution ${!calc.totalRejectAllowed?'⚠':''}`} open={sec.dilution||!calc.totalRejectAllowed} onToggle={()=>toggle('dilution')} accent={!calc.totalRejectAllowed}>
            {(!calc.totalRejectAllowed||showDilutionSim) ? (<div>
              <div style={{...S.strategyTabs,gridTemplateColumns:'1fr 1fr'}}><button style={{...S.stratTab,...(dilutionMode==='auto'?S.stratTabActive:{})}} onClick={()=>setDilutionMode('auto')}>Auto</button><button style={{...S.stratTab,...(dilutionMode==='manual'?S.stratTabActive:{})}} onClick={()=>setDilutionMode('manual')}>Manual</button></div>
              <div style={{marginTop:8,padding:'6px 8px',background:O.bg2,borderRadius:3,border:`1px solid ${O.border}`}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}><span>Safety Margin</span><span style={{color:O.accent,fontWeight:600}}>{safetyMargin}%</span></div>
                <input type="range" min={0} max={30} step={1} value={safetyMargin} onChange={e=>setSafetyMargin(parseFloat(e.target.value))} style={S.slider}/>
                <div style={{fontSize:10,color:O.text3}}>Target: {Math.round(REJECT_COND_LIMIT*(1-safetyMargin/100)).toLocaleString()} µS/cm</div>
              </div>
              {/* IMPORTANT ENGINEERING DISPLAY:
                  Each dilution source must show its individual flow into the reject mixing box.
                  This is required for water balance, operator review, and discharge validation.
                  Do NOT remove source-level dilution flow display.
                  Total dilution flow alone is not enough because engineers need to verify
                  which source contributes how much water before final discharge. */}
              <div style={{display:'flex',flexDirection:'column',gap:4,marginTop:8}}>
                {dilutionSources.map((ds,i)=>(
                  <div key={ds.id} style={{...S.srcCard,...(ds.enabled?S.srcCardOn:{})}}>
                    <div style={S.srcHeader}>
                      <button style={{...S.srcToggle,...(ds.enabled?S.srcToggleOn:{})}} onClick={()=>updateDilution(ds.id,'enabled',!ds.enabled)}>{ds.enabled?'●':'○'}</button>
                      <input type="text" value={ds.name} onChange={e=>updateDilution(ds.id,'name',e.target.value)} style={S.srcName} disabled={!ds.enabled}/>
                      <span style={S.srcIdx}>D{i+1}</span>
                    </div>
                    {ds.enabled && <div style={S.srcInputs}>
                      {dilutionMode==='manual' && <div style={S.srcField}><label style={S.srcFieldLabel}>Flow (m³/h)</label><div style={S.srcInputWrap}><NumInput value={ds.flow} onValueChange={v=>updateDilution(ds.id,'flow',v)} style={S.srcInput}/><span style={S.srcUnit}>m³/h</span></div></div>}
                      <div style={S.srcField}><label style={S.srcFieldLabel}>Cond</label><div style={S.srcInputWrap}><NumInput value={ds.conductivity} onValueChange={v=>updateDilution(ds.id,'conductivity',v)} style={S.srcInput}/><span style={S.srcUnit}>µS/cm</span></div></div>
                    </div>}
                    {ds.enabled && <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4,marginTop:5}}>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>Water</label><div style={S.srcInputWrap}><NumInput value={ds.costWater||0} onValueChange={v=>updateDilution(ds.id,'costWater',v)} style={S.srcInput}/><span style={S.srcUnit}>฿/m³</span></div></div>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>Elec</label><div style={S.srcInputWrap}><NumInput value={ds.costElec||0} onValueChange={v=>updateDilution(ds.id,'costElec',v)} style={S.srcInput}/><span style={S.srcUnit}>฿/m³</span></div></div>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>Chem</label><div style={S.srcInputWrap}><NumInput value={ds.costChem||0} onValueChange={v=>updateDilution(ds.id,'costChem',v)} style={S.srcInput}/><span style={S.srcUnit}>฿/m³</span></div></div>
                      <div style={S.srcField}><label style={S.srcFieldLabel}>Ops</label><div style={S.srcInputWrap}><NumInput value={ds.costOps||0} onValueChange={v=>updateDilution(ds.id,'costOps',v)} style={S.srcInput}/><span style={S.srcUnit}>฿/m³</span></div></div>
                    </div>}
                    {/* Show auto-calculated flow per source */}
                    {ds.enabled && dilutionMode==='auto' && dilution.sourceFlows && (() => {
                      const sf = dilution.sourceFlows.find(x=>x.id===ds.id);
                      return sf && sf.actualFlow > 0 ? (
                        <div style={{fontSize:10,color:O.accent,marginTop:4,fontFamily:mono,paddingLeft:22}}>
                          → Auto Flow: {fmt(sf.actualFlow,1)} m³/h ({fmt(sf.actualFlow*opsHours,0)} m³/day) · TDS {Math.round(cond2tds(toNumber(ds.conductivity)))} mg/L
                        </div>
                      ) : null;
                    })()}
                  </div>))}
              </div>
              {dilution.cannotSolve && <div style={S.warnBox}><div style={S.warnTitle}>⚠ {dilution.msg}</div></div>}
              {!dilution.cannotSolve && (dilution.QdReq||0)>0 && (
                <div style={{...S.mixBox,marginTop:10,borderColor:O.accent}}>
                  <div style={S.mixHead}>{dilutionMode==='auto'?'AUTO RESULT':'FINAL DISCHARGE'}</div>
                  {dilutionMode==='auto' && <div style={S.mixRow}><span>Required Dilution</span><span style={{...S.mixVal,color:O.gold,fontSize:14}}>{fmt(vol(dilution.QdReq),1)} {volUnit}</span></div>}
                  <div style={S.mixRow}><span>Final Flow</span><span style={S.mixVal}>{fmt(vol(dilution.finalFlow),1)} {volUnit}</span></div>
                  <div style={S.mixRow}><span>Final Cond</span><span style={S.mixVal}>{Math.round(dilution.finalCond).toLocaleString()} µS/cm</span></div>
                  <div style={S.mixRow}><span>Status</span><StatusBadge status={dilution.finalStatus}/></div>
                </div>)}
              {!dilution.cannotSolve && dilutionMode==='manual' && (dilution.finalFlow||0)>0 && (
                <div style={{...S.mixBox,marginTop:10,borderColor:O.accent}}>
                  <div style={S.mixHead}>FINAL DISCHARGE</div>
                  <div style={S.mixRow}><span>Flow</span><span style={{...S.mixVal,color:O.gold}}>{fmt(vol(dilution.finalFlow),1)} {volUnit}</span></div>
                  <div style={S.mixRow}><span>Cond</span><span style={S.mixVal}>{Math.round(dilution.finalCond).toLocaleString()} µS/cm</span></div>
                  <div style={S.mixRow}><span>Status</span><StatusBadge status={dilution.finalStatus}/></div>
                </div>)}
              {calc.totalRejectAllowed && <button onClick={()=>setShowDilutionSim(false)} style={{...S.exportBtn,marginTop:6}}>ซ่อน</button>}
            </div>) : (
              <button onClick={()=>setShowDilutionSim(true)} style={{...S.exportBtn,width:'100%',padding:'8px 0',fontSize:11}}>จำลอง Dilution</button>
            )}
          </Section>

          {/* Dashboard */}
          <Section title="Dashboard" open={sec.dashboard} onToggle={()=>toggle('dashboard')}>
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
          <Section title="Loss Breakdown" open={sec.loss} onToggle={()=>toggle('loss')}>
            <LossBreakdown calc={calc} fmtC={fmtC} vol={vol} volUnit={volUnit}/>
          </Section>

          {/* Analysis */}
          <Section title="Analysis" open={sec.analysis} onToggle={()=>toggle('analysis')}>
            <div style={{display:'flex',gap:4,marginBottom:8}}>
              {['status','howToFix','engineering'].map(t=>(
                <button key={t} onClick={()=>setRecTab(t)} style={{...S.stratTab,padding:'6px 12px',fontSize:10,...(recTab===t?S.stratTabActive:{})}}>{t==='status'?'Status':t==='howToFix'?'Fix':'Eng.'}</button>))}
            </div>
            {recTab==='status' && <div style={S.mixBox}>
              <div style={S.mixRow}><span>Total Reject Cond</span><span style={S.mixVal}>{fmtC(calc.totalRejectTDS)} µS/cm</span></div>
              <div style={S.mixRow}><span>Limit</span><span style={S.mixVal}>{REJECT_COND_LIMIT.toLocaleString()}</span></div>
              <div style={S.mixRow}><span>Margin</span><span style={{...S.mixVal,color:calc.totalRejectMargin>=0?O.pass:O.fail}}>{calc.totalRejectMargin>=0?`${Math.round(calc.totalRejectMargin).toLocaleString()} below`:`${Math.round(Math.abs(calc.totalRejectMargin)).toLocaleString()} above`}</span></div>
            </div>}
            {recTab==='howToFix' && (recommendations.length===0?<div style={{color:O.pass,fontSize:12}}>✓ ไม่มีปัญหา</div>:recommendations.map((r,i)=>(
              <div key={i} style={{marginBottom:10}}><StatusBadge status={r.status}/><span style={{marginLeft:8,color:O.warn,fontWeight:600}}>{r.area}</span>
                <ul style={{margin:'4px 0 0 18px',listStyleType:'disc'}}>{r.items.map((it,j)=><li key={j} style={{color:O.text2,fontSize:11,lineHeight:1.8}}>{it}</li>)}</ul></div>)))}
            {recTab==='engineering' && <div style={{fontSize:11,color:O.text2,lineHeight:2,fontFamily:mono}}>
              <div>Final Cond = (Qr×Cr + ΣQd×Cd) / (Qr + ΣQd)</div>
              <div>Required Qd = Qr × (Cr − Ct) / (Ct − Cd)</div>
              <div>TDS = Cond × {COND_TO_TDS} · kWh = kW × hours</div>
            </div>}
          </Section>

          {/* Stream Table */}
          <Section title="Stream Table" open={sec.stream} onToggle={()=>toggle('stream')}>
            <div style={S.tableScroll}>
              <table style={S.table}><thead><tr>
                <th style={S.th}>Stream</th><th style={{...S.th,textAlign:'right'}}>Flow</th><th style={{...S.th,textAlign:'right'}}>Cond</th><th style={{...S.th,textAlign:'right'}}>TDS</th><th style={{...S.th,textAlign:'right'}}>%Feed</th><th style={{...S.th,textAlign:'center'}}>Status</th>
              </tr></thead><tbody>
                {calc.sourceAllocations.map(s=>{const fl=s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow);return<StreamRow key={s.id} name={`├ ${s.name}`} flow={vol(fl)} tds={s.tds} pct={s.actualRatio||0} sub/>;})}
                <StreamRow name="① Mixed Feed" flow={vol(calc.feedFlow)} tds={calc.feedTDS} pct={100} bold/>
                {calc.tssEnabled && <StreamRow name="①.1 TSS Product" flow={vol(calc.tssOutFlow)} tds={calc.feedTDS} pct={calc.tssOutFlow/calc.feedFlow*100} bold/>}
                {calc.tssEnabled && <StreamRow name="①.2 TSS Reject / Sludge Feed" flow={vol(calc.tssRejectFlow)} tds={calc.tssRejectTDS} pct={calc.tssRejectFlow/calc.feedFlow*100} loss status={calc.tssRejectStatus}/>}
                {calc.tssEnabled && <StreamRow name="├ Sludge Pond Water Return" flow={vol(calc.sludgeWaterRecycle)} tds={calc.feedTDS} pct={calc.sludgeWaterRecycle/calc.feedFlow*100} sub/>}
                <StreamRow name="② UF Permeate" flow={vol(calc.ufOut)} tds={calc.ufPermTDS} pct={calc.ufOut/calc.feedFlow*100}/>
                <StreamRow name="③ UF Reject" flow={vol(calc.ufRejectFlow)} tds={calc.ufRejectTDS} pct={calc.ufRejectFlow/calc.feedFlow*100} loss status={calc.ufRejectStatus}/>
                <StreamRow name="④ RO Feed" flow={vol(calc.roIn)} tds={calc.feedTDS} pct={calc.roIn/calc.feedFlow*100}/>
                <StreamRow name="⑤ Bypass" flow={vol(calc.ufBypass)} tds={calc.feedTDS} pct={calc.ufBypass/calc.feedFlow*100} accent/>
                <StreamRow name="⑥ RO Perm" flow={vol(calc.roOut)} tds={calc.roPermTDS} pct={calc.roOut/calc.feedFlow*100}/>
                <StreamRow name="⑦ RO Conc" flow={vol(calc.roRejectFlow)} tds={calc.roRejectTDS} pct={calc.roRejectFlow/calc.feedFlow*100} loss status={calc.roRejectStatus}/>
                <StreamRow name="⑧ Total Rej" flow={vol(calc.totalReject)} tds={calc.totalRejectTDS} pct={calc.totalReject/calc.feedFlow*100} loss status={calc.totalRejectStatus}/>
                <StreamRow name="⑨ PRODUCT" flow={vol(calc.finalProduct)} tds={calc.actualProductTDS} pct={calc.finalProduct/calc.feedFlow*100} highlight/>
                {/* Dilution sources in stream table (A2 restored) */}
                {dilution.needed&&!dilution.cannotSolve&&dilution.sourceFlows&&dilution.sourceFlows.filter(s=>s.actualFlow>0).map(ds=>
                  <StreamRow key={`d-${ds.id}`} name={`├ Dil: ${ds.name}`} flow={vol(ds.actualFlow)} tds={cond2tds(toNumber(ds.conductivity))} pct={0} sub/>)}
                {dilution.needed&&!dilution.cannotSolve&&(dilution.finalFlow||0)>0&&
                  <StreamRow name="⑩ DISCHARGE" flow={vol(dilution.finalFlow)} tds={dilution.finalTDS} pct={0} highlight status={dilution.finalStatus}/>}
              </tbody></table>
            </div>
          </Section>

          {/* ═══ COST ESTIMATION ═══ */}
          <Section title="ประมาณการต้นทุน (Cost / Q)" open={sec.cost} onToggle={()=>toggle('cost')} accent>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:12,marginBottom:14}}>
              <div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:8}}>
                  <CostKPI label="รวมต่อ Q" value={fmtB(costDashboard.totalPerM3Product)} unit="฿/m³" accent/>
                  <CostKPI label="ค่าไฟฟ้า / Q" value={fmtB(costDashboard.sectionElecPerM3)} unit="฿/m³" color={O.accent}/>
                  <CostKPI label="ค่าเคมี / Q" value={fmtB(costDashboard.sectionChemPerM3)} unit="฿/m³" color={O.gold}/>
                  <CostKPI label="ค่าคน / Q" value={fmtB(costDashboard.opsPerM3)} unit="฿/m³" color={O.cyan}/>
                  <CostKPI label="รวมทุกระบบ / day" value={fmtB(costDashboard.totalCostDay,0)} unit="฿" color={O.pass}/>
                  <CostKPI label="รวมต่อเดือน" value={fmtB(costDashboard.totalCostMonth,0)} unit="฿" color={O.text2}/>
                </div>
                <div style={{fontSize:10,color:O.text3,marginTop:8,fontFamily:mono}}>
                  Q อ้างอิงจาก product volume {fmtB(costDashboard.productVolDay,1)} m³/day
                </div>
              </div>
              <div style={{...S.mixBox,margin:0}}>
                <div style={S.mixHead}>COST SHARE BY SYSTEM</div>
                <DonutChart
                  segments={sectionCostRows.map((group,i)=>({
                    label:group.label,
                    value:group.totalCostDay,
                    color:[O.accent,O.cyan,O.gold,O.pass,O.warn,O.text2][i%6],
                  }))}
                  centerLabel={fmtB(costDashboard.totalCostDay,0)}
                  centerSub="฿/day"
                />
              </div>
            </div>

            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
              {COST_GROUPS.map(group=>
                <button key={group.id} onClick={()=>setCostGroupTab(group.id)} style={{...S.exportBtn,...(costGroupTab===group.id?{color:O.bg1,background:O.accent,borderColor:O.accent}:{})}}>
                  {group.label}
                </button>
              )}
            </div>

            <div style={{...S.mixBox,marginBottom:10,borderColor:activeCostGroup.size==='large'?O.cyan:O.gold}}>
              <div style={S.mixHead}>{activeCostGroup.label}</div>
              <div style={S.mixRow}><span>Flow basis</span><span style={S.mixVal}>{activeCostGroup.basis}</span></div>
              <div style={S.mixRow}><span>Volume</span><span style={S.mixVal}>{fmtB(activeCostGroup.hourlyFlow,1)} m³/h · {fmtB(activeCostGroup.volumeDay,1)} m³/day</span></div>
              <div style={S.mixRow}><span>Electricity</span><span style={{...S.mixVal,color:O.accent}}>{fmtB(activeCostGroup.machineCostDay,2)} ฿/day</span></div>
              <div style={S.mixRow}><span>Chemical</span><span style={{...S.mixVal,color:O.gold}}>{fmtB(activeCostGroup.chemicalCostDay,2)} ฿/day</span></div>
              <div style={{...S.mixRow,borderTop:`1px dashed ${O.border}`,paddingTop:6,marginTop:6}}>
                <span>Total section cost</span>
                <span style={{...S.mixVal,color:O.gold}}>{fmtB(activeCostGroup.totalCostDay,2)} ฿/day · {fmtB(activeCostGroup.costPerM3,4)} ฿/m³</span>
              </div>
            </div>

            {/* 1. ELECTRICITY — Equipment Table (Section B/G) */}
            {costGroupTab==='group_uf_ro_plan_A' && <Section title="1. ค่าไฟฟ้า — Equipment Table" open={sec.costElec} onToggle={()=>toggle('costElec')}>
              {/* TOU Tariff inputs (Section C) */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr',gap:5,marginBottom:10}}>
                <div style={S.srcField}><label style={S.srcFieldLabel}>Peak Rate</label><div style={S.srcInputWrap}><NumInput value={peakRate} onValueChange={setPeakRate} style={S.srcInput}/><span style={S.srcUnit}>฿/kWh</span></div></div>
                <div style={S.srcField}><label style={S.srcFieldLabel}>Off-Peak</label><div style={S.srcInputWrap}><NumInput value={offPeakRate} onValueChange={setOffPeakRate} style={S.srcInput}/><span style={S.srcUnit}>฿/kWh</span></div></div>
                <div style={S.srcField}><label style={S.srcFieldLabel}>Ft Charge</label><div style={S.srcInputWrap}><NumInput value={ftCharge} onValueChange={setFtCharge} style={S.srcInput}/><span style={S.srcUnit}>฿/kWh</span></div></div>
                <div style={S.srcField}><label style={S.srcFieldLabel}>Peak h/d</label><div style={S.srcInputWrap}><NumInput value={peakHoursDay} onValueChange={setPeakHoursDay} style={S.srcInput}/><span style={S.srcUnit}>h</span></div></div>
                <div style={S.srcField}><label style={S.srcFieldLabel}>Off-Peak h/d</label><div style={S.srcInputWrap}><NumInput value={offPeakHoursDay} onValueChange={setOffPeakHoursDay} style={S.srcInput}/><span style={S.srcUnit}>h</span></div></div>
              </div>

              {/* Equipment table (Section G) */}
              <div style={{display:'flex',gap:6,marginBottom:8}}>
                <button onClick={loadPreset} style={{...S.exportBtn,color:O.accent,borderColor:O.accent}}>📋 Load UFRO Preset</button>
                <button onClick={addEquip} style={{...S.exportBtn,color:O.pass,borderColor:O.pass}}>+ เพิ่ม</button>
              </div>
              <div style={S.tableScroll}>
                <table style={{...S.table,fontSize:11}}>
                  <thead><tr>
                    <th style={{...S.th,minWidth:160}}>Equipment / Station</th>
                    <th style={{...S.th,textAlign:'right',minWidth:60}}>kW/unit</th>
                    <th style={{...S.th,textAlign:'right',minWidth:40}}>Qty</th>
                    <th style={{...S.th,textAlign:'right',minWidth:55}}>h/day</th>
                    <th style={{...S.th,textAlign:'right',minWidth:70}}>kWh/day</th>
                    <th style={{...S.th,textAlign:'right',minWidth:70}}>฿/day</th>
                    <th style={{...S.th,textAlign:'right',minWidth:65}}>฿/m³</th>
                    <th style={{...S.th,textAlign:'right',minWidth:45}}>%</th>
                    <th style={{...S.th,textAlign:'center',minWidth:30}}></th>
                  </tr></thead>
                  <tbody>
                    {elecCalc.eqWithCost.map((eq)=>(
                      <tr key={eq.id} style={S.tr}>
                        <td style={S.td}><input type="text" value={eq.name} onChange={e=>updateEquip(eq.id,'name',e.target.value)} style={{...S.srcInput,fontSize:11,width:'100%'}}/></td>
                        <td style={{...S.td,textAlign:'right'}}><NumInput value={eq.kw} onValueChange={v=>updateEquip(eq.id,'kw',v)} style={{...S.srcInput,textAlign:'right',width:50}}/></td>
                        <td style={{...S.td,textAlign:'right'}}><NumInput value={eq.qty} onValueChange={v=>updateEquip(eq.id,'qty',v)} style={{...S.srcInput,textAlign:'right',width:30}}/></td>
                        <td style={{...S.td,textAlign:'right'}}><NumInput value={eq.hoursDay} onValueChange={v=>updateEquip(eq.id,'hoursDay',v)} style={{...S.srcInput,textAlign:'right',width:40}}/></td>
                        <td style={{...S.td,textAlign:'right',color:O.text1}}>{fmt(eq.dailyKwh,1)}</td>
                        <td style={{...S.td,textAlign:'right',color:O.accent}}>{fmtB(eq.eqCostDay,1)}</td>
                        <td style={{...S.td,textAlign:'right',color:O.gold}}>{fmtB(eq.eqCostPerM3,3)}</td>
                        <td style={{...S.td,textAlign:'right',color:O.text3}}>{fmt(eq.pctTotal,1)}</td>
                        <td style={{...S.td,textAlign:'center'}}><button onClick={()=>removeEquip(eq.id)} style={{background:'none',border:'none',color:O.fail,cursor:'pointer',fontSize:14}}>×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{...S.mixBox,marginTop:10,borderColor:O.gold}}>
                <div style={S.mixHead}>CLEANING ELECTRICITY / Q</div>
                <div style={S.tableScroll}>
                  <table style={{...S.table,fontSize:11}}>
                    <thead><tr>
                      <th style={{...S.th,minWidth:180}}>Cleaning Event</th>
                      <th style={{...S.th,textAlign:'right'}}>kW</th>
                      <th style={{...S.th,textAlign:'right'}}>Qty</th>
                      <th style={{...S.th,textAlign:'right'}}>h/event</th>
                      <th style={{...S.th,textAlign:'right'}}>days</th>
                      <th style={{...S.th,textAlign:'right'}}>Q/period</th>
                      <th style={{...S.th,textAlign:'right'}}>฿/Q</th>
                    </tr></thead>
                    <tbody>
                      {cleaningEvents.map(ev=>{
                        const row=elecCalc.cleaningRows.find(x=>x.id===ev.id)||{};
                        return <tr key={ev.id} style={S.tr}>
                          <td style={S.td}><input type="text" value={ev.name} onChange={e=>updateCleaning(ev.id,'name',e.target.value)} style={{...S.srcInput,fontSize:11,width:'100%'}}/></td>
                          <td style={{...S.td,textAlign:'right'}}><NumInput value={ev.kw} onValueChange={v=>updateCleaning(ev.id,'kw',v)} style={{...S.srcInput,textAlign:'right',width:48}}/></td>
                          <td style={{...S.td,textAlign:'right'}}><NumInput value={ev.qty} onValueChange={v=>updateCleaning(ev.id,'qty',v)} style={{...S.srcInput,textAlign:'right',width:34}}/></td>
                          <td style={{...S.td,textAlign:'right'}}><NumInput value={ev.hoursEvent} onValueChange={v=>updateCleaning(ev.id,'hoursEvent',v)} style={{...S.srcInput,textAlign:'right',width:48}}/></td>
                          <td style={{...S.td,textAlign:'right'}}><NumInput value={ev.intervalDays} onValueChange={v=>updateCleaning(ev.id,'intervalDays',v)} style={{...S.srcInput,textAlign:'right',width:48}}/></td>
                          <td style={{...S.td,textAlign:'right',color:O.text1}}>{fmtB(row.periodQ||0,0)}</td>
                          <td style={{...S.td,textAlign:'right',color:O.gold}}>{fmtB(row.costPerM3||0,4)}</td>
                        </tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{fontSize:10,color:O.text3,lineHeight:1.7,marginTop:8,fontFamily:mono}}>
                  <div>Note: ค่าไฟเดินเครื่องปกติ = Σ(kW × Qty × h/day) × TOU rate แล้วหารด้วย Q product ต่อวัน</div>
                  <div>UF Online Chemical Cleaning ใช้ interval 7 วัน: ฿/Q = (kW × Qty × h/event × avg ฿/kWh) ÷ Q ที่ผลิตได้ใน 7 วัน</div>
                  <div>RO CIP ใช้ interval 60 วัน: ฿/Q = (kW × Qty × h/event × avg ฿/kWh) ÷ Q ที่ผลิตได้ใน 60 วัน</div>
                </div>
              </div>

              {/* Electricity summary (Section D) */}
              <div style={{...S.mixBox,marginTop:10,borderColor:O.accent}}>
                <div style={S.mixHead}>ELECTRICITY SUMMARY</div>
                <div style={S.mixRow}><span>Regular Daily Energy</span><span style={{...S.mixVal,fontSize:14}}>{fmtB(elecCalc.regularDailyKwh,1)} kWh/day</span></div>
                <div style={S.mixRow}><span>Cleaning Energy Eq.</span><span style={S.mixVal}>{fmtB(elecCalc.cleaningKwhDayEq,1)} kWh/day</span></div>
                <div style={S.mixRow}><span>Total Daily Energy Eq.</span><span style={{...S.mixVal,fontSize:14}}>{fmtB(elecCalc.totalDailyKwh,1)} kWh/day</span></div>
                <div style={S.mixRow}><span>Peak kWh ({peakHoursDay}h)</span><span style={S.mixVal}>{fmtB(elecCalc.peakKwh,1)} kWh</span></div>
                <div style={S.mixRow}><span>Off-Peak kWh ({offPeakHoursDay}h)</span><span style={S.mixVal}>{fmtB(elecCalc.offPeakKwh,1)} kWh</span></div>
                <div style={{...S.mixRow,borderTop:`1px dashed ${O.border}`,paddingTop:4,marginTop:4}}><span>Peak Rate (inc Ft)</span><span style={S.mixVal}>{fmtB(elecCalc.peakCostKwh,4)} ฿/kWh</span></div>
                <div style={S.mixRow}><span>Off-Peak Rate (inc Ft)</span><span style={S.mixVal}>{fmtB(elecCalc.offPeakCostKwh,4)} ฿/kWh</span></div>
                <div style={S.mixRow}><span>Peak Cost</span><span style={S.mixVal}>{fmtB(elecCalc.peakCost,0)} ฿/day</span></div>
                <div style={S.mixRow}><span>Off-Peak Cost</span><span style={S.mixVal}>{fmtB(elecCalc.offPeakCost,0)} ฿/day</span></div>
                <div style={S.mixRow}><span>Regular Electricity Cost</span><span style={S.mixVal}>{fmtB(elecCalc.regularElecCostDay,0)} ฿/day</span></div>
                <div style={S.mixRow}><span>Cleaning Cost Eq.</span><span style={S.mixVal}>{fmtB(elecCalc.cleaningCostDayEq,0)} ฿/day</span></div>
                <div style={{...S.mixRow,borderTop:`1px dashed ${O.border}`,paddingTop:4,marginTop:4,fontWeight:700}}><span>Total Electricity Cost</span><span style={{...S.mixVal,color:O.gold,fontSize:14}}>{fmtB(elecCalc.totalElecCostDay,0)} ฿/day</span></div>
                <div style={S.mixRow}><span>SEC (per m³ feed)</span><span style={S.mixVal}>{fmt(elecCalc.secActual,3)} kWh/m³</span></div>
                <div style={S.mixRow}><span>Cost per m³ product</span><span style={{...S.mixVal,color:O.accent}}>{fmtB(elecCalc.elecPerM3Prod)} ฿/m³</span></div>
                <div style={S.mixRow}><span>Cost per m³ feed</span><span style={S.mixVal}>{fmtB(elecCalc.elecPerM3Feed)} ฿/m³</span></div>
              </div>
            </Section>}

            {costGroupTab==='group_uf_ro_plan_A' && <Section title="2. ค่าเคมี (Chemical)" open={sec.costChem} onToggle={()=>toggle('costChem')}>
              <div style={{...S.mixBox,marginBottom:10,borderColor:O.gold}}>
                <div style={S.mixHead}>PRODUCTION Q REFERENCE</div>
                <div style={S.mixRow}><span>Q product / day</span><span style={S.mixVal}>{fmtB(elecCalc.prodVolDay,0)} m³/day</span></div>
                <div style={S.mixRow}><span>Q product / 1 week</span><span style={{...S.mixVal,color:O.gold}}>{fmtB(elecCalc.prodVolWeek,0)} m³</span></div>
                <div style={S.mixRow}><span>Q product / 2 months (60 days)</span><span style={{...S.mixVal,color:O.accent}}>{fmtB(elecCalc.prodVolTwoMonths,0)} m³</span></div>
                <div style={{fontSize:10,color:O.text3,lineHeight:1.7,marginTop:6,fontFamily:mono}}>
                  Chemical cleaning basis: RO = 1 cleaning / 60 days, UF = 8 cleanings / 60 days. Chemical ฿/Q = (RO chemical cost + UF chemical cost) ÷ Q product in 60 days.
                </div>
              </div>
              <div style={S.tableScroll}>
                <table style={{...S.table,fontSize:11}}>
                  <thead><tr>
                    <th style={{...S.th,minWidth:95}}>Chemical</th>
                    <th style={{...S.th,textAlign:'center'}}>UF/RO</th>
                    <th style={{...S.th,minWidth:150}}>Service</th>
                    <th style={{...S.th,textAlign:'right'}}>kg/event</th>
                    <th style={{...S.th,textAlign:'right'}}>฿/kg</th>
                    <th style={{...S.th,textAlign:'right'}}>฿/event</th>
                    <th style={{...S.th,textAlign:'right'}}>RO ฿/60d</th>
                    <th style={{...S.th,textAlign:'right'}}>UF ฿/60d</th>
                    <th style={{...S.th,textAlign:'right'}}>฿/Q</th>
                  </tr></thead>
                  <tbody>
                    {chemicalRows.map(ch=>{
                      const row=chemCalc.rows.find(x=>x.id===ch.id)||{};
                      return <tr key={ch.id} style={S.tr}>
                        <td style={S.td}><input type="text" value={ch.name} onChange={e=>updateChemical(ch.id,'name',e.target.value)} style={{...S.srcInput,fontSize:11,width:'100%'}}/></td>
                        <td style={{...S.td,textAlign:'center'}}><select value={ch.system||'RO'} onChange={e=>updateChemical(ch.id,'system',e.target.value)} style={{...S.srcInput,fontSize:11,width:70}}>
                          <option value="UF">UF</option>
                          <option value="RO">RO</option>
                          <option value="UF/RO">UF/RO</option>
                        </select></td>
                        <td style={S.td}><input type="text" value={ch.service} onChange={e=>updateChemical(ch.id,'service',e.target.value)} style={{...S.srcInput,fontSize:11,width:'100%'}}/></td>
                        <td style={{...S.td,textAlign:'right'}}><NumInput value={ch.kgEvent} onValueChange={v=>updateChemical(ch.id,'kgEvent',v)} style={{...S.srcInput,textAlign:'right',width:70}}/></td>
                        <td style={{...S.td,textAlign:'right'}}><NumInput value={ch.unitPrice} onValueChange={v=>updateChemical(ch.id,'unitPrice',v)} style={{...S.srcInput,textAlign:'right',width:60}}/></td>
                        <td style={{...S.td,textAlign:'right',color:O.text1}}>{fmtB(row.costEvent||0,0)}</td>
                        <td style={{...S.td,textAlign:'right',color:O.accent}}>{fmtB(row.roCost||0,0)}</td>
                        <td style={{...S.td,textAlign:'right',color:O.gold}}>{fmtB(row.ufCost||0,0)}</td>
                        <td style={{...S.td,textAlign:'right',color:O.gold}}>{fmtB(row.costPerM3||0,5)}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{...S.mixBox,marginTop:8}}>
                <div style={S.mixRow}><span>RO chemical cost (1 time / 60d)</span><span style={{...S.mixVal,color:O.accent}}>{fmtB(chemCalc.roPeriodCost,0)} ฿</span></div>
                <div style={S.mixRow}><span>UF chemical cost (8 times / 60d)</span><span style={{...S.mixVal,color:O.gold}}>{fmtB(chemCalc.ufPeriodCost,0)} ฿</span></div>
                <div style={S.mixRow}><span>Total chemical / 60d</span><span style={S.mixVal}>{fmtB(chemCalc.chemPeriodCost,0)} ฿</span></div>
                <div style={S.mixRow}><span>Chemical cost / Q</span><span style={{...S.mixVal,color:O.gold}}>{fmtB(chemCalc.chemCostPerM3Prod,5)} ฿/m³</span></div>
              </div>
            </Section>}

            {costGroupTab!=='group_uf_ro_plan_A' && activeAuxGroup && <>
              <Section title="1. ค่าไฟฟ้า" open={sec.costElec} onToggle={()=>toggle('costElec')}>
                <div style={{display:'flex',gap:6,marginBottom:8}}>
                  <button onClick={()=>addGroupMachine(activeAuxGroup.id)} style={{...S.exportBtn,color:O.accent,borderColor:O.accent}}>+ Machine</button>
                </div>
                <div style={S.tableScroll}>
                  <table style={{...S.table,fontSize:11}}>
                    <thead><tr>
                      <th style={{...S.th,minWidth:160}}>Machine</th>
                      <th style={{...S.th,textAlign:'right'}}>kW/unit</th>
                      <th style={{...S.th,textAlign:'right'}}>Qty</th>
                      <th style={{...S.th,textAlign:'right'}}>h/day</th>
                      <th style={{...S.th,textAlign:'right'}}>kWh/day</th>
                      <th style={{...S.th,textAlign:'right'}}>฿/day</th>
                      <th style={{...S.th,textAlign:'center',minWidth:30}}></th>
                    </tr></thead>
                    <tbody>
                      {activeAuxGroup.machines.map(row=>
                        <tr key={`group-machine-${row.id}`} style={S.tr}>
                          <td style={S.td}><input type="text" value={row.name} onChange={e=>updateGroupMachine(row.id,'name',e.target.value)} style={{...S.srcInput,fontSize:11,width:'100%'}}/></td>
                          <td style={{...S.td,textAlign:'right'}}><NumInput value={row.kw} onValueChange={v=>updateGroupMachine(row.id,'kw',v)} style={{...S.srcInput,textAlign:'right',width:54}}/></td>
                          <td style={{...S.td,textAlign:'right'}}><NumInput value={row.qty} onValueChange={v=>updateGroupMachine(row.id,'qty',v)} style={{...S.srcInput,textAlign:'right',width:38}}/></td>
                          <td style={{...S.td,textAlign:'right'}}><NumInput value={row.hoursDay} onValueChange={v=>updateGroupMachine(row.id,'hoursDay',v)} style={{...S.srcInput,textAlign:'right',width:48}}/></td>
                          <td style={{...S.td,textAlign:'right'}}>{fmtB(row.dailyKwh,2)}</td>
                          <td style={{...S.td,textAlign:'right',color:O.accent}}>{fmtB(row.costDay,2)}</td>
                          <td style={{...S.td,textAlign:'center'}}><button onClick={()=>removeGroupMachine(row.id)} style={{background:'none',border:'none',color:O.fail,cursor:'pointer',fontSize:14}}>×</button></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Section>
              <Section title="2. ค่าเคมี" open={sec.costChem} onToggle={()=>toggle('costChem')}>
                <div style={{display:'flex',gap:6,marginBottom:8}}>
                  <button onClick={()=>addGroupChemical(activeAuxGroup.id)} style={{...S.exportBtn,color:O.gold,borderColor:O.gold}}>+ Chemical</button>
                </div>
                <div style={S.tableScroll}>
                  <table style={{...S.table,fontSize:11}}>
                    <thead><tr>
                      <th style={{...S.th,minWidth:160}}>Chemical</th>
                      <th style={{...S.th,textAlign:'right'}}>kg/m³</th>
                      <th style={{...S.th,textAlign:'right'}}>฿/kg</th>
                      <th style={{...S.th,textAlign:'right'}}>kg/day</th>
                      <th style={{...S.th,textAlign:'right'}}>฿/day</th>
                      <th style={{...S.th,textAlign:'center',minWidth:30}}></th>
                    </tr></thead>
                    <tbody>
                      {activeAuxGroup.chemicals.map(row=>
                        <tr key={`group-chemical-${row.id}`} style={S.tr}>
                          <td style={S.td}><input type="text" value={row.name} onChange={e=>updateGroupChemical(row.id,'name',e.target.value)} style={{...S.srcInput,fontSize:11,width:'100%'}}/></td>
                          <td style={{...S.td,textAlign:'right'}}><NumInput value={row.dosageKgM3} onValueChange={v=>updateGroupChemical(row.id,'dosageKgM3',v)} style={{...S.srcInput,textAlign:'right',width:62}}/></td>
                          <td style={{...S.td,textAlign:'right'}}><NumInput value={row.unitPrice} onValueChange={v=>updateGroupChemical(row.id,'unitPrice',v)} style={{...S.srcInput,textAlign:'right',width:62}}/></td>
                          <td style={{...S.td,textAlign:'right'}}>{fmtB(row.kgDay,3)}</td>
                          <td style={{...S.td,textAlign:'right',color:O.gold}}>{fmtB(row.costDay,2)}</td>
                          <td style={{...S.td,textAlign:'center'}}><button onClick={()=>removeGroupChemical(row.id)} style={{background:'none',border:'none',color:O.fail,cursor:'pointer',fontSize:14}}>×</button></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Section>
            </>}

            <Section title="ค่าคน / Operation" open={sec.costOps} onToggle={()=>toggle('costOps')}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                <div style={S.srcField}><label style={S.srcFieldLabel}>จำนวนพนักงาน</label><div style={S.srcInputWrap}><NumInput value={staffCount} onValueChange={setStaffCount} style={S.srcInput}/><span style={S.srcUnit}>คน</span></div></div>
                <div style={S.srcField}><label style={S.srcFieldLabel}>เงินเดือน/คน</label><div style={S.srcInputWrap}><NumInput value={staffSalary} onValueChange={setStaffSalary} style={S.srcInput}/><span style={S.srcUnit}>฿/เดือน</span></div></div>
              </div>
              <div style={{...S.mixBox,marginTop:8}}>
                <div style={S.mixRow}><span>รวม/เดือน</span><span style={{...S.mixVal,color:O.gold}}>{fmtB(costCalc.opsCostMonth,0)} ฿</span></div>
                <div style={S.mixRow}><span>ต่อ m³ product</span><span style={S.mixVal}>{fmtB(costCalc.opsCostPerM3Prod)} ฿/m³</span></div>
              </div>
            </Section>

            <div style={{fontSize:10,color:O.text3,textAlign:'center',marginTop:8,fontStyle:'italic'}}>* ต้นทุนประมาณการต่อ Q อ้างอิง m³ product; ยังไม่รวมค่าบำรุงรักษาและค่าเปลี่ยนเมมเบรน</div>
          </Section>

          <footer style={S.footer}>
            <span style={{color:O.text3}}>Cond = TDS × {TDS_TO_COND} · Limit: {REJECT_COND_LIMIT.toLocaleString()} µS/cm · kWh = kW × h</span>
            <span style={{color:O.accent}}>v8.0</span>
          </footer>
        </main>
      </div> : activeTab==='phase10' ? <Phase10Panel
        phase10Calc={phase10Calc}
        sources={phase10Calc.sourceAllocations}
        updateSource={updateSource}
        mode={mode}
        strategy={strategy}
        handleStrategyChange={handleStrategyChange}
        tssReject={tssReject}
        setTssReject={setTssReject}
        sludgeWaterRecovery={sludgeWaterRecovery}
        setSludgeWaterRecovery={setSludgeWaterRecovery}
        phase10ToSalePct={phase10ToSalePct}
        setPhase10ToSalePct={setPhase10ToSalePct}
        phase10HasTargetCond={phase10HasTargetCond}
        setPhase10HasTargetCond={setPhase10HasTargetCond}
        phase10TargetCond={phase10TargetCond}
        setPhase10TargetCond={setPhase10TargetCond}
        phase10HasTargetFlow={phase10HasTargetFlow}
        setPhase10HasTargetFlow={setPhase10HasTargetFlow}
        phase10TargetFlow={phase10TargetFlow}
        setPhase10TargetFlow={setPhase10TargetFlow}
        fmt={fmt}
        fmtC={fmtC}
        vol={vol}
        volUnit={volUnit}
        timeUnit={timeUnit}
        opsHours={opsHours}
      /> : <FutureTab activeTab={activeTab}/>}
    </div>
  );
}

// ════════════ COMPONENTS ════════════
function FutureTab({activeTab}) {
  const data={
    phase10:{title:'Phase 1.0',items:['Multi-source feed screening by NTU and conductivity.','TSS treatment with PAC/Polymer and sludge pond recycle.','Option to sell Phase 1 water directly or blend with Phase 1.5.']},
    diagram:{title:'Project Diagram',items:['Full Phase 1.0 + Phase 1.5 project routing map.','Open/close each water path from the diagram.','Compare sell, recycle, and discharge routes visually.']},
    financial:{title:'Project Financial',items:['Route-by-route OPEX comparison.','Water, power, chemical, sludge, and operation cost rollups.','Scenario comparison for Phase 1, Phase 1.5, and blended sales.']},
  }[activeTab]||{title:'Future Module',items:[]};
  return <div style={S.futurePanel}>
    <div style={S.futureTitle}>{data.title}</div>
    <div style={S.futureSub}>Reserved for Version 8.x development</div>
    <div style={S.futureGrid}>{data.items.map((item,i)=><div key={i} style={S.futureItem}><span style={S.futureIndex}>{String(i+1).padStart(2,'0')}</span>{item}</div>)}</div>
  </div>;
}

function Phase10Panel({phase10Calc,sources,updateSource,mode,strategy,handleStrategyChange,tssReject,setTssReject,sludgeWaterRecovery,setSludgeWaterRecovery,phase10ToSalePct,setPhase10ToSalePct,phase10HasTargetCond,setPhase10HasTargetCond,phase10TargetCond,setPhase10TargetCond,phase10HasTargetFlow,setPhase10HasTargetFlow,phase10TargetFlow,setPhase10TargetFlow,fmt,fmtC,vol,volUnit,timeUnit,opsHours}) {
  return <div style={S.grid} className="ufro-grid">
    <aside style={S.sidebar}>
      <Section title="Phase 1.0 Control" open>
        <div style={S.mixBox}>
          <div style={S.mixHead}>TARGETS</div>
          <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:O.text2,marginBottom:6}}>
            <input type="checkbox" checked={!phase10HasTargetCond} onChange={e=>setPhase10HasTargetCond(!e.target.checked)}/>
            <span>ไม่มี Cond เป้าหมาย</span>
          </label>
          <div style={S.inputRow}>
            <div style={S.inputLabel}>Cond เป้าหมาย</div>
            <div style={{...S.inputWrap,...(!phase10HasTargetCond?S.srcInputRO:{})}}>
              <NumInput value={phase10TargetCond} onValueChange={setPhase10TargetCond} style={S.input} readOnly={!phase10HasTargetCond}/>
              <span style={S.inputUnit}>µS/cm</span>
            </div>
          </div>
          <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:O.text2,margin:'8px 0 6px'}}>
            <input type="checkbox" checked={!phase10HasTargetFlow} onChange={e=>setPhase10HasTargetFlow(!e.target.checked)}/>
            <span>ไม่มี Flow เป้าหมาย</span>
          </label>
          <div style={S.inputRow}>
            <div style={S.inputLabel}>{mode==='know-output'?'Product Flow เป้าหมาย':'Flow เป้าหมาย'}</div>
            <div style={{...S.inputWrap,...(!phase10HasTargetFlow?S.srcInputRO:{})}}>
              <NumInput value={vol(phase10TargetFlow)} onValueChange={v=>setPhase10TargetFlow(timeUnit==='daily'?v/(opsHours||1):v)} style={S.input} readOnly={!phase10HasTargetFlow}/>
              <span style={S.inputUnit}>{volUnit}</span>
            </div>
          </div>
        </div>
        <SliderRow label="TSS Process Reject" value={tssReject} onChange={setTssReject} min={0} max={30} step={0.5} unit="%"/>
        <SliderRow label="Sludge Pond Water Return" value={sludgeWaterRecovery} onChange={setSludgeWaterRecovery} min={0} max={100} step={1} unit="%"/>
        <SliderRow label="Phase 1 Product -> Sale" value={phase10ToSalePct} onChange={v=>setPhase10ToSalePct(Math.max(0,Math.min(100,v)))} min={0} max={100} step={1} unit="%"/>
        <div style={S.mixBox}>
          <div style={S.mixHead}>PHASE 1.0 BALANCE</div>
          <div style={S.mixRow}><span>Raw Feed</span><span style={S.mixVal}>{fmt(vol(phase10Calc.feedFlow),1)} {volUnit}</span></div>
          <div style={S.mixRow}><span>After TSS</span><span style={S.mixVal}>{fmt(vol(phase10Calc.processOut),1)} {volUnit}</span></div>
          <div style={S.mixRow}><span>To Sale</span><span style={S.mixVal}>{fmt(vol(phase10Calc.toSaleFlow),1)} {volUnit}</span></div>
          <div style={S.mixRow}><span>To P1.5 Blend</span><span style={S.mixVal}>{fmt(vol(phase10Calc.toPhase15Flow),1)} {volUnit}</span></div>
          <div style={S.mixRow}><span>Sludge Return</span><span style={S.mixVal}>{fmt(vol(phase10Calc.sludgeWaterReturn),1)} {volUnit}</span></div>
        </div>
      </Section>
      <Section title="แหล่งน้ำดิบ (Feed Sources)" open>
        {mode==='know-output' && <div style={S.strategyTabs}>{['optimize','equal','manual'].map(s=>(
          <button key={s} style={{...S.stratTab,...(strategy===s?S.stratTabActive:{})}} onClick={()=>handleStrategyChange(s)}>{s==='optimize'?'Optimize':s==='equal'?'Equal':'Manual'}</button>))}</div>}
        <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
          {sources.map((s,i)=><div key={s.id} style={{...S.srcCard,...(s.enabled?S.srcCardOn:{})}}>
            <div style={S.srcHeader}>
              <button style={{...S.srcToggle,...(s.enabled?S.srcToggleOn:{})}} onClick={()=>updateSource(s.id,'enabled',!s.enabled)}>{s.enabled?'●':'○'}</button>
              <input type="text" value={s.name} onChange={e=>updateSource(s.id,'name',e.target.value)} style={S.srcName} disabled={!s.enabled}/>
              <span style={S.srcIdx}>S{i+1}</span>
            </div>
            {s.enabled && <div style={{display:'flex',flexDirection:'column',gap:5,marginTop:8}}>
              <div style={S.srcInputs}>
                <div style={S.srcField}><label style={S.srcFieldLabel}>Cond</label><div style={S.srcInputWrap}><NumInput value={Math.round(tds2cond(s.tds))} onValueChange={v=>updateSource(s.id,'tds',cond2tds(v))} style={S.srcInput}/><span style={S.srcUnit}>µS/cm</span></div></div>
                <div style={S.srcField}><label style={S.srcFieldLabel}>{mode==='know-input'?'Flow':'Ratio'}</label><div style={S.srcInputWrap}><NumInput value={mode==='know-input'?s.flow:parseFloat((s.ratio||0).toFixed(1))} onValueChange={v=>updateSource(s.id,mode==='know-input'?'flow':'ratio',v)} style={S.srcInput}/><span style={S.srcUnit}>{mode==='know-input'?'m³/h':'%'}</span></div></div>
              </div>
            </div>}
          </div>)}
        </div>
      </Section>
    </aside>
    <main style={S.main}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8}}>
        <KPI label="Feed" value={fmt(vol(phase10Calc.feedFlow),1)} unit={volUnit}/>
        <KPI label="Product" value={fmt(vol(phase10Calc.processOut),1)} unit={volUnit} highlight/>
        <KPI label="Recovery" value={fmt(phase10Calc.recovery,1)} unit="%"/>
        <KPI label="Cond" value={fmtC(phase10Calc.feedTDS)} unit="µS/cm"/>
        <KPI label="Sludge Waste" value={fmt(vol(phase10Calc.sludgeWaste),1)} unit={volUnit} warning/>
        <KPI label="Cond Target" value={phase10Calc.targetCondStatus} unit="" badge={phase10Calc.targetCondStatus==='OFF'?undefined:phase10Calc.targetCondStatus}/>
        <KPI label="Flow Target" value={phase10Calc.targetFlowStatus} unit="" badge={phase10Calc.targetFlowStatus==='OFF'?undefined:phase10Calc.targetFlowStatus}/>
      </div>
      <Section title="Phase 1.0 Diagram" open>
        <div style={S.diagramScrollWrapper}>
          <Phase10Diagram phase10Calc={phase10Calc} sources={sources} fmt={fmt} fmtC={fmtC} vol={vol} volUnit={volUnit}/>
        </div>
      </Section>
    </main>
  </div>;
}

function Phase10Diagram({phase10Calc,sources,fmt,fmtC,vol,volUnit}) {
  const srcs = sources.filter(s=>s.enabled).slice(0,5);
  const node = (x,y,w,h,title,value,accent=O.cyan,cond) => <g filter="url(#nodeShadow)">
    <rect x={x} y={y} width={w} height={h} rx="4" fill={O.bg2} stroke={accent}/>
    <rect x={x} y={y} width={w} height="4" rx="4" fill={accent}/>
    <text x={x+w/2} y={y+14} textAnchor="middle" fill={O.text2} fontSize="9" fontWeight="700" fontFamily={mono}>{title}</text>
    {value!==undefined && <text x={x+w/2} y={y+h-(cond?18:9)} textAnchor="middle" fill={accent} fontSize="10" fontWeight="800" fontFamily={mono}>{value}</text>}
    {cond && <text x={x+w/2} y={y+h-6} textAnchor="middle" fill={O.text3} fontSize="8" fontWeight="700" fontFamily={mono}>Cond {cond} µS/cm</text>}
  </g>;
  const arrow = (d,color=O.text1) => <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#p10-${color.replace('#','')})`}/>;
  return <svg viewBox="0 0 1700 800" style={{display:'block',width:'100%',height:'auto',minWidth:1450}} xmlns="http://www.w3.org/2000/svg">
    <rect width="1700" height="800" fill={O.bg1}/>
    <defs>
      {[O.text1,O.cyan,O.gold,O.warn,O.pass,O.fail,O.text3].map(c=><marker key={c} id={`p10-${c.replace('#','')}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={c}/></marker>)}
      <filter id="nodeShadow" x="-25%" y="-60%" width="150%" height="220%"><feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.35"/></filter>
    </defs>
    <rect x="24" y="24" width="1652" height="752" rx="8" fill="#081625" stroke={O.border}/>
    <text x="48" y="70" fill={O.text1} fontSize="26" fontWeight="800" fontFamily={mono}>Phase 1.0</text>
    <rect x="330" y="150" width="520" height="420" rx="8" fill="#23180a" fillOpacity="0.42" stroke={O.gold}/>
    <text x="350" y="178" fill={O.gold} fontSize="11" fontWeight="800" fontFamily={mono}>TSS REMOVAL SYSTEM</text>
    {srcs.map((s,i)=>node(60,104+i*58,145,42,`Source ${i+1}`,`${fmt(vol(modeFlow(s)),1)} ${volUnit}`,O.pass,fmtC(s.tds || phase10Calc.feedTDS)))}
    {srcs.map((s,i)=>arrow(`M 205 ${125+i*58} H 260 V 218 H 349`,O.text1))}
    {node(349,190,130,42,'Inlet',`${fmt(vol(phase10Calc.feedFlow),1)} ${volUnit}`,O.cyan,fmtC(phase10Calc.feedTDS))}
    {node(500,112,110,42,'PAC',undefined,O.fail)}
    {node(630,112,110,42,'POLYMER',undefined,O.fail)}
    {arrow('M 555 154 V 184 H 633 V 195',O.text1)}
    {arrow('M 685 154 V 184 H 633 V 195',O.text1)}
    <circle cx="633" cy="205" r="11" fill={O.accent}/>
    {arrow('M 479 211 H 622',O.text1)}
    {arrow('M 644 205 H 683 V 270',O.text1)}
    {node(670,248,126,44,'Process 90%',`${fmt(vol(phase10Calc.processOut),1)} ${volUnit}`,O.cyan,fmtC(phase10Calc.feedTDS))}
    {arrow('M 733 292 V 327',O.text1)}
    {node(670,327,126,44,'Reject',`${fmt(vol(phase10Calc.rejectFlow),1)} ${volUnit}`,O.warn,fmtC(phase10Calc.feedTDS))}
    {arrow('M 733 371 V 409',O.text1)}
    {node(650,409,166,46,'Sludge Pond',`${fmt(vol(phase10Calc.sludgeWaterReturn),1)} return`,O.warn,fmtC(phase10Calc.feedTDS))}
    {arrow('M 733 455 V 493',O.text1)}
    {node(718,493,130,42,'Sludge Waste',`${fmt(vol(phase10Calc.sludgeWaste),1)} ${volUnit}`,O.fail,fmtC(phase10Calc.feedTDS))}
    <path d="M 663 424 H 520 V 220 H 622" fill="none" stroke={O.text3} strokeWidth="2" strokeDasharray="6 5"/>
    <text x="515" y="390" fill={O.text3} fontSize="9" fontFamily={mono}>Water return</text>
    {arrow('M 796 270 H 875',O.text1)}
    {node(875,249,132,42,'Phase 1 Tank',`${fmt(vol(phase10Calc.processOut),1)} ${volUnit}`,O.cyan,fmtC(phase10Calc.feedTDS))}
    {arrow('M 1007 270 H 1120',O.text1)}
    <circle cx="1120" cy="270" r="10" fill={O.fail}/>
    {arrow('M 1120 270 H 1250',O.pass)}
    {node(1250,249,132,42,'Sale Water',`${fmt(vol(phase10Calc.toSaleFlow),1)} ${volUnit}`,O.pass,fmtC(phase10Calc.feedTDS))}
    {arrow('M 1120 270 V 405 H 1250',O.accent)}
    {node(1250,384,150,42,'To P1.5 Blend',`${fmt(vol(phase10Calc.toPhase15Flow),1)} ${volUnit}`,O.accent,fmtC(phase10Calc.feedTDS))}
  </svg>;
}

function modeFlow(source) {
  return source.actualFlow !== undefined ? source.actualFlow : toNumber(source.flow);
}

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
  const c={PASS:O.pass,WARNING:O.gold,FAIL:O.fail};const bg={PASS:O.pass+'22',WARNING:O.gold+'22',FAIL:O.fail+'22'};
  return <span style={{display:'inline-block',padding:small?'1px 5px':'2px 8px',borderRadius:2,fontSize:small?8:10,fontWeight:700,letterSpacing:'0.1em',color:c[status]||O.text3,background:bg[status]||'transparent',border:`1px solid ${c[status]||O.border}`,fontFamily:mono}}>{status}</span>;
}
function DonutChart({segments,centerLabel,centerSub}) {
  const total=segments.reduce((s,x)=>s+(x.value||0),0);if(!total)return<div style={{width:140,height:140,display:'flex',alignItems:'center',justifyContent:'center',color:O.text3}}>—</div>;
  const size=140,cx=70,cy=70,r=52,stroke=16,circ=2*Math.PI*r;
  const arcs=segments.reduce((acc,seg)=>{const p=seg.value/total,d=circ*p;acc.rows.push({...seg,d,g:circ-d,offset:acc.offset});acc.offset+=d;return acc;},{rows:[],offset:0}).rows;
  return(<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
    <div style={{position:'relative',width:size,height:size}}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{width:'100%',height:'100%',transform:'rotate(-90deg)'}}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={O.bg2} strokeWidth={stroke}/>
        {arcs.map((seg,i)=><circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={stroke} strokeDasharray={`${seg.d} ${seg.g}`} strokeDashoffset={-seg.offset} style={{transition:'all 0.3s'}}/>)}</svg>
      <div style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
        <div style={{fontSize:18,fontWeight:700,color:O.text1,fontFamily:serif}}>{centerLabel}</div><div style={{fontSize:9,color:O.text3,fontFamily:mono}}>{centerSub}</div></div>
    </div>
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
function LossBreakdown({calc,vol,volUnit}) {
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
        <div style={{fontSize:18,color:O.text1,fontWeight:600,fontFamily:serif,marginTop:4}}>{f(vol(calc.ufRejectFlow))} {volUnit}</div></div>
      <div style={{background:O.bg2,border:`1px solid ${O.border}`,borderRadius:4,padding:10}}>
        <div style={{fontSize:10,color:O.text3,fontFamily:mono}}>RO Loss <StatusBadge status={calc.roRejectStatus} small/></div>
        <div style={{fontSize:18,color:O.text1,fontWeight:600,fontFamily:serif,marginTop:4}}>{f(vol(calc.roRejectFlow))} {volUnit}</div></div>
    </div></div>);
}

// ════════════ PROCESS DIAGRAM ════════════
function Phase15ProjectDiagram({svgRef,calc,sources,fmtC,fmt,vol,volUnit,dilution,finalAllowed,finalSeverity}) {
  const f=(n,d=1)=>fmt(vol(n),d), fc=(tds)=>fmtC(tds);
  const active=(id)=>calc.routes?.[id]?.enabled, op=(id)=>active(id)?1:0.18, sw=(id)=>active(id)?5:2;
  const cA='#1f5e87', cB='#ff7a1a', cC='#ff3030', blue='#315f91', green='#2f7041', red='#f08085', purple='#d99aee', yellow='#ffe063';
  const statusColor={PASS:'#228a4d',WARNING:'#d99600',FAIL:'#d32f2f'}[finalSeverity]||'#228a4d';
  const srcs=sources.filter(s=>(s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow))>0.01).slice(0,4);
  const srcYs=[118,178,238,298], routeLabel=['A','B','C'].filter(active).join('+')||'-';
  const Box=({x,y,w,h,label,sub,fill=green,size=14,color='white',rx=6})=><g><rect x={x} y={y} width={w} height={h} rx={rx} fill={fill}/><text x={x+w/2} y={y+h/2-(sub?5:0)} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={size} fontWeight="700" fontFamily="'IBM Plex Sans Thai',sans-serif">{label}</text>{sub&&<text x={x+w/2} y={y+h/2+13} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="11" fontWeight="600" fontFamily={mono}>{sub}</text>}</g>;
  const L=({d,color=blue,width=4,opacity=1})=><path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#arr-${color.replace('#','')})`} opacity={opacity}/>;
  const v={raw:223.0,tss:200.7,ufFeed:201,ufProduct:181,ufReject:20,roProduct:146,roReject:35,waste:77.0,returnWater:15.6,planA:146.0};
  const onA=active('A'), onB=active('B'), onC=active('C');
  const eOp=(on)=>on?1:0.22;
  const eSw=(on)=>on?4.5:2;
  const EBox=({x,y,w,h,title,value,unit='m³/h',tone='blue',opacity=1})=>{
    const stroke={blue:O.accent,green:O.teal,amber:O.warn,red:O.fail,purple:'#a78bfa'}[tone]||O.accent;
    const fill={blue:'#0c1a2e',green:'#082f2d',amber:'#2b1d0d',red:'#2b1114',purple:'#17152f'}[tone]||'#0c1a2e';
    return <g opacity={opacity}>
      <rect x={x} y={y} width={w} height={h} rx="10" fill={fill} stroke={stroke} strokeWidth="2"/>
      <text x={x+14} y={y+22} fill={O.text2} fontSize="13" fontWeight="700" fontFamily="'IBM Plex Sans Thai', Inter, sans-serif">{title}</text>
      {value!==undefined&&<><text x={x+14} y={y+h-18} fill={tone==='amber'?O.gold:O.accent} fontSize="25" fontWeight="800" fontFamily="Inter, ui-monospace, monospace">{value}</text><text x={x+w-14} y={y+h-20} textAnchor="end" fill={O.text3} fontSize="12" fontWeight="700" fontFamily="Inter, sans-serif">{unit}</text></>}
    </g>;
  };
  const EArrow=({d,color=O.accent,on=true,dash,width})=><path d={d} fill="none" stroke={color} strokeWidth={width||eSw(on)} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#eng-${color.replace('#','')})`} opacity={eOp(on)} strokeDasharray={dash}/>;
  return <svg ref={svgRef} viewBox="0 0 1720 760" style={{width:'100%',height:'auto',minWidth:1400}} xmlns="http://www.w3.org/2000/svg">
    <rect width="1720" height="760" fill={O.bg1}/>
    <defs>
      {[O.accent,O.teal,O.warn,O.fail,O.text3,'#a78bfa'].map(color=><marker key={color} id={`eng-${color.replace('#','')}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={color}/></marker>)}
      <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={O.accent} floodOpacity="0.22"/></filter>
    </defs>
    <rect x="24" y="20" width="1672" height="720" rx="14" fill="#081426" stroke={O.border} strokeWidth="2"/>
    <text x="52" y="62" fill={O.text1} fontSize="30" fontWeight="800" fontFamily="Inter, 'IBM Plex Sans Thai', sans-serif">UF/RO Phase 1.5 Process Diagram</text>
    <text x="52" y="91" fill={O.text3} fontSize="14" fontWeight="700" fontFamily={mono}>Active: {routeLabel} | Product {f(calc.finalProduct,1)} {volUnit} | Reject {f(calc.totalReject,1)} {volUnit}</text>
    <rect x="1280" y="42" width="360" height="48" rx="10" fill="#0c1a2e" stroke={O.accent} strokeWidth="2"/>
    <text x="1300" y="72" fill={O.text1} fontSize="15" fontWeight="800" fontFamily={mono}>Active: A | Product 146.0 m³/h | Reject 77.0 m³/h</text>

    <rect x="250" y="126" width="390" height="420" rx="14" fill="#3a1018" fillOpacity="0.72" stroke={O.fail} strokeOpacity="0.75" strokeWidth="2"/>
    <text x="274" y="158" fill="#fca5a5" fontSize="18" fontWeight="800" fontFamily="'IBM Plex Sans Thai', Inter, sans-serif">Pre-treatment / TSS Removal</text>
    <rect x="660" y="126" width="720" height="330" rx="14" fill="#17152f" fillOpacity="0.82" stroke={O.accent} strokeOpacity="0.85" strokeWidth="2"/>
    <text x="684" y="158" fill={O.accent} fontSize="18" fontWeight="800" fontFamily="'IBM Plex Sans Thai', Inter, sans-serif">UF/RO Process</text>
    <rect x="660" y="480" width="720" height="210" rx="14" fill="#2b1d0d" fillOpacity="0.82" stroke={O.warn} strokeOpacity="0.9" strokeWidth="2"/>
    <text x="684" y="512" fill={O.gold} fontSize="18" fontWeight="800" fontFamily="'IBM Plex Sans Thai', Inter, sans-serif">Dilution / Mixing / Discharge</text>

    {(srcs.length?srcs:[{id:'ril',name:'RIL Main Feed',actualFlow:v.raw,tds:calc.feedTDS}]).map((s,i)=>{
      const y=170+i*58, fl=s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow);
      return <g key={s.id}><EBox x={54} y={y} w={148} h={44} title={s.name||`น้ำ${i+1}`} value={fmt(vol(fl),0)} tone="green"/><path d={`M 202 ${y+22} H 238 ${i===0?'':`V 199`} H 250`} fill="none" stroke={O.text3} strokeWidth="3" strokeLinecap="round"/></g>;
    })}
    <EBox x={270} y={212} w={160} h={78} title="Raw / Mixed Feed" value={v.raw.toFixed(1)} tone="blue"/>
    <EArrow d="M 430 251 H 495" color={O.accent}/>
    <EBox x={495} y={212} w={122} h={78} title="TSS Process" value={v.tss.toFixed(1)} tone="red"/>
    <EBox x={430} y={162} w={82} h={42} title="PAC" tone="green"/><EBox x={526} y={162} w={82} h={42} title="POLYMER" tone="green"/>
    <path d="M 471 204 V 226" fill="none" stroke={O.teal} strokeWidth="3"/><path d="M 567 204 V 226" fill="none" stroke={O.teal} strokeWidth="3"/>
    <EArrow d="M 556 290 V 350" color={O.warn}/>
    <EBox x={472} y={350} w={160} h={78} title="Sludge Pond" value={v.returnWater.toFixed(1)} tone="red"/>
    <text x="550" y="447" textAnchor="middle" fill={O.text3} fontSize="13" fontWeight="700" fontFamily={mono}>Sludge Water Return</text>
    <path d="M 472 392 H 318 V 290" fill="none" stroke={O.text3} strokeWidth="3" strokeDasharray="8 7" markerEnd={`url(#eng-${O.text3.replace('#','')})`}/>

    <EArrow d="M 617 251 H 706" color={O.accent} on={onA}/>
    <polygon points="706,226 731,251 706,276 681,251" fill={O.accent} opacity={eOp(onA)} filter="url(#softGlow)"/>
    <EArrow d="M 731 251 H 804" color={O.accent} on={onA}/>
    <EBox x={804} y={212} w={160} h={78} title="UF Feed" value={v.ufFeed.toFixed(0)} tone="purple" opacity={eOp(onA)}/>
    <EArrow d="M 964 251 H 1034" color={O.accent} on={onA}/>
    <EBox x={1034} y={212} w={160} h={78} title="UF Product" value={v.ufProduct.toFixed(0)} tone="blue" opacity={eOp(onA)}/>
    <EArrow d="M 1194 251 H 1260" color={O.accent} on={onA}/>
    <EBox x={1260} y={212} w={100} h={78} title="RO Product" value={v.roProduct.toFixed(0)} tone="blue" opacity={eOp(onA)}/>
    <EArrow d="M 1360 251 H 1490" color={O.accent} on={onA||onB||onC}/>
    <EBox x={1490} y={212} w={150} h={78} title="Final Tank / Sale" value={v.planA.toFixed(1)} tone="green" opacity={eOp(onA||onB||onC)}/>

    <EArrow d="M 884 290 V 340" color={O.warn} on={onA}/>
    <EBox x={804} y={340} w={160} h={66} title="UF Reject" value={v.ufReject.toFixed(0)} tone="amber" opacity={eOp(onA)}/>
    <EArrow d="M 1340 290 V 340" color={O.warn} on={onA}/>
    <EBox x={1260} y={340} w={160} h={66} title="RO Reject" value={v.roReject.toFixed(0)} tone="amber" opacity={eOp(onA)}/>
    <EArrow d="M 884 406 V 526 H 940" color={O.warn} on={onA}/><EArrow d="M 1340 406 V 526 H 1110" color={O.warn} on={onA}/>

    <path d="M 706 226 V 128 H 800" fill="none" stroke={O.warn} strokeWidth={eSw(onB)} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#eng-${O.warn.replace('#','')})`} opacity={eOp(onB)}/>
    <EBox x={800} y={104} w={134} h={64} title="Plan 1.5 B" value={fmt(vol(calc.routes?.B?.product||0),1)} tone="amber" opacity={eOp(onB)}/>
    <path d="M 934 136 H 1514 V 212" fill="none" stroke={O.warn} strokeWidth={eSw(onB)} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#eng-${O.warn.replace('#','')})`} opacity={eOp(onB)}/>

    <path d="M 352 212 V 116 H 720" fill="none" stroke={O.fail} strokeWidth={eSw(onC)} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#eng-${O.fail.replace('#','')})`} opacity={eOp(onC)}/>
    <EBox x={720} y={92} w={134} h={64} title="Plan 1.5 C" value={fmt(vol(calc.routes?.C?.product||0),1)} tone="red" opacity={eOp(onC)}/>
    <path d="M 854 124 H 1540 V 212" fill="none" stroke={O.fail} strokeWidth={eSw(onC)} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#eng-${O.fail.replace('#','')})`} opacity={eOp(onC)}/>

    <EBox x={944} y={512} w={170} h={82} title="Wastewater / Reject Tank" value={v.waste.toFixed(1)} tone="amber"/>
    <EArrow d="M 1029 594 V 638 H 1190" color={O.warn}/>
    <EBox x={1190} y={610} w={150} h={58} title="Discharge" value={finalAllowed?'PASS':'FAIL'} unit="" tone={finalAllowed?'green':'red'}/>
    <path d="M 944 553 H 760 V 300 H 495" fill="none" stroke={O.text3} strokeWidth="3" strokeDasharray="8 7" markerEnd={`url(#eng-${O.text3.replace('#','')})`}/>
    <text x="760" y="583" fill={O.text3} fontSize="13" fontWeight="700" fontFamily="'IBM Plex Sans Thai', Inter, sans-serif">Return line to TSS if discharge is not allowed</text>
    <text x="1016" y="624" textAnchor="middle" fill={O.text3} fontSize="13" fontWeight="700" fontFamily={mono}>{dilution?.needed&&!dilution?.cannotSolve?`Final ${Math.round(dilution.finalCond||tds2cond(calc.totalRejectTDS)).toLocaleString()} µS/cm`:fc(calc.totalRejectTDS)+' µS/cm'}</text>
  </svg>;
  return <svg ref={svgRef} viewBox="0 0 1700 620" style={{width:'100%',height:'auto',minWidth:1320}} xmlns="http://www.w3.org/2000/svg">
    <rect width="1700" height="620" fill="#dedede"/>
    <defs>{[blue,cA,cB,cC,'#333333',statusColor].map(color=><marker key={color} id={`arr-${color.replace('#','')}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={color}/></marker>)}</defs>
    <rect x="350" y="70" width="260" height="500" fill={red} opacity="0.95"/><rect x="610" y="70" width="690" height="330" fill={purple} opacity="0.9"/><rect x="610" y="400" width="690" height="170" fill={yellow} opacity="0.96"/>
    <text x="55" y="58" fill="#000" fontSize="40" fontWeight="600" fontFamily="Arial, sans-serif">Phase 1.5</text><text x="1030" y="18" textAnchor="middle" fill="#000" fontSize="24" fontWeight="800" fontFamily="'IBM Plex Sans Thai',sans-serif">แผน 1.5 C</text><text x="790" y="110" fill="#000" fontSize="24" fontWeight="800" fontFamily="'IBM Plex Sans Thai',sans-serif">แผน 1.5 B</text><text x="850" y="240" fill="#000" fontSize="24" fontWeight="800" fontFamily="'IBM Plex Sans Thai',sans-serif">แผน 1.5 A</text><text x="1465" y="20" fill="#000" fontSize="20" fontWeight="800" writingMode="vertical-rl" fontFamily="'IBM Plex Sans Thai',sans-serif">น้ำPhase 1.5</text>
    {srcs.map((s,i)=>{const fl=s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow);return <g key={s.id}><Box x={78} y={srcYs[i]} w={90} h={38} label={s.name||`น้ำ${i+1}`} sub={f(fl,0)} size={13}/><path d={`M 168 ${srcYs[i]+19} H 258 V 218`} fill="none" stroke={blue} strokeWidth="4" strokeLinecap="round"/></g>})}
    <L d="M 258 218 H 360" color={blue}/><polygon points="360,195 383,218 360,241 337,218" fill="#1600b8"/><text x="360" y="272" textAnchor="middle" fill="#111" fontSize="11" fontWeight="700" fontFamily={mono}>{fc(calc.feedTDS)} µS/cm</text>
    <Box x={372} y={76} w={76} h={26} label="ระบบกำจัดTSS" fill="#ff3030" size={10}/><Box x={450} y={108} w={66} h={36} label="PAC" size={12}/><Box x={528} y={108} w={66} h={36} label="POLYMER" size={11}/>
    <L d="M 483 144 V 188" color={blue}/><L d="M 561 144 V 218 H 528" color={blue}/><circle cx="450" cy="218" r="11" fill={green}/><L d="M 383 218 H 450" color={blue}/><L d="M 450 218 H 528 V 246" color={blue}/>
    <Box x={478} y={246} w={112} h={38} label="Process 90%" sub={f(calc.tssOutFlow,0)} size={12}/><L d="M 534 284 V 316" color={blue}/><Box x={478} y={316} w={112} h={38} label="Process reject 10%" sub={f(calc.tssRejectFlow,0)} size={11}/><L d="M 534 354 V 386" color={blue}/><Box x={478} y={386} w={112} h={48} label="Sludge Pond" sub={`70% water ${f(calc.sludgeWaterRecycle,0)}`} size={11}/><L d="M 534 434 V 468" color={blue}/><Box x={478} y={468} w={112} h={38} label="ทิ้ง 30% Slude" sub={f(calc.sludgeWasteFlow,0)} size={11}/><path d="M 478 404 H 424 V 298 H 478" fill="none" stroke={blue} strokeWidth="4" strokeLinecap="round" markerEnd={`url(#arr-${blue.replace('#','')})`}/><text x="438" y="356" fill="#000" fontSize="14" fontWeight="800" transform="rotate(-90 438 356)" fontFamily={mono}>น้ำ 70%</text>
    <L d="M 590 265 H 690" color={cA} width={sw('A')} opacity={op('A')}/><polygon points="690,240 715,265 690,290 665,265" fill="#1600b8" opacity={op('A')}/><L d="M 715 265 H 815" color={cA} width={sw('A')} opacity={op('A')}/><Box x={815} y={246} w={118} h={38} label="UF System" sub={active('A')?f(calc.ufOut,0):''} size={12}/><L d="M 933 265 H 995" color={cA} width={sw('A')} opacity={op('A')}/><Box x={995} y={246} w={68} h={38} label="ลงถัง" size={12}/><L d="M 1063 265 H 1125" color={cA} width={sw('A')} opacity={op('A')}/><Box x={1125} y={246} w={116} h={38} label="RO System" sub={active('A')?f(calc.roOut,0):''} size={12}/><L d="M 1241 265 H 1370" color={cA} width={sw('A')} opacity={op('A')}/>
    <L d="M 875 284 V 322" color={cA} opacity={op('A')}/><Box x={815} y={322} w={118} h={38} label="UF Reject" sub={active('A')?f(calc.ufRejectFlow,0):''} size={12}/><L d="M 875 360 V 386 H 1010" color={cA} opacity={op('A')}/><Box x={990} y={386} w={68} h={38} label="ลงถัง" size={12}/><L d="M 1183 284 V 322" color={cA} opacity={op('A')}/><Box x={1125} y={322} w={116} h={38} label="RO Reject" sub={active('A')?f(calc.roRejectFlow,0):''} size={12}/><L d="M 1183 360 V 386 H 1058" color={cA} opacity={op('A')}/>
    <L d="M 690 240 V 126 H 758" color={cB} width={sw('B')} opacity={op('B')}/><Box x={758} y={107} w={72} h={38} label="ลงถัง" sub={active('B')?f(calc.routes.B.product,0):''} fill="#ff7a1a" size={12}/><path d="M 830 126 H 1360 V 265" fill="none" stroke={cB} strokeWidth={sw('B')} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#arr-${cB.replace('#','')})`} opacity={op('B')}/>
    <path d="M 360 195 V 42 H 745" fill="none" stroke={cC} strokeWidth={sw('C')} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#arr-${cC.replace('#','')})`} opacity={op('C')}/><Box x={745} y={22} w={70} h={38} label="ลงถัง" sub={active('C')?f(calc.routes.C.product,0):''} fill="#ff3030" size={12}/><path d="M 815 42 H 1380 V 265" fill="none" stroke={cC} strokeWidth={sw('C')} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#arr-${cC.replace('#','')})`} opacity={op('C')}/>
    <Box x={1360} y={246} w={72} h={38} label="ลงถัง" sub={f(calc.finalProduct,0)} size={12}/><L d="M 1432 265 H 1605" color={blue}/><circle cx="1610" cy="265" r="11" fill={green}/><text x="1638" y="267" fill="#000" fontSize="24" fontWeight="800" fontFamily="'IBM Plex Sans Thai',sans-serif">C ขาย</text><text x="1638" y="295" fill="#000" fontSize="22" fontWeight="700" fontFamily="'IBM Plex Sans Thai',sans-serif">น้ำPhase</text><text x="1668" y="325" fill="#000" fontSize="22" fontWeight="700" fontFamily="'IBM Plex Sans Thai',sans-serif">1.5</text><path d="M 1610 265 V 355" fill="none" stroke={blue} strokeWidth="4" strokeLinecap="round" markerEnd={`url(#arr-${blue.replace('#','')})`}/>
    <Box x={625} y={404} w={185} h={26} label="ระบบปล่อยน้ำทิ้ง หรือ กลับมาใช้ใหม่" fill="#ff3030" size={11}/><Box x={782} y={450} w={68} h={38} label="คลอง" size={12}/><L d="M 850 469 H 910" color={blue}/><Box x={910} y={450} w={108} h={38} label="ถังน้ำผสม+น้ำเสีย" sub={f(calc.totalReject,0)} size={11}/><text x="1005" y="422" fill="#000" fontSize="18" fontWeight="800" fontFamily="'IBM Plex Sans Thai',sans-serif">ค่าน้ำไม่ผ่าน</text><text x="1095" y="422" fill="#000" fontSize="18" fontWeight="800" fontFamily="'IBM Plex Sans Thai',sans-serif">ค่าน้ำผ่าน</text><path d="M 1018 469 H 1075 V 540 H 1018 V 488" fill="none" stroke={blue} strokeWidth="4" strokeLinecap="round"/><polygon points="1024,525 1047,548 1024,571 1001,548" fill="#1600b8"/><path d="M 1047 548 H 1190" fill="none" stroke={blue} strokeWidth="4" strokeLinecap="round" markerEnd={`url(#arr-${blue.replace('#','')})`}/><Box x={1190} y={529} w={68} h={38} label="คลองทิ้ง" size={12}/><path d="M 1001 548 H 350 V 240" fill="none" stroke="#333333" strokeWidth="4" strokeLinecap="round" markerEnd="url(#arr-333333)"/><text x="835" y="585" fill="#000" fontSize="18" fontWeight="800" fontFamily="'IBM Plex Sans Thai',sans-serif">น้ำหลังจากผสมมี2ทางเลือกคือทิ้งหรือไม่ก็ นำกลับไปที่ระบบกำจัด TSS</text>
    <rect x="1288" y="506" width="150" height="34" rx="5" fill={statusColor}/><text x="1363" y="528" textAnchor="middle" fill="white" fontSize="14" fontWeight="800" fontFamily="'IBM Plex Sans Thai',sans-serif">{finalAllowed?'ค่าน้ำผ่าน':'ค่าน้ำไม่ผ่าน'}</text>{dilution?.needed&&!dilution?.cannotSolve&&<text x="1363" y="558" textAnchor="middle" fill="#000" fontSize="13" fontWeight="700" fontFamily={mono}>Final {Math.round(dilution.finalCond||tds2cond(calc.totalRejectTDS)).toLocaleString()} µS/cm</text>}
    <text x="1015" y="72" fill="#000" fontSize="14" fontWeight="800" fontFamily={mono}>Active: {routeLabel} | Product {f(calc.finalProduct,1)} {volUnit} | Reject {f(calc.totalReject,1)} {volUnit}</text>
  </svg>;
}

function CleanPhase15Diagram({svgRef,calc,sources,dilutionSources,fmtC,fmt,vol,volUnit,dilution,finalAllowed,finalSeverity}) {
  const value = (n, d = 1) => fmt(vol(n), d);
  const active = (id) => calc.routes?.[id]?.enabled;
  const opacity = (id) => active(id) ? 1 : 0.18;
  const width = (id) => active(id) ? 3 : 1.6;
  const blue = O.cyan, teal = O.teal, amber = O.warn, red = O.fail, gray = O.border, green = O.pass, purple = O.accent;
  const srcs = (sources.length ? sources : [{id:'w1',name:'Raw Water Source 1',actualFlow:223,tds:calc.feedTDS}])
    .filter(s => (s.actualFlow !== undefined ? s.actualFlow : toNumber(s.flow)) > 0.01 || s.enabled)
    .slice(0, 5);
  const mixSrcs = (dilutionSources?.length ? dilutionSources : [])
    .filter(s => (s.actualFlow !== undefined ? s.actualFlow : toNumber(s.flow)) > 0.01 || s.enabled)
    .slice(0, 5);
  const srcGap = srcs.length > 4 ? 44 : 56;
  const srcY = (i) => 165 + i * srcGap;
  const srcManifoldTop = srcs.length ? Math.min(srcY(0) + 21, 263) : 263;
  const srcManifoldBottom = srcs.length ? Math.max(srcY(srcs.length - 1) + 21, 263) : 263;
  const header = `Active: ${['A','B','C'].filter(active).join('+') || '-'} | Product ${value(calc.finalProduct, 1)} ${volUnit} | Reject ${value(calc.totalReject, 1)} ${volUnit}`;
  const statusColor = finalAllowed ? ({PASS:O.pass,WARNING:O.gold,FAIL:O.fail}[finalSeverity] || O.pass) : O.fail;
  const passOp = finalAllowed ? 1 : 0.28;
  const failOp = finalAllowed ? 0.28 : 1;
  const finalDischargeCond = Math.round(dilution?.finalCond || tds2cond(calc.totalRejectTDS)).toLocaleString();
  const labelFont = "'IBM Plex Sans Thai', 'Noto Sans Thai', Inter, sans-serif";
  const node = (x,y,w,h,title,num,tone='blue',cond) => {
    const stroke = {blue,teal,amber,red,green,purple,gray}[tone] || blue;
    const fill = {blue:O.bg2,teal:O.bg2,amber:'#1a1020',red:'#1a1020',green:O.bg2,purple:O.bg2,gray:O.bg1}[tone] || O.bg2;
    const titleColor = tone === 'amber' || tone === 'red' ? stroke : O.text2;
    const bx = x + 7, by = y + 6, bw = Math.max(24, w - 14), bh = Math.max(20, h - 12);
    return <g>
      <rect x={bx} y={by} width={bw} height={bh} rx="5" fill={fill} stroke={stroke} strokeWidth="1.2"/>
      <text x={x+w/2} y={by+12} textAnchor="middle" fill={titleColor} fontSize="9" fontWeight="700" fontFamily={mono}>{title}</text>
      {num !== undefined && <text x={x+w/2} y={by+bh-(cond?16:8)} textAnchor="middle" fill={O.text1} fontSize="11" fontWeight="700" fontFamily={mono}>{num}</text>}
      {cond && <text x={x+w/2} y={by+bh-5} textAnchor="middle" fill={O.accent} fontSize="7" fontWeight="600" fontFamily={mono}>Cond {cond} µS/cm</text>}
    </g>;
  };
  const arrow = (d, color=blue, w=2.2, op=1, dash='') => <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#clean-${color.replace('#','')})`} opacity={op} strokeDasharray={dash}/>;

  return <svg ref={svgRef} viewBox="0 0 1700 800" style={{width:'100%',height:'auto',minWidth:1450}} xmlns="http://www.w3.org/2000/svg">
    <rect width="1700" height="800" fill={O.bg1}/>
    <defs>
      {[blue,teal,amber,red,gray,statusColor,purple,green].map(c => <marker key={c} id={`clean-${c.replace('#','')}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={c}/></marker>)}
      <filter id="cleanShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#000" floodOpacity="0.32"/></filter>
    </defs>

    <rect x="20" y="20" width="1660" height="760" rx="6" fill={O.bg1} stroke={O.border} strokeWidth="1"/>
    <text x="48" y="70" fill={O.text1} fontSize="30" fontWeight="700" fontFamily={mono}>Phase 1.5</text>

    {/* แก้ไข 1: ลบ Header แบบ Hardcode ที่ซ้อนกันออกไป เหลือแค่ Dynamic Header */}
    <rect x="990" y="32" width="670" height="48" rx="8" fill="#0c1a2e" stroke={O.border} strokeWidth="1"/>
    <text x="1010" y="62" fill={O.text1} fontSize="16" fontWeight="800" fontFamily={mono}>{header}</text>

    <rect x="385" y="135" width="300" height="570" rx="6" fill="#1a1020" fillOpacity="0.32" stroke={O.warn} strokeOpacity="0.75" strokeWidth="1"/>
    <text x="410" y="166" fill={O.warn} fontSize="12" fontWeight="700" fontFamily={mono}>TSS Removal System</text>
    <rect x="760" y="265" width="670" height="260" rx="6" fill={O.bg2} fillOpacity="0.46" stroke={O.cyan} strokeOpacity="0.75" strokeWidth="1"/>
    <text x="795" y="288" fill={O.cyan} fontSize="12" fontWeight="700" fontFamily={mono}>UF/RO TDS Control</text>
    <rect x="720" y="595" width="680" height="145" rx="6" fill="#1a1020" fillOpacity="0.35" stroke={O.warn} strokeOpacity="0.75" strokeWidth="1"/>
    <text x="735" y="621" fill={O.warn} fontSize="12" fontWeight="700" fontFamily={mono}>Wastewater Pond or Reuse</text>

    <text x="113" y="145" textAnchor="middle" fill={O.text3} fontSize="11" fontWeight="900" fontFamily={mono}>RAW WATER SOURCES</text>
    {srcs.map((s,i) => {
      const y = srcY(i);
      const flow = s.actualFlow !== undefined ? s.actualFlow : toNumber(s.flow);
      return <g key={s.id}>
        {node(48,y,115,42,`Source ${i+1}`,value(flow,1),'green',fmtC(s.tds || calc.feedTDS))}
        <path d={`M 163 ${y+21} H 220`} fill="none" stroke={blue} strokeWidth="2.4" strokeLinecap="round"/>
      </g>;
    })}

    {srcs.length > 0 && <path d={`M 220 ${srcManifoldTop} V ${srcManifoldBottom}`} fill="none" stroke={blue} strokeWidth="2.4" strokeLinecap="round"/>}
    {arrow('M 220 263 H 266', blue)}
    <polygon points="285,244 304,263 285,282 266,263" fill="#0b3cff" stroke={blue} strokeWidth="1.7"/>

    {/* แก้ไข 2: ขยับตำแหน่งข้อความ Raw Feed ขึ้นด้านบน ไม่ให้ทับเส้นประ */}
    <text x="285" y="215" textAnchor="middle" fill={O.text3} fontSize="10" fontWeight="800" fontFamily={mono}>Raw / Mixed Feed</text>
    <text x="285" y="232" textAnchor="middle" fill={O.accent} fontSize="12" fontWeight="900" fontFamily={mono}>223.0 m³/h</text>

    {node(395,150,105,48,'PAC',undefined,'green')}
    {node(520,150,105,48,'POLYMER',undefined,'green')}
    <path d="M 448 198 V 238 H 430" fill="none" stroke={blue} strokeWidth="2.8" strokeLinecap="round" markerEnd={`url(#clean-${blue.replace('#','')})`}/>
    <path d="M 573 198 V 238 H 430" fill="none" stroke={blue} strokeWidth="2.8" strokeLinecap="round" markerEnd={`url(#clean-${blue.replace('#','')})`}/>
    <text x="405" y="225" textAnchor="middle" fill={O.text3} fontSize="10" fontWeight="700" fontFamily={mono}>Chemical Dosing</text>
    <circle cx="405" cy="263" r="13" fill={green} stroke={O.pass} strokeWidth="2"/>
    {arrow('M 309 263 H 392', blue)}
    {arrow('M 405 263 H 505 V 322', blue)}
    {node(455,322,150,56,'Process 90%','200.7','green')}
    {arrow('M 530 378 V 430', blue)}
    {node(438,430,184,56,'Process Reject 10%','22.3','amber')}
    {arrow('M 530 486 V 534', amber)}
    {node(430,534,200,68,'Sludge Pond','15.6 return','red')}

    {/* แก้ไข 3: ปรับเส้นทาง Sludge Return ให้กว้างออก ไม่ให้ทับข้อความ */}
    <text x="365" y="455" fill={O.text2} fontSize="10" fontWeight="800" fontFamily={mono} transform="rotate(-90 365 455)">Water Return 70%</text>
    <path d="M 430 568 H 285 V 282" fill="none" stroke={gray} strokeWidth="2.2" strokeDasharray="7 6" markerEnd={`url(#clean-${gray.replace('#','')})`}/>

    {arrow('M 530 602 V 646', red)}
    {node(438,646,184,44,'30% Sludge Disposal',undefined,'red')}

    {arrow('M 605 350 H 672', blue, width('A'), opacity('A'))}
    <polygon points="690,332 708,350 690,368 672,350" fill="#0b3cff" stroke={blue} strokeWidth="1.7" opacity={opacity('A')}/>
    <text x="850" y="306" fill={O.text1} fontSize="16" fontWeight="700" fontFamily={mono} opacity={opacity('A')}>Plan 1.5 A</text>
    {arrow('M 708 350 H 805', blue, width('A'), opacity('A'))}
    {node(805,318,132,64,'UF System','201','blue',fmtC(calc.feedTDS))}
    {arrow('M 937 350 H 1010', blue, width('A'), opacity('A'))}
    {node(1010,318,118,64,'Tank','181','green',fmtC(calc.feedTDS))}
    {arrow('M 1069 318 V 258 H 1115', blue, width('A'), opacity('A'))}
    {node(1115,232,124,52,'Bypass',value(calc.ufBypass,1),'blue',fmtC(calc.feedTDS))}
    {arrow('M 1239 258 H 1506 V 360', blue, width('A'), opacity('A'))}
    {arrow('M 1128 350 H 1190', blue, width('A'), opacity('A'))}
    {node(1190,318,132,64,'RO System','146','blue',fmtC(calc.roPermTDS))}
    {arrow('M 1322 350 H 1425 V 389 H 1450', blue, width('A'), opacity('A'))}

    {arrow('M 871 382 V 421', amber, width('A'), opacity('A'))}
    {node(805,421,132,64,'UF Reject','20','amber',fmtC(calc.ufRejectTDS))}
    {arrow('M 871 485 V 515 H 1000', amber, width('A'), opacity('A'))}
    {arrow('M 1256 382 V 421', amber, width('A'), opacity('A'))}
    {node(1190,421,132,64,'RO Reject','35','amber',fmtC(calc.roRejectTDS))}
    {arrow('M 1256 485 V 515 H 1120', amber, width('A'), opacity('A'))}
    {node(1000,500,120,54,'Reject Tank',value(calc.totalReject,1),'amber',fmtC(calc.totalRejectTDS))}

    <text x="860" y="190" fill={O.text1} fontSize="16" fontWeight="700" fontFamily={mono} opacity={opacity('B')}>Plan 1.5 B</text>
    <path d="M 690 332 V 210 H 780" fill="none" stroke={amber} strokeWidth={width('B')} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#clean-${amber.replace('#','')})`} opacity={opacity('B')}/>
    {node(780,186,92,56,'Tank',value(calc.routes?.B?.product || 0,1),'amber')}
    <path d="M 872 214 H 1506 V 360" fill="none" stroke={amber} strokeWidth={width('B')} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#clean-${amber.replace('#','')})`} opacity={opacity('B')}/>

    <text x="785" y="96" fill={O.text1} fontSize="14" fontWeight="700" fontFamily={mono} opacity={opacity('C')}>Plan 1.5 C</text>
    <path d="M 285 244 V 105 H 780" fill="none" stroke={red} strokeWidth={width('C')} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#clean-${red.replace('#','')})`} opacity={opacity('C')}/>
    {node(780,76,104,56,'Tank',value(calc.routes?.C?.product || 0,1),'red')}
    <path d="M 884 105 H 1530 V 360" fill="none" stroke={red} strokeWidth={width('C')} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#clean-${red.replace('#','')})`} opacity={opacity('C')}/>

    {node(1450,360,112,72,'Final Mix',value(calc.finalProduct,1),'green',fmtC(calc.actualProductTDS))}
    {arrow('M 1562 396 H 1625 V 285', gray, 2.2)}
    <circle cx="1625" cy="270" r="14" fill={green} stroke={O.pass} strokeWidth="2"/>
    <text x="1595" y="210" textAnchor="middle" fill={O.text1} fontSize="13" fontWeight="700" fontFamily={mono}>To Phase 1 + 1.5</text>
    <text x="1595" y="235" textAnchor="middle" fill={O.text1} fontSize="13" fontWeight="700" fontFamily={mono}>Mixing Tank</text>
    {arrow('M 1506 428 V 495 H 1588', blue)}
    <circle cx="1605" cy="495" r="14" fill={green} stroke={O.pass} strokeWidth="2"/>
    <text x="1632" y="488" fill={O.text1} fontSize="12" fontWeight="700" fontFamily={mono}>Point C:</text>
    <text x="1632" y="512" fill={O.text1} fontSize="12" fontWeight="700" fontFamily={mono}>Phase 1.5 Sale Water</text>

    <path d="M 1060 554 V 716" fill="none" stroke={blue} strokeWidth="2.8" strokeLinecap="round" markerEnd={`url(#clean-${blue.replace('#','')})`} opacity={passOp}/>
    <path d="M 1030 554 V 616 H 930 V 638" fill="none" stroke={amber} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#clean-${amber.replace('#','')})`} opacity={failOp}/>
    {node(850,638,210,48,'Wastewater Mixing Tank',value((dilution?.finalFlow ?? calc.totalReject),1),'amber',finalDischargeCond)}
    {mixSrcs.map((s,i) => {
      const y = 606 + i * 25;
      return <g key={s.id || i} opacity={failOp}>
        <rect x="700" y={y} width="124" height="22" rx="3" fill={O.bg2} stroke={O.cyan+'88'} strokeWidth="1"/>
        <text x="708" y={y+9} fill={O.text2} fontSize="7.5" fontWeight="700" fontFamily={mono}>{`Source ${i+1}`}</text>
        <text x="708" y={y+19} fill={O.text1} fontSize="7.5" fontWeight="700" fontFamily={mono}>{`${value(s.actualFlow || 0,1)} ${volUnit}`}</text>
        <text x="817" y={y+19} textAnchor="end" fill={O.text3} fontSize="7.5" fontWeight="800" fontFamily={mono}>{`${Math.round(toNumber(s.conductivity)).toLocaleString()} µS/cm`}</text>
        <path d={`M 824 ${y+11} H 850`} fill="none" stroke={blue} strokeWidth="2" strokeLinecap="round" markerEnd={`url(#clean-${blue.replace('#','')})`}/>
      </g>;
    })}

    <path d="M 955 686 V 724" fill="none" stroke={blue} strokeWidth="2.8" strokeLinecap="round" markerEnd={`url(#clean-${blue.replace('#','')})`} opacity={failOp}/>
    {arrow('M 955 724 H 1460', blue, 2.8, 1)}
    {node(1460,702,180,46,'Discharge Canal',finalAllowed?'PASS':'AFTER MIX',finalAllowed?'green':'amber')}

    {/* แก้ไข 4: ปรับเส้น Return Line ด้านล่างสุดให้หักหลบข้อความ ไม่ลากทับตรงๆ */}
    <path d="M 955 724 H 285 V 282" fill="none" stroke={gray} strokeWidth="2.4" strokeDasharray="7 6" markerEnd={`url(#clean-${gray.replace('#','')})`}/>

  </svg>;
}
function SvgBlueprintPhase15Diagram({svgRef,calc,sources,dilutionSources,waterControl={},fmtC,fmt,vol,volUnit,dilution,finalAllowed,finalSeverity,svgStyle}) {
  const value = (n, d = 1) => fmt(vol(n), d);
  const active = (id) => calc.routes?.[id]?.enabled;
  const opacity = (id) => active(id) ? 1 : 0.18;
  const strokeWidth = (id) => active(id) ? 2.35 : 1.05;
  const boardBg = '#06111f';
  const boardPanel = '#0b1726';
  const boardPanel2 = '#10243a';
  const boardText = '#e5eef8';
  const boardMuted = '#8da2b8';
  const blue = '#38bdf8';
  const unitBlue = '#2563eb';
  const orange = '#f59e0b';
  const magenta = '#d946ef';
  const purple = '#8b5cf6';
  const sourceGray = '#94a3b8';
  const pipe = '#cbd5e1';
  const wasteBrown = '#b45309';
  const red = '#f43f5e';
  const green = '#22c55e';
  const gray = '#64748b';
  const sourceById = new Map((sources || []).map(s => [String(s.id), s]));
  const blendById = new Map((dilutionSources || []).map(s => [String(s.id), s]));
  const header = `Active: ${['A','B','C'].filter(active).join('+') || '-'} | Product ${value(calc.finalProduct, 1)} ${volUnit} | Reject ${value(calc.totalReject, 1)} ${volUnit}`;
  const statusColor = finalAllowed ? ({PASS:O.pass,WARNING:O.gold,FAIL:O.fail}[finalSeverity] || O.pass) : O.fail;
  const rejectCond = waterControl.rejectCond ?? tds2cond(calc.totalRejectTDS);
  const rejectNeedsMix = waterControl.rejectNeedsMix ?? rejectCond > REJECT_COND_LIMIT;
  const mixOp = rejectNeedsMix ? 1 : 0.18;
  const directOp = rejectNeedsMix ? 0.18 : 1;
  const rejectRouteColor = rejectNeedsMix ? orange : green;
  const failOp = mixOp;
  const finalDischargeCond = Math.round(dilution?.finalCond || tds2cond(calc.totalRejectTDS)).toLocaleString();
  const nodePos = {
    planB:{x:900,y:164.471,w:100,h:25.9965}, planC:{x:900,y:100,w:100,h:25.9965},
    finalTank:{x:1453,y:287.464,w:100,h:25.9965}, sendRIL:{x:1550,y:400,w:100,h:25.9965}, sendP10:{x:1553,y:171,w:100,h:25.9965},
    blend1:{x:800,y:488,w:100,h:25.9965}, blend2:{x:800,y:525.435,w:100,h:25.9965}, blend3:{x:800,y:562.87,w:100,h:25.9965}, blend4:{x:800,y:600.305,w:100,h:25.9965}, blend5:{x:800,y:637.74,w:100,h:25.9965},
    blendTank:{x:950,y:557,w:100,h:25.9965}, mixedTank:{x:1050,y:670,w:100,h:25.9965}, wastewater:{x:1300,y:736,w:100,h:25.9965},
    inlet:{x:250,y:218.544,w:100,h:25.9965}, afterTss:{x:700,y:281.976,w:100,h:25.9965},
    uf:{x:900,y:281.976,w:100,h:25.9965}, ufReject:{x:900,y:385.962,w:100,h:25.9965}, ufroReject:{x:1050,y:437.955,w:100,h:25.9965},
    ro:{x:1250,y:324,w:100,h:25.9965}, roReject:{x:1250,y:386,w:100,h:25.9965}, tankAfterUf:{x:1058,y:281.976,w:83.4457,h:26.2436}, bypass:{x:1250,y:241,w:100,h:25.9965},
    process90:{x:500,y:281.976,w:100,h:31.1958}, processReject:{x:500,y:354.766,w:100,h:31.1958}, sludge:{x:480,y:435.875,w:140,h:30.8839}, sludgeDisposal:{x:550,y:520,w:100,h:25.9965},
    source5:{x:50,y:117.678,w:100,h:25.9965}, source4:{x:50,y:164.471,w:100,h:25.9965}, source3:{x:50,y:211.265,w:100,h:25.9965}, source2:{x:50,y:259.099,w:100,h:25.9965}, source1:{x:50,y:305.893,w:100,h:25.9965},
  };
  const flowText = (n, d = 0) => `${value(n || 0, d)} ${volUnit}`;
  const textColor = () => boardText;
  const label = (x, y, txt, color = '#111827', size = 9, anchor = 'middle', weight = 800, op = 1) => (
    <text x={x} y={y} textAnchor={anchor} fill={color} fontSize={size} fontWeight={weight} fontFamily={mono} opacity={op}>{txt}</text>
  );
  const box = (key, title, metric, fill = blue, op = 1, opts = {}) => {
    const p = typeof key === 'string' ? nodePos[key] : key;
    const accent = opts.accent || fill;
    const txt = opts.textColor || textColor(fill);
    const titleSize = opts.titleSize || 7.5;
    const metricSize = opts.metricSize || 8;
    const bodyFill = opts.bodyFill || boardPanel;
    return <g opacity={op} filter="url(#nodeShadow)">
      <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={opts.rx ?? 3} fill={bodyFill} stroke={opts.stroke || accent} strokeWidth={opts.strokeWidth || 1.1}/>
      <rect x={p.x} y={p.y} width={p.w} height="3.5" rx={opts.rx ?? 3} fill={accent}/>
      {label(p.x + p.w / 2, p.y + (metric !== undefined ? 10.5 : p.h / 2 + 3), title, txt, titleSize, 'middle', 900)}
      {metric !== undefined && label(p.x + p.w / 2, p.y + p.h - 5, metric, opts.metricColor || accent, metricSize, 'middle', 800)}
      {opts.note && label(p.x + p.w / 2, opts.notePosition === 'top' ? p.y - (opts.noteOffset || 5) : p.y + p.h + (opts.noteOffset || 10), opts.note, opts.noteColor || boardMuted, opts.noteSize || 7, 'middle', 700)}
    </g>;
  };
  const arrowId = (color) => `layout-${color.replace('#','')}`;
  const arrow = (d, color=pipe, w=1.7, op=1, dash='') => <g opacity={op}>
    <path d={d} fill="none" stroke="#020617" strokeWidth={w+1.35} strokeLinecap="round" strokeLinejoin="round" opacity="0.5" strokeDasharray={dash}/>
    <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" markerEnd={`url(#${arrowId(color)})`} strokeDasharray={dash}/>
  </g>;
  const line = (d, color=pipe, w=1.7, op=1, dash='') => <g opacity={op}>
    <path d={d} fill="none" stroke="#020617" strokeWidth={w+1.35} strokeLinecap="round" strokeLinejoin="round" opacity="0.45" strokeDasharray={dash}/>
    <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash}/>
  </g>;
  const controlNode = (cx, cy, op = 1) => <g opacity={op} filter="url(#controlGlow)">
    <circle cx={cx} cy={cy} r="15" fill={red} fillOpacity="0.12" stroke={red} strokeOpacity="0.55" strokeDasharray="3 3"/>
    <circle cx={cx} cy={cy} r="7" fill={boardBg} stroke={red} strokeWidth="2"/>
    <circle cx={cx} cy={cy} r="3" fill={red}/>
  </g>;
  const pctOp = (pct) => 0.14 + 0.86 * Math.max(0, Math.min(100, toNumber(pct))) / 100;
  const pctWidth = (pct) => 1 + 1.8 * Math.max(0, Math.min(100, toNumber(pct))) / 100;
  const wc = {
    ufToRO: waterControl.ufToRO ?? calc.calcToRO,
    ufToBypass: waterControl.ufToBypass ?? calc.calcBypass,
    roFeedFlow: waterControl.roFeedFlow ?? calc.roIn,
    bypassFlow: waterControl.bypassFlow ?? calc.ufBypass,
    finalToRil: waterControl.finalToRil ?? 100,
    finalToP10: waterControl.finalToP10 ?? 0,
    sendRilFlow: waterControl.sendRilFlow ?? calc.finalProduct,
    sendP10Flow: waterControl.sendP10Flow ?? 0,
    treatedToWaste: waterControl.treatedToWaste ?? 100,
    treatedToReturn: waterControl.treatedToReturn ?? 0,
    treatedFlow: waterControl.treatedFlow ?? (dilution?.finalFlow ?? calc.totalReject),
    wastewaterFlow: waterControl.wastewaterFlow ?? (dilution?.finalFlow ?? calc.totalReject),
    returnFlow: waterControl.returnFlow ?? 0,
  };
  const sourceSlot = (id) => {
    const p = nodePos[`source${id}`];
    const s = sourceById.get(String(id)) || {};
    const actualFlow = s.actualFlow !== undefined ? s.actualFlow : (s.enabled ? toNumber(s.flow) : 0);
    const op = (actualFlow > 0.01 || s.enabled) ? 1 : 0.35;
    return <g key={id} opacity={op}>{box(p, `Source ${id}`, flowText(actualFlow, 0), sourceGray, 1, {note:`Cond ${fmtC(s.tds || calc.feedTDS)} uS/cm`, noteSize:6.5})}</g>;
  };
  const blendSlot = (id) => {
    const p = nodePos[`blend${id}`];
    const s = blendById.get(String(id)) || {};
    const actualFlow = s.actualFlow !== undefined ? s.actualFlow : toNumber(s.flow);
    const op = failOp * ((actualFlow > 0.01 || s.enabled) ? 1 : 0.35);
    return <g key={id} opacity={op}>{box(p, `Blend ${id}`, flowText(actualFlow, 0), sourceGray, 1, {note:`Cond ${Math.round(toNumber(s.conductivity)).toLocaleString()} uS/cm`, noteSize:6.5})}</g>;
  };

  return <svg ref={svgRef} viewBox="0 0 1700 800" style={{display:'block',width:'100%',height:'auto',minWidth:1450,maxWidth:'none',background:boardBg,borderRadius:6,...svgStyle}} xmlns="http://www.w3.org/2000/svg">
    <rect width="1700" height="800" fill={boardBg}/>
    <defs>
      <linearGradient id="diagramBoardGradient" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stopColor="#0b1f36"/>
        <stop offset="55%" stopColor="#081625"/>
        <stop offset="100%" stopColor="#050b14"/>
      </linearGradient>
      <pattern id="diagramGridSmall" width="24" height="24" patternUnits="userSpaceOnUse">
        <path d="M24 0H0V24" fill="none" stroke="#38bdf8" strokeOpacity="0.08" strokeWidth="1"/>
      </pattern>
      <pattern id="diagramGridMajor" width="120" height="120" patternUnits="userSpaceOnUse">
        <path d="M120 0H0V120" fill="none" stroke="#38bdf8" strokeOpacity="0.16" strokeWidth="1.2"/>
      </pattern>
      <filter id="nodeShadow" x="-25%" y="-60%" width="150%" height="220%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000000" floodOpacity="0.35"/>
      </filter>
      <filter id="controlGlow" x="-220%" y="-220%" width="440%" height="440%">
        <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor={red} floodOpacity="0.75"/>
      </filter>
      {Array.from(new Set([pipe,blue,unitBlue,orange,magenta,purple,wasteBrown,red,green,gray,statusColor])).map(color => (
        <marker key={color} id={arrowId(color)} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.6" markerHeight="4.6" orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={color}/>
        </marker>
      ))}
    </defs>

    <rect x="14" y="14" width="1672" height="772" rx="8" fill="url(#diagramBoardGradient)" stroke="#23435f" strokeWidth="1.2"/>
    <rect x="14" y="14" width="1672" height="772" rx="8" fill="url(#diagramGridSmall)"/>
    <rect x="14" y="14" width="1672" height="772" rx="8" fill="url(#diagramGridMajor)"/>
    <rect x="31" y="31" width="1640" height="50" rx="6" fill="#081827" stroke="#1e3a5a"/>
    {label(48, 64, 'UF/RO P&ID - Phase 1.5', boardText, 26, 'start', 900)}
    <rect x="980" y="38" width="670" height="32" rx="4" fill="#0f2438" stroke="#31506d"/>
    {label(995, 59, header, '#c7d2fe', 11, 'start', 800)}
    <g>
      <rect x="760" y="39" width="190" height="30" rx="4" fill="#07111f" stroke="#31506d"/>
      <circle cx="778" cy="54" r="4" fill={blue}/>{label(790, 58, 'Process', '#dbeafe', 8, 'start', 800)}
      <circle cx="842" cy="54" r="4" fill={orange}/>{label(854, 58, 'Reject', '#fed7aa', 8, 'start', 800)}
      <circle cx="906" cy="54" r="4" fill={red}/>{label(918, 58, 'Control', '#fecdd3', 8, 'start', 800)}
    </g>

    <rect x="35" y="94" width="335" height="245" rx="7" fill={boardPanel2} fillOpacity="0.62" stroke={blue} strokeOpacity="0.35" strokeWidth="1.2"/>
    {label(50, 110, 'RAW WATER SOURCES', '#bae6fd', 10, 'start')}
    <rect x="370" y="124" width="300" height="445" rx="7" fill="#23180a" fillOpacity="0.48" stroke={orange} strokeOpacity="0.38" strokeWidth="1.2"/>
    {label(386, 140, 'TSS REMOVAL SYSTEM', '#fde68a', 10, 'start')}
    <rect x="680" y="84" width="700" height="390" rx="7" fill="#071d35" fillOpacity="0.58" stroke={unitBlue} strokeOpacity="0.42" strokeWidth="1.2"/>
    {label(696, 100, 'UF/RO PLAN ROUTING', '#bfdbfe', 10, 'start')}
    <rect x="760" y="462" width="675" height="295" rx="7" fill="#2a1117" fillOpacity="0.42" stroke={red} strokeOpacity="0.35" strokeWidth="1.2"/>
    {label(776, 478, 'WATER TREATMENT AFTER UF/RO', '#fecdd3', 10, 'start')}

    {[5,4,3,2,1].map(sourceSlot)}
    {line('M 200 130.5 V 321', pipe, 2)}
    {[5,4,3,2,1].map(id => {
      const p = nodePos[`source${id}`];
      const mid = p.y + p.h / 2;
      return <g key={`source-pipe-${id}`}>{arrow(`M ${p.x+p.w} ${mid} H 200 V 231.5 H 250`, pipe, 2.1)}</g>;
    })}
    {box('inlet', 'Inlet', flowText(calc.feedFlow, 0), blue, 1, {note:`Cond ${fmtC(calc.feedTDS)} uS/cm`, noteSize:7})}

    <path d="M402 187.348L386 158H418L402 187.348Z" fill={magenta} stroke="#f5d0fe" strokeWidth="0.8" filter="url(#nodeShadow)"/>
    {label(402, 154, 'PAC', '#f5d0fe', 7)}
    <path d="M502 187.348L486 158H518L502 187.348Z" fill={magenta} stroke="#f5d0fe" strokeWidth="0.8" filter="url(#nodeShadow)"/>
    {label(502, 154, 'POLYMER', '#f5d0fe', 6.5)}
    {arrow('M 402 187 V 200 H 450 V 221', pipe, 2)}
    {arrow('M 502 187 V 200 H 450 V 221', pipe, 2)}
    <ellipse cx="450" cy="232.062" rx="10" ry="10.3986" fill={purple} stroke="#ddd6fe" strokeWidth="0.8" filter="url(#nodeShadow)"/>
    {label(450, 256, 'Chemical', '#ddd6fe', 8)}
    {arrow('M 350 231.5 H 440', pipe, 2)}
    {arrow('M 460 232 H 550 V 282', pipe, 2)}
    {box('process90', 'Process 90%', flowText(calc.tssOutFlow, 0), sourceGray, 1)}
    {arrow('M 550 313.2 V 354.8', pipe, 2)}
    {box('processReject', 'Reject 10%', flowText(calc.tssRejectFlow, 0), sourceGray, 1)}
    {arrow('M 550 386 V 435.9', pipe, 2)}
    {box('sludge', 'Sludge Pond', flowText(calc.tssRejectFlow, 0), sourceGray, 1, {note:`70% return ${value(calc.sludgeWaterRecycle,0)} ${volUnit}`, noteSize:7})}
    {arrow('M 601 466.8 V 520', pipe, 2)}
    {box('sludgeDisposal', '30% Sludge', flowText(calc.sludgeWasteFlow, 0), wasteBrown, 1)}
    {line('M 480 451 H 450 V 302 H 500', gray, 2, 1, '6 5')}
    {label(438, 391, '70% return', '#cbd5e1', 8, 'middle', 800, 1)}
    {arrow('M 600 297.5 H 700', pipe, 2)}
    {box('afterTss', 'After TSS', flowText(calc.tssOutFlow, 0), blue)}

    {box('planC', 'Plan C', flowText(calc.routes?.C?.product, 0), magenta, opacity('C'))}
    {arrow('M 301 218.5 V 113 H 900', magenta, strokeWidth('C'), opacity('C'))}
    {arrow('M 1000 113 H 1453 V 300.5', magenta, strokeWidth('C'), opacity('C'))}
    {box('planB', 'Plan B', flowText(calc.routes?.B?.product, 0), orange, opacity('B'))}
    {arrow('M 800 295 V 177.5 H 900', orange, strokeWidth('B'), opacity('B'))}
    {arrow('M 1000 177.5 H 1453 V 300.5', orange, strokeWidth('B'), opacity('B'))}

    {arrow('M 800 295 H 900', unitBlue, strokeWidth('A'), opacity('A'))}
    {box('uf', 'UF System', flowText(calc.ufOut, 0), unitBlue, opacity('A'), {note:`Cond ${fmtC(calc.feedTDS)} uS/cm`, noteSize:7, notePosition:'top'})}
    {arrow('M 1000 295 H 1058', unitBlue, strokeWidth('A'), opacity('A'))}
    {box('tankAfterUf', 'UF Tank', flowText(calc.ufOut, 0), unitBlue, opacity('A'), {note:`Cond ${fmtC(calc.feedTDS)} uS/cm`, noteSize:7, notePosition:'top'})}
    {arrow('M 1141 295 H 1194', unitBlue, strokeWidth('A'), opacity('A'))}
    {controlNode(1199, 296, opacity('A'))}
    {label(1166, 286, `${fmt(wc.ufToBypass,0)}% BP`, red, 7, 'middle', 900, opacity('A'))}
    {label(1223, 314, `${fmt(wc.ufToRO,0)}% RO`, red, 7, 'start', 900, opacity('A'))}
    {arrow('M 1200 290 V 254 H 1250', unitBlue, pctWidth(wc.ufToBypass), opacity('A') * pctOp(wc.ufToBypass))}
    {box('bypass', 'Bypass', flowText(wc.bypassFlow, 0), unitBlue, opacity('A'))}
    {arrow('M 1200 301.5 V 337 H 1250', unitBlue, pctWidth(wc.ufToRO), opacity('A') * pctOp(wc.ufToRO))}
    {box('ro', 'RO System', flowText(calc.roOut, 0), unitBlue, opacity('A'), {note:`Perm ${fmtC(calc.roPermTDS)} uS/cm`, noteSize:7, notePosition:'top'})}
    {label(1230, 350, flowText(wc.roFeedFlow, 0), '#bae6fd', 7, 'start', 800, opacity('A'))}
    {arrow('M 1350 337 H 1453 V 300.5', unitBlue, strokeWidth('A'), opacity('A'))}
    {arrow('M 1350 254 H 1453 V 300.5', unitBlue, strokeWidth('A'), opacity('A'))}
    {arrow('M 950 308 V 386', orange, strokeWidth('A'), opacity('A'))}
    {box('ufReject', 'UF Reject', flowText(calc.ufRejectFlow, 0), unitBlue, opacity('A'), {note:`Cond ${fmtC(calc.ufRejectTDS)} uS/cm`, noteSize:7})}
    {arrow('M 1000 399 H 1050 V 451', orange, strokeWidth('A'), opacity('A'))}
    {arrow('M 1300 350 V 386', orange, strokeWidth('A'), opacity('A'))}
    {box('roReject', 'RO Reject', flowText(calc.roRejectFlow, 0), unitBlue, opacity('A'), {note:`Cond ${fmtC(calc.roRejectTDS)} uS/cm`, noteSize:7})}
    {arrow('M 1250 399 H 1150 V 451', orange, strokeWidth('A'), opacity('A'))}
    {box('ufroReject', 'UF/RO Reject', flowText(calc.totalReject, 0), rejectRouteColor, opacity('A'), {note:`Cond ${fmtC(calc.totalRejectTDS)} uS/cm`, noteSize:7, notePosition:'top'})}

    {box('finalTank', 'Final Tank', flowText(calc.finalProduct, 0), blue, 1, {note:`Product ${fmtC(calc.actualProductTDS)} uS/cm`, noteSize:7})}
    {arrow('M 1553.5 300 H 1598.5', pipe, 2)}
    {controlNode(1604, 299.007)}
    {label(1572, 289, `${fmt(wc.finalToP10,0)}% P10`, red, 7)}
    {label(1620, 318, `${fmt(wc.finalToRil,0)}% RIL`, red, 7, 'start')}
    {arrow('M 1603.5 293.5 V 197.5 H 1553', pipe, pctWidth(wc.finalToP10), pctOp(wc.finalToP10))}
    {box('sendP10', 'Mixed w/P10', flowText(wc.sendP10Flow, 0), blue)}
    {arrow('M 1604 304.5 V 400', pipe, pctWidth(wc.finalToRil), pctOp(wc.finalToRil))}
    {box('sendRIL', 'Send to RIL', flowText(wc.sendRilFlow, 0), blue)}

    {[1,2,3,4,5].map(blendSlot)}
    {line('M 925 496 V 647', pipe, 2, failOp)}
    {[1,2,3,4,5].map(id => {
      const p = nodePos[`blend${id}`];
      const mid = p.y + p.h / 2;
      return <g key={`blend-pipe-${id}`} opacity={failOp}>{arrow(`M ${p.x+p.w} ${mid} H 925 V 563 H 950`, pipe, 1.8)}</g>;
    })}
    {arrow('M 1100 464 V 563 H 1050', orange, 1.75, opacity('A') * mixOp)}
    {label(1088, 541, rejectNeedsMix ? 'MIX REQUIRED' : 'MIX STANDBY', rejectNeedsMix ? orange : boardMuted, 7, 'start', 900, opacity('A') * Math.max(mixOp, 0.35))}
    {arrow('M 1100 464 V 670', green, 1.75, opacity('A') * directOp)}
    {label(1114, 631, 'DIRECT OK <=6000', green, 7, 'start', 900, opacity('A') * directOp)}
    {box('blendTank', 'Blend Tank', flowText(wc.treatedFlow, 0), blue, mixOp, {note:`Final ${finalDischargeCond} uS/cm`, noteSize:7, notePosition:'top'})}
    {arrow('M 1000 583 V 683 H 1050', pipe, 1.75, mixOp)}
    {box('mixedTank', 'Mixed UF/RO', flowText(wc.treatedFlow, 0), blue, 1, {note:rejectNeedsMix ? 'after blend' : 'direct reject', noteSize:7})}
    {controlNode(1100, 749.076, 1)}
    {arrow('M 1100.5 696 V 742.5', pipe, 1.75, 1)}
    {label(1130, 739, `${fmt(wc.treatedToWaste,0)}% waste`, red, 7, 'start', 900, 1)}
    {label(1058, 764, `${fmt(wc.treatedToReturn,0)}% return`, red, 7, 'end', 900, 1)}
    {arrow('M 1107 749 H 1300 V 749', pipe, pctWidth(wc.treatedToWaste), pctOp(wc.treatedToWaste))}
    {box('wastewater', 'Wastewater', flowText(wc.wastewaterFlow, 0), wasteBrown, 1, {note:`Status ${finalSeverity}`, noteSize:7})}
    {line('M 1094.5 750 H 299.5 V 244.5', gray, pctWidth(wc.treatedToReturn), pctOp(wc.treatedToReturn), '6 5')}
    {label(720, 764, `Return ${flowText(wc.returnFlow,0)}`, '#cbd5e1', 8, 'middle', 800, pctOp(wc.treatedToReturn))}
    <rect x="1420" y="734" width="250" height="36" rx="4" fill={rejectRouteColor} fillOpacity="0.14" stroke={rejectRouteColor} filter="url(#nodeShadow)"/>
    {label(1432, 756, rejectNeedsMix ? 'Reject Cond > 6000: mix before discharge' : 'Reject Cond <= 6000: discharge/reuse OK', rejectRouteColor, 10, 'start', 900)}
  </svg>;
}
const ProcessDiagram = React.forwardRef(function ProcessDiagram({calc,sources,dilutionSources,waterControl,fmtC,fmt,vol,volUnit,dilution,finalAllowed,finalSeverity,svgStyle},ref) {
  return <SvgBlueprintPhase15Diagram svgRef={ref} calc={calc} sources={sources} dilutionSources={dilutionSources} waterControl={waterControl} fmtC={fmtC} fmt={fmt} vol={vol} volUnit={volUnit} dilution={dilution} finalAllowed={finalAllowed} finalSeverity={finalSeverity} svgStyle={svgStyle}/>;
/*
  return (
    <svg ref={ref} viewBox="0 0 1300 650" style={{width:'100%',height:'auto',minWidth:900}} xmlns="http://www.w3.org/2000/svg">
      <rect width="1300" height="650" fill="#070d1a" rx="6"/>
      <defs>
        <marker id="a1" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={O.cyan}/></marker>
        <marker id="a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={O.warn}/></marker>
        <marker id="a3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill={O.accent}/></marker>
      </defs>

      <text x="28" y="592" fill={O.text3} fontSize="10" fontFamily={mono} letterSpacing="1.5">PHASE 1.5 ROUTE SELECTOR</text>
      <rect x="25" y="605" width="225" height="34" rx="5" fill={calc.route==='C'?O.accent+'22':'#0c1a2e'} stroke={calc.route==='C'?O.accent:O.border} strokeWidth={calc.route==='C'?2:1}/>
      <text x="138" y="626" textAnchor="middle" fill={calc.route==='C'?O.accent:O.text2} fontSize="11" fontWeight="700" fontFamily={mono}>C: MIXED FEED BYPASS</text>
      <line x1="250" y1="622" x2="315" y2="622" stroke={O.accent} strokeWidth="1.5" markerEnd="url(#a3)"/>
      <rect x="315" y="605" width="210" height="34" rx="5" fill={(calc.route==='A'||calc.route==='B')?O.cyan+'18':'#0c1a2e'} stroke={(calc.route==='A'||calc.route==='B')?O.cyan:O.border} strokeWidth={(calc.route==='A'||calc.route==='B')?2:1}/>
      <text x="420" y="626" textAnchor="middle" fill={(calc.route==='A'||calc.route==='B')?O.cyan:O.text2} fontSize="11" fontWeight="700" fontFamily={mono}>TSS 90% PROCESS</text>
      <line x1="525" y1="622" x2="590" y2="622" stroke={O.cyan} strokeWidth="1.5" markerEnd="url(#a1)"/>
      <rect x="590" y="605" width="210" height="34" rx="5" fill={calc.route==='B'?O.accent+'22':'#0c1a2e'} stroke={calc.route==='B'?O.accent:O.border} strokeWidth={calc.route==='B'?2:1}/>
      <text x="695" y="626" textAnchor="middle" fill={calc.route==='B'?O.accent:O.text2} fontSize="11" fontWeight="700" fontFamily={mono}>B: TSS BYPASS</text>
      <line x1="800" y1="622" x2="865" y2="622" stroke={O.cyan} strokeWidth="1.5" markerEnd="url(#a1)"/>
      <rect x="865" y="605" width="210" height="34" rx="5" fill={calc.route==='A'?O.accent+'22':'#0c1a2e'} stroke={calc.route==='A'?O.accent:O.border} strokeWidth={calc.route==='A'?2:1}/>
      <text x="970" y="626" textAnchor="middle" fill={calc.route==='A'?O.accent:O.text2} fontSize="11" fontWeight="700" fontFamily={mono}>A: TSS + UF/RO</text>
      <line x1="1075" y1="622" x2="1160" y2="622" stroke={O.accent} strokeWidth="1.5" markerEnd="url(#a3)"/>
      <rect x="1160" y="605" width="115" height="34" rx="5" fill="#0c1a2e" stroke={O.gold} strokeWidth="1.5"/>
      <text x="1218" y="626" textAnchor="middle" fill={O.gold} fontSize="11" fontWeight="700" fontFamily={mono}>FINAL TANK</text>

      {act.map((s,i)=>{const y=sY(i,act.length),fl=s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow);return(
        <g key={s.id}><rect x="15" y={y} width="125" height={sH} rx="4" fill="#0c1a2e" stroke="#1e3a5f" strokeWidth="1"/>
          <text x="78" y={y+13} textAnchor="middle" fill={O.text2} fontSize="10" fontFamily={mono} fontWeight="600">{s.name}</text>
          <text x="78" y={y+26} textAnchor="middle" fill={O.text3} fontSize="9" fontFamily={mono}>{f(fl)} · {fc(s.tds)}</text>
          <line x1="140" y1={y+sH/2} x2="185" y2="180" stroke="#1e3a5f" strokeWidth="1"/></g>);})}

      <circle cx="195" cy="180" r="13" fill="#0c1a2e" stroke={O.cyan} strokeWidth="1.5"/>
      <text x="195" y="184" textAnchor="middle" fill={O.cyan} fontSize="12" fontFamily={mono}>⊕</text>
      <line x1="208" y1="180" x2="285" y2="180" stroke={O.cyan} strokeWidth="2" markerEnd="url(#a1)"/>
      <text x="247" y="172" textAnchor="middle" fill={O.text1} fontSize="11" fontFamily={mono} fontWeight="600">{f(calc.feedFlow)}</text>
      <text x="247" y="196" textAnchor="middle" fill={O.accent} fontSize="9" fontFamily={mono}>{fc(calc.feedTDS)} µS/cm</text>

      <rect x="285" y="150" width="115" height="60" rx="5" fill="#0c1a2e" stroke={O.cyan} strokeWidth="2"/>
      <text x="343" y="172" textAnchor="middle" fill={O.text1} fontSize="14" fontWeight="700" fontFamily={mono}>UF</text>
      <text x="343" y="190" textAnchor="middle" fill={O.text2} fontSize="10" fontFamily={mono}>{f(calc.ufOut)} out</text>

      <line x1="343" y1="215" x2="343" y2="305" stroke={O.warn} strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#a2)"/>
      <rect x="300" y="305" width="86" height="42" rx="4" fill="#1a1020" stroke={O.warn} strokeWidth="1"/>
      <text x="343" y="322" textAnchor="middle" fill={O.warn} fontSize="10" fontWeight="600" fontFamily={mono}>UF Reject</text>
      <text x="343" y="338" textAnchor="middle" fill={O.text1} fontSize="11" fontWeight="700" fontFamily={mono}>{f(calc.ufRejectFlow)}</text>

      <line x1="400" y1="180" x2="485" y2="180" stroke={O.cyan} strokeWidth="2" markerEnd="url(#a1)"/>
      <text x="443" y="172" textAnchor="middle" fill={O.text1} fontSize="11" fontFamily={mono} fontWeight="600">{f(calc.ufOut)}</text>
      <circle cx="495" cy="180" r="9" fill="#0c1a2e" stroke={O.cyan} strokeWidth="1.5"/>
      <text x="495" y="184" textAnchor="middle" fill={O.text1} fontSize="10" fontFamily={mono} fontWeight="700">⋔</text>

      <path d="M 495 171 L 495 65 L 905 65" fill="none" stroke={O.accent} strokeWidth="2" markerEnd="url(#a3)"/>
      <rect x="590" y="42" width="240" height="44" rx="5" fill="#0c1a2e" stroke={O.accent} strokeWidth="1.5"/>
      <text x="710" y="58" textAnchor="middle" fill={O.accent} fontSize="11" fontWeight="700" fontFamily={mono}>BYPASS ({fmt(calc.calcBypass,1)}%)</text>
      <text x="710" y="76" textAnchor="middle" fill={O.text1} fontSize="11" fontFamily={mono}>{f(calc.ufBypass)} {volUnit} · {fc(calc.feedTDS)} µS/cm</text>

      <line x1="504" y1="180" x2="600" y2="180" stroke={O.cyan} strokeWidth="2" markerEnd="url(#a1)"/>
      <text x="552" y="172" textAnchor="middle" fill={O.text1} fontSize="11" fontFamily={mono} fontWeight="600">{f(calc.roIn)}</text>
      <text x="552" y="198" textAnchor="middle" fill={O.text3} fontSize="9" fontFamily={mono}>To RO ({fmt(calc.calcToRO,1)}%)</text>

      <rect x="600" y="148" width="115" height="65" rx="5" fill="#0c1a2e" stroke={O.cyan} strokeWidth="2"/>
      <text x="658" y="170" textAnchor="middle" fill={O.text1} fontSize="14" fontWeight="700" fontFamily={mono}>RO</text>
      <text x="658" y="190" textAnchor="middle" fill={O.text2} fontSize="10" fontFamily={mono}>{f(calc.roOut)} perm</text>
      <text x="658" y="204" textAnchor="middle" fill={O.accent} fontSize="9" fontFamily={mono}>{fc(calc.roPermTDS)} µS/cm</text>

      <line x1="658" y1="220" x2="658" y2="305" stroke={O.warn} strokeWidth="1.5" strokeDasharray="4,3" markerEnd="url(#a2)"/>
      <rect x="610" y="305" width="96" height="50" rx="4" fill="#1a1020" stroke={O.warn} strokeWidth="1"/>
      <text x="658" y="322" textAnchor="middle" fill={O.warn} fontSize="10" fontWeight="600" fontFamily={mono}>RO Conc.</text>
      <text x="658" y="338" textAnchor="middle" fill={O.text1} fontSize="11" fontWeight="700" fontFamily={mono}>{f(calc.roRejectFlow)}</text>
      <text x="658" y="350" textAnchor="middle" fill={O.accent} fontSize="9" fontFamily={mono}>{fc(calc.roRejectTDS)} µS/cm</text>

      <line x1="715" y1="180" x2="905" y2="180" stroke={O.cyan} strokeWidth="2" markerEnd="url(#a1)"/>
      <text x="810" y="172" textAnchor="middle" fill={O.text1} fontSize="11" fontFamily={mono} fontWeight="600">{f(calc.roOut)}</text>
      <text x="810" y="198" textAnchor="middle" fill={O.accent} fontSize="9" fontFamily={mono}>{fc(calc.roPermTDS)} µS/cm</text>

      <circle cx="915" cy="180" r="13" fill="#1a1a10" stroke={O.accent} strokeWidth="2"/>
      <text x="915" y="184" textAnchor="middle" fill={O.accent} fontSize="13" fontFamily={mono} fontWeight="700">⊕</text>
      <line x1="928" y1="180" x2="985" y2="180" stroke={O.accent} strokeWidth="2.5" markerEnd="url(#a3)"/>

      <rect x="985" y="145" width="105" height="72" rx="6" fill="#0c1a2e" stroke={O.accent} strokeWidth="2.5"/>
      <text x="1038" y="164" textAnchor="middle" fill={O.gold} fontSize="12" fontWeight="700" fontFamily={mono}>PRODUCT</text>
      <text x="1038" y="185" textAnchor="middle" fill={O.text1} fontSize="16" fontFamily={mono} fontWeight="700">{f(calc.finalProduct)}</text>
      <text x="1038" y="198" textAnchor="middle" fill={O.text3} fontSize="9" fontFamily={mono}>{volUnit}</text>
      <text x="1038" y="212" textAnchor="middle" fill={O.accent} fontSize="10" fontFamily={mono}>{fc(calc.actualProductTDS)} µS/cm</text>

      <rect x="440" y="370" width="240" height="55" rx="5" fill="#1a1020" stroke={O.warn} strokeWidth="1.5"/>
      <text x="560" y="388" textAnchor="middle" fill={O.warn} fontSize="11" fontWeight="700" fontFamily={mono}>TOTAL REJECT</text>
      <text x="560" y="406" textAnchor="middle" fill={O.text1} fontSize="14" fontFamily={mono} fontWeight="700">{f(calc.totalReject)} {volUnit}</text>
      <text x="560" y="420" textAnchor="middle" fill={O.accent} fontSize="10" fontFamily={mono}>{fc(calc.totalRejectTDS)} µS/cm</text>
      <line x1="343" y1="347" x2="440" y2="390" stroke={O.warn} strokeWidth="1" strokeDasharray="3,2"/>
      <line x1="658" y1="355" x2="680" y2="390" stroke={O.warn} strokeWidth="1" strokeDasharray="3,2"/>

      {/* Dilution zone with individual source flows (A2) * /}
      <g opacity={dilOp}>
        <line x1="560" y1="425" x2="560" y2="460" stroke={O.warn} strokeWidth="1.5" markerEnd="url(#a2)"/>
        <rect x="460" y="460" width="200" height="42" rx="5" fill={rejectFails?'#0c1a2e':'#070d1a'} stroke={rejectFails?O.accent:O.border} strokeWidth={rejectFails?2:1}/>
        <text x="560" y="477" textAnchor="middle" fill={rejectFails?O.accent:O.text3} fontSize="10" fontWeight="700" fontFamily={mono}>{rejectFails?'DILUTION / MIXING':'ไม่จำเป็น'}</text>
        <text x="560" y="494" textAnchor="middle" fill={rejectFails?O.text1:O.text3} fontSize="10" fontFamily={mono}>{hasDil?`${fmt(vol(dilution.finalFlow),1)} ${volUnit}`:''}</text>

        {/* Individual dilution source flows into mixing box * /}
        {dilSrcs.length>0 ? dilSrcs.map((ds,i)=>{
          const lY=481-((dilSrcs.length-1)*18)/2+i*18;
          return(<g key={`ds-${ds.id||i}`}>
            <rect x="160" y={lY-11} width="180" height="22" rx="3" fill={rejectFails?'#0c1a2e':'#070d1a'} stroke={rejectFails?O.cyan+'88':O.border} strokeWidth={rejectFails?1:0.5}/>
            <text x="168" y={lY-1} fill={rejectFails?O.text2:O.text3} fontSize="8" fontFamily={mono} fontWeight="600">{ds.name||`D${i+1}`}</text>
            <text x="168" y={lY+10} fill={rejectFails?O.text1:O.text3} fontSize="9" fontFamily={mono}>{fmt(vol(ds.actualFlow),1)} {volUnit} · {Math.round(toNumber(ds.conductivity))} µS/cm</text>
            <line x1="340" y1={lY} x2="460" y2="481" stroke={rejectFails?O.cyan:O.border} strokeWidth={rejectFails?1.5:0.5} markerEnd="url(#a1)"/>
          </g>);
        }) : (<>
          <line x1="400" y1="481" x2="460" y2="481" stroke={rejectFails?O.cyan:O.border} strokeWidth={rejectFails?2:1} strokeDasharray={rejectFails?'':'4,3'} markerEnd="url(#a1)"/>
          <text x="388" y="475" textAnchor="end" fill={rejectFails?O.text2:O.text3} fontSize="10" fontFamily={mono}>{hasDil&&dilFlow>0?`${fmt(vol(dilFlow),1)} ${volUnit}`:'น้ำผสม'}</text>
          <text x="388" y="490" textAnchor="end" fill={rejectFails?O.text3:O.border} fontSize="9" fontFamily={mono}>{hasDil&&dilution.Cd?`${Math.round(dilution.Cd)} µS/cm`:'Cond ต่ำ'}</text>
        </>)}

        <line x1="660" y1="481" x2="750" y2="481" stroke={fColor} strokeWidth={rejectFails?2.5:1} markerEnd="url(#a1)"/>
        <rect x="750" y="458" width="155" height="48" rx="5" fill={finalAllowed?'#0c1a2e':'#1a1020'} stroke={fColor} strokeWidth={rejectFails?2.5:1}/>
        <text x="828" y="476" textAnchor="middle" fill={fColor} fontSize="10" fontWeight="700" fontFamily={mono}>FINAL DISCHARGE</text>
        <text x="828" y="493" textAnchor="middle" fill={finalAllowed?O.text2:O.warn} fontSize="11" fontWeight="600" fontFamily={mono}>{showFC} µS/cm</text>
        <text x="828" y="503" textAnchor="middle" fill={O.text3} fontSize="8" fontFamily={mono}>{hasDil?`${fmt(vol(dilution.finalFlow),1)} ${volUnit}`:''}</text>
        <rect x="910" y="464" width="42" height="16" rx="3" fill={fColor+'33'} stroke={fColor} strokeWidth="0.5"/>
        <text x="931" y="475" textAnchor="middle" fill={fColor} fontSize="8" fontWeight="700" fontFamily={mono}>{finalAllowed?(finalSeverity==='WARNING'?'WARN':'PASS'):'REJECT'}</text>
      </g>
    </svg>
  );
*/
});

// ════════════ STYLES ════════════
const mono="'JetBrains Mono',ui-monospace,monospace";
const serif="'Fraunces',serif";
const O = {bg1:'#070d1a',bg2:'#0c1a2e',bg3:'#111f38',border:'#1e3a5f',borderLight:'#2a5080',cyan:'#22d3ee',accent:'#38bdf8',gold:'#fbbf24',teal:'#06b6d4',text1:'#e0f2fe',text2:'#94a3b8',text3:'#64748b',pass:'#34d399',warn:'#f97316',fail:'#ef4444'};

const globalCSS=`
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,700&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap');
html,body,#root{width:100%;max-width:100%;overflow-x:hidden;box-sizing:border-box}
*,*::before,*::after{box-sizing:border-box}
#root{margin:0 auto;text-align:left;border-inline:0}
.ufro-grid,.ufro-grid>*,.ufro-kpi-strip,.ufro-kpi-strip>*,.ufro-dash-grid,.ufro-dash-grid>*,.ufro-loss-grid,.ufro-loss-grid>*{min-width:0;max-width:100%}
.ufro-scroll-x{width:100%;max-width:100%;min-width:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;contain:inline-size}
.ufro-scroll-x>svg{display:block;max-width:none}
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
@media(max-width:768px){.ufro-header{flex-direction:column!important;align-items:flex-start!important;gap:10px!important}.ufro-mode-toggle{align-self:stretch!important}.ufro-header-right{align-self:stretch!important;justify-content:space-between!important}.ufro-grid{grid-template-columns:1fr!important}.ufro-kpi-strip{grid-template-columns:repeat(2,1fr)!important}.ufro-dash-grid{grid-template-columns:1fr!important}.ufro-loss-grid{grid-template-columns:1fr!important}}
@media(max-width:480px){.ufro-kpi-strip{grid-template-columns:1fr!important}}
`;

const S={
  root:{minHeight:'100vh',width:'100%',maxWidth:'100%',overflowX:'hidden',boxSizing:'border-box',textAlign:'left',background:`radial-gradient(ellipse at top,${O.bg2},${O.bg1})`,color:O.text1,fontFamily:"'IBM Plex Sans Thai','JetBrains Mono',sans-serif",padding:20,fontSize:12,backgroundImage:`radial-gradient(ellipse at top,${O.bg2},${O.bg1}),repeating-linear-gradient(0deg,${O.border}11 0px,${O.border}11 1px,transparent 1px,transparent 28px),repeating-linear-gradient(90deg,${O.border}11 0px,${O.border}11 1px,transparent 1px,transparent 28px)`,backgroundBlendMode:'normal,overlay,overlay'},
  header:{display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:16,borderBottom:`1px solid ${O.border}`,marginBottom:22,gap:16,flexWrap:'wrap',minWidth:0,maxWidth:'100%'},
  headerLeft:{display:'flex',alignItems:'center',gap:14,minWidth:0},
  logoMark:{fontSize:30,color:O.cyan,lineHeight:1},
  title:{fontFamily:serif,fontSize:24,fontWeight:500,color:O.text1},
  subtitle:{fontSize:11,color:O.text3,letterSpacing:'0.15em',textTransform:'uppercase',marginTop:3},
  headerCenter:{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flex:1,minWidth:200},
  modeToggle:{display:'inline-flex',background:O.bg2,border:`1px solid ${O.border}`,borderRadius:5,padding:3},
  modeBtn:{background:'transparent',border:'none',padding:'8px 16px',cursor:'pointer',color:O.text3,fontFamily:mono,fontSize:12,fontWeight:600,borderRadius:3,transition:'all 0.2s'},
  modeBtnActive:{background:`${O.accent}20`,color:O.accent,boxShadow:`inset 0 0 0 1px ${O.accent}`},
  projectTabs:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:6,marginBottom:18,background:`${O.bg2}aa`,border:`1px solid ${O.border}`,borderRadius:6,padding:5,minWidth:0,maxWidth:'100%'},
  projectTab:{background:'transparent',border:'none',padding:'10px 8px',cursor:'pointer',color:O.text3,fontFamily:mono,fontSize:12,fontWeight:700,borderRadius:4,letterSpacing:'0.04em'},
  projectTabActive:{background:`${O.accent}18`,color:O.accent,boxShadow:`inset 0 0 0 1px ${O.accent}`},
  headerRight:{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'},
  timeToggle:{display:'inline-flex',background:O.bg2,border:`1px solid ${O.border}`,borderRadius:4,padding:2},
  timeBtn:{background:'transparent',border:'none',padding:'5px 10px',cursor:'pointer',color:O.text3,fontFamily:mono,fontSize:10,fontWeight:600,borderRadius:3},
  timeBtnActive:{background:`${O.accent}20`,color:O.accent,boxShadow:`inset 0 0 0 1px ${O.accent}`},
  resetBtn:{background:'transparent',border:`1px solid ${O.warn}`,color:O.warn,fontSize:14,width:32,height:32,borderRadius:4,cursor:'pointer',fontFamily:mono,fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'},
  grid:{display:'grid',gridTemplateColumns:'380px minmax(0,1fr)',gap:22,minWidth:0,maxWidth:'100%',overflowX:'hidden'},
  sidebar:{background:`${O.bg2}cc`,border:`1px solid ${O.border}`,borderRadius:6,padding:18,height:'fit-content',backdropFilter:'blur(8px)',minWidth:0,maxWidth:'100%',overflowX:'hidden'},
  section:{marginBottom:10,minWidth:0,maxWidth:'100%'},
  sectionBody:{padding:'4px 0',animation:'fadeIn 0.15s ease',minWidth:0,maxWidth:'100%',overflowX:'hidden'},
  sectionLabel:{fontSize:12,color:O.cyan,letterSpacing:'0.1em',fontWeight:600,margin:'14px 0 8px',paddingBottom:6,borderBottom:`1px dashed ${O.border}`,fontFamily:mono,textTransform:'uppercase'},
  strategyTabs:{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:2,background:O.bg1,padding:3,borderRadius:4,minWidth:0,maxWidth:'100%'},
  stratTab:{background:'transparent',border:'none',padding:'6px 4px',cursor:'pointer',color:O.text3,fontFamily:mono,fontSize:10,borderRadius:3,transition:'all 0.15s'},
  stratTabActive:{background:`${O.accent}18`,color:O.accent,boxShadow:`inset 0 0 0 1px ${O.accent}`},
  srcCard:{background:O.bg2,border:`1px solid ${O.border}`,borderRadius:4,padding:'8px 10px',transition:'all 0.2s',minWidth:0,maxWidth:'100%'},
  srcCardOn:{background:`${O.cyan}08`,borderColor:O.borderLight},
  srcHeader:{display:'flex',alignItems:'center',gap:7},
  srcToggle:{background:'transparent',border:'none',color:O.border,fontSize:16,cursor:'pointer',padding:0,lineHeight:1,width:16},
  srcToggleOn:{color:O.cyan},
  srcName:{flex:1,background:'transparent',border:'none',color:O.text1,fontSize:12,fontFamily:'inherit',outline:'none',padding:'2px 4px',minWidth:0},
  srcIdx:{fontSize:9,color:O.cyan,letterSpacing:'0.1em',fontWeight:600,fontFamily:mono},
  srcInputs:{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:6,minWidth:0},
  srcField:{minWidth:0},
  srcFieldLabel:{fontSize:10,color:O.text3,letterSpacing:'0.08em',textTransform:'uppercase',display:'block',marginBottom:3,fontFamily:mono},
  srcInputWrap:{display:'flex',alignItems:'center',background:O.bg1,border:`1px solid ${O.border}`,borderRadius:3,padding:'0 6px',minWidth:0},
  srcInputRO:{background:O.bg2,borderStyle:'dashed',borderColor:`${O.accent}44`},
  srcInput:{flex:1,background:'transparent',border:'none',color:O.text1,padding:'5px 0',fontSize:12,fontFamily:mono,outline:'none',width:'100%',minWidth:0},
  srcUnit:{fontSize:9,color:O.text3},
  mixBox:{marginTop:10,padding:10,background:`${O.accent}08`,border:`1px solid ${O.accent}33`,borderRadius:4,minWidth:0,maxWidth:'100%',boxSizing:'border-box'},
  mixHead:{fontSize:10,color:O.accent,letterSpacing:'0.15em',fontWeight:700,paddingBottom:6,borderBottom:`1px dashed ${O.accent}33`,marginBottom:6,fontFamily:mono},
  mixRow:{display:'flex',justifyContent:'space-between',fontSize:11,padding:'3px 0',color:O.text2,gap:8,minWidth:0},
  mixVal:{color:O.accent,fontWeight:600,fontFamily:mono},
  routeDesc:{fontSize:11,color:O.text2,lineHeight:1.6,marginTop:8,padding:8,background:O.bg1,border:`1px solid ${O.border}`,borderRadius:4},
  inputRow:{marginBottom:10},inputLabel:{fontSize:12,color:O.text2,marginBottom:5},
  inputWrap:{display:'flex',alignItems:'center',background:O.bg1,border:`1px solid ${O.border}`,borderRadius:4,padding:'0 10px',minWidth:0},
  inputWrapAccent:{borderColor:O.accent,background:`${O.accent}08`},
  input:{flex:1,background:'transparent',border:'none',color:O.text1,padding:'8px 0',fontSize:14,fontFamily:mono,outline:'none',minWidth:0},
  inputUnit:{fontSize:11,color:O.text3,letterSpacing:'0.1em'},
  sliderRow:{marginBottom:12},slider:{width:'100%'},
  warnBox:{marginTop:10,padding:10,background:`${O.warn}14`,border:`1px solid ${O.warn}`,borderRadius:4},
  warnTitle:{fontSize:12,fontWeight:700,color:O.warn},
  main:{display:'flex',flexDirection:'column',gap:10,minWidth:0,maxWidth:'100%',overflowX:'hidden'},
  futurePanel:{background:`${O.bg2}cc`,border:`1px solid ${O.border}`,borderRadius:6,padding:22,minHeight:360},
  futureTitle:{fontFamily:serif,fontSize:28,fontWeight:600,color:O.text1},
  futureSub:{fontSize:11,color:O.text3,fontFamily:mono,letterSpacing:'0.12em',textTransform:'uppercase',marginTop:4,marginBottom:18},
  futureGrid:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:10},
  futureItem:{background:O.bg2,border:`1px solid ${O.border}`,borderRadius:5,padding:14,color:O.text2,lineHeight:1.6,fontSize:12},
  futureIndex:{display:'block',fontFamily:mono,color:O.accent,fontSize:10,fontWeight:700,marginBottom:6},
  kpiStrip:{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:10,minWidth:0,maxWidth:'100%'},
  kpi:{background:O.bg2,border:`1px solid ${O.border}`,borderRadius:5,padding:'12px 14px'},
  kpiHi:{borderColor:O.accent,background:`${O.accent}0a`},kpiWarn:{borderColor:O.warn,background:`${O.warn}0a`},
  dischargeCard:{borderRadius:6,padding:'16px 22px',display:'flex',flexDirection:'column',alignItems:'center',gap:6},
  dischargePass:{background:`${O.pass}10`,border:`2px solid ${O.pass}`},
  dischargeWarn:{background:`${O.gold}10`,border:`2px solid ${O.gold}`},
  dischargeFail:{background:`${O.fail}10`,border:`2px solid ${O.fail}`},
  dischargeBadge:{fontSize:16,fontWeight:700,letterSpacing:'0.1em',fontFamily:mono,padding:'8px 20px',borderRadius:5},
  dischargeMeta:{fontSize:11,color:O.text2,fontFamily:mono,textAlign:'center'},
  exportBtn:{background:'transparent',border:`1px solid ${O.border}`,color:O.text2,fontSize:10,padding:'4px 10px',borderRadius:3,cursor:'pointer',fontFamily:mono,fontWeight:600},
  diagramToolbar:{display:'flex',alignItems:'center',gap:6,marginBottom:8,flexWrap:'wrap',minWidth:0,maxWidth:'100%'},
  diagramToolbarSpacer:{flex:'1 1 auto',minWidth:8},
  zoomBtn:{width:28,height:26,background:O.bg2,border:`1px solid ${O.border}`,color:O.text1,borderRadius:3,cursor:'pointer',fontFamily:mono,fontWeight:800,fontSize:13,lineHeight:1},
  zoomValue:{minWidth:56,height:26,background:`${O.accent}12`,border:`1px solid ${O.accent}66`,color:O.accent,borderRadius:3,cursor:'pointer',fontFamily:mono,fontWeight:800,fontSize:10},
  diagramZoomStage:{position:'relative',flex:'0 0 auto'},
  fullscreenBackdrop:{position:'fixed',inset:0,zIndex:9999,background:'rgba(2,6,23,0.96)',backdropFilter:'blur(10px)',padding:14,display:'flex',flexDirection:'column',gap:10,boxSizing:'border-box'},
  fullscreenHeader:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:'10px 12px',background:O.bg2,border:`1px solid ${O.border}`,borderRadius:6},
  fullscreenTitle:{fontFamily:serif,fontSize:22,fontWeight:600,color:O.text1},
  fullscreenMeta:{fontSize:10,color:O.text3,fontFamily:mono,letterSpacing:'0.08em',textTransform:'uppercase'},
  fullscreenActions:{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'},
  fullscreenCanvas:{flex:1,width:'100%',maxWidth:'100%',minWidth:0,minHeight:0,overflow:'auto',WebkitOverflowScrolling:'touch',contain:'layout paint',border:`1px solid ${O.border}`,borderRadius:6,background:O.bg1},
  diagramScrollWrapper:{width:'100%',maxWidth:'100%',minWidth:0,overflowX:'auto',overflowY:'hidden',WebkitOverflowScrolling:'touch',contain:'inline-size',border:`1px solid ${O.border}`,borderRadius:6,background:O.bg1},
  tableScroll:{width:'100%',maxWidth:'100%',minWidth:0,overflowX:'auto',overflowY:'hidden',WebkitOverflowScrolling:'touch',contain:'inline-size'},
  table:{width:'100%',borderCollapse:'collapse',fontSize:12,minWidth:550},
  th:{textAlign:'left',padding:'10px 14px',fontSize:10,color:O.text3,letterSpacing:'0.12em',fontWeight:600,borderBottom:`1px solid ${O.border}`,fontFamily:mono},
  tr:{borderBottom:`1px solid ${O.border}44`},
  trHi:{background:`${O.accent}0a`},trLoss:{background:`${O.warn}06`},trAcc:{background:`${O.cyan}06`},trSub:{opacity:0.6,fontSize:11},trBold:{fontWeight:700,background:`${O.cyan}0a`},
  td:{padding:'10px 14px',color:O.text1,fontFamily:mono,fontSize:12},
  footer:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 18px',background:O.bg2,border:`1px solid ${O.border}`,borderRadius:5,fontSize:10,fontFamily:mono,flexWrap:'wrap',gap:8,marginTop:8},
};
