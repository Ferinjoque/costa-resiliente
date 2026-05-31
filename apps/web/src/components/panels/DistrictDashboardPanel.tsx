"use client";

import {
  BarChart3, Droplets, AlertTriangle, Users, History, Radio,
  TrendingUp, Waves, Brain, CheckCircle2, FileText, X,
  Copy, Check, AlertOctagon, ArrowUpRight, Download,
} from "lucide-react";
import { useState } from "react";
import { useUIStore } from "@/store/ui";
import {
  useDistrictDashboard, useDistrictRiskSummary, useAlerts,
  useFloodExposure, useFusion, useDecisionLog, useSocialSignals, useImerg,
} from "@/lib/queries";
import { clsx } from "clsx";
import type { Alert, AlertTrendDay, SocialBreakdown } from "@/lib/api";
import { useT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import {
  DEMO_FORECAST, HUAYCO_THRESHOLD_MM, DEMO_RESOURCES,
  type ForecastStep, type ResourceCategory,
} from "@/lib/demoData";
import {
  SEVERITY_CRITICAL, SEVERITY_HIGH, SEVERITY_MEDIUM, SEVERITY_LOW,
  COSTA_300, COSTA_400,
} from "@/lib/colors";
import {
  Panel, PanelHeader, PanelTitle, SectionLabel,
  Button, Badge, Divider, EmptyState,
} from "@/components/ui/primitives";

// ANA alert thresholds per station code (meters)
const STATION_THRESHOLDS: Record<string, number> = {
  "ANA-CHOSICA":        2.0,
  "ANA-CHACLACAYO":     1.5,
  "ANA-PUENTE-ANGELES": 1.7,
  "ANA-CARABAYLLO":     2.5,
  "ANA-HUACHIPA":       1.8,
};

// ─── Sparkline SVG ────────────────────────────────────────────────────────────

function Sparkline({
  values,
  color = COSTA_300,
  height = 32,
}: {
  values: number[];
  color?: string;
  height?: number;
}) {
  if (values.length < 2) return null;
  const w = 120;
  const max = Math.max(...values, 0.01);
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = height - (v / max) * height;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} aria-hidden="true">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={`0,${height} ${pts} ${w},${height}`}
        fill={color}
        fillOpacity={0.12}
        stroke="none"
      />
    </svg>
  );
}

// ─── Mini bar chart ───────────────────────────────────────────────────────────

function BarMini({ days }: { days: AlertTrendDay[] }) {
  if (!days.length) return null;
  const buckets: Record<string, { critical: number; high: number; medium: number; low: number }> = {};
  for (const d of days) {
    if (!buckets[d.day]) buckets[d.day] = { critical: 0, high: 0, medium: 0, low: 0 };
    const sev = d.severity as keyof typeof buckets[string];
    if (sev in buckets[d.day]) buckets[d.day][sev] += d.count;
  }
  const entries = Object.entries(buckets).slice(-7);
  const maxTotal = Math.max(...entries.map(([, v]) => v.critical + v.high + v.medium + v.low), 1);
  const SEV_COLOR = { critical: SEVERITY_CRITICAL, high: SEVERITY_HIGH, medium: SEVERITY_MEDIUM, low: COSTA_400 };
  const w = 120;
  const bw = Math.floor(w / entries.length) - 2;

  return (
    <svg width={w} height={32} viewBox={`0 0 ${w} 32`} aria-hidden="true">
      {entries.map(([, v], i) => {
        let y = 32;
        return (
          <g key={i}>
            {(["critical", "high", "medium", "low"] as const).map((sev) => {
              const h = (v[sev] / maxTotal) * 32;
              y -= h;
              return h > 0 ? (
                <rect
                  key={sev}
                  x={i * (bw + 2)}
                  y={y}
                  width={bw}
                  height={h}
                  fill={SEV_COLOR[sev]}
                  rx={1}
                />
              ) : null;
            })}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Social pill ──────────────────────────────────────────────────────────────

const LABEL_TEXT: Record<string, { es: string; en: string }> = {
  needs_help:            { es: "Ayuda",            en: "Needs help" },
  infrastructure_damage: { es: "Infraestructura",  en: "Infra damage" },
  road_blocked:          { es: "Vía bloqueada",    en: "Road blocked" },
  huayco_observation:    { es: "Huayco",           en: "Huayco sighting" },
  flood_observation:     { es: "Inundación",       en: "Flood sighting" },
  weather_observation:   { es: "Meteorología",     en: "Weather" },
};

const LABEL_PILL_CLS: Record<string, string> = {
  needs_help:            "bg-danger-soft text-danger",
  infrastructure_damage: "bg-warn-soft text-warn-muted",
  road_blocked:          "bg-warn-soft text-warn-muted",
  huayco_observation:    "bg-warn-soft text-warn-muted",
  flood_observation:     "bg-warn-soft text-warn-muted",
  weather_observation:   "bg-accent-soft text-accent",
};

function SocialPill({ item, locale }: { item: SocialBreakdown; locale: Locale }) {
  const label = LABEL_TEXT[item.label]?.[locale] ?? item.label.replace(/_/g, " ");
  const cls = LABEL_PILL_CLS[item.label] ?? "bg-surface-sunken text-ink-muted";
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>
      {label}
      <span className="font-semibold">{item.count}</span>
    </span>
  );
}

// ─── EDAN report generation ───────────────────────────────────────────────────

function buildReportId(now: Date) {
  return `CR-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(now.getHours()).padStart(2,"0")}${String(now.getMinutes()).padStart(2,"0")}`;
}

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

interface ReportData {
  reportId: string; nowStr: string; level: string;
  active: Alert[]; critical: Alert[]; high: Alert[];
  floodArea: number; popStr: string;
  highRiskDistricts: string[]; moderateDistricts: string[];
  maxRain72h?: number; maxRainWs?: string;
  locale: "es" | "en";
}

function buildMarkdown(d: ReportData): string {
  const es = d.locale === "es";
  const SEV: Record<string,string> = es
    ? { critical:"CRÍTICO", high:"ALTO", medium:"MEDIO", low:"BAJO" }
    : { critical:"CRITICAL", high:"HIGH", medium:"MEDIUM", low:"LOW" };
  const TYPE: Record<string,string> = es
    ? { flood:"Inundación SAR", huayco:"Huayco", social_cluster:"Señal social", weather:"Meteorológica" }
    : { flood:"SAR Flood", huayco:"Mudslide", social_cluster:"Social signal", weather:"Weather" };
  const rows = d.active.slice(0,12).map((a,i) =>
    `${i+1}. **[${SEV[a.severity]??a.severity}]** ${TYPE[a.type]??a.type} — ${a.title}`
  );
  return (es ? [
    `# Reporte de Situación — EDAN-Perú`,``,
    `**ID:** ${d.reportId}  `,
    `**Fecha/Hora:** ${d.nowStr} (Lima, Perú)  `,
    `**Nivel SINAGERD:** ${d.level}  `,
    `**Clasificación:** Para uso oficial`,``,`---`,``,
    `## 1. Resumen Ejecutivo`,``,
    `| Indicador | Valor |`,`|-----------|-------|`,
    `| Alertas activas | ${d.active.length} (${d.critical.length} críticas, ${d.high.length} altas) |`,
    `| Área inundada SAR | ${d.floodArea.toFixed(2)} km² |`,
    `| Lluvia 72h (IMERG) | ${d.maxRain72h != null ? `${d.maxRain72h.toFixed(0)} mm${d.maxRainWs ? ` (${d.maxRainWs})` : ""} — ${d.maxRain72h >= 50 ? "⚠ EMERGENCIA ANA" : d.maxRain72h >= 25 ? "ALERTA ANA" : "Normal"}` : "Sin datos"} |`,
    `| Población en riesgo | ${d.popStr} habitantes |`,
    `| Distritos riesgo alto | ${d.highRiskDistricts.join(", ")||"Ninguno"} |`,
    `| Distritos riesgo moderado | ${d.moderateDistricts.join(", ")||"Ninguno"} |`,``,
    `## 2. Alertas Activas`,``,
    ...rows,
    d.active.length > 12 ? `\n*...y ${d.active.length-12} alertas más*` : ``,``,
    `## 3. Evaluación de Impacto`,``,
    `- SAR Sentinel-1 detecta **${d.floodArea.toFixed(1)} km²** de área inundada`,
    `- Población estimada en zona de riesgo: **${d.popStr} habitantes**`,
    `- Distritos con nivel de riesgo alto: **${d.highRiskDistricts.length}**`,``,
    `## 4. Fuentes de Datos`,``,
    `| Fuente | Detalle | Actualización |`,`|--------|---------|---------------|`,
    `| SAR | Sentinel-1 · Microsoft Planetary Computer | ~6 días |`,
    `| Lluvia | NASA IMERG Late Run V07B | 30 min |`,
    `| Hidrología | ANA Observatorio Chirilu · SENAMHI | 1 hora |`,
    `| Social | Bluesky · RSS RPP/Andina · Reddit · Telegram | 5 min |`,
    `| Peligros | CENEPRED SIGRID | Estático |`,``,`---`,``,
    `*Para uso oficial · Formulario EDAN-Perú · SINAGERD*  `,
    `*Sistema: Costa Resiliente · ${d.nowStr}*`,
  ] : [
    `# Situation Report — EDAN-Peru`,``,
    `**ID:** ${d.reportId}  `,
    `**Date/Time:** ${d.nowStr} (Lima, Peru)  `,
    `**SINAGERD Level:** ${d.level}  `,
    `**Classification:** For official use`,``,`---`,``,
    `## 1. Executive Summary`,``,
    `| Indicator | Value |`,`|-----------|-------|`,
    `| Active alerts | ${d.active.length} (${d.critical.length} critical, ${d.high.length} high) |`,
    `| SAR flooded area | ${d.floodArea.toFixed(2)} km² |`,
    `| Population at risk | ${d.popStr} inhabitants |`,
    `| High-risk districts | ${d.highRiskDistricts.join(", ")||"None"} |`,
    `| Moderate-risk districts | ${d.moderateDistricts.join(", ")||"None"} |`,``,
    `## 2. Active Alerts`,``,
    ...rows,
    d.active.length > 12 ? `\n*...and ${d.active.length-12} more alerts*` : ``,``,
    `## 3. Impact Assessment`,``,
    `- SAR Sentinel-1 detects **${d.floodArea.toFixed(1)} km²** of flooded area`,
    `- Estimated population in risk zone: **${d.popStr} inhabitants**`,
    `- Districts with high risk level: **${d.highRiskDistricts.length}**`,``,
    `## 4. Data Sources`,``,
    `| Source | Detail | Frequency |`,`|--------|--------|-----------|`,
    `| SAR | Sentinel-1 · Microsoft Planetary Computer | ~6 days |`,
    `| Rainfall | NASA IMERG Late Run V07B | 30 min |`,
    `| Hydrology | ANA Observatorio Chirilu · SENAMHI | 1 hour |`,
    `| Social | Bluesky · RSS RPP/Andina · Reddit · Telegram | 5 min |`,
    `| Hazards | CENEPRED SIGRID | Static |`,``,`---`,``,
    `*For official use · EDAN-Peru form · SINAGERD*  `,
    `*System: Costa Resiliente · ${d.nowStr}*`,
  ]).join("\n");
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildReportHTML(d: ReportData): string {
  const es = d.locale === "es";
  const lc = d.level;
  const lcColor = lc==="EMERGENCIA"?"#dc2626":lc==="ALERTA"?"#ea580c":lc==="AVISO"?"#ca8a04":"#16a34a";
  const lcBg   = lc==="EMERGENCIA"?"#fef2f2":lc==="ALERTA"?"#fff7ed":lc==="AVISO"?"#fefce8":"#f0fdf4";
  const lcLbl  = !es ? ({EMERGENCIA:"EMERGENCY",ALERTA:"ALERT",AVISO:"NOTICE",NORMAL:"NORMAL"}[lc]??lc) : lc;
  const lcDesc = lc==="EMERGENCIA"
    ? (es?`${d.critical.length} alerta(s) crítica(s). Respuesta inmediata requerida.`:`${d.critical.length} critical alert(s). Immediate response required.`)
    : lc==="ALERTA"
    ? (es?`${d.high.length} alerta(s) de alta severidad. Monitoreo intensificado.`:`${d.high.length} high severity alert(s). Intensified monitoring.`)
    : (es?`${d.active.length} alerta(s) activa(s). Monitoreo en curso.`:`${d.active.length} active alert(s). Monitoring ongoing.`);
  const SEV_C: Record<string,string> = {critical:"#dc2626",high:"#ea580c",medium:"#ca8a04",low:"#16a34a"};
  const SEV_L: Record<string,string> = es
    ? {critical:"CRÍTICO",high:"ALTO",medium:"MEDIO",low:"BAJO"}
    : {critical:"CRITICAL",high:"HIGH",medium:"MEDIUM",low:"LOW"};
  const TYPE_L: Record<string,string> = es
    ? {flood:"Inundación SAR",huayco:"Huayco / Deslizamiento",social_cluster:"Señal social",weather:"Meteorológica"}
    : {flood:"SAR Flood",huayco:"Mudslide / Huayco",social_cluster:"Social signal",weather:"Weather"};

  const alertRows = d.active.slice(0,12).map(a => {
    const sc = SEV_C[a.severity]??"#6b7280";
    const sl = SEV_L[a.severity]??a.severity;
    return `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;"><span style="background:${sc}18;color:${sc};font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;border:1px solid ${sc}30">${sl}</span></td>
      <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#374151">${escHtml(a.title)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#6b7280">${escHtml(TYPE_L[a.type]??a.type)}</td>
    </tr>`;
  }).join("");

  const distRows = [
    ...d.highRiskDistricts.map(n=>`<tr><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:12px">${escHtml(n)}</td><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9"><span style="background:#fef2f2;color:#dc2626;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px">${es?"ALTO":"HIGH"}</span></td></tr>`),
    ...d.moderateDistricts.map(n=>`<tr><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-size:12px">${escHtml(n)}</td><td style="padding:6px 10px;border-bottom:1px solid #f1f5f9"><span style="background:#fffbeb;color:#d97706;font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px">${es?"MODERADO":"MODERATE"}</span></td></tr>`),
  ].join("");

  const srcRows = (es ? [
    ["SAR / Inundación","Sentinel-1 · Microsoft Planetary Computer · ESA Copernicus","~6 días"],
    ["Lluvia","NASA IMERG Late Run V07B · GPM","30 min"],
    ["Hidrología","ANA Observatorio Chirilu · SENAMHI","1 hora"],
    ["Social","Bluesky · RSS RPP/Andina · Reddit · Telegram · Reportes de campo","5 min"],
    ["Peligros","CENEPRED SIGRID · Zonas de susceptibilidad","Estático"],
    ["SINPAD","INDECI · Historial de emergencias 2003-2020","Histórico"],
  ] : [
    ["SAR / Flood","Sentinel-1 · Microsoft Planetary Computer · ESA Copernicus","~6 days"],
    ["Rainfall","NASA IMERG Late Run V07B · GPM","30 min"],
    ["Hydrology","ANA Observatorio Chirilu · SENAMHI","1 hour"],
    ["Social","Bluesky · RSS RPP/Andina · Reddit · Telegram · Field reports","5 min"],
    ["Hazards","CENEPRED SIGRID · Susceptibility zones","Static"],
    ["SINPAD","INDECI · Emergency history 2003-2020","Historical"],
  ]).map(([s,d2,f])=>`<tr><td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;font-size:12px;color:#374151;width:130px">${s}</td><td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#4b5563">${d2}</td><td style="padding:7px 10px;border-bottom:1px solid #f1f5f9;font-size:11px;color:#9ca3af;width:100px">${f}</td></tr>`).join("");

  return `<!DOCTYPE html><html lang="${d.locale}">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${es?"Reporte EDAN-Perú":"EDAN-Peru Report"} — ${d.reportId}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Helvetica Neue',Arial,sans-serif;background:#f8fafc;color:#111827}
.page{max-width:820px;margin:0 auto;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.1)}
@media print{body{background:#fff}.no-print{display:none!important}.page{box-shadow:none;max-width:none;margin:0}}
.hdr{background:#0f172a;color:#fff;padding:24px 32px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.hdr h1{font-size:16px;font-weight:800;letter-spacing:.04em;text-transform:uppercase}
.hdr p{font-size:11px;color:#94a3b8;margin-top:3px}
.hdr-r{text-align:right;flex-shrink:0}
.banner{padding:14px 32px;background:${lcBg};border-bottom:3px solid ${lcColor};display:flex;align-items:center;gap:14px}
.badge{background:${lcColor};color:#fff;font-size:12px;font-weight:800;letter-spacing:.1em;padding:5px 14px;border-radius:6px;white-space:nowrap}
.banner-desc{font-size:13px;color:${lcColor};font-weight:600}
.body{padding:28px 32px}
.sec{margin-bottom:28px}
.sec-ttl{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:14px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.mcard{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px}
.mval{font-size:22px;font-weight:800;font-family:'Courier New',monospace;line-height:1;letter-spacing:-.02em}
.mlbl{font-size:10px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:.05em}
.msub{font-size:11px;color:#94a3b8;margin-top:5px}
table{width:100%;border-collapse:collapse}
th{text-align:left;padding:8px 10px;background:#f1f5f9;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0}
.impact-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:0}
.icard{border-radius:8px;padding:16px}
.icard-ttl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
.icard p{font-size:12px;line-height:1.7}
.ftr{background:#f1f5f9;padding:14px 32px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e8f0;font-size:11px;color:#64748b}
.actions{padding:12px 32px;border-bottom:1px solid #e2e8f0;display:flex;gap:10px;align-items:center}
.print-btn{background:#0f172a;color:#fff;border:none;padding:9px 18px;font-size:12px;font-weight:700;border-radius:6px;cursor:pointer;letter-spacing:.03em}
.print-btn:hover{background:#1e293b}
.hint{font-size:11px;color:#64748b}
</style></head>
<body><div class="page">
<div class="actions no-print">
  <button class="print-btn" onclick="window.print()">&#x1F5A8;&nbsp;&nbsp;${es?"Imprimir / Guardar como PDF":"Print / Save as PDF"}</button>
  <span class="hint">${es?"Ctrl+P → Guardar como PDF":"Ctrl+P → Save as PDF"}</span>
</div>
<div class="hdr">
  <div><h1>${es?"Reporte de Situación — EDAN-Perú":"Situation Report — EDAN-Peru"}</h1>
  <p>SINAGERD · ${es?"Sistema Nacional de Gestión del Riesgo de Desastres":"National Disaster Risk Management System"}</p></div>
  <div class="hdr-r">
    <div style="font-family:'Courier New',monospace;font-size:12px;font-weight:700">${d.reportId}</div>
    <div style="font-size:11px;color:#94a3b8;margin-top:3px">${d.nowStr}</div>
    <div style="font-size:10px;color:#475569;margin-top:3px">Costa Resiliente</div>
  </div>
</div>
<div class="banner">
  <span class="badge">SINAGERD ${lcLbl}</span>
  <span class="banner-desc">${lcDesc}</span>
</div>
<div class="body">
  <div class="sec">
    <div class="sec-ttl">${es?"1. Resumen Ejecutivo":"1. Executive Summary"}</div>
    <div class="grid4">
      <div class="mcard"><div class="mval" style="color:${d.active.length>0?"#dc2626":"#111827"}">${d.active.length}</div><div class="mlbl">${es?"Alertas activas":"Active alerts"}</div><div class="msub">${d.critical.length} ${es?"críticas":"critical"} · ${d.high.length} ${es?"altas":"high"}</div></div>
      <div class="mcard"><div class="mval" style="color:#2563eb">${d.floodArea.toFixed(1)}<span style="font-size:13px;font-weight:400"> km²</span></div><div class="mlbl">${es?"Área inundada":"Flooded area"}</div><div class="msub">Sentinel-1</div></div>
      <div class="mcard"><div class="mval">${d.popStr}</div><div class="mlbl">${es?"Pob. en riesgo":"Pop. at risk"}</div><div class="msub">${es?"habitantes":"inhabitants"}</div></div>
      <div class="mcard"><div class="mval" style="color:${d.highRiskDistricts.length>0?"#dc2626":"#111827"}">${d.highRiskDistricts.length+d.moderateDistricts.length}</div><div class="mlbl">${es?"Distritos en alerta":"Districts on alert"}</div><div class="msub">${d.highRiskDistricts.length} ${es?"alto":"high"} · ${d.moderateDistricts.length} mod.</div></div>
    </div>
  </div>
  ${d.active.length>0?`<div class="sec">
    <div class="sec-ttl">${es?"2. Alertas Activas":"2. Active Alerts"} (${d.active.length})</div>
    <table><thead><tr><th style="width:85px">${es?"Severidad":"Severity"}</th><th>${es?"Descripción":"Description"}</th><th style="width:150px">${es?"Tipo":"Type"}</th></tr></thead><tbody>${alertRows}</tbody></table>
    ${d.active.length>12?`<p style="font-size:11px;color:#6b7280;margin-top:8px">...${es?"y":"and"} ${d.active.length-12} ${es?"alertas más":"more alerts"}</p>`:""}
  </div>`:""}
  ${distRows?`<div class="sec">
    <div class="sec-ttl">${es?"3. Distritos en Riesgo":"3. Districts at Risk"}</div>
    <table><thead><tr><th>${es?"Distrito":"District"}</th><th style="width:130px">${es?"Nivel de Riesgo":"Risk Level"}</th></tr></thead><tbody>${distRows}</tbody></table>
  </div>`:""}
  <div class="sec">
    <div class="sec-ttl">${es?"4. Evaluación de Impacto Hidrometeorológico":"4. Hydrometeorological Impact Assessment"}</div>
    <div class="impact-grid">
      <div class="icard" style="background:#eff6ff;border:1px solid #bfdbfe"><div class="icard-ttl" style="color:#1d4ed8">SAR Sentinel-1</div><p style="color:#1e3a5f">${es?`Imágenes de radar de apertura sintética detectan <strong>${d.floodArea.toFixed(2)} km²</strong> de superficie inundada en la región de Lima. Cadencia de revisita ~6 días.`:`Synthetic aperture radar imagery detects <strong>${d.floodArea.toFixed(2)} km²</strong> of flooded surface in the Lima region. Revisit cadence ~6 days.`}</p></div>
      <div class="icard" style="background:#f0fdf4;border:1px solid #bbf7d0"><div class="icard-ttl" style="color:#15803d">NASA IMERG Late Run V07B</div><p style="color:#14532d">${es?`Precipitación acumulada basada en estimaciones satelitales IMERG Late Run V07B (GPM). Granularidad de 30 min. ${d.maxRain72h != null ? `<strong>${d.maxRain72h.toFixed(0)} mm/72h${d.maxRainWs ? ` (${d.maxRainWs})` : ''}</strong> — ${d.maxRain72h >= 50 ? '⚠ UMBRAL EMERGENCIA ANA superado' : d.maxRain72h >= 25 ? 'Umbral ALERTA ANA superado' : 'Bajo umbral de alerta'}.` : 'Sin datos recientes.'}` : `Accumulated precipitation from NASA IMERG Late Run V07B (GPM). 30-min granularity. ${d.maxRain72h != null ? `<strong>${d.maxRain72h.toFixed(0)} mm/72h${d.maxRainWs ? ` (${d.maxRainWs})` : ''}</strong> — ${d.maxRain72h >= 50 ? '⚠ ANA EMERGENCY threshold exceeded' : d.maxRain72h >= 25 ? 'ANA ALERT threshold exceeded' : 'Below alert threshold'}.` : 'No recent data.'}`}</p></div>
    </div>
  </div>
  <div class="sec">
    <div class="sec-ttl">${es?"5. Fuentes de Datos y Metodología":"5. Data Sources & Methodology"}</div>
    <table><thead><tr><th style="width:130px">${es?"Fuente":"Source"}</th><th>${es?"Descripción":"Description"}</th><th style="width:100px">${es?"Actualización":"Frequency"}</th></tr></thead><tbody>${srcRows}</tbody></table>
  </div>
</div>
<div class="ftr">
  <div><strong style="color:#374151">${es?"Para uso oficial — EDAN-Perú / SINAGERD":"For official use — EDAN-Peru / SINAGERD"}</strong><div style="margin-top:2px">Costa Resiliente · Lima, Perú</div></div>
  <div style="text-align:right"><strong style="font-family:'Courier New',monospace">${d.reportId}</strong><div style="margin-top:2px">${d.nowStr}</div></div>
</div>
</div></body></html>`;
}

// ─── EDAN report button + config modal ────────────────────────────────────────

type ReportStep = "idle" | "config" | "generating" | "done";

function EDANReportButton() {
  const { locale } = useUIStore();
  const [step, setStep] = useState<ReportStep>("idle");
  const [wantPdf, setWantPdf] = useState(true);
  const [wantMd, setWantMd] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data: alerts = [] } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const { data: summary } = useDistrictRiskSummary();
  const { data: imergEdan } = useImerg(72);

  const now = new Date();
  const nowStr = now.toLocaleString(locale === "en" ? "en-US" : "es-PE", { timeZone: "America/Lima" });
  const active = alerts.filter((a) => a.status === "active");
  const critical = active.filter((a) => a.severity === "critical");
  const high = active.filter((a) => a.severity === "high");
  const floodArea = exposure?.districts.reduce((s, d) => s + d.overlap_km2, 0) ?? 0;
  const affectedPop = exposure?.total_affected_population ?? 0;
  const highRiskDistricts = summary?.features.filter((f) => f.properties.risk_level === "alto").map((f) => f.properties.name) ?? [];
  const moderateDistricts = summary?.features.filter((f) => f.properties.risk_level === "moderado").map((f) => f.properties.name) ?? [];
  const level = critical.length > 0 ? "EMERGENCIA" : high.length > 1 ? "ALERTA" : active.length > 0 ? "AVISO" : "NORMAL";
  const popStr = affectedPop > 1000 ? `~${(affectedPop / 1000).toFixed(1)}k` : String(affectedPop || "—");
  const reportId = buildReportId(now);

  // Max 72h rainfall across watersheds for EDAN report
  const maxRain72h = imergEdan?.features.reduce((mx, f) => {
    const v = f.properties.acc_72h_mm ?? 0;
    return v > mx ? v : mx;
  }, 0) ?? undefined;
  const maxRainWs = maxRain72h != null
    ? imergEdan?.features.find((f) => (f.properties.acc_72h_mm ?? 0) === maxRain72h)?.properties.name
    : undefined;

  const reportData: ReportData = {
    reportId, nowStr, level, active, critical, high,
    floodArea, popStr, highRiskDistricts, moderateDistricts,
    maxRain72h: maxRain72h && maxRain72h > 0 ? maxRain72h : undefined,
    maxRainWs,
    locale,
  };

  function handleGenerate() {
    setStep("generating");
    // window.open must be called synchronously from the click handler
    let win: Window | null = null;
    if (wantPdf) win = window.open("about:blank", "_blank");

    // Build and inject HTML
    if (win) {
      const html = buildReportHTML(reportData);
      win.document.write(html);
      win.document.close();
    }
    if (wantMd) {
      downloadBlob(buildMarkdown(reportData), `${reportId}.md`, "text/markdown;charset=utf-8");
    }
    setStep("done");
    setTimeout(() => setStep("idle"), 2000);
  }

  async function handleCopyText() {
    try {
      await navigator.clipboard.writeText(buildMarkdown(reportData));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  if (step === "idle") {
    return (
      <button
        onClick={() => setStep("config")}
        className="text-xs text-ink-subtle hover:text-accent flex items-center gap-1.5 transition-colors"
        aria-label={locale === "es" ? "Generar reporte EDAN-Perú" : "Generate EDAN-Peru report"}
      >
        <FileText size={13} />
        {locale === "es" ? "Reporte EDAN" : "EDAN Report"}
      </button>
    );
  }

  if (step === "generating") {
    return (
      <span className="text-xs text-ink-subtle flex items-center gap-1.5 animate-pulse">
        <FileText size={13} />
        {locale === "es" ? "Generando…" : "Generating…"}
      </span>
    );
  }

  if (step === "done") {
    return (
      <span className="text-xs text-ok-muted flex items-center gap-1.5">
        <Check size={13} />
        {locale === "es" ? "Listo" : "Done"}
      </span>
    );
  }

  // step === "config"
  const es = locale === "es";
  const levelLabel = !es
    ? ({ EMERGENCIA: "EMERGENCY", ALERTA: "ALERT", AVISO: "NOTICE", NORMAL: "NORMAL" }[level] ?? level)
    : level;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) setStep("idle"); }}
    >
      <div className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm border border-border-strong overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-surface-sunken">
          <FileText size={15} className="text-ink-muted shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink">
              {es ? "Generar Reporte EDAN-Perú" : "Generate EDAN-Peru Report"}
            </p>
            <p className="text-xs text-ink-subtle font-mono">{reportId} · {nowStr}</p>
          </div>
          <button onClick={() => setStep("idle")} className="p-1 rounded text-ink-subtle hover:text-ink hover:bg-surface-hover transition-colors shrink-0">
            <X size={15} />
          </button>
        </div>

        {/* Situation snapshot */}
        <div className="px-5 pt-4 pb-0">
          <div className="flex items-center gap-2 p-3 rounded-xl bg-surface-sunken">
            <span className={clsx(
              "text-xs font-bold uppercase px-2 py-0.5 rounded shrink-0",
              level === "EMERGENCIA" ? "bg-danger-soft text-danger"
              : level === "ALERTA"   ? "bg-warn-soft text-warn-muted"
              : level === "AVISO"    ? "bg-surface text-ink-muted border border-border"
              :                        "bg-accent-soft text-accent",
            )}>
              {levelLabel}
            </span>
            <span className="text-xs text-ink-subtle">
              {active.length} {es ? "alertas" : "alerts"} · {floodArea.toFixed(1)} km² SAR · {popStr} {es ? "hab." : "pop."}
            </span>
          </div>
        </div>

        {/* Format options */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs font-semibold text-ink">{es ? "Formato de exportación" : "Export format"}</p>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={wantPdf} onChange={(e) => setWantPdf(e.target.checked)} className="mt-0.5 rounded accent-accent" />
            <div>
              <span className="text-xs text-ink font-medium">{es ? "PDF visual (nueva pestaña)" : "Visual PDF (new tab)"}</span>
              <p className="text-2xs text-ink-subtle mt-0.5">{es ? "Reporte completo con métricas, tablas y secciones. Usa Ctrl+P → Guardar como PDF." : "Full report with metrics, tables, and sections. Use Ctrl+P → Save as PDF."}</p>
            </div>
          </label>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input type="checkbox" checked={wantMd} onChange={(e) => setWantMd(e.target.checked)} className="mt-0.5 rounded accent-accent" />
            <div>
              <span className="text-xs text-ink font-medium">Markdown (.md)</span>
              <p className="text-2xs text-ink-subtle mt-0.5">{es ? "Texto estructurado para sistemas digitales EDAN / SINAGERD." : "Structured text for EDAN / SINAGERD digital systems."}</p>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-border bg-surface-sunken">
          <button
            onClick={handleGenerate}
            disabled={!wantPdf && !wantMd}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs bg-ink text-surface rounded-xl px-3 py-2.5 hover:bg-ink/90 transition-colors font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={13} />
            {es ? "Generar reporte" : "Generate report"}
          </button>
          <button
            onClick={handleCopyText}
            className="flex items-center gap-1.5 text-xs bg-surface border border-border rounded-xl px-3 py-2.5 hover:bg-surface-hover transition-colors text-ink-muted hover:text-ink"
            title={es ? "Copiar como texto" : "Copy as text"}
          >
            {copied ? <Check size={13} className="text-ok-muted" /> : <Copy size={13} />}
          </button>
          <button onClick={() => setStep("idle")} className="text-xs text-ink-subtle hover:text-ink transition-colors px-1">
            {es ? "Cancelar" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Situation summary banner ─────────────────────────────────────────────────

function SituationSummary() {
  const { locale } = useUIStore();
  const { data: alerts = [] } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const { data: summary } = useDistrictRiskSummary();

  const activeAlerts = alerts.filter((a) => a.status === "active");
  const criticalAlerts = activeAlerts.filter((a) => a.severity === "critical");
  const highAlerts = activeAlerts.filter((a) => a.severity === "high");
  const affectedPop = exposure?.total_affected_population ?? 0;
  const highRiskDistricts = summary?.features.filter(
    (f) => f.properties.risk_level === "alto",
  ) ?? [];

  if (!activeAlerts.length && !affectedPop) return null;

  const sinagerdLevel =
    criticalAlerts.length > 0 ? "EMERGENCIA"
    : highAlerts.length > 2 || highRiskDistricts.length > 3 ? "ALERTA"
    : activeAlerts.length > 0 ? "AVISO"
    : null;

  if (!sinagerdLevel) return null;

  const levelLabel = locale === "es"
    ? { EMERGENCIA: "EMERGENCIA", ALERTA: "ALERTA", AVISO: "AVISO" }[sinagerdLevel]
    : { EMERGENCIA: "EMERGENCY", ALERTA: "ALERT", AVISO: "NOTICE" }[sinagerdLevel];

  const topDistricts = highRiskDistricts.slice(0, 3).map((f) => f.properties.name);
  const alertLabel = locale === "es"
    ? `${activeAlerts.length} alerta${activeAlerts.length !== 1 ? "s" : ""} activa${activeAlerts.length !== 1 ? "s" : ""}`
    : `${activeAlerts.length} active alert${activeAlerts.length !== 1 ? "s" : ""}`;

  const lines: string[] = [];
  if (activeAlerts.length) lines.push(alertLabel);
  if (affectedPop > 0)
    lines.push(`~${affectedPop > 1000 ? `${(affectedPop / 1000).toFixed(0)}k` : affectedPop} ${locale === "es" ? "personas en zona inundada" : "people in flood zone"}`);
  if (topDistricts.length)
    lines.push(`${locale === "es" ? "Distritos prioritarios" : "Priority districts"}: ${topDistricts.join(", ")}`);

  const bannerCls =
    sinagerdLevel === "EMERGENCIA"
      ? "bg-danger-soft border border-danger/20"
      : sinagerdLevel === "ALERTA"
        ? "bg-warn-soft border border-warn/20"
        : "bg-surface-sunken border border-border";

  const levelCls =
    sinagerdLevel === "EMERGENCIA" ? "text-danger font-semibold"
    : sinagerdLevel === "ALERTA"   ? "text-warn-muted font-semibold"
    :                                "text-ink-muted font-semibold";

  return (
    <div className={clsx("rounded-xl px-4 py-3", bannerCls)}>
      <p className="text-2xs font-semibold tracking-caps uppercase text-ink-subtle mb-1">
        SINAGERD · <span className={levelCls}>{levelLabel}</span>
      </p>
      <ul className="space-y-0.5">
        {lines.map((line, i) => (
          <li key={i} className="text-sm text-ink leading-snug">{line}</li>
        ))}
      </ul>
    </div>
  );
}

// ─── Lima-wide overview metrics ───────────────────────────────────────────────

function CityOverview() {
  const { locale } = useUIStore();
  const tr = useT(locale);
  const { data: alerts = [] } = useAlerts();
  const { data: exposure } = useFloodExposure();
  const { data: summary } = useDistrictRiskSummary();
  const { data: imergCity } = useImerg(72);

  const activeCount = alerts.filter((a) => a.status === "active").length;
  const floodArea = exposure?.districts.reduce((sum, d) => sum + d.overlap_km2, 0) ?? 0;
  const affectedPop = exposure?.total_affected_population ?? 0;
  const altoCount = summary?.features.filter((f) => f.properties.risk_level === "alto").length ?? 0;
  const moderadoCount = summary?.features.filter((f) => f.properties.risk_level === "moderado").length ?? 0;
  const maxRain72h = imergCity?.features.reduce((mx, f) => {
    const v = f.properties.acc_72h_mm ?? 0;
    return v > mx ? v : mx;
  }, 0) ?? 0;

  return (
    <section aria-label={tr("dashboard", "lima")}>
      <SectionLabel className="mb-3">{tr("dashboard", "lima")}</SectionLabel>

      <div className="grid grid-cols-2 gap-4 py-4">
        {/* Active alerts */}
        <div>
          <p className={clsx(
            "text-3xl font-bold font-mono tabular-nums leading-none",
            activeCount > 0 ? "text-danger" : "text-ink",
          )}>
            {activeCount}
          </p>
          <p className="text-xs text-ink-muted mt-1">{tr("dashboard", "activeAlerts")}</p>
        </div>

        {/* Flood area */}
        <div>
          <p className="text-3xl font-bold font-mono tabular-nums leading-none text-accent">
            {floodArea.toFixed(1)}
            <span className="text-base font-normal text-ink-subtle ml-1">km²</span>
          </p>
          <p className="text-xs text-ink-muted mt-1">{tr("dashboard", "floodArea")}</p>
        </div>

        {/* Affected population */}
        <div>
          <p className="text-3xl font-bold font-mono tabular-nums leading-none text-ink">
            {affectedPop > 0
              ? affectedPop > 1000
                ? `~${(affectedPop / 1000).toFixed(0)}k`
                : String(affectedPop)
              : "—"}
          </p>
          <p className="text-xs text-ink-muted mt-1">
            {locale === "es" ? "Pob. en riesgo" : "Pop. at risk"}
          </p>
        </div>

        {/* Max rainfall 72h */}
        {maxRain72h > 0 && (
          <div>
            <p className={clsx(
              "text-3xl font-bold font-mono tabular-nums leading-none",
              maxRain72h >= 50 ? "text-danger" : maxRain72h >= 25 ? "text-warn-muted" : "text-ink",
            )}>
              {maxRain72h.toFixed(0)}
              <span className="text-base font-normal text-ink-subtle ml-1">mm</span>
            </p>
            <p className="text-xs text-ink-muted mt-1">
              {locale === "es" ? "Lluvia máx. 72h" : "Max 72h rain"}
            </p>
          </div>
        )}

        {/* Risk district breakdown */}
        {(altoCount > 0 || moderadoCount > 0) && (
          <div>
            <p className="text-3xl font-bold font-mono tabular-nums leading-none text-ink">
              {altoCount + moderadoCount}
            </p>
            <p className="text-xs text-ink-muted mt-1">
              {locale === "es" ? "distritos en alerta" : "districts on alert"}
            </p>
            <p className="text-xs mt-1">
              {altoCount > 0 && (
                <span className="text-danger font-medium">
                  {altoCount} {locale === "es" ? "alto" : "high"}
                </span>
              )}
              {altoCount > 0 && moderadoCount > 0 && (
                <span className="text-ink-subtle"> · </span>
              )}
              {moderadoCount > 0 && (
                <span className="text-warn-muted font-medium">
                  {moderadoCount} {locale === "es" ? "moderado" : "moderate"}
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Top-risk district list ───────────────────────────────────────────────────

function TopRiskList() {
  const { locale } = useUIStore();
  const tr = useT(locale);
  const { data: summary } = useDistrictRiskSummary();
  const { setScenario } = useUIStore();

  const at_risk = summary?.features
    .filter((f) => f.properties.risk_level !== "bajo")
    .sort((a, b) => {
      const order = { alto: 2, moderado: 1, bajo: 0 };
      return order[b.properties.risk_level] - order[a.properties.risk_level];
    })
    .slice(0, 8) ?? [];

  if (!at_risk.length) {
    return (
      <EmptyState
        title={locale === "es" ? "Sin distritos en alerta" : "No districts on alert"}
        body={tr("dashboard", "noDistricts")}
        icon={<CheckCircle2 size={14} />}
      />
    );
  }

  const RISK_DOT: Record<string, string> = {
    alto:     "bg-danger",
    moderado: "bg-warn",
    bajo:     "bg-ink-subtle",
  };

  return (
    <ul className="space-y-0.5">
      {at_risk.map((f) => (
        <li key={f.properties.ubigeo}>
          <button
            onClick={() =>
              setScenario({
                districtUbigeo: f.properties.ubigeo,
                districtName: f.properties.name,
              })
            }
            className="w-full flex items-center gap-2.5 text-left px-2 py-1.5 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <span
              className={clsx("h-2 w-2 rounded-full shrink-0", RISK_DOT[f.properties.risk_level])}
              aria-hidden="true"
            />
            <span className="text-sm text-ink flex-1 truncate">{f.properties.name}</span>
            {f.properties.active_alerts > 0 && (
              <Badge count={f.properties.active_alerts} variant="danger" />
            )}
            {f.properties.urgent_social_3h > 0 && (
              <Badge count={f.properties.urgent_social_3h} variant="warn" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── MetricCard — simple row layout ──────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  valueCls,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: string;
  sub: string;
  color: string;
  valueCls?: string;
}) {
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-ink-subtle">{label}</p>
        {sub && <p className="text-xs text-ink-subtle mt-0.5 leading-tight line-clamp-1">{sub}</p>}
      </div>
      <p className={clsx("text-sm font-semibold tabular-nums shrink-0 ml-3", valueCls ?? "text-ink")}>
        {value}
      </p>
    </div>
  );
}

// ─── District detail view ─────────────────────────────────────────────────────

const SEVERITY_BADGE_CLS: Record<string, string> = {
  critical: "bg-danger-soft text-danger",
  high:     "bg-warn-soft text-warn-muted",
  medium:   "bg-warn-soft/60 text-warn-muted",
  low:      "bg-accent-soft text-accent",
};

function DistrictDetail({ ubigeo }: { ubigeo: string }) {
  const { locale } = useUIStore();
  const tr = useT(locale);
  const { data, isLoading, isError, refetch } = useDistrictDashboard(ubigeo);
  const { data: fusion } = useFusion(ubigeo);

  if (isLoading)
    return <p className="text-xs text-ink-muted px-1 py-4 text-center">{tr("dashboard", "loading")}</p>;
  if (isError || !data)
    return (
      <div className="flex flex-col items-center gap-2 py-6">
        <p className="text-xs text-danger text-center">{tr("dashboard", "errorLoad")}</p>
        <button
          onClick={() => refetch()}
          className="text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
        >
          {locale === "es" ? "Reintentar" : "Retry"}
        </button>
      </div>
    );

  const imergValues = data.imerg_trend_30d.map((d) => d.acc_24h_mm);
  const maxImerg = Math.max(...imergValues, 0);
  const latestImerg = imergValues.at(-1) ?? 0;
  const activeAlerts = data.active_alerts.filter((a) => a.status === "active");

  const FUSION_SUNKEN_CLS: Record<string, string> = {
    alto:     "bg-danger-soft",
    moderado: "bg-warn-soft",
    bajo:     "bg-accent-soft",
  };
  const FUSION_RISK_CLS: Record<string, string> = {
    alto: "text-danger", moderado: "text-warn-muted", bajo: "text-accent",
  };

  const sarPolygonLabel = (n: number) =>
    locale === "es"
      ? `${n} ${n !== 1 ? tr("dashboard", "sarPolygonsPlural") : tr("dashboard", "sarPolygons")}`
      : `${n} Sentinel-1 ${n !== 1 ? "polygons" : "polygon"}`;

  return (
    <div className="space-y-4">
      {/* AI fusion prose */}
      {fusion?.prose_es && (
        <div className={clsx(
          "rounded-xl px-4 py-3",
          FUSION_SUNKEN_CLS[fusion.risk_level] ?? "bg-surface-sunken",
        )}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Brain size={10} className={FUSION_RISK_CLS[fusion.risk_level] ?? "text-ink-muted"} aria-hidden="true" />
            <p className="text-2xs font-semibold tracking-caps uppercase text-ink-subtle">
              {tr("dashboard", "multihazard")}
            </p>
            <span className={clsx(
              "ml-auto text-2xs font-bold uppercase",
              FUSION_RISK_CLS[fusion.risk_level],
            )}>
              {fusion.risk_level.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-ink leading-relaxed">
            {locale === "en" && fusion.prose_en ? fusion.prose_en : fusion.prose_es}
          </p>
        </div>
      )}

      {/* Active alerts list */}
      {activeAlerts.length > 0 && (
        <div>
          <p className="text-xs text-ink-muted mb-1.5 flex items-center gap-1">
            <AlertTriangle size={10} aria-hidden="true" />
            {tr("dashboard", "activeAlerts")} ({activeAlerts.length})
          </p>
          <ul className="space-y-1">
            {activeAlerts.map((a) => (
              <li key={a.id} className="flex items-start gap-2 bg-surface-sunken rounded-lg px-2.5 py-1.5">
                <span className={clsx(
                  "mt-0.5 shrink-0 text-2xs font-bold rounded px-1 py-0.5",
                  SEVERITY_BADGE_CLS[a.severity],
                )}>
                  {a.severity.slice(0, 4).toUpperCase()}
                </span>
                <p className="text-xs text-ink leading-snug line-clamp-2">{a.title}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metric rows */}
      <div>
        <MetricCard
          icon={Droplets}
          label={tr("dashboard", "rain24h")}
          value={latestImerg > 0 ? `${latestImerg.toFixed(1)} mm` : "— mm"}
          sub={maxImerg > 0 ? `${tr("dashboard", "maxLast30d")} ${maxImerg.toFixed(1)} mm` : tr("dashboard", "noRecentData")}
          color="text-accent"
          valueCls="text-accent"
        />
        <MetricCard
          icon={Users}
          label={tr("dashboard", "people")}
          value={data.district.population ? data.district.population.toLocaleString(locale === "es" ? "es-PE" : "en-US") : "—"}
          sub={data.district.area_km2 ? `${data.district.area_km2.toFixed(1)} km²` : ""}
          color="text-ink"
        />
        <MetricCard
          icon={History}
          label={tr("dashboard", "historical")}
          value={String(data.sinpad_historical_events)}
          sub={tr("dashboard", "sinpad")}
          color="text-warn-muted"
          valueCls="text-warn-muted"
        />
        {fusion?.flood.overlap_km2 != null && fusion.flood.overlap_km2 > 0 && (
          <MetricCard
            icon={Waves}
            label={tr("dashboard", "sarFlooded")}
            value={`${fusion.flood.overlap_km2.toFixed(1)} km²`}
            sub={sarPolygonLabel(fusion.flood.active_polygon_count)}
            color="text-accent"
            valueCls="text-accent"
          />
        )}
      </div>

      {/* IMERG 30-day sparkline */}
      {imergValues.length > 1 && (
        <div className="bg-surface-sunken rounded-xl px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs text-ink-muted flex items-center gap-1">
              <TrendingUp size={10} aria-hidden="true" /> {tr("dashboard", "rain30d")}
            </p>
            <p className="text-xs text-accent font-mono tabular-nums">{latestImerg.toFixed(1)} mm {tr("dashboard", "today")}</p>
          </div>
          <Sparkline values={imergValues} color={COSTA_300} />
        </div>
      )}

      {/* Alerts 7-day bar chart */}
      {data.alerts_trend_7d.length > 0 && (
        <div className="bg-surface-sunken rounded-xl px-3 py-2.5">
          <p className="text-xs text-ink-muted mb-1.5 flex items-center gap-1">
            <AlertTriangle size={10} aria-hidden="true" /> {tr("dashboard", "alerts7d")}
          </p>
          <BarMini days={data.alerts_trend_7d} />
        </div>
      )}

      {/* Social signals 24h */}
      {data.social_24h.length > 0 && (
        <div>
          <p className="text-xs text-ink-muted mb-1.5 flex items-center gap-1">
            <Radio size={10} aria-hidden="true" /> {tr("dashboard", "social24h")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.social_24h.map((s) => (
              <SocialPill key={s.label} item={s} locale={locale} />
            ))}
          </div>
        </div>
      )}

      {/* Hydro stations */}
      {data.stations.length > 0 && (
        <div>
          <p className="text-xs text-ink-muted mb-1.5">{tr("dashboard", "nearbyStations")}</p>
          <div className="space-y-1">
            {data.stations.map((st) => {
              const threshold = STATION_THRESHOLDS[st.code] ?? null;
              const overThreshold = threshold != null && st.level_m != null && st.level_m >= threshold;
              return (
                <div
                  key={st.code}
                  className={clsx(
                    "flex items-center justify-between rounded-xl px-3 py-2",
                    overThreshold
                      ? "bg-warn-soft border border-warn/20"
                      : "bg-surface-sunken",
                  )}
                >
                  <div>
                    <div className="flex items-center gap-1">
                      {overThreshold && <AlertTriangle size={9} className="text-warn-muted shrink-0" aria-hidden="true" />}
                      <p className={clsx("text-xs font-medium", overThreshold ? "text-warn-muted" : "text-ink")}>
                        {st.name}
                      </p>
                    </div>
                    <p className="text-2xs text-ink-subtle mt-0.5">{st.river} · {st.source.toUpperCase()}</p>
                    {overThreshold && threshold != null && (
                      <p className="text-2xs text-warn-muted mt-0.5">
                        {tr("dashboard", "threshold")} {threshold.toFixed(1)} m {tr("dashboard", "exceeded")}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    {st.level_m != null && (
                      <p className={clsx("text-xs font-mono tabular-nums", overThreshold ? "text-warn-muted" : "text-accent")}>
                        {st.level_m.toFixed(2)} m
                      </p>
                    )}
                    {st.flow_m3s != null && (
                      <p className="text-2xs text-ink-subtle font-mono tabular-nums">{st.flow_m3s.toFixed(1)} m³/s</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 72h Rainfall Forecast ────────────────────────────────────────────────────

const RISK_STEP_COLOR: Record<ForecastStep["risk"], { fill: string; stroke: string; valueCls: string }> = {
  bajo:     { fill: SEVERITY_LOW,    stroke: SEVERITY_LOW,      valueCls: "text-accent" },
  moderado: { fill: SEVERITY_MEDIUM, stroke: SEVERITY_MEDIUM,   valueCls: "text-warn-muted" },
  alto:     { fill: SEVERITY_HIGH,   stroke: SEVERITY_CRITICAL, valueCls: "text-danger" },
};

function ForecastChart({ steps }: { steps: ForecastStep[] }) {
  const W = 220; const H = 48;
  const values = steps.map((s) => s.rimac_mm);
  const maxVal = Math.max(...values, HUAYCO_THRESHOLD_MM + 10);
  const toY = (v: number) => H - (v / maxVal) * (H - 4) - 2;
  const toX = (i: number) => (i / (steps.length - 1)) * W;

  const pts = steps.map((s, i) => `${toX(i)},${toY(s.rimac_mm)}`).join(" ");
  const threshY = toY(HUAYCO_THRESHOLD_MM);

  const segments: { x1: number; y1: number; x2: number; y2: number; risk: ForecastStep["risk"] }[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    segments.push({
      x1: toX(i), y1: toY(steps[i].rimac_mm),
      x2: toX(i + 1), y2: toY(steps[i + 1].rimac_mm),
      risk: steps[i + 1].risk,
    });
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="w-full">
      <line x1={0} y1={threshY} x2={W} y2={threshY} stroke={SEVERITY_HIGH} strokeWidth={0.75} strokeDasharray="3,3" opacity={0.6} />
      <polyline
        points={`0,${H} ${pts} ${W},${H}`}
        fill={COSTA_300}
        fillOpacity={0.08}
        stroke="none"
      />
      {segments.map((seg, i) => (
        <line
          key={i}
          x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2}
          stroke={RISK_STEP_COLOR[seg.risk].stroke}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
      {steps.map((s, i) => (
        <circle
          key={i}
          cx={toX(i)} cy={toY(s.rimac_mm)}
          r={2.5}
          fill={RISK_STEP_COLOR[s.risk].fill}
          stroke="transparent"
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

function ForecastSection({ locale }: { locale: Locale }) {
  const steps = DEMO_FORECAST;
  const firstAlert = steps.find((s) => s.rimac_mm >= HUAYCO_THRESHOLD_MM);

  const label = {
    title:    { es: "Pronóstico 72h — Cuenca Rímac",  en: "72h Forecast — Rímac Watershed" },
    source:   { es: "SENAMHI · WRF",                  en: "SENAMHI · WRF" },
    preAlert: { es: "PRE-ALERTA",                     en: "PRE-ALERT" },
    thresh:   { es: "Umbral huayco",                  en: "Huayco threshold" },
    at:       { es: "en",                             en: "at" },
    prob:     { es: "prob.",                          en: "prob." },
    rim:      { es: "Rímac · mm acumulado",           en: "Rímac · accumulated mm" },
    risk: {
      bajo:     { es: "BAJO",  en: "LOW" },
      moderado: { es: "MOD",   en: "MOD" },
      alto:     { es: "ALTO",  en: "HIGH" },
    },
  } as const;
  const L = (obj: { es: string; en: string }) => obj[locale];

  return (
    <section>
      <Divider className="mb-4" />
      <div className="flex items-baseline justify-between mb-3">
        <SectionLabel>{L(label.title)}</SectionLabel>
        <p className="font-mono text-2xs text-ink-subtle">{L(label.source)}</p>
      </div>

      <div className="mb-3">
        <ForecastChart steps={steps} />
        <div className="flex justify-between px-0.5 mt-1">
          {steps.map((s) => (
            <span key={s.hours} className="font-mono text-2xs text-ink-subtle tabular-nums">+{s.hours}h</span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 mb-3">
        {steps.map((step) => {
          const cfg = RISK_STEP_COLOR[step.risk];
          return (
            <div key={step.hours} className="text-center">
              <p className={clsx("font-bold font-mono tabular-nums text-base leading-none", cfg.valueCls)}>
                {step.rimac_mm.toFixed(0)}
              </p>
              <p className="text-2xs text-ink-subtle mt-1">{L(label.risk[step.risk])}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between">
        <span className="text-2xs text-ink-subtle">{L(label.rim)}</span>
        <span className="text-2xs text-danger">{L(label.thresh)} {HUAYCO_THRESHOLD_MM} mm</span>
      </div>

      {firstAlert && (
        <div className="mt-3 pl-3 border-l-2 border-danger">
          <p className="text-2xs font-semibold tracking-caps uppercase text-danger mb-1">{L(label.preAlert)}</p>
          <p className="text-xs text-ink leading-snug">
            {L(label.thresh)} {L(label.at)} +{firstAlert.hours}h —{" "}
            <span className="font-mono tabular-nums">{firstAlert.rimac_mm.toFixed(0)} mm</span>{" "}
            ({(firstAlert.huayco_prob * 100).toFixed(0)}% {L(label.prob)})
          </p>
        </div>
      )}
      <Divider className="mt-4" />
    </section>
  );
}

// ─── Resource deployment status ───────────────────────────────────────────────

const STATUS_BAR_CLS: Record<ResourceCategory["status"], string> = {
  ok:      "bg-accent",
  partial: "bg-warn",
  deficit: "bg-danger",
};

function ResourceStatus({ locale }: { locale: Locale }) {
  const label = {
    title:  { es: "Recursos desplegados", en: "Deployed Resources" },
    source: { es: "INDECI COEN",          en: "INDECI COEN" },
  } as const;
  const L = (obj: { es: string; en: string }) => obj[locale];

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <SectionLabel>{L(label.title)}</SectionLabel>
        <p className="font-mono text-2xs text-ink-subtle">{L(label.source)}</p>
      </div>
      <ul className="space-y-3">
        {DEMO_RESOURCES.map((r) => {
          const pct = Math.min((r.deployed / r.count) * 100, 100);
          return (
            <li key={r.id} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2">
              <span className="font-mono text-2xs text-ink-subtle tabular-nums" aria-hidden="true">
                {r.icon}
              </span>
              <div>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs text-ink truncate">{L(r.label)}</span>
                  <span className="font-mono text-2xs text-ink-subtle tabular-nums shrink-0 ml-2">
                    {r.deployed}/{r.count}
                  </span>
                </div>
                <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                  <div
                    className={clsx("h-full rounded-full transition-all", STATUS_BAR_CLS[r.status])}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <span className="text-2xs text-ink-subtle">{L(r.unit)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Incident timeline (city-wide) ───────────────────────────────────────────

type EventKind = "alert" | "dispatch" | "protocol" | "action" | "social" | "field";

interface EventItem {
  id: string;
  time: string;
  kind: EventKind;
  badge: string;
  badgeCls: string;
  dotCls: string;
  text: string;
  sub?: string;
}

const ALERT_TYPE_ES: Record<string, string> = {
  flood: "Inundación", huayco: "Huayco", social_cluster: "Señal social", weather: "Meteorológica",
};
const ALERT_TYPE_EN: Record<string, string> = {
  flood: "Flood", huayco: "Mudslide", social_cluster: "Social signal", weather: "Weather",
};

const LOG_ACTION_ES: Record<string, { badge: string; verb: string }> = {
  alert_acknowledge:   { badge: "ACK",     verb: "Alerta reconocida" },
  alert_escalate:      { badge: "ESC↑",    verb: "Escalado a INDECI" },
  alert_false_positive:{ badge: "FP",      verb: "Falsa alarma marcada" },
  alert_close:         { badge: "CIERRE",  verb: "Alerta cerrada" },
  resource_dispatch:   { badge: "DESP",    verb: "Recursos despachados" },
  protocol_step:       { badge: "PROT",    verb: "Paso de protocolo" },
  field_report:        { badge: "CAMPO",   verb: "Reporte de campo" },
  map_pin:             { badge: "PIN",     verb: "Marcador de campo" },
};
const LOG_ACTION_EN: Record<string, { badge: string; verb: string }> = {
  alert_acknowledge:   { badge: "ACK",     verb: "Alert acknowledged" },
  alert_escalate:      { badge: "ESC↑",    verb: "Escalated to INDECI" },
  alert_false_positive:{ badge: "FP",      verb: "Marked false alarm" },
  alert_close:         { badge: "CLOSE",   verb: "Alert closed" },
  resource_dispatch:   { badge: "DISP",    verb: "Resources dispatched" },
  protocol_step:       { badge: "PROT",    verb: "Protocol step" },
  field_report:        { badge: "FIELD",   verb: "Field report" },
  map_pin:             { badge: "PIN",     verb: "Field marker" },
};

const SOURCE_LABEL_SHORT: Record<string, string> = {
  bluesky: "Bluesky", telegram: "TG", reddit: "Reddit", campo: "Campo", rss: "RSS",
};

function IncidentTimeline({ locale }: { locale: Locale }) {
  const { data: alerts = [], isLoading: alertsLoading } = useAlerts();
  const { data: log = [], isLoading: logLoading } = useDecisionLog(20);
  const { data: socialData, isLoading: socialLoading } = useSocialSignals(6);
  const isLoading = alertsLoading || logLoading || socialLoading;

  const events: EventItem[] = [];
  const ATYPE = locale === "es" ? ALERT_TYPE_ES : ALERT_TYPE_EN;
  const LACT = locale === "es" ? LOG_ACTION_ES : LOG_ACTION_EN;

  for (const a of alerts.slice(0, 4)) {
    events.push({
      id: `a-${a.id}`,
      time: a.created_at,
      kind: "alert",
      badge: a.severity === "critical" ? (locale === "es" ? "CRIT" : "CRIT")
           : a.severity === "high"     ? (locale === "es" ? "ALTO" : "HIGH")
           :                             (locale === "es" ? "MED"  : "MED"),
      badgeCls: a.severity === "critical" ? "bg-danger-soft text-danger"
              : a.severity === "high"     ? "bg-warn-soft text-warn-muted"
              :                             "bg-surface-sunken text-ink-muted border border-border",
      dotCls: a.severity === "critical" ? "bg-danger" : a.severity === "high" ? "bg-warn" : "bg-warn/60",
      text: a.title,
      sub: ATYPE[a.type] ?? a.type,
    });
  }

  for (const entry of log.slice(0, 6)) {
    const meta = LACT[entry.action_type] ?? { badge: "LOG", verb: entry.action_type.replace(/_/g, " ") };
    const payload = entry.payload as Record<string, unknown>;
    let detail = "";
    if (entry.action_type === "resource_dispatch") {
      detail = String(payload.resource_name ?? payload.resource ?? "");
    } else if (entry.action_type === "protocol_step") {
      detail = String(payload.label ?? payload.step ?? "");
    } else if (entry.action_type === "field_report") {
      detail = String(payload.label_es ?? payload.label ?? "");
      const dist = payload.district ? ` · ${payload.district}` : "";
      detail += dist;
    } else if (entry.action_type === "map_pin") {
      detail = String(payload.district ?? payload.label ?? "");
    }
    events.push({
      id: `l-${entry.id}`,
      time: entry.logged_at,
      kind: entry.action_type === "resource_dispatch" ? "dispatch"
          : entry.action_type === "protocol_step"     ? "protocol"
          : entry.action_type === "field_report"      ? "field"
          :                                             "action",
      badge: meta.badge,
      badgeCls: entry.action_type === "resource_dispatch" ? "bg-accent-soft text-accent"
              : entry.action_type === "field_report"      ? "bg-ok-soft text-ok-muted"
              :                                             "bg-surface-sunken text-ink-muted border border-border",
      dotCls: "bg-ink-subtle",
      text: detail || meta.verb,
      sub: detail ? meta.verb : entry.operator_id,
    });
  }

  const _URGENT_LABELS = new Set(["needs_help", "road_blocked", "huayco_observation", "flood_observation"]);
  for (const f of (socialData?.features ?? [])
    .filter((f) => _URGENT_LABELS.has(f.properties.triage_label ?? ""))
    .slice(0, 3)) {
    const src = SOURCE_LABEL_SHORT[f.properties.source ?? ""] ?? f.properties.source ?? "?";
    const txt = (f.properties.text?.slice(0, 60) ?? (locale === "es" ? "Señal social" : "Social signal"));
    const labelKey = f.properties.triage_label ?? "";
    const subEs = LABEL_TEXT[labelKey]?.es ?? labelKey.replace(/_/g, " ");
    const subEn = LABEL_TEXT[labelKey]?.en ?? labelKey.replace(/_/g, " ");
    events.push({
      id: `s-${f.properties.id}`,
      time: f.properties.ingested_at,
      kind: "social",
      badge: src,
      badgeCls: "bg-costa-soft text-costa-400 border border-costa-400/20",
      dotCls: "bg-accent",
      text: txt,
      sub: locale === "es" ? subEs : subEn,
    });
  }

  events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  const top = events.slice(0, 10);

  const title = locale === "es" ? "Cronología del incidente" : "Incident timeline";

  if (isLoading && top.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-3">
          <History size={10} className="text-ink-subtle" aria-hidden="true" />
          <SectionLabel>{title}</SectionLabel>
        </div>
        <p className="text-xs text-ink-muted py-4 text-center animate-pulse" aria-live="polite">
          {locale === "es" ? "Cargando cronología…" : "Loading timeline…"}
        </p>
      </div>
    );
  }

  if (top.length === 0) return null;
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" });

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-3">
        <History size={10} className="text-ink-subtle" aria-hidden="true" />
        <SectionLabel>{title}</SectionLabel>
      </div>
      <ol className="relative space-y-0" aria-label={title}>
        {/* Vertical connector line */}
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border-subtle" aria-hidden="true" />
        {top.map((ev) => (
          <li key={ev.id} className="relative flex items-start gap-2.5 pb-3 last:pb-0">
            <span className={clsx("w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 z-10 ring-2 ring-surface", ev.dotCls)} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-1.5 flex-wrap">
                <span className={clsx(
                  "inline-flex items-center text-2xs font-bold uppercase rounded px-1.5 py-0.5 shrink-0 leading-none",
                  ev.badgeCls,
                )}>
                  {ev.badge}
                </span>
                <p className="text-xs text-ink leading-snug flex-1 min-w-0 line-clamp-2">{ev.text}</p>
              </div>
              {ev.sub && (
                <p className="text-2xs text-ink-subtle mt-0.5 ml-0">{ev.sub}</p>
              )}
            </div>
            <time
              className="text-2xs text-ink-subtle shrink-0 font-mono tabular-nums mt-0.5"
              dateTime={ev.time}
            >
              {formatTime(ev.time)}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function DistrictDashboardPanel() {
  const { activePanel, scenario, locale } = useUIStore();
  const tr = useT(locale);
  if (activePanel !== "dashboard") return null;

  const title = scenario.districtName ?? tr("dashboard", "titleCity");

  return (
    <aside
      className={clsx(
        // Mobile: sheet from bottom
        "fixed bottom-14 left-0 right-0 h-[80vh] rounded-t-2xl",
        "bg-surface border-t border-border-strong shadow-panel z-20",
        // Desktop: flush right panel
        "sm:absolute sm:top-0 sm:right-0 sm:bottom-auto sm:left-auto",
        "sm:h-full sm:w-[400px] sm:rounded-none sm:border-t-0",
        "sm:border-l sm:border-border-strong",
        "flex flex-col panel-animate",
      )}
      aria-label={tr("dashboard", "panelLabel")}
    >
      {/* Mobile drag handle */}
      <div className="sm:hidden flex justify-center pt-2.5 pb-1" aria-hidden="true">
        <div className="w-10 h-[3px] bg-border-strong rounded-full" />
      </div>

      {/* Header */}
      <PanelHeader border className="px-5 pt-4 pb-3 gap-2">
        <BarChart3 size={15} className="text-ink-muted shrink-0" aria-hidden="true" />
        <PanelTitle>{title}</PanelTitle>
        {scenario.districtUbigeo && (
          <span className="font-mono text-2xs text-ink-subtle tabular-nums shrink-0">
            {scenario.districtUbigeo}
          </span>
        )}
        <EDANReportButton />
      </PanelHeader>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {scenario.districtUbigeo ? (
          <DistrictDetail ubigeo={scenario.districtUbigeo} />
        ) : (
          <>
            <SituationSummary />
            <Divider />
            <CityOverview />
            <Divider />
            <IncidentTimeline locale={locale} />
            <ForecastSection locale={locale} />
            <ResourceStatus locale={locale} />
            <Divider />
            <div>
              <SectionLabel className="mb-3">
                {tr("dashboard", "priorityDistricts")}
              </SectionLabel>
              <TopRiskList />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
