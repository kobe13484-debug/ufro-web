import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';

// ────────────── Input Helpers ──────────────
const toNumber = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

function NumInput({ value, onValueChange, style, readOnly }) {
  const [display, setDisplay] = useState(String(value ?? ''));
  const typing = useRef(false);
  useEffect(() => { if (!typing.current) setDisplay(String(value ?? '')); }, [value]);
  const handleChange = (e) => {
    const raw = e.target.value; setDisplay(raw); typing.current = true;
    if (raw === '' || raw === '-' || raw === '.' || raw.endsWith('.')) return;
    const n = parseFloat(raw); if (isFinite(n)) onValueChange(n);
  };
  const handleBlur = () => { typing.current = false; const n = toNumber(display); onValueChange(n); setDisplay(String(n)); };
  return <input type="text" inputMode="decimal" value={display} onChange={handleChange} onBlur={handleBlur} style={style} readOnly={readOnly} />;
}

// ────────────── Conversion ──────────────
const TDS_TO_COND = 2;
const COND_TO_TDS = 0.5;
const tds2cond = (tds) => tds * TDS_TO_COND;
const cond2tds = (cond) => cond * COND_TO_TDS;

const REJECT_TDS_LIMIT = 3000;
const REJECT_COND_LIMIT = 6000;

// ══════ FIX #1 & #2: Proper discharge validation ══════
// Two separate concepts: regulatoryAllowed (boolean) and severityStatus (PASS/WARNING/FAIL)
function validateDischarge(tds) {
  const cond = tds2cond(tds);
  const condLimit = REJECT_COND_LIMIT;
  const tdsLimit = REJECT_TDS_LIMIT;
  const warnRatio = 0.8;

  const regulatoryAllowed = cond <= condLimit && tds <= tdsLimit;

  let severityStatus;
  if (!regulatoryAllowed) {
    severityStatus = 'FAIL';
  } else if (cond >= condLimit * warnRatio || tds >= tdsLimit * warnRatio) {
    severityStatus = 'WARNING';
  } else {
    severityStatus = 'PASS';
  }

  const margin = condLimit - cond; // positive = below limit, negative = above limit

  return { regulatoryAllowed, severityStatus, cond, tds, margin };
}

// Backward-compat wrapper for badges that just need status string
function getRejectStatus(tds) {
  return validateDischarge(tds).severityStatus;
}

// ────────────── Recommendations ──────────────
function getRecommendations(calc, splitMode) {
  const recs = [];
  const roV = validateDischarge(calc.roRejectTDS);
  const totV = validateDischarge(calc.totalRejectTDS);

  if (!roV.regulatoryAllowed && totV.regulatoryAllowed) {
    recs.push({ area: 'RO Concentrate', status: 'WARNING', items: [
      'RO Concentrate เกินเกณฑ์เดี่ยว แต่เมื่อรวมกับ UF Reject แล้ว Total Reject ยังผ่านเกณฑ์ปล่อยทิ้ง',
    ]});
  }
  if (!totV.regulatoryAllowed) {
    recs.push({ area: 'Total Combined Reject', status: 'FAIL', items: [
      'น้ำ Reject รวมยังไม่ผ่านเกณฑ์ปล่อยทิ้ง',
      'เพิ่มน้ำผสม Conductivity ต่ำ ในโมดูล Reject Dilution Water',
      'ปรับสัดส่วน RO/Bypass เพื่อลดความเข้มข้น',
      'ลด RO Recovery / เพิ่ม RO Reject rate',
      'พิจารณา Reject treatment, Evaporation, ED/BMED หรือ 2-Stage RO',
    ]});
  }
  if (splitMode === 'manual' && calc.actualProductTDS > calc.targetTDS * 1.0) {
    recs.push({ area: 'Product Water Quality (Manual Split)', status: 'FAIL', items: [
      'ลด UF Bypass % เพื่อเพิ่มสัดส่วน RO Permeate',
      'เพิ่ม To RO % ในส่วน UF Permeate Split',
      'เพิ่ม RO Salt Rejection % ถ้าเมมเบรนรองรับ',
      'ลด Target Product Conductivity',
    ]});
  }
  if (totV.severityStatus === 'WARNING') {
    recs.push({ area: 'Reject ใกล้ขีดจำกัด', status: 'WARNING', items: [
      'เฝ้าระวัง Conductivity ของ Reject อย่างใกล้ชิด',
      'เตรียมน้ำผสม Conductivity ต่ำไว้เป็น safety buffer',
      'ลด RO recovery หรือเพิ่ม RO reject rate หากค่าเริ่มสูงขึ้น',
      'ตรวจสอบ online conductivity meter เป็นระยะ',
    ]});
  }
  return recs;
}

// ────────────── Export ──────────────
function exportSVG(el) {
  if (!el) return;
  const s = new XMLSerializer().serializeToString(el);
  const b = new Blob([s], { type: 'image/svg+xml;charset=utf-8' });
  const u = URL.createObjectURL(b); const a = document.createElement('a');
  a.href = u; a.download = 'ufro-process-diagram.svg'; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
}
function exportPNG(el) {
  if (!el) return;
  const s = new XMLSerializer().serializeToString(el);
  const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d'); const img = new Image();
  const u = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml;charset=utf-8' }));
  img.onload = () => { canvas.width = 2000; canvas.height = 920; ctx.fillStyle = '#060c09'; ctx.fillRect(0,0,2000,920); ctx.drawImage(img,0,0,2000,920); URL.revokeObjectURL(u);
    const a = document.createElement('a'); a.href = canvas.toDataURL('image/png'); a.download = 'ufro-process-diagram.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); };
  img.src = u;
}

// ────────────── Defaults ──────────────
const DEFAULT_SOURCES = [
  { id:1, name:'แหล่งน้ำ A', flow:200, ratio:100, tds:1018, enabled:true, cost:5 },
  { id:2, name:'แหล่งน้ำ B', flow:0, ratio:0, tds:800, enabled:false, cost:8 },
  { id:3, name:'แหล่งน้ำ C', flow:0, ratio:0, tds:600, enabled:false, cost:3 },
  { id:4, name:'แหล่งน้ำ D', flow:0, ratio:0, tds:400, enabled:false, cost:12 },
  { id:5, name:'แหล่งน้ำ E', flow:0, ratio:0, tds:1200, enabled:false, cost:2 },
];
const DEFAULT_DILUTION = [
  { id:1, name:'น้ำคลอง A', flow:0, conductivity:500, enabled:false },
  { id:2, name:'น้ำคลอง B', flow:0, conductivity:300, enabled:false },
  { id:3, name:'น้ำประปา', flow:0, conductivity:200, enabled:false },
  { id:4, name:'น้ำบ่อตื้น', flow:0, conductivity:400, enabled:false },
  { id:5, name:'น้ำบาดาล', flow:0, conductivity:600, enabled:false },
];

// ══════════════ MAIN COMPONENT ══════════════
export default function UFROCalculator() {
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dilutionMode, setDilutionMode] = useState('auto');
  const [dilutionSources, setDilutionSources] = useState(DEFAULT_DILUTION.map(s=>({...s})));
  const [showDilutionSim, setShowDilutionSim] = useState(false);
  const [recTab, setRecTab] = useState('status');
  const [safetyMargin, setSafetyMargin] = useState(10);

  // v6.3.1: Cost Model state
  const [elecTariff, setElecTariff] = useState(4); // THB/kWh
  const [energyMode, setEnergyMode] = useState('simple'); // 'simple' | 'equipment'
  const [secFeed, setSecFeed] = useState(0.614); // kWh/m³ feed (simple mode)
  const [equipments, setEquipments] = useState([
    { id:1, name:'High Pressure Pump', kw:55, qty:2, duty:0.9, enabled:true },
    { id:2, name:'UF Feed Pump', kw:15, qty:2, duty:0.85, enabled:true },
    { id:3, name:'CIP Pump', kw:7.5, qty:1, duty:0.1, enabled:false },
  ]);
  const [costOpen, setCostOpen] = useState(true);

  const diagramRef = useRef(null);
  const targetTDS = cond2tds(targetCond);
  const manualBypass = 100 - manualToRO;

  const handleReset = () => {
    if (!window.confirm('รีเซ็ตค่าทั้งหมดกลับเป็นค่าเริ่มต้น?')) return;
    setMode('know-output'); setStrategy('optimize'); setTimeUnit('hourly'); setOpsHours(24);
    setSources(DEFAULT_SOURCES.map(s=>({...s}))); setTargetCond(636); setProductFlow(146);
    setUfReject(10); setRoReject(25); setRoSaltRejection(96.56);
    setSplitMode('auto'); setManualToRO(75); setAdvancedOpen(false);
    setDilutionMode('auto'); setDilutionSources(DEFAULT_DILUTION.map(s=>({...s})));
    setShowDilutionSim(false); setRecTab('status'); setSafetyMargin(10);
    setElecTariff(4); setEnergyMode('simple'); setSecFeed(0.614); setCostOpen(true);
    setEquipments([
      { id:1, name:'High Pressure Pump', kw:55, qty:2, duty:0.9, enabled:true },
      { id:2, name:'UF Feed Pump', kw:15, qty:2, duty:0.85, enabled:true },
      { id:3, name:'CIP Pump', kw:7.5, qty:1, duty:0.1, enabled:false },
    ]);
  };

  // Source optimization (preserved)
  useEffect(() => {
    if (mode !== 'know-output' || strategy === 'manual') return;
    const enabled = sources.filter(s => s.enabled);
    if (enabled.length === 0) return;
    let nr;
    if (strategy === 'equal') { const e = 100/enabled.length; nr = enabled.map(s=>({id:s.id,ratio:e})); }
    else {
      const minT = Math.min(...enabled.map(s=>s.tds));
      if (minT <= targetTDS) { const l = enabled.filter(s=>s.tds<=targetTDS); const e=100/l.length; nr = enabled.map(s=>({id:s.id,ratio:s.tds<=targetTDS?e:0})); }
      else { const w=enabled.map(s=>1/Math.max(s.tds,1)); const sm=w.reduce((a,b)=>a+b,0); nr=enabled.map((s,i)=>({id:s.id,ratio:(w[i]/sm)*100})); }
    }
    setSources(p => { const u=p.map(s=>{const r=nr.find(x=>x.id===s.id);if(r&&Math.abs(toNumber(s.ratio)-r.ratio)>0.01)return{...s,ratio:Math.round(r.ratio*10)/10};return s;}); return u.some((s,i)=>s.ratio!==p[i].ratio)?u:p; });
  }, [mode, strategy, sources.map(s=>`${s.id}-${s.enabled}-${s.tds}`).join(','), targetTDS]);

  // Mixed Feed (preserved)
  const mixedFeed = useMemo(() => {
    const active = sources.filter(s=>s.enabled);
    if (mode === 'know-input') {
      const tf = active.reduce((s,x)=>s+toNumber(x.flow),0);
      if (tf===0) return {flow:0,tds:0,sources:[]};
      const tds = active.reduce((s,x)=>s+toNumber(x.flow)*toNumber(x.tds),0)/tf;
      return {flow:tf,tds,sources:active.map(s=>({...s,actualFlow:toNumber(s.flow),actualRatio:tf>0?(toNumber(s.flow)/tf)*100:0}))};
    } else {
      const usable = active.filter(s=>toNumber(s.ratio)>0);
      const tr = usable.reduce((s,x)=>s+toNumber(x.ratio),0);
      if (tr===0) return {flow:0,tds:0,sources:active,totalRatio:0};
      const tds = usable.reduce((s,x)=>s+toNumber(x.ratio)*toNumber(x.tds),0)/tr;
      return {flow:0,tds,sources:active,totalRatio:tr};
    }
  }, [sources, mode]);

  // ══════ MAIN PROCESS CALC ══════
  const calc = useMemo(() => {
    const ufR = (100-ufReject)/100;
    const roR = (100-roReject)/100;
    const rej = roSaltRejection/100;
    const feedTDS = mixedFeed.tds;
    const roPermTDS = feedTDS * (1-rej);
    const roRejectTDS = roR<1 ? (feedTDS - roR*roPermTDS)/(1-roR) : feedTDS;

    let feedFlow, ufOut, ufBypass, roIn, roOut, roRejectFlow, ufRejectFlow, totalReject, finalProduct;
    let blendValid = true, blendWarning = '', bypassRO = false, actualProductTDS;

    if (splitMode === 'manual') {
      const toROPct = manualToRO / 100;
      const bypassPct = 1 - toROPct;
      if (mode === 'know-output') {
        finalProduct = productFlow;
        const factor = bypassPct + toROPct * roR;
        ufOut = factor > 0 ? finalProduct / factor : 0;
        feedFlow = ufR > 0 ? ufOut / ufR : 0;
      } else { feedFlow = mixedFeed.flow; ufOut = feedFlow * ufR; }
      ufRejectFlow = feedFlow - ufOut;
      roIn = ufOut * (manualToRO / 100); ufBypass = ufOut - roIn;
      roOut = roIn * roR; roRejectFlow = roIn - roOut;
      finalProduct = ufBypass + roOut; totalReject = ufRejectFlow + roRejectFlow;
      actualProductTDS = finalProduct > 0 ? (ufBypass * feedTDS + roOut * roPermTDS) / finalProduct : 0;
      if (feedTDS === 0) { blendValid = false; blendWarning = 'ยังไม่ได้กรอกแหล่งน้ำ'; }
    } else {
      let blendRatio = feedTDS > 0 && (feedTDS - roPermTDS) !== 0 ? (targetTDS - roPermTDS) / (feedTDS - roPermTDS) : 0;
      if (feedTDS === 0) { blendValid = false; blendWarning = 'ยังไม่ได้กรอกแหล่งน้ำ'; blendRatio = 0; }
      else if (feedTDS <= targetTDS) { bypassRO = true; blendRatio = 1; }
      else if (targetTDS < roPermTDS) { blendValid = false; blendWarning = `เป้าหมาย Cond (${Math.round(tds2cond(targetTDS))}) ต่ำกว่า RO permeate (${Math.round(tds2cond(roPermTDS))} µS/cm)`; blendRatio = 0; }
      else { blendRatio = Math.max(0, Math.min(1, blendRatio)); }

      if (mode === 'know-output') {
        finalProduct = productFlow; ufBypass = blendRatio * finalProduct; roOut = (1-blendRatio)*finalProduct;
        roIn = roR>0 ? roOut/roR : 0; roRejectFlow = roIn-roOut; ufOut = ufBypass+roIn;
        feedFlow = ufR>0 ? ufOut/ufR : 0; ufRejectFlow = feedFlow-ufOut; totalReject = ufRejectFlow+roRejectFlow;
      } else {
        feedFlow = mixedFeed.flow; ufOut = feedFlow*ufR; ufRejectFlow = feedFlow-ufOut;
        const denom = roR*blendRatio + (1-blendRatio);
        roIn = denom>0 ? ufOut*(1-blendRatio)/denom : 0; roOut = roR*roIn; ufBypass = ufOut-roIn;
        roRejectFlow = roIn-roOut; finalProduct = ufBypass+roOut; totalReject = ufRejectFlow+roRejectFlow;
      }
      actualProductTDS = bypassRO ? feedTDS : (finalProduct > 0 ? (ufBypass*feedTDS + roOut*roPermTDS)/finalProduct : 0);
    }

    const overallRecovery = feedFlow>0 ? (finalProduct/feedFlow)*100 : 0;
    const tdsInFeed = feedFlow*feedTDS, tdsInProduct = finalProduct*actualProductTDS;
    const totalRejectTDS = totalReject>0 ? (tdsInFeed-tdsInProduct)/totalReject : 0;
    const calcToRO = ufOut > 0 ? (roIn/ufOut)*100 : 0;
    const calcBypass = ufOut > 0 ? (ufBypass/ufOut)*100 : 0;

    let sourceAllocations = [];
    if (mode==='know-output' && mixedFeed.totalRatio>0) {
      sourceAllocations = mixedFeed.sources.map(s=>({...s,actualFlow:feedFlow*(toNumber(s.ratio)/mixedFeed.totalRatio),actualRatio:(toNumber(s.ratio)/mixedFeed.totalRatio)*100}));
    } else { sourceAllocations = mixedFeed.sources; }

    // Use new validation (#1/#2)
    const ufRejectV = validateDischarge(feedTDS);
    const roRejectV = validateDischarge(roRejectTDS);
    const totalRejectV = validateDischarge(totalRejectTDS);

    return {
      feedFlow, ufOut, ufBypass, roIn, roOut, roRejectFlow, ufRejectFlow, totalReject, finalProduct,
      feedTDS, ufPermTDS:feedTDS, ufRejectTDS:feedTDS, roPermTDS, roRejectTDS, totalRejectTDS, actualProductTDS,
      overallRecovery, blendValid, blendWarning, bypassRO, sourceAllocations, totalRatio:mixedFeed.totalRatio||0,
      ufRejectStatus: ufRejectV.severityStatus, roRejectStatus: roRejectV.severityStatus,
      totalRejectStatus: totalRejectV.severityStatus,
      totalRejectAllowed: totalRejectV.regulatoryAllowed, // KEY FIX
      totalRejectMargin: totalRejectV.margin,
      targetTDS, calcToRO, calcBypass,
      productCondStatus: tds2cond(actualProductTDS) > targetCond ? 'FAIL' : 'PASS',
    };
  }, [mixedFeed, targetTDS, targetCond, productFlow, ufReject, roReject, roSaltRejection, mode, splitMode, manualToRO]);

  // ══════ DILUTION CALC ══════
  const dilution = useMemo(() => {
    // Changed: use regulatoryAllowed, not severityStatus
    const rejectFails = !calc.totalRejectAllowed;
    // Also compute for simulation mode (#6)
    const needsCompute = rejectFails || showDilutionSim;
    if (!needsCompute) return { needed: false, rejectFails: false };

    const Qr = calc.totalReject;
    const Cr = tds2cond(calc.totalRejectTDS);
    const Ctarget = REJECT_COND_LIMIT * (1 - safetyMargin / 100); // v6.3: apply safety margin

    if (dilutionMode === 'auto') {
      const enabledSrcs = dilutionSources.filter(s=>s.enabled);
      const Cd = enabledSrcs.length > 0 ? enabledSrcs.reduce((s,x)=>s+toNumber(x.conductivity),0)/enabledSrcs.length : 500;
      const srcNames = enabledSrcs.map(s=>s.name).join(', ') || 'น้ำผสม';

      // IMPORTANT — DO NOT REMOVE:
      // This function creates source-level dilution flow data for the Mixing diagram.
      // The total required dilution water (QdReq) alone is NOT enough for operation/engineering review.
      // Users must see how much water EACH selected dilution source contributes into DILUTION / MIXING.
      // If this is removed, the diagram will collapse back to one generic "น้ำผสม" line and the operator
      // cannot verify the flow from each source before mixing with UF Reject + RO Reject.
      const makeMixingSources = (flow) => enabledSrcs.map(s => ({
        ...s,
        actualFlow: enabledSrcs.length > 0 ? flow / enabledSrcs.length : 0,
        actualRatio: enabledSrcs.length > 0 ? 100 / enabledSrcs.length : 0,
      }));

      if (Cd >= Ctarget) {
        const mixingSources = makeMixingSources(0);
        return { needed: true, rejectFails, autoMode: true, cannotSolve: true, Cd, Cr, Qr, Ctarget, sourceFlows: mixingSources, mixingSources, msg: `Conductivity น้ำผสม (${Math.round(Cd)}) สูงกว่าเป้าหมาย (${Math.round(Ctarget)} µS/cm)` };
      }
      if (Cr <= Ctarget) {
        const mixingSources = makeMixingSources(0);
        return { needed: true, rejectFails, autoMode: true, cannotSolve: false, QdReq: 0, Cd, Cr, Qr, Ctarget, finalFlow: Qr, finalCond: Cr, finalTDS: cond2tds(Cr), finalStatus: getRejectStatus(cond2tds(Cr)), finalV: validateDischarge(cond2tds(Cr)), srcName: srcNames, sourceFlows: mixingSources, mixingSources };
      }
      const QdReq = Qr * (Cr - Ctarget) / (Ctarget - Cd);
      const finalFlow = Qr + QdReq;
      const finalCond = (Qr*Cr + QdReq*Cd) / finalFlow;
      const finalTDS = cond2tds(finalCond);
      const finalV = validateDischarge(finalTDS);
      const mixingSources = makeMixingSources(QdReq);
      return { needed: true, rejectFails, autoMode: true, cannotSolve: false, QdReq, Cd, Cr, Qr, Ctarget, finalFlow, finalCond, finalTDS, finalStatus: finalV.severityStatus, finalAllowed: finalV.regulatoryAllowed, finalV, srcName: srcNames, sourceFlows: mixingSources, mixingSources };
    } else {
      const active = dilutionSources.filter(s=>s.enabled && toNumber(s.flow) > 0);
      const dilFlow = active.reduce((s,x)=>s+toNumber(x.flow),0);
      const dilCondLoad = active.reduce((s,x)=>s+toNumber(x.flow)*toNumber(x.conductivity),0);
      const finalFlow = Qr + dilFlow;
      const finalCond = finalFlow > 0 ? (Qr*Cr + dilCondLoad) / finalFlow : Cr;
      const finalTDS = cond2tds(finalCond);
      const finalV = validateDischarge(finalTDS);
      // IMPORTANT — DO NOT REMOVE:
      // Manual mode must also expose mixingSources so the Mixing diagram can show each dilution source
      // as a separate incoming line with its own flow. This is critical for explaining the real water balance.
      const mixingSources = active.map(s => ({
        ...s,
        actualFlow: toNumber(s.flow),
        actualRatio: dilFlow > 0 ? (toNumber(s.flow) / dilFlow) * 100 : 0,
      }));
      return { needed: true, rejectFails, autoMode: false, cannotSolve: false, dilFlow, finalFlow, finalCond, finalTDS, finalStatus: finalV.severityStatus, finalAllowed: finalV.regulatoryAllowed, finalV, Cr, Qr, Ctarget, sources: active, mixingSources };
    }
  }, [calc, dilutionSources, dilutionMode, showDilutionSim, safetyMargin]);

  // ═══ Final discharge decision (KEY FIX #1/#2) ═══
  // Use regulatoryAllowed for PASS/REJECT decision, severityStatus for badge color
  const finalDischargeV = useMemo(() => {
    if (dilution.needed && dilution.rejectFails && !dilution.cannotSolve && dilution.finalV) {
      return dilution.finalV;
    }
    return validateDischarge(calc.totalRejectTDS);
  }, [calc, dilution]);

  const finalAllowed = finalDischargeV.regulatoryAllowed;
  const finalSeverity = finalDischargeV.severityStatus;
  const finalMargin = finalDischargeV.margin;

  const recommendations = useMemo(() => getRecommendations({...calc}, splitMode), [calc, splitMode]);

  // ══════ COST CALCULATION (v6.3.1) ══════
  const costCalc = useMemo(() => {
    const feedFlow = calc.feedFlow;
    const productFlow = calc.finalProduct;

    // Raw water cost — weighted by actual flow from sourceAllocations
    const allocs = calc.sourceAllocations || [];
    let totalWaterCostPerH = 0;
    let totalSourceFlow = 0;
    allocs.forEach(s => {
      const fl = s.actualFlow !== undefined ? s.actualFlow : toNumber(s.flow);
      const c = toNumber(s.cost);
      totalWaterCostPerH += fl * c;
      totalSourceFlow += fl;
    });
    const avgWaterCostPerM3 = totalSourceFlow > 0 ? totalWaterCostPerH / totalSourceFlow : 0;
    const rawWaterCostPerH = totalWaterCostPerH;
    const rawWaterCostPerDay = rawWaterCostPerH * opsHours;
    const rawWaterCostPerM3Product = productFlow > 0 ? rawWaterCostPerH / productFlow : 0;

    // Electricity cost
    let elecKwPerH = 0;
    if (energyMode === 'simple') {
      elecKwPerH = feedFlow * toNumber(secFeed);
    } else {
      equipments.filter(e => e.enabled).forEach(e => {
        elecKwPerH += toNumber(e.kw) * toNumber(e.qty) * toNumber(e.duty);
      });
    }
    const elecCostPerH = elecKwPerH * toNumber(elecTariff);
    const elecCostPerDay = elecCostPerH * opsHours;
    const elecCostPerM3Feed = feedFlow > 0 ? elecCostPerH / feedFlow : 0;
    const elecCostPerM3Product = productFlow > 0 ? elecCostPerH / productFlow : 0;
    const secActual = feedFlow > 0 ? elecKwPerH / feedFlow : 0;

    // Totals
    const totalCostPerH = rawWaterCostPerH + elecCostPerH;
    const totalCostPerDay = totalCostPerH * opsHours;
    const totalCostPerM3Product = rawWaterCostPerM3Product + elecCostPerM3Product;
    const totalCostPerMonth = totalCostPerDay * 30;

    return {
      avgWaterCostPerM3, rawWaterCostPerH, rawWaterCostPerDay, rawWaterCostPerM3Product,
      elecKwPerH, elecCostPerH, elecCostPerDay, elecCostPerM3Feed, elecCostPerM3Product, secActual,
      totalCostPerH, totalCostPerDay, totalCostPerM3Product, totalCostPerMonth,
    };
  }, [calc, opsHours, energyMode, secFeed, elecTariff, equipments]);

  const updateSource = (id, field, value) => {
    setSources(sources.map(s=>s.id===id?{...s,[field]:value}:s));
    if (mode==='know-output' && field==='ratio') setStrategy('manual');
  };
  const updateDilution = (id, field, value) => {
    setDilutionSources(dilutionSources.map(s=>s.id===id?{...s,[field]:value}:s));
  };
  const updateEquipment = (id, field, value) => {
    setEquipments(equipments.map(e=>e.id===id?{...e,[field]:value}:e));
  };
  const addEquipment = () => {
    const maxId = equipments.reduce((m,e)=>Math.max(m,e.id),0);
    setEquipments([...equipments, { id:maxId+1, name:`Equipment ${maxId+1}`, kw:10, qty:1, duty:1, enabled:true }]);
  };
  const removeEquipment = (id) => {
    if (equipments.length <= 1) return;
    setEquipments(equipments.filter(e=>e.id!==id));
  };

  const vol = (h) => timeUnit==='daily'?h*opsHours:h;
  const volUnit = timeUnit==='daily'?'m³/day':'m³/h';
  const fmt = (n,d=1) => isFinite(n)&&!isNaN(n)?n.toFixed(d):'—';
  const fmtC = (tds) => isFinite(tds)&&!isNaN(tds)?Math.round(tds2cond(tds)).toLocaleString():'—';
  const fmtB = (n,d=2) => isFinite(n)&&!isNaN(n)?n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d}):'—';

  return (
    <div style={S.root}><style>{globalCSS}</style>

      {/* ═══ HEADER ═══ */}
      <header style={S.header} className="ufro-header">
        <div style={S.headerLeft}>
          <div style={S.logoMark}>◐</div>
          <div><div style={S.title}>UF · RO CALCULATOR</div><div style={S.subtitle}>JYN Reuse Water v6.3.1</div></div>
        </div>
        <div style={S.headerCenter} className="ufro-mode-toggle">
          <div style={S.modeToggle}>
            <button style={{...S.modeBtn,...(mode==='know-input'?S.modeBtnActive:{})}} onClick={()=>setMode('know-input')}>
              <span style={S.modeBtnLabel}>FEED</span><span style={S.modeBtnArrow}>→</span><span style={{...S.modeBtnQ,...(mode==='know-input'?S.modeBtnQActive:{})}}>?</span>
            </button>
            <button style={{...S.modeBtn,...(mode==='know-output'?S.modeBtnActive:{})}} onClick={()=>setMode('know-output')}>
              <span style={{...S.modeBtnQ,...(mode==='know-output'?S.modeBtnQActive:{})}}>?</span><span style={S.modeBtnArrow}>→</span><span style={S.modeBtnLabel}>PRODUCT</span>
            </button>
          </div>
          <div style={S.modeDesc}>{mode==='know-input'?'ทราบ Feed → คำนวณ Product':'ทราบ Product → คำนวณ Feed'}</div>
        </div>
        <div style={S.headerRight} className="ufro-header-right">
          <div style={S.timeControls}>
            <div style={S.timeToggle}>
              <button style={{...S.timeBtn,...(timeUnit==='hourly'?S.timeBtnActive:{})}} onClick={()=>setTimeUnit('hourly')}>h</button>
              <button style={{...S.timeBtn,...(timeUnit==='daily'?S.timeBtnActive:{})}} onClick={()=>setTimeUnit('daily')}>day</button>
            </div>
            {timeUnit==='daily' && <div style={S.opsWrap}><NumInput value={opsHours} onValueChange={v=>setOpsHours(Math.max(1,Math.min(24,v)))} style={S.opsInput}/><span style={S.opsLabel}>h/d</span></div>}
          </div>
          <button onClick={handleReset} style={S.resetBtn}>↺ Reset</button>
          <div style={S.statusDot}/><span style={S.statusText}>{calc.blendValid?'READY':'CHECK'}</span>
        </div>
      </header>

      <div style={S.grid} className="ufro-grid">
        {/* ═══ LEFT SIDEBAR ═══ */}
        <aside style={S.sidebar}>
          <div style={S.sectionLabel}>แหล่งน้ำดิบ {mode==='know-input'?'— ระบุปริมาณ':''}</div>
          {mode==='know-output' && (
            <div style={S.strategyBox}>
              <div style={S.strategyHeader}><span style={S.strategyLabel}>วิธีจัดสรร</span>{strategy==='manual'&&<span style={S.manualTag}>MANUAL</span>}</div>
              <div style={S.strategyTabs}>{['optimize','equal','manual'].map(s=>(
                <button key={s} style={{...S.stratTab,...(strategy===s?S.stratTabActive:{})}} onClick={()=>setStrategy(s)}>{s==='optimize'?'Optimize':s==='equal'?'Equal':'Manual'}</button>))}</div>
            </div>)}
          <div style={S.sourcesWrap}>
            {sources.map((s,i)=><SourceCard key={s.id} index={i+1} source={s} mode={mode} strategy={strategy} tUnit={timeUnit} opsH={opsHours} onChange={(f,v)=>updateSource(s.id,f,v)}/>)}
          </div>
          <div style={S.mixBox}>
            <div style={S.mixHead}>น้ำดิบผสม (MIXED FEED)</div>
            <div style={S.mixRow}><span>Flow</span><span style={S.mixVal}>{fmt(vol(calc.feedFlow),1)} {volUnit}</span></div>
            <div style={S.mixRow}><span>Conductivity</span><span style={S.mixVal}>{fmtC(calc.feedTDS)} µS/cm</span></div>
          </div>

          <div style={S.sectionLabel}>{mode==='know-output'?'น้ำผลิตที่ต้องการ':'Conductivity เป้าหมาย'}</div>
          <div style={S.inputRow}><div style={S.inputLabel}>Conductivity เป้าหมาย</div>
            <div style={{...S.inputWrap,...S.inputWrapAccent}}><NumInput value={targetCond} onValueChange={setTargetCond} style={S.input}/><span style={S.inputUnit}>µS/cm</span></div>
            <div style={S.tdsHint}>≈ TDS {fmt(cond2tds(targetCond),0)} mg/L</div></div>
          {mode==='know-output' && <div style={S.inputRow}><div style={S.inputLabel}>ปริมาณน้ำผลิต</div>
            <div style={{...S.inputWrap,...S.inputWrapAccent}}><NumInput value={timeUnit==='daily'?productFlow*opsHours:productFlow} onValueChange={v=>setProductFlow(timeUnit==='daily'?v/opsHours:v)} style={S.input}/><span style={S.inputUnit}>{volUnit}</span></div></div>}

          {/* UF Permeate Split */}
          <div style={S.sectionLabel}>สัดส่วนน้ำหลัง UF (UF Permeate Split)</div>
          <div style={{...S.strategyTabs,gridTemplateColumns:'1fr 1fr'}}>
            <button style={{...S.stratTab,...(splitMode==='auto'?S.stratTabActive:{})}} onClick={()=>setSplitMode('auto')}>Auto Blend</button>
            <button style={{...S.stratTab,...(splitMode==='manual'?S.stratTabActive:{})}} onClick={()=>setSplitMode('manual')}>Manual Split</button>
          </div>
          <div style={S.stratHint}>{splitMode==='auto'?'ระบบคำนวณ Bypass/RO อัตโนมัติตาม Target Cond':'วิศวกรกำหนด To RO / Bypass เอง'}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginTop:8}}>
            <div><div style={S.srcFieldLabel}>To RO (%)</div>
              <div style={{...S.srcInputWrap,...(splitMode==='auto'?S.srcInputRO:{})}}>
                <NumInput value={splitMode==='manual'?manualToRO:parseFloat(calc.calcToRO.toFixed(1))} onValueChange={v=>setManualToRO(Math.max(0,Math.min(100,v)))} style={S.srcInput} readOnly={splitMode==='auto'}/>
                <span style={S.srcUnit}>%</span></div></div>
            <div><div style={S.srcFieldLabel}>Bypass (%)</div>
              <div style={{...S.srcInputWrap,...(splitMode==='auto'?S.srcInputRO:{})}}>
                <NumInput value={splitMode==='manual'?manualBypass:parseFloat(calc.calcBypass.toFixed(1))} onValueChange={v=>setManualToRO(Math.max(0,Math.min(100,100-v)))} style={S.srcInput} readOnly={splitMode==='auto'}/>
                <span style={S.srcUnit}>%</span></div></div>
          </div>
          {splitMode==='manual' && calc.productCondStatus==='FAIL' && (
            <div style={S.warnBox}><div style={S.warnTitle}>⚠ Product Cond เกิน Target</div>
              <div style={S.warnText}>Product: {fmtC(calc.actualProductTDS)} µS/cm &gt; Target: {Math.round(targetCond)} µS/cm</div></div>)}

          {/* Advanced Membrane */}
          <div style={{...S.sectionLabel,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}} onClick={()=>setAdvancedOpen(!advancedOpen)}>
            <span>ตั้งค่าเมมเบรนขั้นสูง</span><span style={{fontSize:12,color:'#d4a857'}}>{advancedOpen?'▾':'▸'}</span></div>
          {advancedOpen && (<div style={{padding:'0 4px'}}>
            <SliderRow label="UF Reject" value={ufReject} onChange={setUfReject} min={2} max={30} step={0.5} unit="%" hint="% น้ำทิ้งจาก UF"/>
            <SliderRow label="RO Reject" value={roReject} onChange={setRoReject} min={10} max={50} step={0.5} unit="%" hint="% น้ำทิ้งเป็น concentrate"/>
            <SliderRow label="RO Salt Rejection" value={roSaltRejection} onChange={setRoSaltRejection} min={90} max={99.9} step={0.1} unit="%" hint="ประสิทธิภาพกำจัดเกลือ"/>
          </div>)}
          {timeUnit==='daily' && <><div style={S.sectionLabel}>Operating Hours</div><SliderRow label="ชั่วโมง/วัน" value={opsHours} onChange={setOpsHours} min={1} max={24} step={1} unit="h/d"/></>}
          {!calc.blendValid && <div style={S.warnBox}><div style={S.warnTitle}>⚠ ตรวจสอบข้อมูล</div><div style={S.warnText}>{calc.blendWarning}</div></div>}
        </aside>

        {/* ═══ RIGHT MAIN ═══ */}
        <main style={S.main}>
          {/* Allocation */}
          {mode==='know-output' && calc.blendValid && calc.sourceAllocations.length>0 && (
            <div style={S.allocCard}>
              <div style={S.cardHdr}><div><span style={S.cardLabel}>SOURCE ALLOCATION</span><span style={S.allocSub}>ต้องดึงน้ำจากแต่ละแหล่ง</span></div><span style={S.cardMeta}>{strategy.toUpperCase()}</span></div>
              <div style={S.allocGrid} className="ufro-alloc-grid">
                {calc.sourceAllocations.map(s=>(
                  <div key={s.id} style={{...S.allocItem,...(s.actualRatio<0.1?{opacity:0.3}:{})}}>
                    <div style={S.allocName}>{s.name}</div>
                    <div style={S.allocFlow}>{fmt(vol(s.actualFlow),1)}<span style={S.allocUnit}> {volUnit}</span></div>
                    <div style={S.allocBar}><div style={{...S.allocBarFill,width:`${Math.min(100,s.actualRatio)}%`}}/></div>
                    <div style={S.allocMeta}><span style={{color:'#d4a857',fontWeight:600}}>{fmt(s.actualRatio,1)}%</span><span style={{color:'#3a6049'}}>•</span><span>Cond {fmtC(s.tds)}</span></div>
                  </div>))}
              </div>
            </div>)}

          {/* KPIs */}
          <div style={S.kpiStrip} className="ufro-kpi-strip">
            <KPI label="น้ำดิบ" value={fmt(vol(calc.feedFlow),1)} unit={volUnit} sub={`Cond ${fmtC(calc.feedTDS)}`} highlight={mode==='know-output'}/>
            <KPI label="น้ำผลิต" value={fmt(vol(calc.finalProduct),1)} unit={volUnit} sub={`Cond ${fmtC(calc.actualProductTDS)}`}
              badge={splitMode==='manual'?calc.productCondStatus:undefined} highlight={mode==='know-input'}/>
            <KPI label="น้ำทิ้งรวม" value={fmt(vol(calc.totalReject),1)} unit={volUnit} sub={`Cond ${fmtC(calc.totalRejectTDS)}`} badge={calc.totalRejectStatus} warning={!calc.totalRejectAllowed}/>
            <KPI label="Recovery" value={fmt(calc.overallRecovery,1)} unit="%"/>
            <KPI label="To RO / Bypass" value={`${fmt(calc.calcToRO,0)}/${fmt(calc.calcBypass,0)}`} unit="%"/>
          </div>

          {/* ═══ FINAL DISCHARGE STATUS (FIX #1/#2/#5) ═══ */}
          <div style={{
            ...S.dischargeCard,
            ...(finalAllowed ? (finalSeverity==='WARNING'?S.dischargeWarn:S.dischargePass) : S.dischargeFail)
          }}>
            <div style={S.dischargeInner}>
              <span className={!finalAllowed?'status-blink-fail':(finalSeverity==='WARNING'?'status-blink-warn':'status-blink-pass')} style={S.dischargeBadge}>
                {finalAllowed
                  ? (finalSeverity==='WARNING' ? '⚠ ผ่านเกณฑ์แต่ใกล้ขีดจำกัด — WARNING' : '✓ ผ่านเกณฑ์ปล่อยทิ้ง — PASS')
                  : '✗ ไม่ผ่านเกณฑ์ปล่อยทิ้ง — REJECT'}
              </span>
              {/* Margin display (#5) */}
              <span style={S.dischargeMeta}>
                {finalMargin >= 0
                  ? `เหลือ Margin ${Math.round(Math.abs(finalMargin)).toLocaleString()} µS/cm ก่อนถึงขีดจำกัด`
                  : `เกินขีดจำกัด ${Math.round(Math.abs(finalMargin)).toLocaleString()} µS/cm`}
                {' · '}Limit: {REJECT_COND_LIMIT.toLocaleString()} µS/cm
              </span>
            </div>
          </div>

          {/* Dashboard */}
          <div style={S.dashCard}>
            <div style={S.cardHdr}><span style={S.cardLabel}>WATER BALANCE DASHBOARD</span><span style={S.cardMeta}>{volUnit}</span></div>
            <div style={{...S.dashGrid,gridTemplateColumns:'1fr 1fr 1fr 1.2fr'}} className="ufro-dash-grid">
              <div style={S.dashChartWrap}><div style={S.dashChartTitle}>Product vs Reject</div>
                <DonutChart segments={[{label:'Product',value:calc.finalProduct,color:'#d4a857'},{label:'Reject',value:calc.totalReject,color:'#c97a5d'}]} centerLabel={`${fmt(calc.overallRecovery,0)}%`} centerSub="Recovery"/></div>
              <div style={S.dashChartWrap}><div style={S.dashChartTitle}>UF vs RO Reject</div>
                <DonutChart segments={[{label:'UF Rej.',value:calc.ufRejectFlow,color:'#c97a5d'},{label:'RO Rej.',value:calc.roRejectFlow,color:'#d4a857'}]} centerLabel={fmt(vol(calc.totalReject),0)} centerSub={volUnit}/></div>
              {/* v6.3: Flow Distribution Pie */}
              <div style={S.dashChartWrap}><div style={S.dashChartTitle}>Flow Distribution</div>
                <DonutChart segments={[
                  {label:'UF Bypass',value:calc.ufBypass,color:'#d4a857'},
                  {label:'To RO',value:calc.roIn,color:'#5da377'},
                  {label:'UF Reject',value:calc.ufRejectFlow,color:'#c97a5d'},
                ]} centerLabel={fmt(vol(calc.feedFlow),0)} centerSub={`Feed ${volUnit}`}/></div>
              <div style={S.dashCardsCol}>
                <BalanceCard label="Feed" value={fmt(vol(calc.feedFlow),1)} unit={volUnit} cond={fmtC(calc.feedTDS)}/>
                <BalanceCard label="Product" value={fmt(vol(calc.finalProduct),1)} unit={volUnit} cond={fmtC(calc.actualProductTDS)} accent/>
                <BalanceCard label="UF Reject" value={fmt(vol(calc.ufRejectFlow),1)} unit={volUnit} cond={fmtC(calc.ufRejectTDS)} status={calc.ufRejectStatus}/>
                <BalanceCard label="RO Conc." value={fmt(vol(calc.roRejectFlow),1)} unit={volUnit} cond={fmtC(calc.roRejectTDS)} status={calc.roRejectStatus}/>
                <BalanceCard label="Total Reject" value={fmt(vol(calc.totalReject),1)} unit={volUnit} cond={fmtC(calc.totalRejectTDS)} status={calc.totalRejectStatus}/>
              </div>
            </div>
          </div>

          {/* Process Diagram */}
          <div style={S.diagramCard}>
            <div style={S.cardHdr}><span style={S.cardLabel}>PROCESS FLOW DIAGRAM</span>
              <div style={{display:'flex',gap:6}}><button onClick={()=>exportSVG(diagramRef.current)} style={S.exportBtn}>⬇ SVG</button><button onClick={()=>exportPNG(diagramRef.current)} style={S.exportBtn}>⬇ PNG</button></div></div>
            <div style={{overflowX:'auto'}}>
              <ProcessDiagram ref={diagramRef} calc={calc} sources={calc.sourceAllocations} fmtC={fmtC} fmt={fmt} vol={vol} volUnit={volUnit}
                dilution={dilution} finalAllowed={finalAllowed} finalSeverity={finalSeverity}/>
            </div>
          </div>

          {/* ═══ DILUTION MODULE (v6.3: 5 sources + safety margin) ═══ */}
          {(!calc.totalRejectAllowed || showDilutionSim) ? (
            <div style={{...S.dilutionCard,...(!calc.totalRejectAllowed?{}:{borderColor:'#3a6049',background:'rgba(93,163,119,0.03)'})}}>
              <div style={S.cardHdr}>
                <div><span style={S.cardLabel}>REJECT DILUTION WATER</span><span style={S.allocSub}>{!calc.totalRejectAllowed?'น้ำผสมเพื่อลด Cond ก่อนปล่อยทิ้ง':'จำลองการผสมน้ำ (ไม่จำเป็น)'}</span></div>
                {dilution.finalV&&<StatusBadge status={dilution.finalV.regulatoryAllowed?(dilution.finalV.severityStatus==='WARNING'?'WARNING':'PASS'):'FAIL'}/>}
              </div>
              <div style={{padding:'14px 18px'}}>
                <div style={{...S.strategyTabs,gridTemplateColumns:'1fr 1fr'}}>
                  <button style={{...S.stratTab,...(dilutionMode==='auto'?S.stratTabActive:{})}} onClick={()=>setDilutionMode('auto')}>Auto Required Flow</button>
                  <button style={{...S.stratTab,...(dilutionMode==='manual'?S.stratTabActive:{})}} onClick={()=>setDilutionMode('manual')}>Manual</button>
                </div>

                {/* Safety Margin Slider */}
                <div style={{marginTop:10,padding:'8px 10px',background:'#0a1410',borderRadius:3,border:'1px solid #2a4538'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                    <span style={{fontSize:9,color:'#9bc7a4',fontFamily:mono}}>Safety Margin</span>
                    <span style={{fontSize:9,color:'#d4a857',fontWeight:600,fontFamily:mono}}>{safetyMargin}% → Target: {Math.round(REJECT_COND_LIMIT*(1-safetyMargin/100)).toLocaleString()} µS/cm</span>
                  </div>
                  <input type="range" min={0} max={30} step={1} value={safetyMargin} onChange={e=>setSafetyMargin(parseFloat(e.target.value))} style={S.slider}/>
                </div>

                {dilutionMode==='auto' ? (
                  <div style={{marginTop:12}}>
                    <div style={S.srcFieldLabel}>DILUTION SOURCES (เลือกแหล่งน้ำผสม — สูงสุด 5 แหล่ง)</div>
                    {dilutionSources.map(ds=>(
                      <div key={ds.id} style={{...S.srcCard,...(ds.enabled?S.srcCardOn:{}),marginBottom:5}}>
                        <div style={S.srcHeader}>
                          <button style={{...S.srcToggle,...(ds.enabled?S.srcToggleOn:{})}} onClick={()=>updateDilution(ds.id,'enabled',!ds.enabled)}>{ds.enabled?'●':'○'}</button>
                          <input type="text" value={ds.name} onChange={e=>updateDilution(ds.id,'name',e.target.value)} style={S.srcName} disabled={!ds.enabled}/>
                        </div>
                        {ds.enabled&&<div style={{marginTop:6}}>
                          <div style={S.srcField}><label style={S.srcFieldLabel}>Conductivity</label><div style={S.srcInputWrap}>
                            <NumInput value={ds.conductivity} onValueChange={v=>updateDilution(ds.id,'conductivity',v)} style={S.srcInput}/><span style={S.srcUnit}>µS/cm</span></div>
                            <div style={S.srcTdsHint}>≈ TDS {Math.round(cond2tds(ds.conductivity))} mg/L</div></div>
                          {/* IMPORTANT — DO NOT REMOVE:
                              This read-only Auto Flow shows how much water THIS source contributes into Mixing.
                              Without this, users only see total dilution flow and cannot check per-source water balance. */}
                          <div style={{...S.srcField,marginTop:6}}><label style={S.srcFieldLabel}>Auto Flow to Mixing</label><div style={S.srcInputWrap}>
                            <NumInput value={parseFloat((vol(dilution.mixingSources?.find(x=>x.id===ds.id)?.actualFlow || 0)).toFixed(1))} onValueChange={()=>{}} style={S.srcInput} readOnly/><span style={S.srcUnit}>{volUnit}</span></div>
                            {timeUnit==='hourly'&&<div style={S.srcTdsHint}>≈ {fmt((dilution.mixingSources?.find(x=>x.id===ds.id)?.actualFlow || 0)*opsHours,0)} m³/day</div>}</div>
                        </div>}
                      </div>))}
                    {dilution.cannotSolve ?
                      <div style={S.warnBox}><div style={S.warnTitle}>⚠ ไม่สามารถ Dilute ได้</div><div style={S.warnText}>{dilution.msg}</div></div>
                    : dilution.QdReq!==undefined && (
                      <div style={{...S.mixBox,marginTop:12,borderColor:'#d4a857'}}>
                        <div style={S.mixHead}>AUTO CALCULATION RESULT</div>
                        <div style={S.mixRow}><span>Target Discharge Cond</span><span style={{...S.mixVal,color:'#9bc7a4'}}>{Math.round(dilution.Ctarget||0).toLocaleString()} µS/cm</span></div>
                        <div style={S.mixRow}><span>Required Dilution Flow</span><span style={{...S.mixVal,color:'#f0d488'}}>{fmt(vol(dilution.QdReq),1)} {volUnit}</span></div>
                        {timeUnit==='hourly'&&<div style={S.mixRow}><span>Daily Volume</span><span style={{...S.mixVal,opacity:0.6}}>{fmt(dilution.QdReq*opsHours,0)} m³/day</span></div>}
                        <div style={S.mixRow}><span>Final Discharge Cond</span><span style={S.mixVal}>{Math.round(dilution.finalCond).toLocaleString()} µS/cm</span></div>
                        <div style={S.mixRow}><span>Safety Margin</span><span style={S.mixVal}>{safetyMargin}%</span></div>
                        <div style={S.mixRow}><span>Status</span><StatusBadge status={dilution.finalStatus}/></div>
                      </div>)}
                  </div>
                ) : (
                  <div style={{marginTop:12}}>
                    <div style={S.srcFieldLabel}>DILUTION SOURCES (กรอก Flow + Cond — สูงสุด 5 แหล่ง)</div>
                    {dilutionSources.map(ds=>(
                      <div key={ds.id} style={{...S.srcCard,...(ds.enabled?S.srcCardOn:{}),marginBottom:5}}>
                        <div style={S.srcHeader}>
                          <button style={{...S.srcToggle,...(ds.enabled?S.srcToggleOn:{})}} onClick={()=>updateDilution(ds.id,'enabled',!ds.enabled)}>{ds.enabled?'●':'○'}</button>
                          <input type="text" value={ds.name} onChange={e=>updateDilution(ds.id,'name',e.target.value)} style={S.srcName} disabled={!ds.enabled}/>
                        </div>
                        {ds.enabled&&<div style={S.srcInputs}>
                          <div style={S.srcField}><label style={S.srcFieldLabel}>Flow</label><div style={S.srcInputWrap}>
                            <NumInput value={ds.flow} onValueChange={v=>updateDilution(ds.id,'flow',v)} style={S.srcInput}/><span style={S.srcUnit}>m³/h</span></div></div>
                          <div style={S.srcField}><label style={S.srcFieldLabel}>Cond</label><div style={S.srcInputWrap}>
                            <NumInput value={ds.conductivity} onValueChange={v=>updateDilution(ds.id,'conductivity',v)} style={S.srcInput}/><span style={S.srcUnit}>µS/cm</span></div>
                            <div style={S.srcTdsHint}>≈ TDS {Math.round(cond2tds(ds.conductivity))}</div></div>
                        </div>}
                      </div>))}
                    {dilution.finalFlow>0&&(
                      <div style={{...S.mixBox,marginTop:10,borderColor:'#d4a857'}}>
                        <div style={S.mixHead}>FINAL DISCHARGE</div>
                        <div style={S.mixRow}><span>Flow</span><span style={{...S.mixVal,color:'#f0d488'}}>{fmt(vol(dilution.finalFlow),1)} {volUnit}</span></div>
                        <div style={S.mixRow}><span>Conductivity</span><span style={S.mixVal}>{Math.round(dilution.finalCond).toLocaleString()} µS/cm</span></div>
                        <div style={S.mixRow}><span>Status</span><StatusBadge status={dilution.finalStatus}/></div>
                      </div>)}
                  </div>
                )}
                {calc.totalRejectAllowed&&<div style={{marginTop:8,textAlign:'right'}}>
                  <button onClick={()=>setShowDilutionSim(false)} style={{...S.exportBtn,color:'#d4a857',borderColor:'#d4a857'}}>ซ่อน</button></div>}
              </div>
            </div>
          ) : (
            /* When passing — small button to simulate (#6) */
            <div style={{textAlign:'center',padding:8}}>
              <button onClick={()=>setShowDilutionSim(true)} style={{...S.exportBtn,padding:'6px 14px',fontSize:10,color:'#7ba386',borderColor:'#3a6049'}}>
                จำลองการผสมน้ำเพิ่มเติม (Simulate Dilution)
              </button>
            </div>
          )}

          {/* Loss */}
          <div style={S.lossCard}>
            <div style={S.cardHdr}><span style={S.cardLabel}>WATER LOSS BREAKDOWN</span><span style={S.cardMeta}>{volUnit}</span></div>
            <LossBreakdown calc={calc} fmtC={fmtC} vol={vol} volUnit={volUnit}/>
          </div>

          {/* ═══ INTERACTIVE RECOMMENDATIONS (#4) ═══ */}
          <div style={S.recCard}>
            <div style={S.cardHdr}>
              <span style={S.cardLabel}>DISCHARGE ANALYSIS</span>
              {!finalAllowed && <span className="status-blink-fail" style={{fontSize:9,color:'#c97a5d',fontWeight:700,fontFamily:mono}}>ACTION REQUIRED</span>}
            </div>
            <div style={{padding:'0 18px 14px'}}>
              {/* Tab buttons */}
              <div style={{display:'flex',gap:4,paddingTop:12,paddingBottom:10,overflowX:'auto'}}>
                {['status','whatHappened','howToFix','engineering'].map(tab => (
                  <button key={tab} onClick={()=>setRecTab(tab)} style={{
                    ...S.stratTab, padding:'6px 12px', fontSize:9, whiteSpace:'nowrap',
                    ...(recTab===tab ? S.stratTabActive : {})
                  }}>
                    {tab==='status'?'Status':tab==='whatHappened'?'What happened?':tab==='howToFix'?'How to fix?':'Engineering'}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {recTab === 'status' && (
                <div style={{padding:'8px 0'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                    <StatusBadge status={finalSeverity}/>
                    <span style={{fontSize:12,color:finalAllowed?'#9bc7a4':'#e09a7e',fontWeight:600}}>
                      {finalAllowed ? (finalSeverity==='WARNING' ? 'ผ่านเกณฑ์ แต่ใกล้ขีดจำกัด ควรเฝ้าระวัง' : 'ระบบผ่านเกณฑ์ปล่อยทิ้ง — No dilution required') : 'ต้องแก้ไขก่อนปล่อยทิ้ง'}
                    </span>
                  </div>
                  <div style={S.mixBox}>
                    <div style={S.mixRow}><span>Total Reject Cond</span><span style={S.mixVal}>{fmtC(calc.totalRejectTDS)} µS/cm</span></div>
                    <div style={S.mixRow}><span>Limit</span><span style={S.mixVal}>{REJECT_COND_LIMIT.toLocaleString()} µS/cm</span></div>
                    <div style={S.mixRow}><span>Margin</span><span style={{...S.mixVal,color:calc.totalRejectMargin>=0?'#5da377':'#c97a5d'}}>
                      {calc.totalRejectMargin>=0 ? `${Math.round(calc.totalRejectMargin).toLocaleString()} µS/cm below` : `${Math.round(Math.abs(calc.totalRejectMargin)).toLocaleString()} µS/cm above`}
                    </span></div>
                  </div>
                </div>
              )}

              {recTab === 'whatHappened' && (
                <div style={{padding:'8px 0',fontSize:11,color:'#cde7d2',lineHeight:1.8}}>
                  {!calc.totalRejectAllowed ? (
                    <div>
                      <div style={{color:'#e09a7e',fontWeight:600,marginBottom:6}}>Total Reject เกินเกณฑ์ปล่อยทิ้ง</div>
                      <div>RO Concentrate มี Cond สูง ({fmtC(calc.roRejectTDS)} µS/cm) เมื่อรวมกับ UF Reject ({fmtC(calc.ufRejectTDS)} µS/cm) ทำให้ Total Reject ({fmtC(calc.totalRejectTDS)} µS/cm) เกินขีดจำกัด {REJECT_COND_LIMIT.toLocaleString()} µS/cm</div>
                    </div>
                  ) : calc.totalRejectStatus === 'WARNING' ? (
                    <div>
                      <div style={{color:'#d4a857',fontWeight:600,marginBottom:6}}>ค่าใกล้ขีดจำกัด</div>
                      <div>Total Reject Cond ({fmtC(calc.totalRejectTDS)} µS/cm) ยังผ่านเกณฑ์ แต่อยู่ในช่วง 80-100% ของขีดจำกัด ({REJECT_COND_LIMIT.toLocaleString()} µS/cm) ควรเฝ้าระวังอย่างใกล้ชิด</div>
                    </div>
                  ) : (
                    <div><div style={{color:'#5da377',fontWeight:600}}>ระบบทำงานปกติ — ค่าทุกอย่างอยู่ในเกณฑ์</div></div>
                  )}
                </div>
              )}

              {recTab === 'howToFix' && (
                <div style={{padding:'8px 0'}}>
                  {recommendations.length === 0 ? (
                    <div style={{fontSize:11,color:'#5da377'}}>ไม่มีปัญหาที่ต้องแก้ไข ✓</div>
                  ) : recommendations.map((r,i) => (
                    <div key={i} style={{marginBottom:12}}>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}><StatusBadge status={r.status}/><span style={{fontSize:11,color:'#e09a7e',fontWeight:600}}>{r.area}</span></div>
                      <ul style={S.recList}>{r.items.map((item,j)=><li key={j} style={S.recItem}>{item}</li>)}</ul>
                    </div>
                  ))}
                </div>
              )}

              {recTab === 'engineering' && (
                <div style={{padding:'8px 0',fontSize:10,color:'#9bc7a4',fontFamily:mono,lineHeight:2}}>
                  <div style={{marginBottom:8,fontWeight:600,color:'#d4a857'}}>สูตรที่ใช้ในการคำนวณ:</div>
                  <div>Final Cond = (Qr×Cr + ΣQd×Cd) / (Qr + ΣQd)</div>
                  <div>Required Qd = Qr × (Cr − {REJECT_COND_LIMIT}) / ({REJECT_COND_LIMIT} − Cd)</div>
                  <div>TDS = Cond × {COND_TO_TDS}</div>
                  <div>Reject Limit: Cond ≤ {REJECT_COND_LIMIT} µS/cm / TDS ≤ {REJECT_TDS_LIMIT} mg/L</div>
                  <div>Warning Zone: ≥ 80% of limit</div>
                  <div style={{marginTop:8}}>Mass Balance: Feed = Product + Total Reject</div>
                  <div>Load (kg/h) = Flow (m³/h) × TDS (mg/L) / 1000</div>
                </div>
              )}
            </div>
          </div>

          {/* Stream Table */}
          <div style={S.tableCard}>
            <div style={S.cardHdr}><span style={S.cardLabel}>STREAM TABLE</span><span style={S.cardMeta}>{volUnit}</span></div>
            <div style={{overflowX:'auto'}}>
              <table style={S.table}><thead><tr>
                <th style={S.th}>Stream</th><th style={{...S.th,textAlign:'right'}}>Flow ({volUnit})</th>
                <th style={{...S.th,textAlign:'right'}}>Cond (µS/cm)</th><th style={{...S.th,textAlign:'right'}}>TDS (mg/L)</th>
                <th style={{...S.th,textAlign:'right'}}>Load (kg/h)</th><th style={{...S.th,textAlign:'right'}}>% of Feed</th>
                <th style={{...S.th,textAlign:'center'}}>Status</th>
              </tr></thead><tbody>
                {calc.sourceAllocations.map(s=>{const fl=s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow);
                  return <StreamRow key={s.id} name={`├─ ${s.name}`} flow={vol(fl)} tds={s.tds} pct={s.actualRatio||0} sub/>;})}
                <StreamRow name="① Mixed Feed" flow={vol(calc.feedFlow)} tds={calc.feedTDS} pct={100} bold/>
                <StreamRow name="② UF Permeate" flow={vol(calc.ufOut)} tds={calc.ufPermTDS} pct={calc.ufOut/calc.feedFlow*100}/>
                <StreamRow name="③ UF Reject" flow={vol(calc.ufRejectFlow)} tds={calc.ufRejectTDS} pct={calc.ufRejectFlow/calc.feedFlow*100} loss status={calc.ufRejectStatus}/>
                <StreamRow name="④ → RO Feed" flow={vol(calc.roIn)} tds={calc.feedTDS} pct={calc.roIn/calc.feedFlow*100}/>
                <StreamRow name="⑤ UF Bypass" flow={vol(calc.ufBypass)} tds={calc.feedTDS} pct={calc.ufBypass/calc.feedFlow*100} accent/>
                <StreamRow name="⑥ RO Permeate" flow={vol(calc.roOut)} tds={calc.roPermTDS} pct={calc.roOut/calc.feedFlow*100}/>
                <StreamRow name="⑦ RO Conc." flow={vol(calc.roRejectFlow)} tds={calc.roRejectTDS} pct={calc.roRejectFlow/calc.feedFlow*100} loss status={calc.roRejectStatus}/>
                <StreamRow name="⑧ Total Reject" flow={vol(calc.totalReject)} tds={calc.totalRejectTDS} pct={calc.totalReject/calc.feedFlow*100} loss status={calc.totalRejectStatus}/>
                <StreamRow name="⑨ PRODUCT" flow={vol(calc.finalProduct)} tds={calc.actualProductTDS} pct={calc.finalProduct/calc.feedFlow*100} highlight
                  status={splitMode==='manual'?calc.productCondStatus:undefined}/>
                {dilution.needed && !dilution.cannotSolve && (dilution.finalFlow||0) > 0 && (<>
                  {dilutionMode==='manual' && dilution.sources?.map(ds=>
                    <StreamRow key={`dil-${ds.id}`} name={`├─ Dilution: ${ds.name}`} flow={vol(toNumber(ds.flow))} tds={cond2tds(toNumber(ds.conductivity))} pct={0} sub/>)}
                  {dilutionMode==='auto' && (dilution.QdReq||0) > 0 && dilution.mixingSources?.map(ds=>
                    <StreamRow key={`dil-auto-${ds.id}`} name={`├─ Dilution: ${ds.name}`} flow={vol(toNumber(ds.actualFlow))} tds={cond2tds(toNumber(ds.conductivity))} pct={0} sub/>)}
                  <StreamRow name="⑩ FINAL DISCHARGE" flow={vol(dilution.finalFlow)} tds={dilution.finalTDS} pct={0} highlight status={dilution.finalStatus}/>
                </>)}
              </tbody></table>
            </div>
          </div>

          {/* ═══ COST MODEL (v6.3.1) ═══ */}
          <div style={{...S.dashCard,border:costOpen?'1px solid #d4a857':'1px solid #1f3528'}}>
            <div style={{...S.cardHdr,cursor:'pointer'}} onClick={()=>setCostOpen(!costOpen)}>
              <div><span style={{...S.cardLabel,color:'#d4a857'}}>COST ESTIMATION</span><span style={S.allocSub}>ประมาณการค่าใช้จ่าย (ไม่รวมค่าเคมี)</span></div>
              <span style={{fontSize:12,color:'#d4a857'}}>{costOpen?'▾':'▸'}</span>
            </div>
            {costOpen && (<div style={{padding:'14px 18px'}}>

              {/* ── Cost Summary Cards ── */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8,marginBottom:16}}>
                <CostKPI label="ค่าน้ำดิบ" value={fmtB(costCalc.rawWaterCostPerM3Product)} unit="฿/m³ product" sub={`${fmtB(costCalc.rawWaterCostPerH,0)} ฿/h`} color="#5da377"/>
                <CostKPI label="ค่าไฟฟ้า" value={fmtB(costCalc.elecCostPerM3Product)} unit="฿/m³ product" sub={`${fmtB(costCalc.elecCostPerH,0)} ฿/h · ${fmt(costCalc.secActual,2)} kWh/m³`} color="#d4a857"/>
                <CostKPI label="รวมต่อ m³ Product" value={fmtB(costCalc.totalCostPerM3Product)} unit="฿/m³" accent sub={`exc. chemicals`}/>
                <CostKPI label="OPEX / Day" value={fmtB(costCalc.totalCostPerDay,0)} unit="฿/day" sub={`${opsHours}h operation`}/>
                <CostKPI label="OPEX / Month" value={fmtB(costCalc.totalCostPerMonth,0)} unit="฿/mo" sub="30 days"/>
              </div>

              {/* ── Raw Water Cost Detail ── */}
              <div style={{...S.mixBox,marginBottom:12}}>
                <div style={S.mixHead}>RAW WATER COST</div>
                <div style={S.mixRow}><span>Weighted Avg. Cost</span><span style={S.mixVal}>{fmtB(costCalc.avgWaterCostPerM3)} ฿/m³</span></div>
                <div style={S.mixRow}><span>Cost / Hour</span><span style={S.mixVal}>{fmtB(costCalc.rawWaterCostPerH,0)} ฿/h</span></div>
                <div style={S.mixRow}><span>Cost / Day</span><span style={S.mixVal}>{fmtB(costCalc.rawWaterCostPerDay,0)} ฿/day</span></div>
                <div style={S.mixRow}><span>Cost per m³ Product</span><span style={{...S.mixVal,color:'#f0d488'}}>{fmtB(costCalc.rawWaterCostPerM3Product)} ฿/m³</span></div>
                <div style={{fontSize:8,color:'#5da377',marginTop:4,fontStyle:'italic'}}>* กำหนดค่าน้ำแต่ละแหล่งที่ Source cards ด้านซ้าย (฿/m³)</div>
              </div>

              {/* ── Electricity Cost ── */}
              <div style={{...S.mixBox,borderColor:'#d4a857',marginBottom:12}}>
                <div style={S.mixHead}>ELECTRICITY COST</div>

                {/* Tariff */}
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8}}>
                  <span style={{fontSize:9,color:'#9bc7a4',flex:1}}>ค่าไฟฟ้า (Tariff)</span>
                  <div style={{...S.srcInputWrap,width:90}}>
                    <NumInput value={elecTariff} onValueChange={setElecTariff} style={S.srcInput}/>
                    <span style={S.srcUnit}>฿/kWh</span>
                  </div>
                </div>

                {/* Mode toggle */}
                <div style={{...S.strategyTabs,gridTemplateColumns:'1fr 1fr',marginBottom:10}}>
                  <button style={{...S.stratTab,...(energyMode==='simple'?S.stratTabActive:{})}} onClick={()=>setEnergyMode('simple')}>Simple (SEC)</button>
                  <button style={{...S.stratTab,...(energyMode==='equipment'?S.stratTabActive:{})}} onClick={()=>setEnergyMode('equipment')}>Equipment List</button>
                </div>

                {energyMode === 'simple' ? (
                  <div>
                    <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                      <span style={{fontSize:9,color:'#9bc7a4',flex:1}}>Specific Energy (SEC)</span>
                      <div style={{...S.srcInputWrap,width:100}}>
                        <NumInput value={secFeed} onValueChange={setSecFeed} style={S.srcInput}/>
                        <span style={S.srcUnit}>kWh/m³</span>
                      </div>
                    </div>
                    <div style={{fontSize:8,color:'#7ba386',fontStyle:'italic'}}>SEC × Feed Flow × Tariff = Electric Cost</div>
                  </div>
                ) : (
                  <div>
                    <div style={{fontSize:9,color:'#7ba386',marginBottom:6}}>รายการอุปกรณ์ — Rated kW × Qty × Duty Factor</div>
                    {equipments.map((eq,i)=>(
                      <div key={eq.id} style={{...S.srcCard,...(eq.enabled?S.srcCardOn:{}),marginBottom:4}}>
                        <div style={{display:'flex',gap:4,alignItems:'center'}}>
                          <button style={{...S.srcToggle,...(eq.enabled?S.srcToggleOn:{})}} onClick={()=>updateEquipment(eq.id,'enabled',!eq.enabled)}>{eq.enabled?'●':'○'}</button>
                          <input type="text" value={eq.name} onChange={e=>updateEquipment(eq.id,'name',e.target.value)} style={{...S.srcName,flex:1,fontSize:10}} disabled={!eq.enabled}/>
                          <button onClick={()=>removeEquipment(eq.id)} style={{background:'none',border:'none',color:'#c97a5d',cursor:'pointer',fontSize:12,padding:0}}>×</button>
                        </div>
                        {eq.enabled && (
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4,marginTop:4}}>
                            <div style={S.srcField}><label style={S.srcFieldLabel}>kW</label>
                              <div style={S.srcInputWrap}><NumInput value={eq.kw} onValueChange={v=>updateEquipment(eq.id,'kw',v)} style={S.srcInput}/></div></div>
                            <div style={S.srcField}><label style={S.srcFieldLabel}>Qty</label>
                              <div style={S.srcInputWrap}><NumInput value={eq.qty} onValueChange={v=>updateEquipment(eq.id,'qty',v)} style={S.srcInput}/></div></div>
                            <div style={S.srcField}><label style={S.srcFieldLabel}>Duty</label>
                              <div style={S.srcInputWrap}><NumInput value={eq.duty} onValueChange={v=>updateEquipment(eq.id,'duty',v)} style={S.srcInput}/></div></div>
                          </div>
                        )}
                        {eq.enabled && <div style={S.srcTdsHint}>Effective: {fmt(toNumber(eq.kw)*toNumber(eq.qty)*toNumber(eq.duty),1)} kW</div>}
                      </div>
                    ))}
                    <button onClick={addEquipment} style={{...S.exportBtn,width:'100%',marginTop:6,padding:'5px 0',fontSize:9,color:'#d4a857',borderColor:'#3a3018'}}>+ เพิ่มอุปกรณ์</button>
                  </div>
                )}

                <div style={{borderTop:'1px dashed #3a3018',marginTop:10,paddingTop:8}}>
                  <div style={S.mixRow}><span>Total Power</span><span style={S.mixVal}>{fmt(costCalc.elecKwPerH,1)} kW</span></div>
                  <div style={S.mixRow}><span>Electric Cost / Hour</span><span style={S.mixVal}>{fmtB(costCalc.elecCostPerH,0)} ฿/h</span></div>
                  <div style={S.mixRow}><span>Electric Cost / Day</span><span style={S.mixVal}>{fmtB(costCalc.elecCostPerDay,0)} ฿/day</span></div>
                  <div style={S.mixRow}><span>SEC (actual)</span><span style={S.mixVal}>{fmt(costCalc.secActual,3)} kWh/m³ feed</span></div>
                  <div style={S.mixRow}><span>Cost per m³ Product</span><span style={{...S.mixVal,color:'#f0d488'}}>{fmtB(costCalc.elecCostPerM3Product)} ฿/m³</span></div>
                </div>
              </div>

              <div style={{fontSize:9,color:'#7ba386',textAlign:'center',fontStyle:'italic',padding:'4px 0'}}>
                * ประมาณการค่าใช้จ่ายเบื้องต้น ยังไม่รวมค่าเคมี, ค่าบำรุงรักษา, ค่าเปลี่ยนเมมเบรน
              </div>
            </div>)}
          </div>

          <footer style={S.footer}>
            <span style={S.footFormula}>Cond = TDS × {TDS_TO_COND} · Reject Limit: {REJECT_COND_LIMIT.toLocaleString()} µS/cm</span>
            <span style={S.footMeta}>v6.3.1</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

// ════════════ SUB COMPONENTS ════════════

function SourceCard({ index, source, mode, strategy, tUnit, opsH, onChange }) {
  const readOnly = mode==='know-output' && strategy!=='manual';
  const pct = source.actualRatio !== undefined ? source.actualRatio : 0;
  return (
    <div style={{...S.srcCard,...(source.enabled?S.srcCardOn:{})}}>
      <div style={S.srcHeader}>
        <button style={{...S.srcToggle,...(source.enabled?S.srcToggleOn:{})}} onClick={()=>onChange('enabled',!source.enabled)}>{source.enabled?'●':'○'}</button>
        <input type="text" value={source.name} onChange={e=>onChange('name',e.target.value)} style={S.srcName} disabled={!source.enabled}/>
        <span style={S.srcIdx}>S{index}</span>
        {mode==='know-input' && source.enabled && pct>0 && <span style={S.srcPct}>{pct.toFixed(1)}%</span>}
      </div>
      {source.enabled && (<div style={{display:'flex',flexDirection:'column',gap:4,marginTop:6}}>
        <div style={S.srcInputs}>
          <div style={S.srcField}><label style={S.srcFieldLabel}>Cond (µS/cm)</label>
            <div style={S.srcInputWrap}><NumInput value={Math.round(tds2cond(source.tds))} onValueChange={v=>onChange('tds',cond2tds(v))} style={S.srcInput}/><span style={S.srcUnit}>µS/cm</span></div>
            <div style={S.srcTdsHint}>≈ TDS {Math.round(source.tds)}</div></div>
          <div style={S.srcField}><label style={S.srcFieldLabel}>{mode==='know-input'?'Flow':<span style={{display:'flex',alignItems:'center',gap:4}}>Ratio {readOnly&&<span style={S.autoTag}>AUTO</span>}</span>}</label>
            <div style={{...S.srcInputWrap,...(readOnly?S.srcInputRO:{})}}>
              <NumInput value={mode==='know-input'?source.flow:parseFloat((source.ratio||0).toFixed(1))} onValueChange={v=>onChange(mode==='know-input'?'flow':'ratio',v)} style={S.srcInput} readOnly={readOnly}/>
              <span style={S.srcUnit}>{mode==='know-input'?'m³/h':'%'}</span></div>
            {mode==='know-input'&&tUnit==='daily'&&<div style={S.srcTdsHint}>= {(toNumber(source.flow)*opsH).toFixed(0)} m³/day</div>}</div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr',gap:4}}>
          <div style={S.srcField}><label style={S.srcFieldLabel}>ค่าน้ำ (THB/m³)</label>
            <div style={{...S.srcInputWrap,borderColor:'#3a3018'}}>
              <NumInput value={source.cost||0} onValueChange={v=>onChange('cost',v)} style={S.srcInput}/>
              <span style={{...S.srcUnit,color:'#d4a857'}}>฿/m³</span></div></div>
        </div>
      </div>)}
    </div>
  );
}

function CostKPI({label,value,unit,sub,color,accent}) {
  return (<div style={{background:accent?'rgba(212,168,87,0.08)':'#0a1410',border:`1px solid ${accent?'#d4a857':color||'#1f3528'}`,borderRadius:4,padding:'10px 12px'}}>
    <div style={{fontSize:8,color:color||'#7ba386',letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:4,fontFamily:mono}}>{label}</div>
    <div style={{display:'flex',alignItems:'baseline',gap:4}}>
      <span style={{fontSize:accent?22:18,fontWeight:700,color:accent?'#f0d488':'#e8f0e8',fontVariantNumeric:'tabular-nums',fontFamily:serif}}>{value}</span>
      <span style={{fontSize:9,color:'#5da377',fontFamily:mono}}>{unit}</span>
    </div>
    {sub && <div style={{fontSize:8,color:'#7ba386',marginTop:3,fontFamily:mono}}>{sub}</div>}
  </div>);
}

function SliderRow({label,value,onChange,min,max,step,unit,hint}) {
  return (<div style={S.sliderRow}><div style={S.sliderHdr}><span style={S.sliderLabel}>{label}</span><span style={S.sliderVal}>{value}{unit}</span></div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(parseFloat(e.target.value))} style={S.slider}/>
    {hint&&<div style={S.sliderHint}>{hint}</div>}</div>);
}

function KPI({label,value,unit,sub,highlight,warning,badge}) {
  return (<div style={{...S.kpi,...(highlight?S.kpiHi:{}),...(warning?S.kpiWarn:{})}}>
    <div style={S.kpiLabel}>{label} {badge&&<StatusBadge status={badge} small/>}</div>
    <div style={S.kpiRow}><span style={S.kpiVal}>{value}</span><span style={S.kpiUnit}>{unit}</span></div>
    {sub&&<div style={S.kpiSub}>{sub}</div>}</div>);
}

function StatusBadge({status,small}) {
  const c={PASS:'#5da377',WARNING:'#d4a857',FAIL:'#c97a5d'};
  const bg={PASS:'rgba(93,163,119,0.15)',WARNING:'rgba(212,168,87,0.15)',FAIL:'rgba(201,122,93,0.15)'};
  return <span style={{display:'inline-block',padding:small?'1px 5px':'2px 8px',borderRadius:2,fontSize:small?7:9,fontWeight:700,letterSpacing:'0.15em',color:c[status]||'#7ba386',background:bg[status]||'transparent',border:`1px solid ${c[status]||'#3a6049'}`,fontFamily:mono}}>{status}</span>;
}

function BalanceCard({label,value,unit,cond,accent,status}) {
  return (<div style={{...S.balCard,...(accent?S.balCardAccent:{})}}>
    <div style={S.balLabel}>{label} {status&&<StatusBadge status={status} small/>}</div>
    <div style={S.balVal}>{value} <span style={S.balUnit}>{unit}</span></div>
    <div style={S.balCond}>Cond {cond} µS/cm</div></div>);
}

function DonutChart({segments,centerLabel,centerSub}) {
  const total=segments.reduce((s,x)=>s+(x.value||0),0);
  if(total===0)return<div style={{width:140,height:140,display:'flex',alignItems:'center',justifyContent:'center',color:'#5da377',fontSize:11}}>No data</div>;
  const size=140,cx=70,cy=70,r=52,stroke=14,circ=2*Math.PI*r;let offset=0;
  return(<div style={{position:'relative',width:size,height:size}}>
    <svg viewBox={`0 0 ${size} ${size}`} style={{width:'100%',height:'100%',transform:'rotate(-90deg)'}}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#142820" strokeWidth={stroke}/>
      {segments.map((seg,i)=>{const pct=seg.value/total,dash=circ*pct,gap=circ-dash;
        const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={stroke} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} style={{transition:'all 0.3s'}}/>;
        offset+=dash;return el;})}</svg>
    <div style={S.donutCenter}><div style={S.donutCenterVal}>{centerLabel}</div><div style={S.donutCenterSub}>{centerSub}</div></div>
    <div style={S.donutLegend}>{segments.map((seg,i)=><div key={i} style={S.donutLegendItem}><div style={{...S.donutLegendDot,background:seg.color}}/><span>{seg.label} {total>0?`${((seg.value/total)*100).toFixed(0)}%`:''}</span></div>)}</div>
  </div>);
}

function StreamRow({name,flow,tds,pct,highlight,loss,accent,sub,bold,status}) {
  const cond=tds2cond(tds),load=isFinite(flow)&&isFinite(tds)?(flow*tds/1000):NaN;
  const cc=cond<200?'#9bc7a4':cond>6000?'#e09a7e':'#cde7d2';
  const rs={...S.tr,...(highlight?S.trHi:{}),...(loss?S.trLoss:{}),...(accent?S.trAcc:{}),...(sub?S.trSub:{}),...(bold?S.trBold:{})};
  return(<tr style={rs}><td style={S.td}>{name}</td>
    <td style={{...S.td,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{isFinite(flow)?flow.toFixed(1):'—'}</td>
    <td style={{...S.td,textAlign:'right',fontVariantNumeric:'tabular-nums',color:cc}}>{isFinite(cond)?Math.round(cond).toLocaleString():'—'}</td>
    <td style={{...S.td,textAlign:'right',fontVariantNumeric:'tabular-nums',opacity:0.5}}>{isFinite(tds)?tds.toFixed(0):'—'}</td>
    <td style={{...S.td,textAlign:'right',fontVariantNumeric:'tabular-nums',color:'#8a9'}}>{isFinite(load)?load.toFixed(2):'—'}</td>
    <td style={{...S.td,textAlign:'right',fontVariantNumeric:'tabular-nums',color:'#8a9'}}>{isFinite(pct)?pct.toFixed(1):'—'}%</td>
    <td style={{...S.td,textAlign:'center'}}>{status?<StatusBadge status={status} small/>:''}</td></tr>);
}

// ════════════ PROCESS DIAGRAM (#3: always show dilution zone) ════════════
const ProcessDiagram = React.forwardRef(function ProcessDiagram({calc,sources,fmtC,fmt,vol,volUnit,dilution,finalAllowed,finalSeverity},ref) {
  const f=(n)=>fmt(vol(n),1);
  const act=sources.filter(s=>(s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow))>0.01);
  const sH=28,sY=(i,t)=>{const sp=sH+4;return 170-((t-1)*sp)/2-sH/2+i*sp;};
  const sc={PASS:'#5da377',WARNING:'#d4a857',FAIL:'#c97a5d'};

  const rejectFails = !calc.totalRejectAllowed;
  const hasDilution = dilution?.needed && !dilution?.cannotSolve && ((dilution.finalFlow||0) > 0 || (dilution.QdReq||0) > 0);
  const dilZoneOpacity = rejectFails ? 1 : 0.25;

  // Determine final discharge display
  const showFinalCond = hasDilution && dilution.finalCond ? Math.round(dilution.finalCond).toLocaleString() : fmtC(calc.totalRejectTDS);
  const finalColor = sc[finalSeverity] || sc.PASS;

  // IMPORTANT — DO NOT REMOVE:
  // These source-level dilution streams are required to show the actual water balance into DILUTION / MIXING.
  // The user needs to see each selected source as its own box/line with its own flow, not only the total
  // dilution flow. This prevents future edits from accidentally hiding where the dilution water comes from.
  const dilSourcesRaw = hasDilution
    ? (dilution?.mixingSources || (dilution?.autoMode ? dilution?.sourceFlows : dilution?.sources) || [])
    : [];
  const dilSources = dilSourcesRaw
    .map(s => ({ ...s, actualFlow: s.actualFlow !== undefined ? s.actualFlow : toNumber(s.flow) }))
    .filter(s => s.enabled !== false && toNumber(s.actualFlow) > 0.0001)
    .slice(0, 5);
  const dilWaterFlow = hasDilution ? (dilution?.autoMode ? (dilution.QdReq || 0) : (dilution.dilFlow || 0)) : 0;

  return (
    <svg ref={ref} viewBox="0 0 1000 460" style={{width:'100%',height:'auto',minWidth:700}} xmlns="http://www.w3.org/2000/svg">
      <rect width="1000" height="460" fill="#060c09" rx="4"/>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5da377"/></marker>
        <marker id="arrL" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c97a5d"/></marker>
        <marker id="arrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#d4a857"/></marker>
      </defs>

      {/* Sources → Mix → UF → Split → RO → Blend → Product (same as v6) */}
      {act.map((s,i)=>{const y=sY(i,act.length),fl=s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow);
        return(<g key={s.id}><rect x="20" y={y} width="105" height={sH} rx="2" fill="#0f2218" stroke="#3a6049" strokeWidth="1"/>
          <text x="72" y={y+11} textAnchor="middle" fill="#9bc7a4" fontSize="8" fontFamily="ui-monospace,monospace" fontWeight="600">{s.name}</text>
          <text x="72" y={y+22} textAnchor="middle" fill="#7ba386" fontSize="7" fontFamily="ui-monospace,monospace">{f(fl)} · {fmtC(s.tds)}</text>
          <line x1="125" y1={y+sH/2} x2="170" y2="170" stroke="#3a6049" strokeWidth="1"/></g>);})}

      <circle cx="175" cy="170" r="10" fill="#1a3a2e" stroke="#5da377" strokeWidth="1.5"/>
      <text x="175" y="174" textAnchor="middle" fill="#9bc7a4" fontSize="10" fontFamily="ui-monospace,monospace">⊕</text>

      <line x1="185" y1="170" x2="270" y2="170" stroke="#5da377" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="228" y="160" textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace,monospace" fontWeight="600">{f(calc.feedFlow)}</text>
      <text x="228" y="184" textAnchor="middle" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.feedTDS)} µS/cm</text>

      <rect x="270" y="135" width="100" height="70" rx="3" fill="#0d2a20" stroke="#5da377" strokeWidth="2"/>
      <text x="320" y="155" textAnchor="middle" fill="#cde7d2" fontSize="13" fontWeight="700" fontFamily="ui-monospace,monospace">UF</text>
      <text x="320" y="192" textAnchor="middle" fill="#cde7d2" fontSize="9" fontFamily="ui-monospace,monospace">rej {(calc.feedFlow>0?(calc.ufRejectFlow/calc.feedFlow*100):0).toFixed(1)}%</text>

      <line x1="320" y1="205" x2="320" y2="300" stroke="#c97a5d" strokeWidth="1.5" strokeDasharray="3,3" markerEnd="url(#arrL)"/>
      <text x="330" y="252" fill="#e09a7e" fontSize="9" fontFamily="ui-monospace,monospace" fontWeight="600">{f(calc.ufRejectFlow)}</text>
      <text x="330" y="264" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.ufRejectTDS)}</text>

      <line x1="370" y1="170" x2="455" y2="170" stroke="#5da377" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="413" y="160" textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace,monospace" fontWeight="600">{f(calc.ufOut)}</text>

      <circle cx="460" cy="170" r="6" fill="#1a3a2e" stroke="#5da377" strokeWidth="1.5"/>
      <path d="M 460 164 L 460 55 L 835 55" fill="none" stroke="#d4a857" strokeWidth="2" markerEnd="url(#arrG)"/>
      <rect x="545" y="38" width="210" height="30" rx="3" fill="#1a1410" stroke="#d4a857" strokeWidth="1"/>
      <text x="650" y="50" textAnchor="middle" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace" fontWeight="700">BYPASS ({fmt(calc.calcBypass,1)}%)</text>
      <text x="650" y="62" textAnchor="middle" fill="#e8c876" fontSize="9" fontFamily="ui-monospace,monospace">{f(calc.ufBypass)} · {fmtC(calc.feedTDS)} µS/cm</text>

      <line x1="466" y1="170" x2="555" y2="170" stroke="#5da377" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="510" y="160" textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace,monospace" fontWeight="600">{f(calc.roIn)}</text>
      <text x="510" y="184" textAnchor="middle" fill="#7ba386" fontSize="8" fontFamily="ui-monospace,monospace">To RO {fmt(calc.calcToRO,1)}%</text>

      <rect x="555" y="135" width="100" height="70" rx="3" fill="#0d2a20" stroke="#5da377" strokeWidth="2"/>
      <text x="605" y="155" textAnchor="middle" fill="#cde7d2" fontSize="13" fontWeight="700" fontFamily="ui-monospace,monospace">RO</text>
      <text x="605" y="192" textAnchor="middle" fill="#cde7d2" fontSize="9" fontFamily="ui-monospace,monospace">rej {(calc.roIn>0?(calc.roRejectFlow/calc.roIn*100):0).toFixed(1)}%</text>

      <line x1="605" y1="205" x2="605" y2="300" stroke="#c97a5d" strokeWidth="1.5" strokeDasharray="3,3" markerEnd="url(#arrL)"/>
      <text x="615" y="252" fill="#e09a7e" fontSize="9" fontFamily="ui-monospace,monospace" fontWeight="600">{f(calc.roRejectFlow)}</text>
      <text x="615" y="264" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.roRejectTDS)}</text>
      <rect x="585" y="272" width="40" height="14" rx="2" fill={sc[calc.roRejectStatus]} opacity="0.15" stroke={sc[calc.roRejectStatus]} strokeWidth="0.5"/>
      <text x="605" y="282" textAnchor="middle" fill={sc[calc.roRejectStatus]} fontSize="7" fontWeight="700" fontFamily="ui-monospace,monospace">{calc.roRejectStatus}</text>

      <line x1="655" y1="170" x2="835" y2="170" stroke="#5da377" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="745" y="160" textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace,monospace" fontWeight="600">{f(calc.roOut)}</text>
      <text x="745" y="184" textAnchor="middle" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.roPermTDS)} µS/cm</text>

      <circle cx="840" cy="170" r="10" fill="#3a2e10" stroke="#d4a857" strokeWidth="2"/>
      <text x="840" y="174" textAnchor="middle" fill="#d4a857" fontSize="11" fontFamily="ui-monospace,monospace" fontWeight="700">⊕</text>
      <line x1="850" y1="170" x2="910" y2="170" stroke="#d4a857" strokeWidth="2" markerEnd="url(#arrG)"/>

      <rect x="910" y="132" width="82" height="76" rx="3" fill="#3a2e10" stroke="#d4a857" strokeWidth="2"/>
      <text x="951" y="152" textAnchor="middle" fill="#f0d488" fontSize="9" fontWeight="700" fontFamily="ui-monospace,monospace">PRODUCT</text>
      <text x="951" y="170" textAnchor="middle" fill="#e8c876" fontSize="13" fontFamily="ui-monospace,monospace" fontWeight="700">{f(calc.finalProduct)}</text>
      <text x="951" y="182" textAnchor="middle" fill="#b89a55" fontSize="8" fontFamily="ui-monospace,monospace">{volUnit}</text>
      <text x="951" y="198" textAnchor="middle" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.actualProductTDS)} µS/cm</text>

      {/* Total Reject */}
      <rect x="420" y="305" width="210" height="48" rx="3" fill="#2a1a14" stroke="#c97a5d" strokeWidth="1.5"/>
      <text x="525" y="322" textAnchor="middle" fill="#e09a7e" fontSize="9" fontWeight="700" fontFamily="ui-monospace,monospace">TOTAL REJECT</text>
      <text x="525" y="337" textAnchor="middle" fill="#f0b298" fontSize="11" fontFamily="ui-monospace,monospace" fontWeight="700">{f(calc.totalReject)} {volUnit}</text>
      <text x="525" y="348" textAnchor="middle" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.totalRejectTDS)} µS/cm</text>
      <line x1="320" y1="300" x2="420" y2="328" stroke="#c97a5d" strokeWidth="1" strokeDasharray="2,2"/>
      <line x1="605" y1="300" x2="630" y2="328" stroke="#c97a5d" strokeWidth="1" strokeDasharray="2,2"/>

      {/* ═══ DILUTION ZONE (#3: always visible, dimmed/active) ═══ */}
      <g opacity={dilZoneOpacity}>
        <line x1="525" y1="353" x2="525" y2="385" stroke="#c97a5d" strokeWidth="1.5" markerEnd="url(#arrL)"/>

        {/* Mixing box */}
        <rect x="440" y="385" width="170" height="38" rx="3"
          fill={rejectFails ? '#1a2a20' : '#0d1814'}
          stroke={rejectFails ? '#d4a857' : '#2a4538'} strokeWidth={rejectFails ? 1.5 : 1}/>
        <text x="525" y="400" textAnchor="middle" fill={rejectFails?'#d4a857':'#5da377'} fontSize="8" fontWeight="700" fontFamily="ui-monospace,monospace">
          {rejectFails ? 'DILUTION / MIXING' : 'DILUTION (ไม่จำเป็น)'}</text>
        <text x="525" y="416" textAnchor="middle" fill={rejectFails?'#cde7d2':'#3a6049'} fontSize="8" fontFamily="ui-monospace,monospace">
          {hasDilution ? `${fmt(vol(dilution.finalFlow),1)} ${volUnit}` : (rejectFails ? 'กรุณาเพิ่มน้ำผสม' : 'Not required')}</text>

        {/* Dilution Sources → Mixing
            IMPORTANT — DO NOT REMOVE:
            This block shows the flow from EACH dilution source into DILUTION / MIXING.
            It is intentionally source-level, not only total flow, because operators/engineers need to verify
            how much water is added from each source before it mixes with UF Reject + RO Reject.
        */}
        {dilSources.length > 0 ? (
          dilSources.map((ds, i) => {
            const total = dilSources.length;
            const laneGap = 20;
            const y = 404 - ((total - 1) * laneGap) / 2 + i * laneGap;
            const x0 = 135;
            const boxW = 185;
            const midX = 380;
            const flow = toNumber(ds.actualFlow);
            const cond = ds.conductivity !== undefined ? toNumber(ds.conductivity) : toNumber(ds.tds);
            return (
              <g key={`dil-src-${ds.id || i}`}>
                <rect x={x0} y={y - 12} width={boxW} height="24" rx="3"
                  fill={rejectFails?'#0f2218':'#0d1814'}
                  stroke={rejectFails?'#5da377':'#2a4538'} strokeWidth={rejectFails?1:0.75}/>
                <text x={x0 + 7} y={y - 2} textAnchor="start" fill={rejectFails?'#9bc7a4':'#3a6049'} fontSize="7" fontFamily="ui-monospace,monospace" fontWeight="700">
                  {ds.name || `Source ${i+1}`}</text>
                <text x={x0 + 7} y={y + 9} textAnchor="start" fill={rejectFails?'#e8f0e8':'#2a4538'} fontSize="7" fontFamily="ui-monospace,monospace" fontWeight="600">
                  {`${fmt(vol(flow),1)} ${volUnit}${cond ? ` · ${Math.round(cond).toLocaleString()} µS/cm` : ''}`}</text>
                <path d={`M ${x0 + boxW} ${y} L ${midX} ${y} L 440 404`}
                  fill="none" stroke={rejectFails?'#5da377':'#2a4538'} strokeWidth={rejectFails?1.5:1} markerEnd="url(#arr)"/>
              </g>
            );
          })
        ) : (
          <>
            <line x1="380" y1="404" x2="440" y2="404" stroke={rejectFails?'#5da377':'#2a4538'} strokeWidth={rejectFails?1.5:1} strokeDasharray={rejectFails?'':'3,3'} markerEnd="url(#arr)"/>
            <text x="368" y="398" textAnchor="end" fill={rejectFails?'#9bc7a4':'#3a6049'} fontSize="7" fontFamily="ui-monospace,monospace">น้ำผสม</text>
            <text x="368" y="412" textAnchor="end" fill={rejectFails?'#7ba386':'#2a4538'} fontSize="7" fontFamily="ui-monospace,monospace">Cond ต่ำ</text>
          </>
        )}

        {dilSources.length > 0 && (
          <>
            <text x="330" y="366" textAnchor="start" fill={rejectFails?'#d4a857':'#3a6049'} fontSize="7" fontFamily="ui-monospace,monospace" fontWeight="700">DILUTION WATER TOTAL</text>
            <text x="330" y="378" textAnchor="start" fill={rejectFails?'#f0d488':'#2a4538'} fontSize="8" fontFamily="ui-monospace,monospace" fontWeight="700">{`${fmt(vol(dilWaterFlow),1)} ${volUnit}`}</text>
          </>
        )}

        {/* → Final Discharge */}
        <line x1="610" y1="404" x2="700" y2="404" stroke={finalColor} strokeWidth={rejectFails?2:1} markerEnd="url(#arr)"/>
        <rect x="700" y="388" width="130" height="38" rx="3"
          fill={finalAllowed?'#0f2218':'#2a1a14'}
          stroke={finalColor} strokeWidth={rejectFails?2:1}/>
        <text x="765" y="402" textAnchor="middle" fill={finalColor} fontSize="8" fontWeight="700" fontFamily="ui-monospace,monospace">FINAL DISCHARGE</text>
        <text x="765" y="416" textAnchor="middle" fill={finalAllowed?'#9bc7a4':'#f0b298'} fontSize="9" fontFamily="ui-monospace,monospace">
          {showFinalCond} µS/cm</text>

        {/* Status badge */}
        <rect x="835" y="391" width="40" height="14" rx="2" fill={finalColor} opacity="0.15" stroke={finalColor} strokeWidth="0.5"/>
        <text x="855" y="401" textAnchor="middle" fill={finalColor} fontSize="7" fontWeight="700" fontFamily="ui-monospace,monospace">
          {finalAllowed ? (finalSeverity==='WARNING'?'WARN':'PASS') : 'REJECT'}</text>
      </g>
    </svg>
  );
});

function LossBreakdown({calc,fmtC,vol,volUnit}) {
  const total=calc.totalReject,ufPct=total>0?(calc.ufRejectFlow/total)*100:0,roPct=total>0?(calc.roRejectFlow/total)*100:0;
  const ufF=calc.feedFlow>0?(calc.ufRejectFlow/calc.feedFlow)*100:0,roF=calc.feedFlow>0?(calc.roRejectFlow/calc.feedFlow)*100:0;
  const f=(n)=>isFinite(n)?n.toFixed(1):'—';
  return(<div style={{padding:'18px 22px'}}>
    <div style={{display:'flex',height:50,borderRadius:3,overflow:'hidden',background:'#0a1410'}}>
      <div style={{width:`${ufPct}%`,background:'linear-gradient(180deg,#c97a5d,#a8624a)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontFamily:'ui-monospace,monospace',fontWeight:600,minWidth:ufPct>8?'auto':0,transition:'width 0.3s'}}>{ufPct>8&&`UF ${ufPct.toFixed(0)}%`}</div>
      <div style={{width:`${roPct}%`,background:'linear-gradient(180deg,#d4a857,#b08940)',display:'flex',alignItems:'center',justifyContent:'center',color:'#1a1a14',fontSize:11,fontFamily:'ui-monospace,monospace',fontWeight:700,minWidth:roPct>8?'auto':0,transition:'width 0.3s'}}>{roPct>8&&`RO ${roPct.toFixed(0)}%`}</div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:16}} className="ufro-loss-grid">
      <div style={S.lossItem}><div style={{...S.lossDot,background:'#c97a5d'}}/><div style={{flex:1}}>
        <div style={S.lossLabel}>UF Loss <StatusBadge status={calc.ufRejectStatus} small/></div>
        <div style={S.lossVal}>{f(vol(calc.ufRejectFlow))} {volUnit}</div>
        <div style={S.lossSub}>{ufF.toFixed(1)}% of feed · Cond {fmtC(calc.ufRejectTDS)}</div></div></div>
      <div style={S.lossItem}><div style={{...S.lossDot,background:'#d4a857'}}/><div style={{flex:1}}>
        <div style={S.lossLabel}>RO Loss <StatusBadge status={calc.roRejectStatus} small/></div>
        <div style={S.lossVal}>{f(vol(calc.roRejectFlow))} {volUnit}</div>
        <div style={S.lossSub}>{roF.toFixed(1)}% of feed · Cond {fmtC(calc.roRejectTDS)}</div></div></div>
    </div></div>);
}

// ════════════ STYLES ════════════
const mono="'JetBrains Mono',ui-monospace,monospace";
const thai="'IBM Plex Sans Thai','JetBrains Mono',sans-serif";
const serif="'Fraunces',serif";

const globalCSS=`
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,700&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap');
*{box-sizing:border-box}
input[type="range"]{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;width:100%}
input[type="range"]::-webkit-slider-runnable-track{height:2px;background:#2a4538;border-radius:1px}
input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;height:14px;width:14px;border-radius:2px;background:#d4a857;margin-top:-6px;border:1px solid #1a1a10}
input[type="range"]::-moz-range-track{height:2px;background:#2a4538}
input[type="range"]::-moz-range-thumb{height:14px;width:14px;border-radius:2px;background:#d4a857;border:1px solid #1a1a10}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
@keyframes blinkPass{0%,100%{opacity:1;box-shadow:0 0 8px rgba(93,163,119,0.6)}50%{opacity:0.7;box-shadow:0 0 2px rgba(93,163,119,0.2)}}
@keyframes blinkWarn{0%,100%{opacity:1;box-shadow:0 0 8px rgba(212,168,87,0.6)}50%{opacity:0.7;box-shadow:0 0 2px rgba(212,168,87,0.2)}}
@keyframes blinkFail{0%,100%{opacity:1;box-shadow:0 0 8px rgba(201,122,93,0.6)}50%{opacity:0.7;box-shadow:0 0 2px rgba(201,122,93,0.2)}}
.status-blink-pass{animation:blinkPass 1.5s infinite}
.status-blink-warn{animation:blinkWarn 1.2s infinite}
.status-blink-fail{animation:blinkFail 1s infinite}
@media(max-width:768px){
  .ufro-header{flex-direction:column!important;align-items:flex-start!important;gap:10px!important}
  .ufro-mode-toggle{align-self:stretch!important}
  .ufro-header-right{align-self:stretch!important;justify-content:space-between!important}
  .ufro-grid{grid-template-columns:1fr!important}
  .ufro-kpi-strip{grid-template-columns:repeat(2,1fr)!important}
  .ufro-dash-grid{grid-template-columns:1fr!important}
  .ufro-alloc-grid{grid-template-columns:1fr!important}
  .ufro-loss-grid{grid-template-columns:1fr!important}
}
@media(max-width:480px){.ufro-kpi-strip{grid-template-columns:1fr!important}}
`;

const S={
  root:{minHeight:'100vh',background:'radial-gradient(ellipse at top,#0e1a14,#060c09)',color:'#cde7d2',fontFamily:thai,padding:20,backgroundImage:'radial-gradient(ellipse at top,#0e1a14,#060c09),repeating-linear-gradient(0deg,rgba(93,163,119,0.025) 0px,rgba(93,163,119,0.025) 1px,transparent 1px,transparent 24px),repeating-linear-gradient(90deg,rgba(93,163,119,0.025) 0px,rgba(93,163,119,0.025) 1px,transparent 1px,transparent 24px)',backgroundBlendMode:'normal,overlay,overlay'},
  header:{display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:14,borderBottom:'1px solid #1f3528',marginBottom:20,gap:16,flexWrap:'wrap'},
  headerLeft:{display:'flex',alignItems:'center',gap:14,flex:'0 0 auto'},
  logoMark:{fontSize:28,color:'#d4a857',lineHeight:1},
  title:{fontFamily:serif,fontSize:20,fontWeight:500,color:'#e8f0e8'},
  subtitle:{fontSize:10,color:'#7ba386',letterSpacing:'0.15em',textTransform:'uppercase',marginTop:2},
  headerCenter:{display:'flex',flexDirection:'column',alignItems:'center',gap:4,flex:1,minWidth:200},
  modeToggle:{display:'inline-flex',background:'#0a1410',border:'1px solid #1f3528',borderRadius:4,padding:3},
  modeBtn:{background:'transparent',border:'none',padding:'6px 12px',cursor:'pointer',color:'#5da377',fontFamily:mono,fontSize:10,letterSpacing:'0.15em',fontWeight:600,borderRadius:2,transition:'all 0.2s',display:'inline-flex',alignItems:'center',gap:6},
  modeBtnActive:{background:'rgba(212,168,87,0.12)',color:'#e8c876',boxShadow:'inset 0 0 0 1px #d4a857'},
  modeBtnLabel:{fontWeight:700},modeBtnArrow:{opacity:0.6,fontSize:12},
  modeBtnQ:{width:14,height:14,borderRadius:'50%',background:'rgba(93,163,119,0.15)',border:'1px solid #3a6049',display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'#5da377'},
  modeBtnQActive:{background:'rgba(212,168,87,0.15)',borderColor:'#d4a857',color:'#d4a857'},
  modeDesc:{fontSize:10,color:'#7ba386',letterSpacing:'0.1em',fontFamily:mono},
  headerRight:{display:'flex',alignItems:'center',gap:8,flex:'0 0 auto',flexWrap:'wrap'},
  timeControls:{display:'flex',alignItems:'center',gap:6},
  timeToggle:{display:'inline-flex',background:'#0a1410',border:'1px solid #1f3528',borderRadius:3,padding:2},
  timeBtn:{background:'transparent',border:'none',padding:'4px 8px',cursor:'pointer',color:'#5da377',fontFamily:mono,fontSize:9,fontWeight:600,borderRadius:2},
  timeBtnActive:{background:'rgba(212,168,87,0.12)',color:'#e8c876',boxShadow:'inset 0 0 0 1px #d4a857'},
  opsWrap:{display:'flex',alignItems:'center',background:'#0a1410',border:'1px solid #1f3528',borderRadius:3,padding:'0 6px'},
  opsInput:{width:28,background:'transparent',border:'none',color:'#e8c876',fontSize:10,fontFamily:mono,textAlign:'center',outline:'none',padding:'4px 0'},
  opsLabel:{fontSize:8,color:'#5da377'},
  resetBtn:{background:'transparent',border:'1px solid #c97a5d',color:'#e09a7e',fontSize:9,padding:'4px 10px',borderRadius:3,cursor:'pointer',fontFamily:mono,letterSpacing:'0.1em',fontWeight:600},
  statusDot:{width:8,height:8,borderRadius:'50%',background:'#5da377',animation:'pulse 2s infinite'},
  statusText:{fontSize:9,color:'#7ba386',letterSpacing:'0.15em'},
  grid:{display:'grid',gridTemplateColumns:'360px 1fr',gap:20},
  sidebar:{background:'rgba(13,26,20,0.6)',border:'1px solid #1f3528',borderRadius:4,padding:16,height:'fit-content',backdropFilter:'blur(8px)'},
  sectionLabel:{fontSize:10,color:'#5da377',letterSpacing:'0.12em',fontWeight:600,margin:'16px 0 8px',paddingBottom:5,borderBottom:'1px dashed #2a4538',fontFamily:mono,textTransform:'uppercase'},
  strategyBox:{background:'#0a1410',border:'1px solid #2a4538',borderRadius:4,padding:10,marginBottom:8},
  strategyHeader:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6},
  strategyLabel:{fontSize:10,color:'#9bc7a4'},
  manualTag:{fontSize:7,padding:'2px 5px',background:'#3a3018',color:'#d4a857',borderRadius:2,letterSpacing:'0.15em',fontWeight:700,fontFamily:mono},
  strategyTabs:{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:2,background:'#060c09',padding:2,borderRadius:3},
  stratTab:{background:'transparent',border:'none',padding:'5px 4px',cursor:'pointer',color:'#5da377',fontFamily:mono,fontSize:9,borderRadius:2,transition:'all 0.15s'},
  stratTabActive:{background:'rgba(212,168,87,0.12)',color:'#e8c876',boxShadow:'inset 0 0 0 1px #d4a857'},
  stratHint:{fontSize:9,color:'#7ba386',marginTop:6,lineHeight:1.5,fontStyle:'italic'},
  sourcesWrap:{display:'flex',flexDirection:'column',gap:5},
  srcCard:{background:'#0a1410',border:'1px solid #1f3528',borderRadius:3,padding:'7px 9px',transition:'all 0.2s'},
  srcCardOn:{background:'rgba(93,163,119,0.04)',borderColor:'#3a6049'},
  srcHeader:{display:'flex',alignItems:'center',gap:6},
  srcToggle:{background:'transparent',border:'none',color:'#3a6049',fontSize:14,cursor:'pointer',padding:0,lineHeight:1,width:14},
  srcToggleOn:{color:'#5da377'},
  srcName:{flex:1,background:'transparent',border:'none',color:'#cde7d2',fontSize:11,fontFamily:'inherit',outline:'none',padding:'2px 4px'},
  srcIdx:{fontSize:8,color:'#5da377',letterSpacing:'0.1em',fontWeight:600,fontFamily:mono},
  srcPct:{fontSize:9,color:'#d4a857',fontWeight:600,fontFamily:mono,background:'rgba(212,168,87,0.1)',padding:'1px 5px',borderRadius:2},
  srcInputs:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginTop:6},
  srcField:{},
  srcFieldLabel:{fontSize:8,color:'#7ba386',letterSpacing:'0.1em',textTransform:'uppercase',display:'block',marginBottom:2,fontFamily:mono},
  autoTag:{fontSize:6,padding:'1px 3px',background:'#3a3018',color:'#d4a857',borderRadius:2,letterSpacing:'0.1em',fontWeight:700},
  srcInputWrap:{display:'flex',alignItems:'center',background:'#0a1410',border:'1px solid #1f3528',borderRadius:2,padding:'0 5px'},
  srcInputRO:{background:'#0d1814',borderStyle:'dashed',borderColor:'#3a3018'},
  srcInput:{flex:1,background:'transparent',border:'none',color:'#e8f0e8',padding:'4px 0',fontSize:10,fontFamily:mono,outline:'none',width:'100%',minWidth:0},
  srcUnit:{fontSize:7,color:'#5da377'},
  srcTdsHint:{fontSize:8,color:'#5da377',marginTop:2,opacity:0.7},
  mixBox:{marginTop:10,padding:8,background:'rgba(212,168,87,0.04)',border:'1px solid #3a3018',borderRadius:3},
  mixHead:{fontSize:8,color:'#d4a857',letterSpacing:'0.2em',fontWeight:700,paddingBottom:5,borderBottom:'1px dashed #3a3018',marginBottom:5,fontFamily:mono},
  mixRow:{display:'flex',justifyContent:'space-between',fontSize:10,padding:'2px 0'},
  mixVal:{color:'#e8c876',fontWeight:600,fontVariantNumeric:'tabular-nums',fontFamily:mono},
  inputRow:{marginBottom:8},inputLabel:{fontSize:10,color:'#9bc7a4',marginBottom:4},
  inputWrap:{display:'flex',alignItems:'center',background:'#0a1410',border:'1px solid #2a4538',borderRadius:3,padding:'0 8px'},
  inputWrapAccent:{borderColor:'#d4a857',background:'rgba(212,168,87,0.05)'},
  input:{flex:1,background:'transparent',border:'none',color:'#e8f0e8',padding:'7px 0',fontSize:13,fontFamily:mono,outline:'none'},
  inputUnit:{fontSize:10,color:'#5da377',letterSpacing:'0.1em'},
  tdsHint:{fontSize:9,color:'#5da377',marginTop:-4,marginBottom:8,opacity:0.7,fontFamily:mono},
  sliderRow:{marginBottom:10},sliderHdr:{display:'flex',justifyContent:'space-between',marginBottom:5},
  sliderLabel:{fontSize:10,color:'#9bc7a4'},sliderVal:{fontSize:10,color:'#d4a857',fontWeight:600,fontFamily:mono},slider:{width:'100%'},
  sliderHint:{fontSize:8,color:'#5da377',marginTop:2,fontStyle:'italic'},
  warnBox:{marginTop:10,padding:8,background:'rgba(201,122,93,0.1)',border:'1px solid #c97a5d',borderRadius:3},
  warnTitle:{fontSize:10,fontWeight:700,color:'#e09a7e',letterSpacing:'0.1em'},warnText:{fontSize:10,color:'#f0b298',marginTop:3,lineHeight:1.5},
  main:{display:'flex',flexDirection:'column',gap:14},
  allocCard:{background:'linear-gradient(180deg,rgba(212,168,87,0.08),rgba(13,26,20,0.6))',border:'1px solid #d4a857',borderRadius:6,overflow:'hidden',boxShadow:'0 4px 20px rgba(212,168,87,0.1)'},
  allocSub:{fontSize:11,color:'#cde7d2',marginLeft:12,fontWeight:400,letterSpacing:'normal',textTransform:'none'},
  allocGrid:{padding:'14px 18px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10},
  allocItem:{background:'rgba(10,20,16,0.6)',border:'1px solid #3a3018',borderRadius:4,padding:'10px 12px',transition:'opacity 0.2s'},
  allocName:{fontSize:10,color:'#9bc7a4',marginBottom:4},
  allocFlow:{fontSize:20,color:'#f0d488',fontFamily:serif,fontWeight:600,fontVariantNumeric:'tabular-nums'},
  allocUnit:{fontSize:10,color:'#b89a55',fontFamily:mono},
  allocBar:{height:3,background:'#0a1410',borderRadius:2,overflow:'hidden',margin:'6px 0 4px'},allocBarFill:{height:'100%',background:'linear-gradient(90deg,#d4a857,#f0d488)',transition:'width 0.3s'},
  allocMeta:{fontSize:9,color:'#7ba386',display:'flex',gap:5,alignItems:'center',fontFamily:mono},
  kpiStrip:{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10},
  kpi:{background:'rgba(13,26,20,0.6)',border:'1px solid #1f3528',borderRadius:4,padding:'10px 12px'},
  kpiHi:{borderColor:'#d4a857',background:'rgba(212,168,87,0.06)'},kpiWarn:{borderColor:'#c97a5d',background:'rgba(201,122,93,0.05)'},
  kpiLabel:{fontSize:8,color:'#7ba386',letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:5,fontFamily:mono,display:'flex',alignItems:'center',gap:6},
  kpiRow:{display:'flex',alignItems:'baseline',gap:4},
  kpiVal:{fontSize:20,fontWeight:600,color:'#e8f0e8',fontVariantNumeric:'tabular-nums',fontFamily:serif},kpiUnit:{fontSize:9,color:'#5da377',fontFamily:mono},
  kpiSub:{fontSize:8,color:'#7ba386',marginTop:3,fontFamily:mono},
  dischargeCard:{borderRadius:6,padding:'14px 20px',margin:'0 0 4px',display:'flex',alignItems:'center',justifyContent:'center'},
  dischargePass:{background:'rgba(93,163,119,0.08)',border:'2px solid #5da377'},
  dischargeWarn:{background:'rgba(212,168,87,0.08)',border:'2px solid #d4a857'},
  dischargeFail:{background:'rgba(201,122,93,0.08)',border:'2px solid #c97a5d'},
  dischargeInner:{display:'flex',flexDirection:'column',alignItems:'center',gap:6},
  dischargeBadge:{fontSize:14,fontWeight:700,letterSpacing:'0.1em',fontFamily:mono,padding:'6px 18px',borderRadius:4},
  dischargeMeta:{fontSize:10,color:'#9bc7a4',fontFamily:mono,textAlign:'center'},
  dashCard:{background:'rgba(13,26,20,0.6)',border:'1px solid #1f3528',borderRadius:4,overflow:'hidden'},
  dashGrid:{display:'grid',gridTemplateColumns:'1fr 1fr 1.5fr',gap:16,padding:'16px 20px',alignItems:'start'},
  dashChartWrap:{display:'flex',flexDirection:'column',alignItems:'center',gap:6},dashChartTitle:{fontSize:9,color:'#7ba386',letterSpacing:'0.15em',fontFamily:mono,textTransform:'uppercase'},
  dashCardsCol:{display:'flex',flexDirection:'column',gap:6},
  donutCenter:{position:'absolute',top:0,left:0,width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',pointerEvents:'none'},
  donutCenterVal:{fontSize:18,fontWeight:600,color:'#e8f0e8',fontFamily:serif},donutCenterSub:{fontSize:8,color:'#7ba386',fontFamily:mono},
  donutLegend:{display:'flex',flexDirection:'column',gap:3,marginTop:4},donutLegendItem:{display:'flex',alignItems:'center',gap:5,fontSize:9,color:'#9bc7a4',fontFamily:mono},donutLegendDot:{width:8,height:8,borderRadius:2},
  balCard:{background:'#0a1410',border:'1px solid #1f3528',borderRadius:3,padding:'8px 10px'},balCardAccent:{borderColor:'#d4a857',background:'rgba(212,168,87,0.04)'},
  balLabel:{fontSize:8,color:'#7ba386',letterSpacing:'0.1em',fontFamily:mono,textTransform:'uppercase',display:'flex',alignItems:'center',gap:5},
  balVal:{fontSize:14,color:'#e8f0e8',fontWeight:600,fontFamily:serif,marginTop:2},balUnit:{fontSize:9,color:'#5da377',fontFamily:mono},balCond:{fontSize:8,color:'#d4a857',fontFamily:mono,marginTop:2},
  diagramCard:{background:'rgba(13,26,20,0.6)',border:'1px solid #1f3528',borderRadius:4,overflow:'hidden'},
  exportBtn:{background:'transparent',border:'1px solid #3a6049',color:'#9bc7a4',fontSize:8,padding:'3px 8px',borderRadius:2,cursor:'pointer',fontFamily:mono,fontWeight:600},
  dilutionCard:{background:'rgba(201,122,93,0.04)',border:'1px solid #c97a5d',borderRadius:4,overflow:'hidden'},
  lossCard:{background:'rgba(13,26,20,0.6)',border:'1px solid #1f3528',borderRadius:4,overflow:'hidden'},
  tableCard:{background:'rgba(13,26,20,0.6)',border:'1px solid #1f3528',borderRadius:4,overflow:'hidden'},
  recCard:{background:'rgba(13,26,20,0.6)',border:'1px solid #1f3528',borderRadius:4,overflow:'hidden'},
  recSection:{marginBottom:14},recHeader:{display:'flex',alignItems:'center',gap:8,marginBottom:6},recArea:{fontSize:11,color:'#e09a7e',fontWeight:600},
  recList:{margin:0,paddingLeft:20,listStyleType:'disc'},recItem:{fontSize:10,color:'#f0b298',lineHeight:1.8},
  cardHdr:{padding:'10px 16px',borderBottom:'1px solid #1f3528',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8},
  cardLabel:{fontSize:9,color:'#5da377',letterSpacing:'0.2em',fontWeight:600,fontFamily:mono},cardMeta:{fontSize:9,color:'#7ba386',letterSpacing:'0.1em',fontFamily:mono},
  table:{width:'100%',borderCollapse:'collapse',fontSize:10,minWidth:600},
  th:{textAlign:'left',padding:'8px 14px',fontSize:8,color:'#5da377',letterSpacing:'0.15em',fontWeight:600,borderBottom:'1px solid #1f3528',fontFamily:mono},
  tr:{borderBottom:'1px solid #142820'},trHi:{background:'rgba(212,168,87,0.08)'},trLoss:{background:'rgba(201,122,93,0.04)'},trAcc:{background:'rgba(93,163,119,0.04)'},trSub:{opacity:0.7,fontSize:9},trBold:{fontWeight:700,background:'rgba(93,163,119,0.06)'},
  td:{padding:'8px 14px',color:'#cde7d2',fontFamily:mono},
  lossItem:{display:'flex',gap:10,alignItems:'flex-start',padding:10,background:'#0a1410',borderRadius:3,border:'1px solid #1f3528'},
  lossDot:{width:8,height:8,borderRadius:2,marginTop:4},
  lossLabel:{fontSize:9,color:'#7ba386',letterSpacing:'0.1em',textTransform:'uppercase',fontFamily:mono,display:'flex',alignItems:'center',gap:6},
  lossVal:{fontSize:16,color:'#e8f0e8',fontWeight:600,marginTop:3,fontFamily:serif},
  lossSub:{fontSize:9,color:'#5da377',marginTop:2,fontFamily:mono},
  footer:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',background:'rgba(13,26,20,0.4)',border:'1px solid #1f3528',borderRadius:4,fontSize:9,fontFamily:mono,flexWrap:'wrap',gap:8},
  footFormula:{color:'#9bc7a4',fontStyle:'italic'},footMeta:{color:'#5da377',letterSpacing:'0.15em'},
};
