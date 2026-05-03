import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';

// ────────────── Input Helpers (BUG FIX #1) ──────────────
// toNumber: for calculations — empty/invalid → 0
const toNumber = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

// Custom hook: stores string for display, number for state
function useNumericInput(initial) {
  const [num, setNum] = useState(initial);
  const [str, setStr] = useState(String(initial));
  const ref = useRef(false);

  const onChange = useCallback((e) => {
    const raw = e.target.value;
    setStr(raw);
    ref.current = true;
    const n = parseFloat(raw);
    if (raw === '' || raw === '-' || raw === '.' || raw.endsWith('.')) return;
    if (isFinite(n)) setNum(n);
  }, []);

  const setValue = useCallback((v) => {
    setNum(v);
    if (!ref.current) setStr(String(v));
    ref.current = false;
  }, []);

  const onBlur = useCallback(() => {
    ref.current = false;
    setStr(String(num));
  }, [num]);

  return { value: num, displayValue: str, onChange, onBlur, setValue };
}

// Simpler: for source fields that are set externally (optimization)
// We just need to handle the typing gracefully
function NumInput({ value, onValueChange, style, readOnly, min, max, step }) {
  const [display, setDisplay] = useState(String(value ?? ''));
  const typing = useRef(false);

  useEffect(() => {
    if (!typing.current) setDisplay(String(value ?? ''));
  }, [value]);

  const handleChange = (e) => {
    const raw = e.target.value;
    setDisplay(raw);
    typing.current = true;
    if (raw === '' || raw === '-' || raw === '.' || raw.endsWith('.')) return;
    const n = parseFloat(raw);
    if (isFinite(n)) onValueChange(n);
  };

  const handleBlur = () => {
    typing.current = false;
    const n = toNumber(display);
    onValueChange(n);
    setDisplay(String(n));
  };

  return (
    <input type="text" inputMode="decimal" value={display} onChange={handleChange} onBlur={handleBlur}
      style={style} readOnly={readOnly} />
  );
}

// ────────────── Conversion & Validation ──────────────
const TDS_TO_COND = 1.885;
const COND_TO_TDS = 0.53;
const tds2cond = (tds) => tds * TDS_TO_COND;
const cond2tds = (cond) => cond * COND_TO_TDS;

const REJECT_TDS_LIMIT = 3000;
const REJECT_COND_LIMIT = 6000;

function getRejectStatus(tds) {
  const cond = tds2cond(tds);
  if (tds > REJECT_TDS_LIMIT || cond > REJECT_COND_LIMIT) return 'FAIL';
  if (tds > REJECT_TDS_LIMIT * 0.8 || cond > REJECT_COND_LIMIT * 0.8) return 'WARNING';
  return 'PASS';
}

function getRecommendations(calc) {
  const recs = [];
  if (getRejectStatus(calc.roRejectTDS) === 'FAIL') {
    recs.push({ area: 'RO Reject (Concentrate)', status: 'FAIL', items: [
      'เพิ่ม RO Reject % เพื่อลด concentration factor',
      'ลด RO Recovery เพื่อลดความเข้มข้น',
      'ลด Feed Conductivity โดยเลือกแหล่งน้ำ TDS ต่ำ',
      'ผสมกับแหล่งน้ำ Conductivity ต่ำเพื่อเจือจาง',
      'พิจารณา Reject treatment หรือ 2-Stage RO',
    ]});
  }
  if (calc.actualProductTDS > calc.targetTDS * 1.1) {
    recs.push({ area: 'Product Water Quality', status: 'WARNING', items: [
      'ลด UF Bypass เพื่อเพิ่มสัดส่วน RO permeate',
      'เพิ่ม RO Salt Rejection (%)',
      'ลด Target Conductivity ให้ต่ำลง',
      'เลือกแหล่งน้ำ TDS ต่ำเป็นหลัก',
    ]});
  }
  if (getRejectStatus(calc.totalRejectTDS) === 'FAIL') {
    recs.push({ area: 'Total Combined Reject', status: 'FAIL', items: [
      'ลด Overall Recovery เพื่อเจือจาง reject',
      'เจือจาง reject stream ก่อนปล่อย',
      'เพิ่ม Reject treatment ก่อน discharge',
      'พิจารณา ZLD (Zero Liquid Discharge) system',
    ]});
  }
  return recs;
}

// ────────────── Export Helpers (#4) ──────────────
function exportSVG(svgEl) {
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ufro-process-diagram.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPNG(svgEl) {
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgEl);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);
  img.onload = () => {
    canvas.width = 2000;
    canvas.height = 800;
    ctx.fillStyle = '#060c09';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = 'ufro-process-diagram.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  img.src = url;
}

// ────────────── Default State (#3) ──────────────
const DEFAULT_SOURCES = [
  { id: 1, name: 'แหล่งน้ำ A', flow: 200, ratio: 100, tds: 1018, enabled: true },
  { id: 2, name: 'แหล่งน้ำ B', flow: 0,   ratio: 0,   tds: 800,  enabled: false },
  { id: 3, name: 'แหล่งน้ำ C', flow: 0,   ratio: 0,   tds: 600,  enabled: false },
  { id: 4, name: 'แหล่งน้ำ D', flow: 0,   ratio: 0,   tds: 400,  enabled: false },
  { id: 5, name: 'แหล่งน้ำ E', flow: 0,   ratio: 0,   tds: 1200, enabled: false },
];

// ────────────── Main Component ──────────────
export default function UFROCalculator() {
  const [mode, setMode] = useState('know-output');
  const [strategy, setStrategy] = useState('optimize');
  const [timeUnit, setTimeUnit] = useState('hourly');
  const [opsHours, setOpsHours] = useState(24);
  const [sources, setSources] = useState(DEFAULT_SOURCES.map(s => ({...s})));
  const [targetCond, setTargetCond] = useState(635);
  const [productFlow, setProductFlow] = useState(146);
  const [ufReject, setUfReject] = useState(10);
  const [roReject, setRoReject] = useState(25);
  const [roSaltRejection, setRoSaltRejection] = useState(96.56);

  const diagramRef = useRef(null);
  const targetTDS = cond2tds(targetCond);

  // ── Reset All (#3) ──
  const handleReset = () => {
    if (!window.confirm('รีเซ็ตค่าทั้งหมดกลับเป็นค่าเริ่มต้น?')) return;
    setMode('know-output');
    setStrategy('optimize');
    setTimeUnit('hourly');
    setOpsHours(24);
    setSources(DEFAULT_SOURCES.map(s => ({...s})));
    setTargetCond(635);
    setProductFlow(146);
    setUfReject(10);
    setRoReject(25);
    setRoSaltRejection(96.56);
  };

  // ── Auto-optimization ──
  useEffect(() => {
    if (mode !== 'know-output' || strategy === 'manual') return;
    const enabled = sources.filter(s => s.enabled);
    if (enabled.length === 0) return;
    let newRatios;
    if (strategy === 'equal') {
      const each = 100 / enabled.length;
      newRatios = enabled.map(s => ({ id: s.id, ratio: each }));
    } else {
      const minTDS = Math.min(...enabled.map(s => s.tds));
      if (minTDS <= targetTDS) {
        const low = enabled.filter(s => s.tds <= targetTDS);
        const each = 100 / low.length;
        newRatios = enabled.map(s => ({ id: s.id, ratio: s.tds <= targetTDS ? each : 0 }));
      } else {
        const w = enabled.map(s => 1 / Math.max(s.tds, 1));
        const sum = w.reduce((a, b) => a + b, 0);
        newRatios = enabled.map((s, i) => ({ id: s.id, ratio: (w[i] / sum) * 100 }));
      }
    }
    setSources(prev => {
      const updated = prev.map(s => {
        const r = newRatios.find(x => x.id === s.id);
        if (r && Math.abs(toNumber(s.ratio) - r.ratio) > 0.01) return { ...s, ratio: Math.round(r.ratio * 10) / 10 };
        return s;
      });
      return updated.some((s, i) => s.ratio !== prev[i].ratio) ? updated : prev;
    });
  }, [mode, strategy, sources.map(s => `${s.id}-${s.enabled}-${s.tds}`).join(','), targetTDS]);

  // ── Mixed Feed ──
  const mixedFeed = useMemo(() => {
    const active = sources.filter(s => s.enabled);
    if (mode === 'know-input') {
      const totalFlow = active.reduce((sum, s) => sum + toNumber(s.flow), 0);
      if (totalFlow === 0) return { flow: 0, tds: 0, sources: [] };
      const tds = active.reduce((sum, s) => sum + toNumber(s.flow) * toNumber(s.tds), 0) / totalFlow;
      return { flow: totalFlow, tds, sources: active.map(s => ({ ...s, actualFlow: toNumber(s.flow), actualRatio: totalFlow > 0 ? (toNumber(s.flow) / totalFlow) * 100 : 0 })) };
    } else {
      const usable = active.filter(s => toNumber(s.ratio) > 0);
      const totalRatio = usable.reduce((sum, s) => sum + toNumber(s.ratio), 0);
      if (totalRatio === 0) return { flow: 0, tds: 0, sources: active, totalRatio: 0 };
      const tds = usable.reduce((sum, s) => sum + toNumber(s.ratio) * toNumber(s.tds), 0) / totalRatio;
      return { flow: 0, tds, sources: active, totalRatio };
    }
  }, [sources, mode]);

  // ── Process Calc ──
  const calc = useMemo(() => {
    const ufR = (100 - ufReject) / 100;
    const roR = (100 - roReject) / 100;
    const rej = roSaltRejection / 100;
    const feedTDS = mixedFeed.tds;
    const roPermTDS = feedTDS * (1 - rej);
    const roRejectTDS = roR < 1 ? (feedTDS - roR * roPermTDS) / (1 - roR) : feedTDS;

    let blendRatio = (targetTDS - roPermTDS) / (feedTDS - roPermTDS);
    let blendValid = true, blendWarning = '', bypassRO = false;

    if (feedTDS === 0) { blendValid = false; blendWarning = 'ยังไม่ได้กรอกแหล่งน้ำ'; blendRatio = 0; }
    else if (feedTDS <= targetTDS) { blendValid = true; bypassRO = true; blendRatio = 1; }
    else if (targetTDS < roPermTDS) { blendValid = false; blendWarning = `เป้าหมาย Cond (${Math.round(tds2cond(targetTDS))}) ต่ำกว่า RO permeate (${Math.round(tds2cond(roPermTDS))} µS/cm)`; blendRatio = 0; }
    else { blendRatio = Math.max(0, Math.min(1, blendRatio)); }

    let feedFlow, ufOut, ufBypass, roIn, roOut, roRejectFlow, ufRejectFlow, totalReject, finalProduct;
    if (mode === 'know-output') {
      finalProduct = productFlow; ufBypass = blendRatio * finalProduct; roOut = (1 - blendRatio) * finalProduct;
      roIn = roR > 0 ? roOut / roR : 0; roRejectFlow = roIn - roOut; ufOut = ufBypass + roIn;
      feedFlow = ufR > 0 ? ufOut / ufR : 0; ufRejectFlow = feedFlow - ufOut; totalReject = ufRejectFlow + roRejectFlow;
    } else {
      feedFlow = mixedFeed.flow; ufOut = feedFlow * ufR; ufRejectFlow = feedFlow - ufOut;
      const denom = roR * blendRatio + (1 - blendRatio);
      roIn = denom > 0 ? ufOut * (1 - blendRatio) / denom : 0; roOut = roR * roIn; ufBypass = ufOut - roIn;
      roRejectFlow = roIn - roOut; finalProduct = ufBypass + roOut; totalReject = ufRejectFlow + roRejectFlow;
    }

    const overallRecovery = feedFlow > 0 ? (finalProduct / feedFlow) * 100 : 0;
    const actualProductTDS = bypassRO ? feedTDS : (blendRatio * feedTDS + (1 - blendRatio) * roPermTDS);
    const tdsInFeed = feedFlow * feedTDS, tdsInProduct = finalProduct * actualProductTDS;
    const totalRejectTDS = totalReject > 0 ? (tdsInFeed - tdsInProduct) / totalReject : 0;

    let sourceAllocations = [];
    if (mode === 'know-output' && mixedFeed.totalRatio > 0) {
      sourceAllocations = mixedFeed.sources.map(s => ({ ...s, actualFlow: feedFlow * (toNumber(s.ratio) / mixedFeed.totalRatio), actualRatio: (toNumber(s.ratio) / mixedFeed.totalRatio) * 100 }));
    } else { sourceAllocations = mixedFeed.sources; }

    return {
      feedFlow, ufOut, ufBypass, roIn, roOut, roRejectFlow, ufRejectFlow, totalReject, finalProduct, blendRatio,
      feedTDS, ufPermTDS: feedTDS, ufRejectTDS: feedTDS, roPermTDS, roRejectTDS, totalRejectTDS, actualProductTDS,
      overallRecovery, blendValid, blendWarning, bypassRO, sourceAllocations, totalRatio: mixedFeed.totalRatio || 0,
      ufRejectStatus: getRejectStatus(feedTDS), roRejectStatus: getRejectStatus(roRejectTDS), totalRejectStatus: getRejectStatus(totalRejectTDS), targetTDS
    };
  }, [mixedFeed, targetTDS, productFlow, ufReject, roReject, roSaltRejection, mode]);

  const recommendations = useMemo(() => getRecommendations({ ...calc, targetTDS }), [calc, targetTDS]);

  const updateSource = (id, field, value) => {
    setSources(sources.map(s => s.id === id ? { ...s, [field]: value } : s));
    if (mode === 'know-output' && field === 'ratio') setStrategy('manual');
  };

  const vol = (h) => timeUnit === 'daily' ? h * opsHours : h;
  const volUnit = timeUnit === 'daily' ? 'm³/day' : 'm³/h';
  const fmt = (n, d = 1) => isFinite(n) && !isNaN(n) ? n.toFixed(d) : '—';
  const fmtC = (tds) => isFinite(tds) && !isNaN(tds) ? Math.round(tds2cond(tds)).toLocaleString() : '—';

  return (
    <div style={S.root}>
      <style>{globalCSS}</style>

      {/* HEADER */}
      <header style={S.header} className="ufro-header">
        <div style={S.headerLeft}>
          <div style={S.logoMark}>◐</div>
          <div>
            <div style={S.title}>UF · RO CALCULATOR</div>
            <div style={S.subtitle}>JYN Reuse Water v5.1</div>
          </div>
        </div>

        <div style={S.headerCenter} className="ufro-mode-toggle">
          <div style={S.modeToggle}>
            <button style={{...S.modeBtn, ...(mode === 'know-input' ? S.modeBtnActive : {})}} onClick={() => setMode('know-input')}>
              <span style={S.modeBtnLabel}>FEED</span><span style={S.modeBtnArrow}>→</span>
              <span style={{...S.modeBtnQ, ...(mode === 'know-input' ? S.modeBtnQActive : {})}}>?</span>
            </button>
            <button style={{...S.modeBtn, ...(mode === 'know-output' ? S.modeBtnActive : {})}} onClick={() => setMode('know-output')}>
              <span style={{...S.modeBtnQ, ...(mode === 'know-output' ? S.modeBtnQActive : {})}}>?</span>
              <span style={S.modeBtnArrow}>→</span><span style={S.modeBtnLabel}>PRODUCT</span>
            </button>
          </div>
          <div style={S.modeDesc}>{mode === 'know-input' ? 'ทราบ Feed → คำนวณ Product' : 'ทราบ Product → คำนวณ Feed'}</div>
        </div>

        <div style={S.headerRight} className="ufro-header-right">
          <div style={S.timeControls}>
            <div style={S.timeToggle}>
              <button style={{...S.timeBtn, ...(timeUnit === 'hourly' ? S.timeBtnActive : {})}} onClick={() => setTimeUnit('hourly')}>h</button>
              <button style={{...S.timeBtn, ...(timeUnit === 'daily' ? S.timeBtnActive : {})}} onClick={() => setTimeUnit('daily')}>day</button>
            </div>
            {timeUnit === 'daily' && (
              <div style={S.opsWrap}>
                <NumInput value={opsHours} onValueChange={v => setOpsHours(Math.max(1, Math.min(24, v)))} style={S.opsInput} />
                <span style={S.opsLabel}>h/d</span>
              </div>
            )}
          </div>
          <button onClick={handleReset} style={S.resetBtn} title="รีเซ็ตค่าทั้งหมด">↺ Reset</button>
          <div style={S.statusDot} />
          <span style={S.statusText}>{calc.blendValid ? 'READY' : 'CHECK'}</span>
        </div>
      </header>

      <div style={S.grid} className="ufro-grid">
        {/* ─── LEFT SIDEBAR ─── */}
        <aside style={S.sidebar}>
          <div style={S.sectionLabel}>แหล่งน้ำดิบ {mode === 'know-input' ? '— ระบุปริมาณ' : ''}</div>

          {mode === 'know-output' && (
            <div style={S.strategyBox}>
              <div style={S.strategyHeader}><span style={S.strategyLabel}>วิธีจัดสรร</span>{strategy === 'manual' && <span style={S.manualTag}>MANUAL</span>}</div>
              <div style={S.strategyTabs}>
                {['optimize', 'equal', 'manual'].map(s => (
                  <button key={s} style={{...S.stratTab, ...(strategy === s ? S.stratTabActive : {})}} onClick={() => setStrategy(s)}>
                    {s === 'optimize' ? 'Optimize' : s === 'equal' ? 'Equal' : 'Manual'}
                  </button>
                ))}
              </div>
              <div style={S.stratHint}>
                {strategy === 'optimize' && 'เลือกแหล่ง Cond ต่ำเป็นหลัก → recovery สูงสุด'}
                {strategy === 'equal' && 'แบ่งสัดส่วนเท่ากันทุกแหล่ง'}
                {strategy === 'manual' && 'ปรับสัดส่วนเองในช่อง Ratio'}
              </div>
            </div>
          )}

          {mode === 'know-output' && calc.totalRatio > 0 && (
            <div style={{...S.ratioBar, ...(Math.abs(calc.totalRatio - 100) > 0.5 ? S.ratioBarWarn : {})}}>
              <span>รวม {fmt(calc.totalRatio, 1)}%</span>
              <span style={S.ratioMsg}>{Math.abs(calc.totalRatio - 100) > 0.5 ? 'will normalize' : '✓'}</span>
            </div>
          )}

          <div style={S.sourcesWrap}>
            {sources.map((s, idx) => (
              <SourceCard key={s.id} index={idx + 1} source={s} mode={mode} strategy={strategy} tUnit={timeUnit} opsH={opsHours}
                onChange={(f, v) => updateSource(s.id, f, v)} />
            ))}
          </div>

          <div style={S.mixBox}>
            <div style={S.mixHead}>น้ำดิบผสม (MIXED FEED)</div>
            <div style={S.mixRow}><span>Flow</span><span style={S.mixVal}>{fmt(vol(calc.feedFlow), 1)} {volUnit}</span></div>
            <div style={S.mixRow}><span>Conductivity</span><span style={S.mixVal}>{fmtC(calc.feedTDS)} µS/cm</span></div>
            <div style={S.mixRow}><span>TDS</span><span style={{...S.mixVal, opacity: 0.5}}>{fmt(calc.feedTDS, 0)} mg/L</span></div>
          </div>

          <div style={S.sectionLabel}>{mode === 'know-output' ? 'น้ำผลิตที่ต้องการ' : 'Conductivity เป้าหมาย'}</div>
          <div style={S.inputRow}>
            <div style={S.inputLabel}>Conductivity เป้าหมาย</div>
            <div style={{...S.inputWrap, ...S.inputWrapAccent}}>
              <NumInput value={targetCond} onValueChange={setTargetCond} style={S.input} />
              <span style={S.inputUnit}>µS/cm</span>
            </div>
            <div style={S.tdsHint}>≈ TDS {fmt(cond2tds(targetCond), 0)} mg/L</div>
          </div>
          {mode === 'know-output' && (
            <div style={S.inputRow}>
              <div style={S.inputLabel}>ปริมาณน้ำผลิต</div>
              <div style={{...S.inputWrap, ...S.inputWrapAccent}}>
                <NumInput value={timeUnit === 'daily' ? productFlow * opsHours : productFlow}
                  onValueChange={v => setProductFlow(timeUnit === 'daily' ? v / opsHours : v)} style={S.input} />
                <span style={S.inputUnit}>{volUnit}</span>
              </div>
            </div>
          )}

          <div style={S.sectionLabel}>การตั้งค่าเมมเบรน</div>
          <SliderRow label="UF Reject" value={ufReject} onChange={setUfReject} min={2} max={30} step={0.5} unit="%" hint="% น้ำที่ทิ้งจาก UF" />
          <SliderRow label="RO Reject" value={roReject} onChange={setRoReject} min={10} max={50} step={0.5} unit="%" hint="% น้ำที่ทิ้งเป็น concentrate" />
          <SliderRow label="RO Salt Rejection" value={roSaltRejection} onChange={setRoSaltRejection} min={90} max={99.9} step={0.1} unit="%" hint="ประสิทธิภาพกำจัดเกลือ" />

          {timeUnit === 'daily' && (
            <><div style={S.sectionLabel}>Operating Hours</div>
            <SliderRow label="ชั่วโมง/วัน" value={opsHours} onChange={setOpsHours} min={1} max={24} step={1} unit="h/d" /></>
          )}

          {!calc.blendValid && <div style={S.warnBox}><div style={S.warnTitle}>⚠ ตรวจสอบข้อมูล</div><div style={S.warnText}>{calc.blendWarning}</div></div>}
          {calc.bypassRO && <div style={S.infoBox}><div style={S.infoTitle}>ℹ น้ำดิบบริสุทธิ์พอ</div><div style={S.infoText}>Mixed Cond ({fmtC(calc.feedTDS)}) ≤ Target ({Math.round(targetCond)}) — ไม่ต้อง RO</div></div>}
        </aside>

        {/* ─── RIGHT MAIN ─── */}
        <main style={S.main}>
          {mode === 'know-output' && calc.blendValid && calc.sourceAllocations.length > 0 && (
            <div style={S.allocCard}>
              <div style={S.cardHdr}>
                <div><span style={S.cardLabel}>SOURCE ALLOCATION</span><span style={S.allocSub}>ต้องดึงน้ำจากแต่ละแหล่ง</span></div>
                <span style={S.cardMeta}>Strategy: <strong style={{color:'#d4a857'}}>{strategy.toUpperCase()}</strong></span>
              </div>
              <div style={S.allocGrid} className="ufro-alloc-grid">
                {calc.sourceAllocations.map(s => (
                  <div key={s.id} style={{...S.allocItem, ...(s.actualRatio < 0.1 ? {opacity:0.3} : {})}}>
                    <div style={S.allocName}>{s.name}</div>
                    <div style={S.allocFlow}>{fmt(vol(s.actualFlow), 1)}<span style={S.allocUnit}> {volUnit}</span></div>
                    {timeUnit === 'daily' && <div style={S.allocSecondary}>{fmt(s.actualFlow, 1)} m³/h</div>}
                    <div style={S.allocBar}><div style={{...S.allocBarFill, width:`${Math.min(100,s.actualRatio)}%`}} /></div>
                    <div style={S.allocMeta}><span style={{color:'#d4a857',fontWeight:600}}>{fmt(s.actualRatio,1)}%</span><span style={{color:'#3a6049'}}>•</span><span>Cond {fmtC(s.tds)}</span></div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={S.kpiStrip} className="ufro-kpi-strip">
            <KPI label="น้ำดิบ" value={fmt(vol(calc.feedFlow),1)} unit={volUnit} sub={`Cond ${fmtC(calc.feedTDS)}`}
              secondary={timeUnit==='hourly'?`${fmt(calc.feedFlow*opsHours,0)} m³/day`:`${fmt(calc.feedFlow,1)} m³/h`} highlight={mode==='know-output'} />
            <KPI label="น้ำผลิต" value={fmt(vol(calc.finalProduct),1)} unit={volUnit} sub={`Cond ${fmtC(calc.actualProductTDS)}`}
              secondary={timeUnit==='hourly'?`${fmt(calc.finalProduct*opsHours,0)} m³/day`:`${fmt(calc.finalProduct,1)} m³/h`} highlight={mode==='know-input'} />
            <KPI label="น้ำสูญเสีย" value={fmt(vol(calc.totalReject),1)} unit={volUnit} sub={`Cond ${fmtC(calc.totalRejectTDS)}`} badge={calc.totalRejectStatus} warning />
            <KPI label="Recovery" value={fmt(calc.overallRecovery,1)} unit="%" />
            <KPI label="Blend" value={`${fmt(calc.blendRatio*100,0)}:${fmt((1-calc.blendRatio)*100,0)}`} unit="UF:RO" />
          </div>

          {/* DASHBOARD */}
          <div style={S.dashCard}>
            <div style={S.cardHdr}><span style={S.cardLabel}>WATER BALANCE DASHBOARD</span><span style={S.cardMeta}>{volUnit}</span></div>
            <div style={S.dashGrid} className="ufro-dash-grid">
              <div style={S.dashChartWrap}>
                <div style={S.dashChartTitle}>Product vs Reject</div>
                <DonutChart segments={[{label:'Product',value:calc.finalProduct,color:'#d4a857'},{label:'Reject',value:calc.totalReject,color:'#c97a5d'}]}
                  centerLabel={`${fmt(calc.overallRecovery,0)}%`} centerSub="Recovery" />
              </div>
              <div style={S.dashChartWrap}>
                <div style={S.dashChartTitle}>UF vs RO Reject</div>
                <DonutChart segments={[{label:'UF Reject',value:calc.ufRejectFlow,color:'#c97a5d'},{label:'RO Reject',value:calc.roRejectFlow,color:'#d4a857'}]}
                  centerLabel={fmt(vol(calc.totalReject),0)} centerSub={volUnit} />
              </div>
              <div style={S.dashCardsCol}>
                <BalanceCard label="Feed" value={fmt(vol(calc.feedFlow),1)} unit={volUnit} cond={fmtC(calc.feedTDS)} />
                <BalanceCard label="Product" value={fmt(vol(calc.finalProduct),1)} unit={volUnit} cond={fmtC(calc.actualProductTDS)} accent />
                <BalanceCard label="UF Reject" value={fmt(vol(calc.ufRejectFlow),1)} unit={volUnit} cond={fmtC(calc.ufRejectTDS)} status={calc.ufRejectStatus} />
                <BalanceCard label="RO Reject" value={fmt(vol(calc.roRejectFlow),1)} unit={volUnit} cond={fmtC(calc.roRejectTDS)} status={calc.roRejectStatus} />
                <BalanceCard label="Total Reject" value={fmt(vol(calc.totalReject),1)} unit={volUnit} cond={fmtC(calc.totalRejectTDS)} status={calc.totalRejectStatus} />
              </div>
            </div>
          </div>

          {/* PROCESS DIAGRAM with Export (#4) */}
          <div style={S.diagramCard}>
            <div style={S.cardHdr}>
              <span style={S.cardLabel}>PROCESS FLOW DIAGRAM</span>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <button onClick={() => exportSVG(diagramRef.current)} style={S.exportBtn} title="Export SVG">⬇ SVG</button>
                <button onClick={() => exportPNG(diagramRef.current)} style={S.exportBtn} title="Export PNG">⬇ PNG</button>
              </div>
            </div>
            <div style={{overflowX:'auto'}}>
              <ProcessDiagram ref={diagramRef} calc={calc} sources={calc.sourceAllocations} fmtC={fmtC} fmt={fmt} vol={vol} volUnit={volUnit} />
            </div>
          </div>

          {/* LOSS */}
          <div style={S.lossCard}>
            <div style={S.cardHdr}><span style={S.cardLabel}>WATER LOSS BREAKDOWN</span><span style={S.cardMeta}>{volUnit}</span></div>
            <LossBreakdown calc={calc} fmtC={fmtC} vol={vol} volUnit={volUnit} />
          </div>

          {/* RECOMMENDATIONS */}
          {recommendations.length > 0 && (
            <div style={S.recCard}>
              <div style={S.cardHdr}><span style={S.cardLabel}>RECOMMENDATIONS</span><span style={S.cardMeta}>{recommendations.length} issue(s)</span></div>
              <div style={{padding:'14px 18px'}}>
                {recommendations.map((r,i) => (
                  <div key={i} style={S.recSection}>
                    <div style={S.recHeader}><StatusBadge status={r.status} /><span style={S.recArea}>{r.area}</span></div>
                    <ul style={S.recList}>{r.items.map((item,j) => <li key={j} style={S.recItem}>{item}</li>)}</ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STREAM TABLE */}
          <div style={S.tableCard}>
            <div style={S.cardHdr}>
              <span style={S.cardLabel}>STREAM TABLE</span>
              <span style={S.cardMeta}>{mode==='know-output'?'PRODUCT→FEED':'FEED→PRODUCT'} · {volUnit}</span>
            </div>
            <div style={{overflowX:'auto'}}>
              <table style={S.table}>
                <thead><tr>
                  <th style={S.th}>Stream</th>
                  <th style={{...S.th,textAlign:'right'}}>Flow ({volUnit})</th>
                  <th style={{...S.th,textAlign:'right'}}>Cond (µS/cm)</th>
                  <th style={{...S.th,textAlign:'right'}}>TDS (mg/L)</th>
                  <th style={{...S.th,textAlign:'right'}}>Load (kg/h)</th>
                  <th style={{...S.th,textAlign:'right'}}>% of Feed</th>
                  <th style={{...S.th,textAlign:'center'}}>Status</th>
                </tr></thead>
                <tbody>
                  {calc.sourceAllocations.map(s => {
                    const fl = s.actualFlow !== undefined ? s.actualFlow : toNumber(s.flow);
                    return <StreamRow key={s.id} name={`├─ ${s.name}`} flow={vol(fl)} tds={s.tds} pct={s.actualRatio||0} sub />;
                  })}
                  <StreamRow name="① Mixed Feed" flow={vol(calc.feedFlow)} tds={calc.feedTDS} pct={100} bold />
                  <StreamRow name="② UF Permeate" flow={vol(calc.ufOut)} tds={calc.ufPermTDS} pct={calc.ufOut/calc.feedFlow*100} />
                  <StreamRow name="③ UF Reject" flow={vol(calc.ufRejectFlow)} tds={calc.ufRejectTDS} pct={calc.ufRejectFlow/calc.feedFlow*100} loss status={calc.ufRejectStatus} />
                  <StreamRow name="④ → RO Feed" flow={vol(calc.roIn)} tds={calc.feedTDS} pct={calc.roIn/calc.feedFlow*100} />
                  <StreamRow name="⑤ UF Bypass" flow={vol(calc.ufBypass)} tds={calc.feedTDS} pct={calc.ufBypass/calc.feedFlow*100} accent />
                  <StreamRow name="⑥ RO Permeate" flow={vol(calc.roOut)} tds={calc.roPermTDS} pct={calc.roOut/calc.feedFlow*100} />
                  <StreamRow name="⑦ RO Conc." flow={vol(calc.roRejectFlow)} tds={calc.roRejectTDS} pct={calc.roRejectFlow/calc.feedFlow*100} loss status={calc.roRejectStatus} />
                  <StreamRow name="⑧ Total Reject" flow={vol(calc.totalReject)} tds={calc.totalRejectTDS} pct={calc.totalReject/calc.feedFlow*100} loss status={calc.totalRejectStatus} />
                  <StreamRow name="⑨ PRODUCT" flow={vol(calc.finalProduct)} tds={calc.actualProductTDS} pct={calc.finalProduct/calc.feedFlow*100} highlight />
                </tbody>
              </table>
            </div>
          </div>

          <footer style={S.footer}>
            <span style={S.footFormula}>Cond = TDS × {TDS_TO_COND} · Reject limit: {REJECT_COND_LIMIT} µS/cm</span>
            <span style={S.footMeta}>v5.1</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

// ────────────── Sub Components ──────────────

function SourceCard({ index, source, mode, strategy, tUnit, opsH, onChange }) {
  const readOnly = mode === 'know-output' && strategy !== 'manual';
  const pct = source.actualRatio !== undefined ? source.actualRatio : 0;

  return (
    <div style={{...S.srcCard, ...(source.enabled ? S.srcCardOn : {})}}>
      <div style={S.srcHeader}>
        <button style={{...S.srcToggle, ...(source.enabled ? S.srcToggleOn : {})}} onClick={() => onChange('enabled', !source.enabled)}>
          {source.enabled ? '●' : '○'}
        </button>
        <input type="text" value={source.name} onChange={e => onChange('name', e.target.value)} style={S.srcName} disabled={!source.enabled} />
        <span style={S.srcIdx}>S{index}</span>
        {mode === 'know-input' && source.enabled && pct > 0 && <span style={S.srcPct}>{pct.toFixed(1)}%</span>}
      </div>
      {source.enabled && (
        <div style={S.srcInputs}>
          <div style={S.srcField}>
            <label style={S.srcFieldLabel}>Cond (µS/cm)</label>
            <div style={S.srcInputWrap}>
              <NumInput value={Math.round(tds2cond(source.tds))} onValueChange={v => onChange('tds', cond2tds(v))} style={S.srcInput} />
              <span style={S.srcUnit}>µS/cm</span>
            </div>
            <div style={S.srcTdsHint}>≈ TDS {Math.round(source.tds)}</div>
          </div>
          <div style={S.srcField}>
            <label style={S.srcFieldLabel}>
              {mode === 'know-input' ? 'Flow' : <span style={{display:'flex',alignItems:'center',gap:4}}>Ratio {readOnly && <span style={S.autoTag}>AUTO</span>}</span>}
            </label>
            <div style={{...S.srcInputWrap, ...(readOnly ? S.srcInputRO : {})}}>
              <NumInput
                value={mode === 'know-input' ? source.flow : parseFloat((source.ratio || 0).toFixed(1))}
                onValueChange={v => onChange(mode === 'know-input' ? 'flow' : 'ratio', v)}
                style={S.srcInput} readOnly={readOnly} />
              <span style={S.srcUnit}>{mode === 'know-input' ? 'm³/h' : '%'}</span>
            </div>
            {mode === 'know-input' && tUnit === 'daily' && <div style={S.srcTdsHint}>= {(toNumber(source.flow) * opsH).toFixed(0)} m³/day</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step, unit, hint }) {
  return (
    <div style={S.sliderRow}>
      <div style={S.sliderHdr}><span style={S.sliderLabel}>{label}</span><span style={S.sliderVal}>{value}{unit}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} style={S.slider} />
      {hint && <div style={S.sliderHint}>{hint}</div>}
    </div>
  );
}

function KPI({ label, value, unit, sub, secondary, highlight, warning, badge }) {
  return (
    <div style={{...S.kpi, ...(highlight?S.kpiHi:{}), ...(warning?S.kpiWarn:{})}}>
      <div style={S.kpiLabel}>{label} {badge && <StatusBadge status={badge} small />}</div>
      <div style={S.kpiRow}><span style={S.kpiVal}>{value}</span><span style={S.kpiUnit}>{unit}</span></div>
      {sub && <div style={S.kpiSub}>{sub}</div>}
      {secondary && <div style={S.kpiSecondary}>{secondary}</div>}
    </div>
  );
}

function StatusBadge({ status, small }) {
  const c = { PASS:'#5da377', WARNING:'#d4a857', FAIL:'#c97a5d' };
  const bg = { PASS:'rgba(93,163,119,0.15)', WARNING:'rgba(212,168,87,0.15)', FAIL:'rgba(201,122,93,0.15)' };
  return <span style={{ display:'inline-block', padding:small?'1px 5px':'2px 8px', borderRadius:2, fontSize:small?7:9, fontWeight:700, letterSpacing:'0.15em', color:c[status]||'#7ba386', background:bg[status]||'transparent', border:`1px solid ${c[status]||'#3a6049'}`, fontFamily:mono }}>{status}</span>;
}

function BalanceCard({ label, value, unit, cond, accent, status }) {
  return (
    <div style={{...S.balCard, ...(accent?S.balCardAccent:{})}}>
      <div style={S.balLabel}>{label} {status && <StatusBadge status={status} small />}</div>
      <div style={S.balVal}>{value} <span style={S.balUnit}>{unit}</span></div>
      <div style={S.balCond}>Cond {cond} µS/cm</div>
    </div>
  );
}

function DonutChart({ segments, centerLabel, centerSub }) {
  const total = segments.reduce((s,x) => s+(x.value||0), 0);
  if (total === 0) return <div style={{width:140,height:140,display:'flex',alignItems:'center',justifyContent:'center',color:'#5da377',fontSize:11}}>No data</div>;
  const size=140,cx=70,cy=70,r=52,stroke=14,circ=2*Math.PI*r;
  let offset=0;
  return (
    <div style={{position:'relative',width:size,height:size}}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{width:'100%',height:'100%',transform:'rotate(-90deg)'}}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#142820" strokeWidth={stroke} />
        {segments.map((seg,i) => { const pct=seg.value/total, dash=circ*pct, gap=circ-dash;
          const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={stroke} strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-offset} style={{transition:'all 0.3s'}} />;
          offset+=dash; return el; })}
      </svg>
      <div style={S.donutCenter}><div style={S.donutCenterVal}>{centerLabel}</div><div style={S.donutCenterSub}>{centerSub}</div></div>
      <div style={S.donutLegend}>{segments.map((seg,i) => (
        <div key={i} style={S.donutLegendItem}><div style={{...S.donutLegendDot,background:seg.color}} /><span>{seg.label} {total>0?`${((seg.value/total)*100).toFixed(0)}%`:''}</span></div>
      ))}</div>
    </div>
  );
}

function StreamRow({ name, flow, tds, pct, highlight, loss, accent, sub, bold, status }) {
  const cond=tds2cond(tds), tdsLoad=isFinite(flow)&&isFinite(tds)?(flow*tds/1000):NaN;
  const condColor=cond<200?'#9bc7a4':cond>6000?'#e09a7e':'#cde7d2';
  const rowStyle={...S.tr,...(highlight?S.trHi:{}),...(loss?S.trLoss:{}),...(accent?S.trAcc:{}),...(sub?S.trSub:{}),...(bold?S.trBold:{})};
  return (
    <tr style={rowStyle}>
      <td style={S.td}>{name}</td>
      <td style={{...S.td,textAlign:'right',fontVariantNumeric:'tabular-nums'}}>{isFinite(flow)?flow.toFixed(1):'—'}</td>
      <td style={{...S.td,textAlign:'right',fontVariantNumeric:'tabular-nums',color:condColor}}>{isFinite(cond)?Math.round(cond).toLocaleString():'—'}</td>
      <td style={{...S.td,textAlign:'right',fontVariantNumeric:'tabular-nums',opacity:0.5}}>{isFinite(tds)?tds.toFixed(0):'—'}</td>
      <td style={{...S.td,textAlign:'right',fontVariantNumeric:'tabular-nums',color:'#8a9'}}>{isFinite(tdsLoad)?tdsLoad.toFixed(2):'—'}</td>
      <td style={{...S.td,textAlign:'right',fontVariantNumeric:'tabular-nums',color:'#8a9'}}>{isFinite(pct)?pct.toFixed(1):'—'}%</td>
      <td style={{...S.td,textAlign:'center'}}>{status?<StatusBadge status={status} small />:''}</td>
    </tr>
  );
}

// forwardRef for export (#4)
const ProcessDiagram = React.forwardRef(function ProcessDiagram({ calc, sources, fmtC, fmt, vol, volUnit }, ref) {
  const f = (n) => fmt(vol(n), 1);
  const activeSources = sources.filter(s => (s.actualFlow !== undefined ? s.actualFlow : toNumber(s.flow)) > 0.01);
  const sH=28, sY=(i,t)=>{const sp=sH+4;return 170-((t-1)*sp)/2-sH/2+i*sp;};
  const sc={PASS:'#5da377',WARNING:'#d4a857',FAIL:'#c97a5d'};

  return (
    <svg ref={ref} viewBox="0 0 1000 400" style={{width:'100%',height:'auto',minWidth:700}} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5da377"/></marker>
        <marker id="arrL" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c97a5d"/></marker>
        <marker id="arrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#d4a857"/></marker>
      </defs>
      <rect width="1000" height="400" fill="#060c09" rx="4" />

      {activeSources.map((s,i) => { const y=sY(i,activeSources.length), fl=s.actualFlow!==undefined?s.actualFlow:toNumber(s.flow);
        return (<g key={s.id}><rect x="20" y={y} width="105" height={sH} rx="2" fill="#0f2218" stroke="#3a6049" strokeWidth="1"/>
          <text x="72" y={y+11} textAnchor="middle" fill="#9bc7a4" fontSize="8" fontFamily="ui-monospace,monospace" fontWeight="600">{s.name}</text>
          <text x="72" y={y+22} textAnchor="middle" fill="#7ba386" fontSize="7" fontFamily="ui-monospace,monospace">{f(fl)} · {fmtC(s.tds)}</text>
          <line x1="125" y1={y+sH/2} x2="170" y2="170" stroke="#3a6049" strokeWidth="1" /></g>); })}

      <circle cx="175" cy="170" r="10" fill="#1a3a2e" stroke="#5da377" strokeWidth="1.5"/>
      <text x="175" y="174" textAnchor="middle" fill="#9bc7a4" fontSize="10" fontFamily="ui-monospace,monospace">⊕</text>

      <line x1="185" y1="170" x2="270" y2="170" stroke="#5da377" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="228" y="160" textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace,monospace" fontWeight="600">{f(calc.feedFlow)}</text>
      <text x="228" y="184" textAnchor="middle" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.feedTDS)} µS/cm</text>

      <rect x="270" y="135" width="100" height="70" rx="3" fill="#0d2a20" stroke="#5da377" strokeWidth="2"/>
      <text x="320" y="158" textAnchor="middle" fill="#cde7d2" fontSize="13" fontWeight="700" fontFamily="ui-monospace,monospace">UF</text>
      <text x="320" y="174" textAnchor="middle" fill="#7ba386" fontSize="8" fontFamily="ui-monospace,monospace">Ultrafiltration</text>
      <text x="320" y="192" textAnchor="middle" fill="#cde7d2" fontSize="9" fontFamily="ui-monospace,monospace">rej {(100-(calc.feedFlow>0?calc.ufOut/calc.feedFlow*100:0)).toFixed(1)}%</text>

      <line x1="320" y1="205" x2="320" y2="310" stroke="#c97a5d" strokeWidth="1.5" strokeDasharray="3,3" markerEnd="url(#arrL)"/>
      <text x="330" y="248" fill="#c97a5d" fontSize="8" fontFamily="ui-monospace,monospace">UF rej</text>
      <text x="330" y="260" fill="#e09a7e" fontSize="10" fontFamily="ui-monospace,monospace" fontWeight="600">{f(calc.ufRejectFlow)}</text>
      <text x="330" y="272" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.ufRejectTDS)}</text>
      <rect x="300" y="280" width="40" height="14" rx="2" fill={sc[calc.ufRejectStatus]} opacity="0.15" stroke={sc[calc.ufRejectStatus]} strokeWidth="0.5"/>
      <text x="320" y="290" textAnchor="middle" fill={sc[calc.ufRejectStatus]} fontSize="7" fontWeight="700" fontFamily="ui-monospace,monospace">{calc.ufRejectStatus}</text>

      <line x1="370" y1="170" x2="455" y2="170" stroke="#5da377" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="413" y="160" textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace,monospace" fontWeight="600">{f(calc.ufOut)}</text>
      <text x="413" y="184" textAnchor="middle" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.ufPermTDS)}</text>

      <circle cx="460" cy="170" r="6" fill="#1a3a2e" stroke="#5da377" strokeWidth="1.5"/>
      <path d="M 460 164 L 460 55 L 835 55" fill="none" stroke="#d4a857" strokeWidth="2" markerEnd="url(#arrG)"/>
      <rect x="545" y="38" width="200" height="30" rx="3" fill="#1a1410" stroke="#d4a857" strokeWidth="1"/>
      <text x="645" y="50" textAnchor="middle" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace" fontWeight="700">UF BYPASS</text>
      <text x="645" y="62" textAnchor="middle" fill="#e8c876" fontSize="9" fontFamily="ui-monospace,monospace">{f(calc.ufBypass)} · {fmtC(calc.feedTDS)} µS/cm</text>

      <line x1="466" y1="170" x2="555" y2="170" stroke="#5da377" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="510" y="160" textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace,monospace" fontWeight="600">{f(calc.roIn)}</text>
      <text x="510" y="184" textAnchor="middle" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.feedTDS)}</text>

      <rect x="555" y="135" width="100" height="70" rx="3" fill="#0d2a20" stroke="#5da377" strokeWidth="2"/>
      <text x="605" y="158" textAnchor="middle" fill="#cde7d2" fontSize="13" fontWeight="700" fontFamily="ui-monospace,monospace">RO</text>
      <text x="605" y="174" textAnchor="middle" fill="#7ba386" fontSize="8" fontFamily="ui-monospace,monospace">1st Stage</text>
      <text x="605" y="192" textAnchor="middle" fill="#cde7d2" fontSize="9" fontFamily="ui-monospace,monospace">rej {(calc.roIn>0?calc.roRejectFlow/calc.roIn*100:0).toFixed(1)}%</text>

      <line x1="605" y1="205" x2="605" y2="310" stroke="#c97a5d" strokeWidth="1.5" strokeDasharray="3,3" markerEnd="url(#arrL)"/>
      <text x="615" y="248" fill="#c97a5d" fontSize="8" fontFamily="ui-monospace,monospace">RO conc</text>
      <text x="615" y="260" fill="#e09a7e" fontSize="10" fontFamily="ui-monospace,monospace" fontWeight="600">{f(calc.roRejectFlow)}</text>
      <text x="615" y="272" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.roRejectTDS)}</text>
      <rect x="585" y="280" width="40" height="14" rx="2" fill={sc[calc.roRejectStatus]} opacity="0.15" stroke={sc[calc.roRejectStatus]} strokeWidth="0.5"/>
      <text x="605" y="290" textAnchor="middle" fill={sc[calc.roRejectStatus]} fontSize="7" fontWeight="700" fontFamily="ui-monospace,monospace">{calc.roRejectStatus}</text>

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

      <rect x="430" y="315" width="195" height="55" rx="3" fill="#2a1a14" stroke="#c97a5d" strokeWidth="1.5"/>
      <text x="528" y="333" textAnchor="middle" fill="#e09a7e" fontSize="9" fontWeight="700" fontFamily="ui-monospace,monospace">TOTAL REJECT</text>
      <text x="528" y="349" textAnchor="middle" fill="#f0b298" fontSize="12" fontFamily="ui-monospace,monospace" fontWeight="700">{f(calc.totalReject)} {volUnit}</text>
      <text x="528" y="362" textAnchor="middle" fill="#d4a857" fontSize="8" fontFamily="ui-monospace,monospace">{fmtC(calc.totalRejectTDS)} µS/cm</text>
      <rect x="595" y="324" width="28" height="12" rx="2" fill={sc[calc.totalRejectStatus]} opacity="0.15" stroke={sc[calc.totalRejectStatus]} strokeWidth="0.5"/>
      <text x="609" y="333" textAnchor="middle" fill={sc[calc.totalRejectStatus]} fontSize="7" fontWeight="700" fontFamily="ui-monospace,monospace">{calc.totalRejectStatus}</text>
      <line x1="320" y1="310" x2="430" y2="340" stroke="#c97a5d" strokeWidth="1" strokeDasharray="2,2"/>
      <line x1="605" y1="310" x2="615" y2="335" stroke="#c97a5d" strokeWidth="1" strokeDasharray="2,2"/>
    </svg>
  );
});

function LossBreakdown({ calc, fmtC, vol, volUnit }) {
  const total=calc.totalReject, ufPct=total>0?(calc.ufRejectFlow/total)*100:0, roPct=total>0?(calc.roRejectFlow/total)*100:0;
  const ufF=calc.feedFlow>0?(calc.ufRejectFlow/calc.feedFlow)*100:0, roF=calc.feedFlow>0?(calc.roRejectFlow/calc.feedFlow)*100:0;
  const f=(n)=>isFinite(n)?n.toFixed(1):'—';
  return (
    <div style={{padding:'18px 22px'}}>
      <div style={{display:'flex',height:50,borderRadius:3,overflow:'hidden',background:'#0a1410'}}>
        <div style={{width:`${ufPct}%`,background:'linear-gradient(180deg,#c97a5d,#a8624a)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:11,fontFamily:'ui-monospace,monospace',fontWeight:600,minWidth:ufPct>8?'auto':0,transition:'width 0.3s'}}>{ufPct>8&&`UF ${ufPct.toFixed(0)}%`}</div>
        <div style={{width:`${roPct}%`,background:'linear-gradient(180deg,#d4a857,#b08940)',display:'flex',alignItems:'center',justifyContent:'center',color:'#1a1a14',fontSize:11,fontFamily:'ui-monospace,monospace',fontWeight:700,minWidth:roPct>8?'auto':0,transition:'width 0.3s'}}>{roPct>8&&`RO ${roPct.toFixed(0)}%`}</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginTop:16}} className="ufro-loss-grid">
        <div style={S.lossItem}><div style={{...S.lossDot,background:'#c97a5d'}}/><div style={{flex:1}}>
          <div style={S.lossLabel}>UF Loss <StatusBadge status={calc.ufRejectStatus} small /></div>
          <div style={S.lossVal}>{f(vol(calc.ufRejectFlow))} {volUnit}</div>
          <div style={S.lossSub}>{ufF.toFixed(1)}% of feed · Cond {fmtC(calc.ufRejectTDS)}</div>
        </div></div>
        <div style={S.lossItem}><div style={{...S.lossDot,background:'#d4a857'}}/><div style={{flex:1}}>
          <div style={S.lossLabel}>RO Loss <StatusBadge status={calc.roRejectStatus} small /></div>
          <div style={S.lossVal}>{f(vol(calc.roRejectFlow))} {volUnit}</div>
          <div style={S.lossSub}>{roF.toFixed(1)}% of feed · Cond {fmtC(calc.roRejectTDS)}</div>
        </div></div>
      </div>
    </div>
  );
}

// ────────────── Styles ──────────────
const mono = "'JetBrains Mono',ui-monospace,monospace";
const thai = "'IBM Plex Sans Thai','JetBrains Mono',sans-serif";
const serif = "'Fraunces',serif";

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,700&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap');
  *{box-sizing:border-box}
  input[type="range"]{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;width:100%}
  input[type="range"]::-webkit-slider-runnable-track{height:2px;background:#2a4538;border-radius:1px}
  input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;height:14px;width:14px;border-radius:2px;background:#d4a857;margin-top:-6px;border:1px solid #1a1a10}
  input[type="range"]::-moz-range-track{height:2px;background:#2a4538}
  input[type="range"]::-moz-range-thumb{height:14px;width:14px;border-radius:2px;background:#d4a857;border:1px solid #1a1a10}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}

  /* MOBILE RESPONSIVE (#2) */
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
  @media(max-width:480px){
    .ufro-kpi-strip{grid-template-columns:1fr!important}
  }
`;

const S = {
  root:{minHeight:'100vh',background:'radial-gradient(ellipse at top,#0e1a14,#060c09)',color:'#cde7d2',fontFamily:thai,padding:20,
    backgroundImage:'radial-gradient(ellipse at top,#0e1a14,#060c09),repeating-linear-gradient(0deg,rgba(93,163,119,0.025) 0px,rgba(93,163,119,0.025) 1px,transparent 1px,transparent 24px),repeating-linear-gradient(90deg,rgba(93,163,119,0.025) 0px,rgba(93,163,119,0.025) 1px,transparent 1px,transparent 24px)',backgroundBlendMode:'normal,overlay,overlay'},
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
  resetBtn:{background:'transparent',border:'1px solid #c97a5d',color:'#e09a7e',fontSize:9,padding:'4px 10px',borderRadius:3,cursor:'pointer',fontFamily:mono,letterSpacing:'0.1em',fontWeight:600,transition:'all 0.2s'},
  statusDot:{width:8,height:8,borderRadius:'50%',background:'#5da377',animation:'pulse 2s infinite'},
  statusText:{fontSize:9,color:'#7ba386',letterSpacing:'0.15em'},

  grid:{display:'grid',gridTemplateColumns:'340px 1fr',gap:20},
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
  ratioBar:{display:'flex',justifyContent:'space-between',padding:'5px 8px',background:'rgba(93,163,119,0.08)',border:'1px solid #3a6049',borderRadius:3,marginBottom:8,fontSize:9,color:'#9bc7a4',fontFamily:mono},
  ratioBarWarn:{background:'rgba(201,122,93,0.08)',borderColor:'#c97a5d',color:'#e09a7e'},
  ratioMsg:{fontWeight:600},
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
  infoBox:{marginTop:10,padding:8,background:'rgba(93,163,119,0.08)',border:'1px solid #3a6049',borderRadius:3},
  infoTitle:{fontSize:10,fontWeight:700,color:'#9bc7a4',letterSpacing:'0.1em'},infoText:{fontSize:10,color:'#cde7d2',marginTop:3,lineHeight:1.5},
  main:{display:'flex',flexDirection:'column',gap:14},
  allocCard:{background:'linear-gradient(180deg,rgba(212,168,87,0.08),rgba(13,26,20,0.6))',border:'1px solid #d4a857',borderRadius:6,overflow:'hidden',boxShadow:'0 4px 20px rgba(212,168,87,0.1)'},
  allocSub:{fontSize:11,color:'#cde7d2',marginLeft:12,fontWeight:400,letterSpacing:'normal',textTransform:'none'},
  allocGrid:{padding:'14px 18px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10},
  allocItem:{background:'rgba(10,20,16,0.6)',border:'1px solid #3a3018',borderRadius:4,padding:'10px 12px',transition:'opacity 0.2s'},
  allocName:{fontSize:10,color:'#9bc7a4',marginBottom:4},
  allocFlow:{fontSize:20,color:'#f0d488',fontFamily:serif,fontWeight:600,fontVariantNumeric:'tabular-nums'},
  allocUnit:{fontSize:10,color:'#b89a55',fontFamily:mono},allocSecondary:{fontSize:9,color:'#7ba386',fontFamily:mono,marginTop:2},
  allocBar:{height:3,background:'#0a1410',borderRadius:2,overflow:'hidden',margin:'6px 0 4px'},allocBarFill:{height:'100%',background:'linear-gradient(90deg,#d4a857,#f0d488)',transition:'width 0.3s'},
  allocMeta:{fontSize:9,color:'#7ba386',display:'flex',gap:5,alignItems:'center',fontFamily:mono},
  kpiStrip:{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10},
  kpi:{background:'rgba(13,26,20,0.6)',border:'1px solid #1f3528',borderRadius:4,padding:'10px 12px'},
  kpiHi:{borderColor:'#d4a857',background:'rgba(212,168,87,0.06)'},kpiWarn:{borderColor:'#c97a5d',background:'rgba(201,122,93,0.05)'},
  kpiLabel:{fontSize:8,color:'#7ba386',letterSpacing:'0.15em',textTransform:'uppercase',marginBottom:5,fontFamily:mono,display:'flex',alignItems:'center',gap:6},
  kpiRow:{display:'flex',alignItems:'baseline',gap:4},
  kpiVal:{fontSize:20,fontWeight:600,color:'#e8f0e8',fontVariantNumeric:'tabular-nums',fontFamily:serif},kpiUnit:{fontSize:9,color:'#5da377',fontFamily:mono},
  kpiSub:{fontSize:8,color:'#7ba386',marginTop:3,fontFamily:mono},kpiSecondary:{fontSize:8,color:'#5da377',marginTop:2,fontFamily:mono,opacity:0.7},
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
  exportBtn:{background:'transparent',border:'1px solid #3a6049',color:'#9bc7a4',fontSize:8,padding:'3px 8px',borderRadius:2,cursor:'pointer',fontFamily:mono,letterSpacing:'0.1em',fontWeight:600,transition:'all 0.2s'},
  lossCard:{background:'rgba(13,26,20,0.6)',border:'1px solid #1f3528',borderRadius:4,overflow:'hidden'},
  tableCard:{background:'rgba(13,26,20,0.6)',border:'1px solid #1f3528',borderRadius:4,overflow:'hidden'},
  recCard:{background:'rgba(201,122,93,0.04)',border:'1px solid #c97a5d',borderRadius:4,overflow:'hidden'},
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
