import React, { useState, useMemo, useEffect } from 'react';

export default function UFROCalculator() {
  const [mode, setMode] = useState('know-output');
  const [strategy, setStrategy] = useState('optimize'); // 'equal' | 'optimize' | 'manual'

  const [sources, setSources] = useState([
    { id: 1, name: 'แหล่งน้ำ A', flow: 200, ratio: 100, tds: 1018, enabled: true },
    { id: 2, name: 'แหล่งน้ำ B', flow: 0,   ratio: 0,   tds: 800,  enabled: false },
    { id: 3, name: 'แหล่งน้ำ C', flow: 0,   ratio: 0,   tds: 600,  enabled: false },
    { id: 4, name: 'แหล่งน้ำ D', flow: 0,   ratio: 0,   tds: 400,  enabled: false },
    { id: 5, name: 'แหล่งน้ำ E', flow: 0,   ratio: 0,   tds: 1200, enabled: false },
  ]);

  const [targetTDS, setTargetTDS] = useState(337);
  const [productFlow, setProductFlow] = useState(146);

  const [ufReject, setUfReject] = useState(10);
  const [roReject, setRoReject] = useState(25);
  const [roSaltRejection, setRoSaltRejection] = useState(96.56);

  // ---- AUTO-OPTIMIZATION ----
  // When in know-output mode + auto strategy, compute optimal ratios
  useEffect(() => {
    if (mode !== 'know-output') return;
    if (strategy === 'manual') return;

    const enabled = sources.filter(s => s.enabled);
    if (enabled.length === 0) return;

    let newRatios;

    if (strategy === 'equal') {
      // Equal split
      const each = 100 / enabled.length;
      newRatios = enabled.map(s => ({ id: s.id, ratio: each }));
    } else if (strategy === 'optimize') {
      // Strategy: find combination that maximizes overall recovery
      // Insight: lower mixed TDS (closer to but >= target) = better recovery
      // Algorithm:
      //   - If any source TDS <= target: use that source 100% (or proportionally for low-TDS sources)
      //   - Else: weight inversely to TDS (lower TDS gets higher ratio)
      //   - But cap to avoid mixed TDS < target

      const minTDS = Math.min(...enabled.map(s => s.tds));
      const maxTDS = Math.max(...enabled.map(s => s.tds));

      if (minTDS <= targetTDS) {
        // Use only sources with TDS <= target, weighted equally among them
        const lowSources = enabled.filter(s => s.tds <= targetTDS);
        const each = 100 / lowSources.length;
        newRatios = enabled.map(s => ({
          id: s.id,
          ratio: s.tds <= targetTDS ? each : 0
        }));
      } else {
        // All sources have TDS > target → inverse-TDS weighting
        // Weight each source by 1/TDS, normalize to 100
        const weights = enabled.map(s => 1 / s.tds);
        const sumW = weights.reduce((a, b) => a + b, 0);
        newRatios = enabled.map((s, i) => ({
          id: s.id,
          ratio: (weights[i] / sumW) * 100
        }));
      }
    }

    // Apply only if different (avoid infinite loop)
    setSources(prev => {
      const updated = prev.map(s => {
        const r = newRatios.find(x => x.id === s.id);
        if (r && Math.abs((s.ratio || 0) - r.ratio) > 0.01) {
          return { ...s, ratio: Math.round(r.ratio * 10) / 10 };
        }
        return s;
      });
      // check if any changed
      const changed = updated.some((s, i) => s.ratio !== prev[i].ratio);
      return changed ? updated : prev;
    });
  }, [mode, strategy, sources.map(s => `${s.id}-${s.enabled}-${s.tds}`).join(','), targetTDS]);

  // ---- Mixed Feed Calculation ----
  const mixedFeed = useMemo(() => {
    const active = sources.filter(s => s.enabled);

    if (mode === 'know-input') {
      const totalFlow = active.reduce((sum, s) => sum + (s.flow || 0), 0);
      if (totalFlow === 0) return { flow: 0, tds: 0, sources: [] };
      const tds = active.reduce((sum, s) => sum + (s.flow || 0) * (s.tds || 0), 0) / totalFlow;
      return {
        flow: totalFlow,
        tds,
        sources: active.map(s => ({
          ...s,
          actualFlow: s.flow || 0,
          actualRatio: totalFlow > 0 ? ((s.flow || 0) / totalFlow) * 100 : 0
        }))
      };
    } else {
      const usable = active.filter(s => (s.ratio || 0) > 0);
      const totalRatio = usable.reduce((sum, s) => sum + (s.ratio || 0), 0);
      if (totalRatio === 0) return { flow: 0, tds: 0, sources: active, totalRatio: 0 };
      const tds = usable.reduce((sum, s) => sum + (s.ratio || 0) * (s.tds || 0), 0) / totalRatio;
      return { flow: 0, tds, sources: active, totalRatio };
    }
  }, [sources, mode]);

  // ---- Process Calculation ----
  const calc = useMemo(() => {
    const ufR = (100 - ufReject) / 100;
    const roR = (100 - roReject) / 100;
    const rej = roSaltRejection / 100;

    const feedTDS = mixedFeed.tds;
    const roPermTDS = feedTDS * (1 - rej);
    const roRejectTDS = roR < 1 ? (feedTDS - roR * roPermTDS) / (1 - roR) : feedTDS;

    let blendRatio = (targetTDS - roPermTDS) / (feedTDS - roPermTDS);
    let blendValid = true;
    let blendWarning = '';
    let bypassRO = false;

    if (feedTDS === 0) {
      blendValid = false;
      blendWarning = 'ยังไม่ได้กรอกแหล่งน้ำ';
      blendRatio = 0;
    } else if (feedTDS <= targetTDS) {
      // No RO needed — feed already meets target
      blendValid = true;
      bypassRO = true;
      blendRatio = 1;
      blendWarning = '';
    } else if (targetTDS < roPermTDS) {
      blendValid = false;
      blendWarning = `เป้าหมาย TDS (${targetTDS}) ต่ำกว่าค่า RO permeate (${roPermTDS.toFixed(1)} mg/L)`;
      blendRatio = 0;
    } else {
      blendRatio = Math.max(0, Math.min(1, blendRatio));
    }

    let feedFlow, ufOut, ufBypass, roIn, roOut, roRejectFlow, ufRejectFlow, totalReject, finalProduct;

    if (mode === 'know-output') {
      finalProduct = productFlow;
      ufBypass = blendRatio * finalProduct;
      roOut = (1 - blendRatio) * finalProduct;
      roIn = roR > 0 ? roOut / roR : 0;
      roRejectFlow = roIn - roOut;
      ufOut = ufBypass + roIn;
      feedFlow = ufR > 0 ? ufOut / ufR : 0;
      ufRejectFlow = feedFlow - ufOut;
      totalReject = ufRejectFlow + roRejectFlow;
    } else {
      feedFlow = mixedFeed.flow;
      ufOut = feedFlow * ufR;
      ufRejectFlow = feedFlow - ufOut;
      const denom = roR * blendRatio + (1 - blendRatio);
      roIn = denom > 0 ? ufOut * (1 - blendRatio) / denom : 0;
      roOut = roR * roIn;
      ufBypass = ufOut - roIn;
      roRejectFlow = roIn - roOut;
      finalProduct = ufBypass + roOut;
      totalReject = ufRejectFlow + roRejectFlow;
    }

    const overallRecovery = feedFlow > 0 ? (finalProduct / feedFlow) * 100 : 0;
    const actualProductTDS = bypassRO ? feedTDS : (blendRatio * feedTDS + (1 - blendRatio) * roPermTDS);

    const tdsInFeed = feedFlow * feedTDS;
    const tdsInProduct = finalProduct * actualProductTDS;
    const tdsInTotalReject = tdsInFeed - tdsInProduct;
    const totalRejectTDS = totalReject > 0 ? tdsInTotalReject / totalReject : 0;

    let sourceAllocations = [];
    if (mode === 'know-output' && mixedFeed.totalRatio > 0) {
      sourceAllocations = mixedFeed.sources.map(s => ({
        ...s,
        actualFlow: feedFlow * ((s.ratio || 0) / mixedFeed.totalRatio),
        actualRatio: ((s.ratio || 0) / mixedFeed.totalRatio) * 100
      }));
    } else {
      sourceAllocations = mixedFeed.sources;
    }

    return {
      feedFlow, ufOut, ufBypass, roIn, roOut, roRejectFlow, ufRejectFlow,
      totalReject, finalProduct, blendRatio,
      feedTDS, ufPermTDS: feedTDS, ufRejectTDS: feedTDS,
      roPermTDS, roRejectTDS, totalRejectTDS, actualProductTDS,
      overallRecovery,
      blendValid, blendWarning, bypassRO,
      sourceAllocations,
      totalRatio: mixedFeed.totalRatio || 0
    };
  }, [mixedFeed, targetTDS, productFlow, ufReject, roReject, roSaltRejection, mode]);

  const updateSource = (id, field, value) => {
    setSources(sources.map(s => s.id === id ? { ...s, [field]: value } : s));
    // If user manually edits ratio, switch strategy to manual
    if (mode === 'know-output' && field === 'ratio') {
      setStrategy('manual');
    }
  };

  const fmt = (n, d = 1) => isFinite(n) && !isNaN(n) ? n.toFixed(d) : '—';

  return (
    <div style={styles.root}>
      <style>{globalCSS}</style>

      {/* HEADER with professional mode toggle */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoMark}>◐</div>
          <div>
            <div style={styles.title}>UF · RO RECOVERY CALCULATOR</div>
            <div style={styles.subtitle}>JYN Reuse Water — Engineering Toolkit</div>
          </div>
        </div>

        <div style={styles.headerCenter}>
          <div style={styles.modeToggle}>
            <button
              style={{
                ...styles.modeToggleBtn,
                ...(mode === 'know-input' ? styles.modeToggleBtnActive : {})
              }}
              onClick={() => setMode('know-input')}
              title="ฉันรู้ว่ามีน้ำเข้าเท่าไร — อยากรู้ว่าจะได้น้ำผลิตเท่าไร"
            >
              <span style={styles.modeToggleLabel}>FEED</span>
              <span style={styles.modeToggleArrow}>→</span>
              <span style={{...styles.modeToggleQ, ...(mode === 'know-input' ? styles.modeToggleQActive : {})}}>?</span>
            </button>
            <button
              style={{
                ...styles.modeToggleBtn,
                ...(mode === 'know-output' ? styles.modeToggleBtnActive : {})
              }}
              onClick={() => setMode('know-output')}
              title="ฉันต้องการน้ำผลิตเท่านี้ — อยากรู้ว่าต้องใช้น้ำเข้าเท่าไร"
            >
              <span style={{...styles.modeToggleQ, ...(mode === 'know-output' ? styles.modeToggleQActive : {})}}>?</span>
              <span style={styles.modeToggleArrow}>→</span>
              <span style={styles.modeToggleLabel}>PRODUCT</span>
            </button>
          </div>
          <div style={styles.modeDescription}>
            {mode === 'know-input'
              ? 'ทราบ Feed → คำนวณ Product'
              : 'ทราบ Product → คำนวณ Feed'}
          </div>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.statusDot} />
          <span style={styles.statusText}>{calc.blendValid ? 'READY' : 'CHECK INPUT'}</span>
        </div>
      </header>

      <div style={styles.grid}>
        {/* LEFT SIDEBAR */}
        <aside style={styles.sidebar}>
          {/* Sources */}
          <div style={styles.sectionLabel}>
            แหล่งน้ำดิบ {mode === 'know-input' ? '— ระบุปริมาณ' : ''}
          </div>

          {/* Strategy selector — only in know-output mode */}
          {mode === 'know-output' && (
            <div style={styles.strategyBox}>
              <div style={styles.strategyHeader}>
                <span style={styles.strategyLabel}>วิธีจัดสรร</span>
                {strategy === 'manual' && (
                  <span style={styles.strategyManualTag}>MANUAL</span>
                )}
              </div>
              <div style={styles.strategyTabs}>
                <button
                  style={{
                    ...styles.strategyTab,
                    ...(strategy === 'optimize' ? styles.strategyTabActive : {})
                  }}
                  onClick={() => setStrategy('optimize')}
                >
                  Optimize
                </button>
                <button
                  style={{
                    ...styles.strategyTab,
                    ...(strategy === 'equal' ? styles.strategyTabActive : {})
                  }}
                  onClick={() => setStrategy('equal')}
                >
                  Equal Split
                </button>
                <button
                  style={{
                    ...styles.strategyTab,
                    ...(strategy === 'manual' ? styles.strategyTabActive : {})
                  }}
                  onClick={() => setStrategy('manual')}
                >
                  Manual
                </button>
              </div>
              <div style={styles.strategyHint}>
                {strategy === 'optimize' && 'ระบบเลือกแหล่งน้ำ TDS ต่ำเป็นหลัก เพื่อ recovery สูงสุด'}
                {strategy === 'equal' && 'แบ่งสัดส่วนเท่ากันทุกแหล่งที่เปิดใช้งาน'}
                {strategy === 'manual' && 'ปรับสัดส่วนเองในช่อง Ratio ของแต่ละแหล่ง'}
              </div>
            </div>
          )}

          {mode === 'know-output' && mixedFeed.totalRatio > 0 && (
            <div style={{
              ...styles.ratioStatus,
              ...(Math.abs(calc.totalRatio - 100) > 0.5 ? styles.ratioStatusWarn : {})
            }}>
              <span>รวมสัดส่วน {fmt(calc.totalRatio, 1)}%</span>
              {Math.abs(calc.totalRatio - 100) > 0.5 ? (
                <span style={styles.ratioStatusMsg}>
                  จะ normalize เป็น 100%
                </span>
              ) : (
                <span style={{...styles.ratioStatusMsg, color: '#5da377'}}>✓ สมดุล</span>
              )}
            </div>
          )}

          <div style={styles.sourcesContainer}>
            {sources.map((s, idx) => (
              <SourceCard
                key={s.id}
                index={idx + 1}
                source={s}
                mode={mode}
                strategy={strategy}
                onChange={(field, val) => updateSource(s.id, field, val)}
              />
            ))}
          </div>

          <div style={styles.mixedSummary}>
            <div style={styles.mixedHeader}>น้ำดิบผสม (MIXED FEED)</div>
            <div style={styles.mixedRow}>
              <span style={styles.mixedLabel}>{mode === 'know-output' ? 'Flow ที่ต้องใช้' : 'Total Flow'}</span>
              <span style={styles.mixedValue}>{fmt(calc.feedFlow, 1)} <em>m³/h</em></span>
            </div>
            <div style={styles.mixedRow}>
              <span style={styles.mixedLabel}>Weighted TDS</span>
              <span style={styles.mixedValue}>{fmt(calc.feedTDS, 0)} <em>mg/L</em></span>
            </div>
          </div>

          <div style={styles.sectionLabel}>
            {mode === 'know-output' ? 'น้ำผลิตที่ต้องการ' : 'TDS น้ำผลิตที่ต้องการ'}
          </div>
          <InputRow
            label="TDS น้ำผลิต"
            unit="mg/L"
            value={targetTDS}
            onChange={setTargetTDS}
            accent
          />
          {mode === 'know-output' && (
            <InputRow
              label="ปริมาณน้ำผลิต"
              unit="m³/h"
              value={productFlow}
              onChange={setProductFlow}
              accent
            />
          )}

          <div style={styles.sectionLabel}>การตั้งค่าเมมเบรน</div>
          <SliderRow
            label="UF Reject"
            value={ufReject}
            onChange={setUfReject}
            min={2} max={30} step={0.5} unit="%"
            hint="% น้ำที่ทิ้งจาก UF"
          />
          <SliderRow
            label="RO Reject"
            value={roReject}
            onChange={setRoReject}
            min={10} max={50} step={0.5} unit="%"
            hint="% น้ำที่ทิ้งเป็น concentrate"
          />
          <SliderRow
            label="RO Salt Rejection"
            value={roSaltRejection}
            onChange={setRoSaltRejection}
            min={90} max={99.9} step={0.1} unit="%"
            hint="ประสิทธิภาพการกำจัดเกลือ"
          />

          {!calc.blendValid && (
            <div style={styles.warningBox}>
              <div style={styles.warningTitle}>⚠ ตรวจสอบข้อมูล</div>
              <div style={styles.warningText}>{calc.blendWarning}</div>
            </div>
          )}

          {calc.bypassRO && (
            <div style={styles.infoBox}>
              <div style={styles.infoTitle}>ℹ น้ำดิบบริสุทธิ์พอแล้ว</div>
              <div style={styles.infoText}>
                Mixed feed TDS ({fmt(calc.feedTDS, 0)}) ≤ target ({targetTDS})<br/>
                ไม่ต้องผ่าน RO
              </div>
            </div>
          )}
        </aside>

        {/* RIGHT MAIN */}
        <main style={styles.main}>
          {/* Allocation card — prominent in know-output mode */}
          {mode === 'know-output' && calc.blendValid && calc.sourceAllocations.length > 0 && (
            <div style={styles.allocationCard}>
              <div style={styles.cardHeader}>
                <div>
                  <span style={styles.cardLabel}>SOURCE ALLOCATION</span>
                  <span style={styles.allocationSubtitle}>ต้องดึงน้ำจากแต่ละแหล่งเท่าไร</span>
                </div>
                <span style={styles.cardMeta}>
                  Strategy: <strong style={{color: '#d4a857'}}>{strategy.toUpperCase()}</strong>
                </span>
              </div>
              <div style={styles.allocationGrid}>
                {calc.sourceAllocations.map((s) => (
                  <div key={s.id} style={{
                    ...styles.allocationItem,
                    ...(s.actualRatio < 0.1 ? styles.allocationItemDim : {})
                  }}>
                    <div style={styles.allocationName}>{s.name}</div>
                    <div style={styles.allocationFlow}>
                      {fmt(s.actualFlow, 1)}
                      <span style={styles.allocationUnit}> m³/h</span>
                    </div>
                    <div style={styles.allocationBar}>
                      <div style={{
                        ...styles.allocationBarFill,
                        width: `${Math.min(100, s.actualRatio)}%`
                      }} />
                    </div>
                    <div style={styles.allocationMeta}>
                      <span style={{color: '#d4a857', fontWeight: 600}}>{fmt(s.actualRatio, 1)}%</span>
                      <span style={styles.allocationDot}>•</span>
                      <span>TDS {Math.round(s.tds)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPIs */}
          <div style={styles.kpiStrip}>
            <KPI
              label="น้ำดิบที่ต้องใช้"
              value={fmt(calc.feedFlow, 1)} unit="m³/h"
              sub={`TDS ${fmt(calc.feedTDS, 0)}`}
              highlight={mode === 'know-output'}
            />
            <KPI
              label="น้ำผลิต"
              value={fmt(calc.finalProduct, 1)} unit="m³/h"
              sub={`TDS ${fmt(calc.actualProductTDS, 0)}`}
              highlight={mode === 'know-input'}
            />
            <KPI
              label="น้ำสูญเสียรวม"
              value={fmt(calc.totalReject, 1)} unit="m³/h"
              sub={`TDS ${fmt(calc.totalRejectTDS, 0)}`}
              warning
            />
            <KPI label="Overall Recovery" value={fmt(calc.overallRecovery, 1)} unit="%" />
            <KPI
              label="Blend Ratio"
              value={`${fmt(calc.blendRatio * 100, 0)}:${fmt((1 - calc.blendRatio) * 100, 0)}`}
              unit="UF:RO"
            />
          </div>

          {/* Process Diagram */}
          <div style={styles.diagramCard}>
            <div style={styles.cardHeader}>
              <span style={styles.cardLabel}>PROCESS FLOW DIAGRAM · WITH TDS</span>
              <span style={styles.cardMeta}>mass balance ✓</span>
            </div>
            <ProcessDiagram calc={calc} sources={calc.sourceAllocations} />
          </div>

          {/* Loss */}
          <div style={styles.lossCard}>
            <div style={styles.cardHeader}>
              <span style={styles.cardLabel}>WATER LOSS BREAKDOWN</span>
              <span style={styles.cardMeta}>by stage</span>
            </div>
            <LossBreakdown calc={calc} />
          </div>

          {/* Stream Table */}
          <div style={styles.tableCard}>
            <div style={styles.cardHeader}>
              <span style={styles.cardLabel}>COMPLETE STREAM TABLE</span>
              <span style={styles.cardMeta}>{mode === 'know-output' ? 'PRODUCT-TO-FEED' : 'FEED-TO-PRODUCT'}</span>
            </div>
            <div style={{overflowX: 'auto'}}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Stream</th>
                    <th style={{...styles.th, textAlign: 'right'}}>Flow (m³/h)</th>
                    <th style={{...styles.th, textAlign: 'right'}}>TDS (mg/L)</th>
                    <th style={{...styles.th, textAlign: 'right'}}>Load (kg/h)</th>
                    <th style={{...styles.th, textAlign: 'right'}}>% of Feed</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.sourceAllocations.map((s) => (
                    <StreamRow key={s.id}
                      name={`├─ ${s.name}`}
                      flow={s.actualFlow} tds={s.tds}
                      pct={s.actualRatio}
                      sub
                    />
                  ))}
                  <StreamRow name="① Mixed Raw Feed" flow={calc.feedFlow} tds={calc.feedTDS} pct={100} bold />
                  <StreamRow name="② UF Permeate (SS removed)" flow={calc.ufOut} tds={calc.ufPermTDS} pct={calc.ufOut / calc.feedFlow * 100} />
                  <StreamRow name="③ UF Reject" flow={calc.ufRejectFlow} tds={calc.ufRejectTDS} pct={calc.ufRejectFlow / calc.feedFlow * 100} loss />
                  <StreamRow name="④ → RO Feed" flow={calc.roIn} tds={calc.feedTDS} pct={calc.roIn / calc.feedFlow * 100} />
                  <StreamRow name="⑤ UF Bypass (to blend)" flow={calc.ufBypass} tds={calc.feedTDS} pct={calc.ufBypass / calc.feedFlow * 100} accent />
                  <StreamRow name="⑥ RO Permeate" flow={calc.roOut} tds={calc.roPermTDS} pct={calc.roOut / calc.feedFlow * 100} />
                  <StreamRow name="⑦ RO Reject (Concentrate)" flow={calc.roRejectFlow} tds={calc.roRejectTDS} pct={calc.roRejectFlow / calc.feedFlow * 100} loss />
                  <StreamRow name="⑧ Total Combined Reject" flow={calc.totalReject} tds={calc.totalRejectTDS} pct={calc.totalReject / calc.feedFlow * 100} loss />
                  <StreamRow name="⑨ FINAL BLENDED PRODUCT" flow={calc.finalProduct} tds={calc.actualProductTDS} pct={calc.finalProduct / calc.feedFlow * 100} highlight />
                </tbody>
              </table>
            </div>
          </div>

          <footer style={styles.footer}>
            <div>
              <span style={styles.footLabel}>FORMULA</span>
              <span style={styles.footFormula}>
                Mixed TDS = Σ(Q·C) / ΣQ &nbsp;·&nbsp; Blend x = (C_target − C_RO) / (C_feed − C_RO)
              </span>
            </div>
            <div style={styles.footMeta}>v4.0 · AUTO-OPTIMIZE</div>
          </footer>
        </main>
      </div>
    </div>
  );
}

// ────────────── Components ──────────────

function SourceCard({ index, source, mode, strategy, onChange }) {
  const showRatioField = mode === 'know-output';
  const ratioReadOnly = mode === 'know-output' && strategy !== 'manual';

  return (
    <div style={{
      ...styles.sourceCard,
      ...(source.enabled ? styles.sourceCardActive : {})
    }}>
      <div style={styles.sourceHeader}>
        <button
          style={{
            ...styles.sourceToggle,
            ...(source.enabled ? styles.sourceToggleOn : {})
          }}
          onClick={() => onChange('enabled', !source.enabled)}
          title={source.enabled ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        >
          {source.enabled ? '●' : '○'}
        </button>
        <input
          type="text"
          value={source.name}
          onChange={e => onChange('name', e.target.value)}
          style={styles.sourceName}
          disabled={!source.enabled}
        />
        <span style={styles.sourceIndex}>S{index}</span>
      </div>
      {source.enabled && (
        <div style={styles.sourceInputs}>
          <div style={styles.sourceField}>
            <label style={styles.sourceFieldLabel}>TDS</label>
            <div style={styles.sourceInputWrap}>
              <input
                type="number"
                value={source.tds}
                onChange={e => onChange('tds', parseFloat(e.target.value) || 0)}
                style={styles.sourceInput}
              />
              <span style={styles.sourceUnit}>mg/L</span>
            </div>
          </div>
          <div style={styles.sourceField}>
            <label style={styles.sourceFieldLabel}>
              {mode === 'know-input' ? 'Flow' : (
                <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
                  Ratio
                  {ratioReadOnly && <span style={styles.autoTag}>AUTO</span>}
                </span>
              )}
            </label>
            <div style={{
              ...styles.sourceInputWrap,
              ...(ratioReadOnly ? styles.sourceInputWrapReadOnly : {})
            }}>
              <input
                type="number"
                value={mode === 'know-input' ? source.flow : (source.ratio || 0).toFixed(1)}
                onChange={e => onChange(
                  mode === 'know-input' ? 'flow' : 'ratio',
                  parseFloat(e.target.value) || 0
                )}
                style={styles.sourceInput}
                readOnly={ratioReadOnly}
              />
              <span style={styles.sourceUnit}>
                {mode === 'know-input' ? 'm³/h' : '%'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InputRow({ label, unit, value, onChange, accent }) {
  return (
    <div style={styles.inputRow}>
      <div style={styles.inputLabel}>{label}</div>
      <div style={{...styles.inputWrap, ...(accent ? styles.inputWrapAccent : {})}}>
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          style={styles.input}
        />
        <span style={styles.inputUnit}>{unit}</span>
      </div>
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step, unit, hint }) {
  return (
    <div style={styles.sliderRow}>
      <div style={styles.sliderHeader}>
        <span style={styles.sliderLabel}>{label}</span>
        <span style={styles.sliderValue}>{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={styles.slider}
      />
      {hint && <div style={styles.sliderHint}>{hint}</div>}
    </div>
  );
}

function KPI({ label, value, unit, sub, highlight, warning }) {
  return (
    <div style={{
      ...styles.kpi,
      ...(highlight ? styles.kpiHighlight : {}),
      ...(warning ? styles.kpiWarning : {})
    }}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={styles.kpiValueRow}>
        <span style={styles.kpiValue}>{value}</span>
        <span style={styles.kpiUnit}>{unit}</span>
      </div>
      {sub && <div style={styles.kpiSub}>{sub} mg/L</div>}
    </div>
  );
}

function StreamRow({ name, flow, tds, pct, highlight, loss, accent, sub, bold }) {
  const tdsLoad = isFinite(flow) && isFinite(tds) ? (flow * tds / 1000) : NaN;
  const rowStyle = {
    ...styles.tr,
    ...(highlight ? styles.trHighlight : {}),
    ...(loss ? styles.trLoss : {}),
    ...(accent ? styles.trAccent : {}),
    ...(sub ? styles.trSub : {}),
    ...(bold ? styles.trBold : {}),
  };
  return (
    <tr style={rowStyle}>
      <td style={styles.td}>{name}</td>
      <td style={{...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums'}}>{isFinite(flow) ? flow.toFixed(1) : '—'}</td>
      <td style={{...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tds < 100 ? '#9bc7a4' : tds > 2000 ? '#e09a7e' : '#cde7d2'}}>{isFinite(tds) ? tds.toFixed(0) : '—'}</td>
      <td style={{...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#8a9'}}>{isFinite(tdsLoad) ? tdsLoad.toFixed(2) : '—'}</td>
      <td style={{...styles.td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#8a9'}}>{isFinite(pct) ? pct.toFixed(1) : '—'}%</td>
    </tr>
  );
}

function ProcessDiagram({ calc, sources }) {
  const f = (n) => isFinite(n) && !isNaN(n) ? n.toFixed(1) : '—';
  const fInt = (n) => isFinite(n) && !isNaN(n) ? Math.round(n) : '—';

  const activeSources = sources.filter(s => (s.actualFlow !== undefined ? s.actualFlow : s.flow) > 0.01);
  const sourceHeight = 28;
  const sourceY = (i, total) => {
    const spacing = sourceHeight + 4;
    const startY = 170 - ((total - 1) * spacing) / 2 - sourceHeight / 2;
    return startY + i * spacing;
  };

  return (
    <svg viewBox="0 0 1000 380" style={{width: '100%', height: 'auto'}} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#5da377"/>
        </marker>
        <marker id="arrLoss" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#c97a5d"/>
        </marker>
        <marker id="arrGold" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#d4a857"/>
        </marker>
      </defs>

      {activeSources.map((s, i) => {
        const y = sourceY(i, activeSources.length);
        const flow = s.actualFlow !== undefined ? s.actualFlow : s.flow;
        return (
          <g key={s.id}>
            <rect x="20" y={y} width="100" height={sourceHeight} rx="2"
                  fill="#0f2218" stroke="#3a6049" strokeWidth="1"/>
            <text x="70" y={y + 11} textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace, monospace" fontWeight="600">{s.name}</text>
            <text x="70" y={y + 22} textAnchor="middle" fill="#7ba386" fontSize="8" fontFamily="ui-monospace, monospace">{f(flow)} m³/h · {fInt(s.tds)}</text>
            <line x1="120" y1={y + sourceHeight/2} x2="170" y2="170" stroke="#3a6049" strokeWidth="1" />
          </g>
        );
      })}

      <circle cx="170" cy="170" r="10" fill="#1a3a2e" stroke="#5da377" strokeWidth="1.5"/>
      <text x="170" y="174" textAnchor="middle" fill="#9bc7a4" fontSize="10" fontFamily="ui-monospace, monospace">⊕</text>
      <text x="170" y="155" textAnchor="middle" fill="#7ba386" fontSize="8" fontFamily="ui-monospace, monospace">MIX</text>

      <line x1="180" y1="170" x2="270" y2="170" stroke="#5da377" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="225" y="160" textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace, monospace" fontWeight="600">{f(calc.feedFlow)} m³/h</text>
      <text x="225" y="184" textAnchor="middle" fill="#d4a857" fontSize="9" fontFamily="ui-monospace, monospace">TDS {fInt(calc.feedTDS)}</text>

      <g>
        <rect x="270" y="135" width="100" height="70" rx="3" fill="#0d2a20" stroke="#5da377" strokeWidth="2"/>
        <text x="320" y="158" textAnchor="middle" fill="#cde7d2" fontSize="13" fontWeight="700" fontFamily="ui-monospace, monospace">UF</text>
        <text x="320" y="174" textAnchor="middle" fill="#7ba386" fontSize="9" fontFamily="ui-monospace, monospace">Ultrafiltration</text>
        <text x="320" y="193" textAnchor="middle" fill="#cde7d2" fontSize="10" fontFamily="ui-monospace, monospace">reject {(100 - (calc.feedFlow > 0 ? calc.ufOut/calc.feedFlow*100 : 0)).toFixed(1)}%</text>
      </g>

      <line x1="320" y1="205" x2="320" y2="295" stroke="#c97a5d" strokeWidth="1.5" strokeDasharray="3,3" markerEnd="url(#arrLoss)"/>
      <text x="328" y="240" fill="#c97a5d" fontSize="9" fontFamily="ui-monospace, monospace">UF reject</text>
      <text x="328" y="252" fill="#e09a7e" fontSize="10" fontFamily="ui-monospace, monospace" fontWeight="600">{f(calc.ufRejectFlow)} m³/h</text>
      <text x="328" y="264" fill="#d4a857" fontSize="9" fontFamily="ui-monospace, monospace">TDS {fInt(calc.ufRejectTDS)}</text>

      <line x1="370" y1="170" x2="450" y2="170" stroke="#5da377" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="410" y="160" textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace, monospace" fontWeight="600">{f(calc.ufOut)} m³/h</text>
      <text x="410" y="184" textAnchor="middle" fill="#d4a857" fontSize="9" fontFamily="ui-monospace, monospace">TDS {fInt(calc.ufPermTDS)}</text>

      <circle cx="460" cy="170" r="6" fill="#1a3a2e" stroke="#5da377" strokeWidth="1.5"/>

      <path d="M 460 164 L 460 60 L 830 60" fill="none" stroke="#d4a857" strokeWidth="2" markerEnd="url(#arrGold)"/>
      <rect x="540" y="40" width="200" height="36" rx="3" fill="#1a1410" stroke="#d4a857" strokeWidth="1" opacity="0.95"/>
      <text x="640" y="54" textAnchor="middle" fill="#d4a857" fontSize="9" fontFamily="ui-monospace, monospace" fontWeight="700">UF BYPASS</text>
      <text x="640" y="68" textAnchor="middle" fill="#e8c876" fontSize="10" fontFamily="ui-monospace, monospace">{f(calc.ufBypass)} m³/h · TDS {fInt(calc.feedTDS)}</text>

      <line x1="466" y1="170" x2="550" y2="170" stroke="#5da377" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="508" y="160" textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace, monospace" fontWeight="600">{f(calc.roIn)} m³/h</text>
      <text x="508" y="184" textAnchor="middle" fill="#d4a857" fontSize="9" fontFamily="ui-monospace, monospace">TDS {fInt(calc.feedTDS)}</text>

      <g>
        <rect x="550" y="135" width="100" height="70" rx="3" fill="#0d2a20" stroke="#5da377" strokeWidth="2"/>
        <text x="600" y="158" textAnchor="middle" fill="#cde7d2" fontSize="13" fontWeight="700" fontFamily="ui-monospace, monospace">RO</text>
        <text x="600" y="174" textAnchor="middle" fill="#7ba386" fontSize="9" fontFamily="ui-monospace, monospace">1st Stage</text>
        <text x="600" y="193" textAnchor="middle" fill="#cde7d2" fontSize="10" fontFamily="ui-monospace, monospace">reject {(calc.roIn > 0 ? calc.roRejectFlow/calc.roIn*100 : 0).toFixed(1)}%</text>
      </g>

      <line x1="600" y1="205" x2="600" y2="295" stroke="#c97a5d" strokeWidth="1.5" strokeDasharray="3,3" markerEnd="url(#arrLoss)"/>
      <text x="608" y="240" fill="#c97a5d" fontSize="9" fontFamily="ui-monospace, monospace">RO reject</text>
      <text x="608" y="252" fill="#e09a7e" fontSize="10" fontFamily="ui-monospace, monospace" fontWeight="600">{f(calc.roRejectFlow)} m³/h</text>
      <text x="608" y="264" fill="#d4a857" fontSize="9" fontFamily="ui-monospace, monospace">TDS {fInt(calc.roRejectTDS)}</text>

      <line x1="650" y1="170" x2="830" y2="170" stroke="#5da377" strokeWidth="1.5" markerEnd="url(#arr)"/>
      <text x="740" y="160" textAnchor="middle" fill="#9bc7a4" fontSize="9" fontFamily="ui-monospace, monospace" fontWeight="600">{f(calc.roOut)} m³/h</text>
      <text x="740" y="184" textAnchor="middle" fill="#d4a857" fontSize="9" fontFamily="ui-monospace, monospace">TDS {fInt(calc.roPermTDS)}</text>

      <circle cx="835" cy="170" r="10" fill="#3a2e10" stroke="#d4a857" strokeWidth="2"/>
      <text x="835" y="174" textAnchor="middle" fill="#d4a857" fontSize="11" fontFamily="ui-monospace, monospace" fontWeight="700">⊕</text>
      <text x="835" y="153" textAnchor="middle" fill="#d4a857" fontSize="8" fontFamily="ui-monospace, monospace">BLEND</text>

      <line x1="845" y1="170" x2="910" y2="170" stroke="#d4a857" strokeWidth="2" markerEnd="url(#arrGold)"/>

      <g>
        <rect x="910" y="135" width="80" height="70" rx="3" fill="#3a2e10" stroke="#d4a857" strokeWidth="2"/>
        <text x="950" y="155" textAnchor="middle" fill="#f0d488" fontSize="10" fontWeight="700" fontFamily="ui-monospace, monospace">PRODUCT</text>
        <text x="950" y="173" textAnchor="middle" fill="#e8c876" fontSize="13" fontFamily="ui-monospace, monospace" fontWeight="700">{f(calc.finalProduct)}</text>
        <text x="950" y="184" textAnchor="middle" fill="#b89a55" fontSize="8" fontFamily="ui-monospace, monospace">m³/h</text>
        <text x="950" y="198" textAnchor="middle" fill="#d4a857" fontSize="9" fontFamily="ui-monospace, monospace">TDS {fInt(calc.actualProductTDS)}</text>
      </g>

      <g>
        <rect x="430" y="300" width="180" height="50" rx="3" fill="#2a1a14" stroke="#c97a5d" strokeWidth="1.5"/>
        <text x="520" y="318" textAnchor="middle" fill="#e09a7e" fontSize="10" fontWeight="700" fontFamily="ui-monospace, monospace">TOTAL REJECT</text>
        <text x="520" y="334" textAnchor="middle" fill="#f0b298" fontSize="12" fontFamily="ui-monospace, monospace" fontWeight="700">{f(calc.totalReject)} m³/h</text>
        <text x="520" y="346" textAnchor="middle" fill="#d4a857" fontSize="9" fontFamily="ui-monospace, monospace">TDS {fInt(calc.totalRejectTDS)}</text>
      </g>
      <line x1="320" y1="295" x2="430" y2="320" stroke="#c97a5d" strokeWidth="1" strokeDasharray="2,2"/>
      <line x1="600" y1="295" x2="610" y2="320" stroke="#c97a5d" strokeWidth="1" strokeDasharray="2,2"/>
    </svg>
  );
}

function LossBreakdown({ calc }) {
  const total = calc.totalReject;
  const ufPct = total > 0 ? (calc.ufRejectFlow / total) * 100 : 0;
  const roPct = total > 0 ? (calc.roRejectFlow / total) * 100 : 0;
  const ufOfFeed = calc.feedFlow > 0 ? (calc.ufRejectFlow / calc.feedFlow) * 100 : 0;
  const roOfFeed = calc.feedFlow > 0 ? (calc.roRejectFlow / calc.feedFlow) * 100 : 0;

  return (
    <div style={{padding: '20px 24px'}}>
      <div style={{display: 'flex', height: 56, borderRadius: 3, overflow: 'hidden', background: '#0a1410'}}>
        <div style={{
          width: `${ufPct}%`,
          background: 'linear-gradient(180deg, #c97a5d 0%, #a8624a 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 12, fontFamily: 'ui-monospace, monospace', fontWeight: 600,
          minWidth: ufPct > 8 ? 'auto' : 0, transition: 'width 0.3s',
        }}>
          {ufPct > 8 && `UF ${ufPct.toFixed(0)}%`}
        </div>
        <div style={{
          width: `${roPct}%`,
          background: 'linear-gradient(180deg, #d4a857 0%, #b08940 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#1a1a14', fontSize: 12, fontFamily: 'ui-monospace, monospace', fontWeight: 700,
          minWidth: roPct > 8 ? 'auto' : 0, transition: 'width 0.3s',
        }}>
          {roPct > 8 && `RO ${roPct.toFixed(0)}%`}
        </div>
      </div>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 18}}>
        <div style={styles.lossItem}>
          <div style={{...styles.lossDot, background: '#c97a5d'}}/>
          <div style={{flex: 1}}>
            <div style={styles.lossItemLabel}>UF Stage Loss</div>
            <div style={styles.lossItemValue}>{isFinite(calc.ufRejectFlow) ? calc.ufRejectFlow.toFixed(1) : '—'} m³/h</div>
            <div style={styles.lossItemSub}>{ufOfFeed.toFixed(1)}% ของน้ำดิบ · TDS {isFinite(calc.ufRejectTDS) ? calc.ufRejectTDS.toFixed(0) : '—'}</div>
          </div>
        </div>
        <div style={styles.lossItem}>
          <div style={{...styles.lossDot, background: '#d4a857'}}/>
          <div style={{flex: 1}}>
            <div style={styles.lossItemLabel}>RO Stage Loss</div>
            <div style={styles.lossItemValue}>{isFinite(calc.roRejectFlow) ? calc.roRejectFlow.toFixed(1) : '—'} m³/h</div>
            <div style={styles.lossItemSub}>{roOfFeed.toFixed(1)}% ของน้ำดิบ · TDS {isFinite(calc.roRejectTDS) ? calc.roRejectTDS.toFixed(0) : '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────── Styles ──────────────

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,300;9..144,500;9..144,700&family=IBM+Plex+Sans+Thai:wght@400;500;600&display=swap');

  * { box-sizing: border-box; }

  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
    width: 100%;
  }
  input[type="range"]::-webkit-slider-runnable-track {
    height: 2px;
    background: #2a4538;
    border-radius: 1px;
  }
  input[type="range"]::-moz-range-track {
    height: 2px;
    background: #2a4538;
    border-radius: 1px;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    height: 14px;
    width: 14px;
    border-radius: 2px;
    background: #d4a857;
    margin-top: -6px;
    border: 1px solid #1a1a10;
    transition: transform 0.15s;
  }
  input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.2);
  }
  input[type="range"]::-moz-range-thumb {
    height: 14px;
    width: 14px;
    border-radius: 2px;
    background: #d4a857;
    border: 1px solid #1a1a10;
  }

  input[type="number"]::-webkit-inner-spin-button,
  input[type="number"]::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  input[type="number"] { -moz-appearance: textfield; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
`;

const styles = {
  root: {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at top, #0e1a14 0%, #060c09 100%)',
    color: '#cde7d2',
    fontFamily: "'IBM Plex Sans Thai', 'JetBrains Mono', ui-monospace, monospace",
    padding: '20px',
    backgroundImage: `
      radial-gradient(ellipse at top, #0e1a14 0%, #060c09 100%),
      repeating-linear-gradient(0deg, rgba(93,163,119,0.025) 0px, rgba(93,163,119,0.025) 1px, transparent 1px, transparent 24px),
      repeating-linear-gradient(90deg, rgba(93,163,119,0.025) 0px, rgba(93,163,119,0.025) 1px, transparent 1px, transparent 24px)
    `,
    backgroundBlendMode: 'normal, overlay, overlay',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 16, borderBottom: '1px solid #1f3528',
    marginBottom: 20, gap: 24,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16, flex: '0 0 auto' },
  logoMark: { fontSize: 32, color: '#d4a857', lineHeight: 1 },
  title: {
    fontFamily: "'Fraunces', serif",
    fontSize: 22, fontWeight: 500,
    letterSpacing: '0.02em', color: '#e8f0e8',
  },
  subtitle: {
    fontSize: 11, color: '#7ba386',
    letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 2,
  },
  headerCenter: {
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 4, flex: 1,
  },
  modeToggle: {
    display: 'inline-flex',
    background: '#0a1410',
    border: '1px solid #1f3528',
    borderRadius: 4,
    padding: 3,
  },
  modeToggleBtn: {
    background: 'transparent',
    border: 'none',
    padding: '7px 14px',
    cursor: 'pointer',
    color: '#5da377',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 11,
    letterSpacing: '0.15em',
    fontWeight: 600,
    borderRadius: 2,
    transition: 'all 0.2s',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  },
  modeToggleBtnActive: {
    background: 'rgba(212, 168, 87, 0.12)',
    color: '#e8c876',
    boxShadow: 'inset 0 0 0 1px #d4a857',
  },
  modeToggleLabel: { fontWeight: 700 },
  modeToggleArrow: { opacity: 0.6, fontSize: 13 },
  modeToggleQ: {
    width: 16, height: 16, borderRadius: '50%',
    background: 'rgba(93, 163, 119, 0.15)',
    border: '1px solid #3a6049',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9,
    color: '#5da377',
  },
  modeToggleQActive: {
    background: 'rgba(212, 168, 87, 0.15)',
    borderColor: '#d4a857',
    color: '#d4a857',
  },
  modeDescription: {
    fontSize: 10,
    color: '#7ba386',
    letterSpacing: '0.1em',
    marginTop: 4,
    fontFamily: "'JetBrains Mono', monospace",
  },
  headerRight: {
    display: 'flex', alignItems: 'center', gap: 8,
    flex: '0 0 auto',
  },
  statusDot: {
    width: 8, height: 8, borderRadius: '50%',
    background: '#5da377', animation: 'pulse 2s infinite',
  },
  statusText: { fontSize: 10, color: '#7ba386', letterSpacing: '0.15em' },

  grid: {
    display: 'grid',
    gridTemplateColumns: '340px 1fr',
    gap: 20,
  },
  sidebar: {
    background: 'rgba(13, 26, 20, 0.6)',
    border: '1px solid #1f3528',
    borderRadius: 4, padding: 18,
    height: 'fit-content',
    backdropFilter: 'blur(8px)',
  },
  sectionLabel: {
    fontSize: 10, color: '#5da377',
    letterSpacing: '0.15em', fontWeight: 600,
    margin: '18px 0 10px 0', paddingBottom: 6,
    borderBottom: '1px dashed #2a4538',
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: 'uppercase',
  },

  // Strategy selector
  strategyBox: {
    background: '#0a1410',
    border: '1px solid #2a4538',
    borderRadius: 4,
    padding: 10,
    marginBottom: 10,
  },
  strategyHeader: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  strategyLabel: {
    fontSize: 10, color: '#9bc7a4',
    letterSpacing: '0.05em',
  },
  strategyManualTag: {
    fontSize: 8, padding: '2px 6px',
    background: '#3a3018', color: '#d4a857',
    borderRadius: 2, letterSpacing: '0.15em',
    fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
  },
  strategyTabs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: 3,
    background: '#060c09',
    padding: 3,
    borderRadius: 3,
  },
  strategyTab: {
    background: 'transparent',
    border: 'none',
    padding: '6px 4px',
    cursor: 'pointer',
    color: '#5da377',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 10,
    letterSpacing: '0.05em',
    borderRadius: 2,
    transition: 'all 0.15s',
  },
  strategyTabActive: {
    background: 'rgba(212, 168, 87, 0.12)',
    color: '#e8c876',
    boxShadow: 'inset 0 0 0 1px #d4a857',
  },
  strategyHint: {
    fontSize: 10, color: '#7ba386',
    marginTop: 8, lineHeight: 1.5,
    fontStyle: 'italic',
  },

  ratioStatus: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 10px',
    background: 'rgba(93, 163, 119, 0.08)',
    border: '1px solid #3a6049',
    borderRadius: 3,
    marginBottom: 10,
    fontSize: 10,
    color: '#9bc7a4',
    fontFamily: "'JetBrains Mono', monospace",
  },
  ratioStatusWarn: {
    background: 'rgba(201, 122, 93, 0.08)',
    borderColor: '#c97a5d',
    color: '#e09a7e',
  },
  ratioStatusMsg: { fontWeight: 600 },

  sourcesContainer: { display: 'flex', flexDirection: 'column', gap: 6 },
  sourceCard: {
    background: '#0a1410',
    border: '1px solid #1f3528',
    borderRadius: 3,
    padding: '8px 10px',
    transition: 'all 0.2s',
  },
  sourceCardActive: {
    background: 'rgba(93, 163, 119, 0.04)',
    borderColor: '#3a6049',
  },
  sourceHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  sourceToggle: {
    background: 'transparent', border: 'none',
    color: '#3a6049', fontSize: 16, cursor: 'pointer',
    padding: 0, lineHeight: 1, width: 16,
  },
  sourceToggleOn: { color: '#5da377' },
  sourceName: {
    flex: 1, background: 'transparent', border: 'none',
    color: '#cde7d2', fontSize: 11, fontFamily: 'inherit',
    outline: 'none', padding: '2px 4px',
  },
  sourceIndex: {
    fontSize: 9, color: '#5da377',
    letterSpacing: '0.1em', fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
  },
  sourceInputs: {
    display: 'grid', gridTemplateColumns: '1fr 1fr',
    gap: 6, marginTop: 8,
  },
  sourceField: {},
  sourceFieldLabel: {
    fontSize: 9, color: '#7ba386',
    letterSpacing: '0.1em', textTransform: 'uppercase',
    display: 'block', marginBottom: 3,
    fontFamily: "'JetBrains Mono', monospace",
  },
  autoTag: {
    fontSize: 7, padding: '1px 4px',
    background: '#3a3018', color: '#d4a857',
    borderRadius: 2, letterSpacing: '0.1em',
    fontWeight: 700, marginLeft: 2,
  },
  sourceInputWrap: {
    display: 'flex', alignItems: 'center',
    background: '#0a1410', border: '1px solid #1f3528',
    borderRadius: 2, padding: '0 6px',
  },
  sourceInputWrapReadOnly: {
    background: '#0d1814',
    borderStyle: 'dashed',
    borderColor: '#3a3018',
  },
  sourceInput: {
    flex: 1, background: 'transparent', border: 'none',
    color: '#e8f0e8', padding: '5px 0',
    fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
    outline: 'none', width: '100%', minWidth: 0,
  },
  sourceUnit: { fontSize: 8, color: '#5da377' },

  mixedSummary: {
    marginTop: 12, padding: 10,
    background: 'rgba(212, 168, 87, 0.04)',
    border: '1px solid #3a3018',
    borderRadius: 3,
  },
  mixedHeader: {
    fontSize: 9, color: '#d4a857',
    letterSpacing: '0.2em', fontWeight: 700,
    paddingBottom: 6, borderBottom: '1px dashed #3a3018',
    marginBottom: 6,
    fontFamily: "'JetBrains Mono', monospace",
  },
  mixedRow: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: 10, padding: '2px 0',
  },
  mixedLabel: { color: '#9bc7a4' },
  mixedValue: {
    color: '#e8c876', fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    fontFamily: "'JetBrains Mono', monospace",
  },

  inputRow: { marginBottom: 10 },
  inputLabel: { fontSize: 10, color: '#9bc7a4', marginBottom: 5 },
  inputWrap: {
    display: 'flex', alignItems: 'center',
    background: '#0a1410', border: '1px solid #2a4538',
    borderRadius: 3, padding: '0 10px',
  },
  inputWrapAccent: {
    borderColor: '#d4a857',
    background: 'rgba(212, 168, 87, 0.05)',
  },
  input: {
    flex: 1, background: 'transparent', border: 'none',
    color: '#e8f0e8', padding: '8px 0',
    fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
    outline: 'none',
  },
  inputUnit: { fontSize: 10, color: '#5da377', letterSpacing: '0.1em' },

  sliderRow: { marginBottom: 12 },
  sliderHeader: {
    display: 'flex', justifyContent: 'space-between', marginBottom: 6,
  },
  sliderLabel: { fontSize: 10, color: '#9bc7a4' },
  sliderValue: {
    fontSize: 10, color: '#d4a857', fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
  },
  slider: { width: '100%' },
  sliderHint: {
    fontSize: 9, color: '#5da377',
    marginTop: 3, fontStyle: 'italic',
  },

  warningBox: {
    marginTop: 12, padding: 10,
    background: 'rgba(201, 122, 93, 0.1)',
    border: '1px solid #c97a5d',
    borderRadius: 3,
  },
  warningTitle: {
    fontSize: 10, fontWeight: 700, color: '#e09a7e',
    letterSpacing: '0.1em',
  },
  warningText: {
    fontSize: 10, color: '#f0b298',
    marginTop: 4, lineHeight: 1.5,
  },
  infoBox: {
    marginTop: 12, padding: 10,
    background: 'rgba(93, 163, 119, 0.08)',
    border: '1px solid #3a6049',
    borderRadius: 3,
  },
  infoTitle: {
    fontSize: 10, fontWeight: 700, color: '#9bc7a4',
    letterSpacing: '0.1em',
  },
  infoText: {
    fontSize: 10, color: '#cde7d2',
    marginTop: 4, lineHeight: 1.5,
  },

  main: { display: 'flex', flexDirection: 'column', gap: 16 },

  allocationCard: {
    background: 'linear-gradient(180deg, rgba(212, 168, 87, 0.08) 0%, rgba(13, 26, 20, 0.6) 100%)',
    border: '1px solid #d4a857',
    borderRadius: 6, overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(212, 168, 87, 0.1)',
  },
  allocationSubtitle: {
    fontSize: 11, color: '#cde7d2',
    marginLeft: 12,
    fontFamily: "'IBM Plex Sans Thai', sans-serif",
    fontWeight: 400,
    letterSpacing: 'normal',
    textTransform: 'none',
  },
  allocationGrid: {
    padding: '16px 20px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 12,
  },
  allocationItem: {
    background: 'rgba(10, 20, 16, 0.6)',
    border: '1px solid #3a3018',
    borderRadius: 4,
    padding: '12px 14px',
    transition: 'opacity 0.2s',
  },
  allocationItemDim: {
    opacity: 0.4,
  },
  allocationName: {
    fontSize: 11, color: '#9bc7a4',
    marginBottom: 6, letterSpacing: '0.05em',
  },
  allocationFlow: {
    fontSize: 22, color: '#f0d488',
    fontFamily: "'Fraunces', serif",
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  allocationUnit: {
    fontSize: 11, color: '#b89a55',
    fontFamily: "'JetBrains Mono', monospace",
  },
  allocationBar: {
    height: 4, background: '#0a1410',
    borderRadius: 2, overflow: 'hidden',
    margin: '8px 0 6px 0',
  },
  allocationBarFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #d4a857 0%, #f0d488 100%)',
    transition: 'width 0.3s ease',
  },
  allocationMeta: {
    fontSize: 10, color: '#7ba386',
    display: 'flex', gap: 6, alignItems: 'center',
    fontFamily: "'JetBrains Mono', monospace",
  },
  allocationDot: { color: '#3a6049' },

  kpiStrip: {
    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10,
  },
  kpi: {
    background: 'rgba(13, 26, 20, 0.6)',
    border: '1px solid #1f3528',
    borderRadius: 4, padding: '12px 14px',
  },
  kpiHighlight: {
    borderColor: '#d4a857',
    background: 'rgba(212, 168, 87, 0.06)',
  },
  kpiWarning: {
    borderColor: '#c97a5d',
    background: 'rgba(201, 122, 93, 0.05)',
  },
  kpiLabel: {
    fontSize: 9, color: '#7ba386',
    letterSpacing: '0.15em', textTransform: 'uppercase',
    marginBottom: 6,
    fontFamily: "'JetBrains Mono', monospace",
  },
  kpiValueRow: { display: 'flex', alignItems: 'baseline', gap: 4 },
  kpiValue: {
    fontSize: 22, fontWeight: 600, color: '#e8f0e8',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: "'Fraunces', serif",
  },
  kpiUnit: {
    fontSize: 10, color: '#5da377',
    fontFamily: "'JetBrains Mono', monospace",
  },
  kpiSub: {
    fontSize: 9, color: '#7ba386', marginTop: 4,
    letterSpacing: '0.05em',
    fontFamily: "'JetBrains Mono', monospace",
  },

  diagramCard: {
    background: 'rgba(13, 26, 20, 0.6)',
    border: '1px solid #1f3528',
    borderRadius: 4, overflow: 'hidden',
  },
  lossCard: {
    background: 'rgba(13, 26, 20, 0.6)',
    border: '1px solid #1f3528',
    borderRadius: 4, overflow: 'hidden',
  },
  tableCard: {
    background: 'rgba(13, 26, 20, 0.6)',
    border: '1px solid #1f3528',
    borderRadius: 4, overflow: 'hidden',
  },
  cardHeader: {
    padding: '12px 18px',
    borderBottom: '1px solid #1f3528',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  cardLabel: {
    fontSize: 10, color: '#5da377',
    letterSpacing: '0.2em', fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
  },
  cardMeta: {
    fontSize: 10, color: '#7ba386',
    letterSpacing: '0.1em',
    fontFamily: "'JetBrains Mono', monospace",
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 11 },
  th: {
    textAlign: 'left', padding: '9px 18px',
    fontSize: 9, color: '#5da377',
    letterSpacing: '0.15em', fontWeight: 600,
    borderBottom: '1px solid #1f3528',
    fontFamily: "'JetBrains Mono', monospace",
  },
  tr: { borderBottom: '1px solid #142820' },
  trHighlight: { background: 'rgba(212, 168, 87, 0.08)' },
  trLoss: { background: 'rgba(201, 122, 93, 0.04)' },
  trAccent: { background: 'rgba(93, 163, 119, 0.04)' },
  trSub: { opacity: 0.7, fontSize: 10 },
  trBold: { fontWeight: 700, background: 'rgba(93, 163, 119, 0.06)' },
  td: {
    padding: '9px 18px', color: '#cde7d2',
    fontFamily: "'JetBrains Mono', monospace",
  },
  lossItem: {
    display: 'flex', gap: 12, alignItems: 'flex-start',
    padding: 12, background: '#0a1410',
    borderRadius: 3, border: '1px solid #1f3528',
  },
  lossDot: { width: 10, height: 10, borderRadius: 2, marginTop: 5 },
  lossItemLabel: {
    fontSize: 10, color: '#7ba386',
    letterSpacing: '0.1em', textTransform: 'uppercase',
    fontFamily: "'JetBrains Mono', monospace",
  },
  lossItemValue: {
    fontSize: 18, color: '#e8f0e8', fontWeight: 600,
    marginTop: 4, fontFamily: "'Fraunces', serif",
  },
  lossItemSub: {
    fontSize: 10, color: '#5da377', marginTop: 2,
    fontFamily: "'JetBrains Mono', monospace",
  },
  footer: {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '12px 18px',
    background: 'rgba(13, 26, 20, 0.4)',
    border: '1px solid #1f3528',
    borderRadius: 4, fontSize: 10,
  },
  footLabel: {
    color: '#5da377', letterSpacing: '0.2em', marginRight: 12,
    fontFamily: "'JetBrains Mono', monospace",
  },
  footFormula: {
    color: '#9bc7a4', fontStyle: 'italic',
    fontFamily: "'JetBrains Mono', monospace",
  },
  footMeta: {
    color: '#5da377', letterSpacing: '0.15em',
    fontFamily: "'JetBrains Mono', monospace",
  },
};