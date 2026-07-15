// ---------------------------------------------------------------------------
// Report HTML Template — Dependency-free HTML generation for BouCheck reports
//
// Renders a complete, self-contained HTML document suitable for:
//   - Serving via GET /r/{token} (Public_Report_Endpoint)
//   - PDF rendering via Playwright (no client-side JS required)
//
// Requirements covered:
//   6.1 — Visual_Identity, nome, empresa, Normalized_Score, Maturity_Band, answer summary, recommendation
//   6.2 — Radar-chart data when dimensionScores is non-empty
//   6.3 — Render without band name/description when band is null
//   6.4 — Each answered question text and answer text in summary
//   10.1 — Footer with BeOnUp contact info
//   10.2 — Footer CTA linking to link_agendamento
// ---------------------------------------------------------------------------

import { buildLogoUrl } from '#support/build_logo_url'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportContext {
  response: { nome: string | null; empresa: string | null }
  visualIdentity: {
    corPrimaria?: string
    corSecundaria?: string
    corFundo?: string
    logoS3Key?: string
  }
  normalizedScore: number
  band: { nome: string; descricao: string } | null
  dimensionScores: Array<{ dimensao: string; normalized: number }>
  answerSummary: Array<{ questionText: string; answerText: string }>
  recommendationText: string
  footer: { contact: string; linkAgendamento: string | null; telefoneWhatsapp: string | null }
}

// ---------------------------------------------------------------------------
// HTML Escaping
// ---------------------------------------------------------------------------

const ESC_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Escapes HTML special characters in user-provided or survey-authored text.
 * All respondent/survey content MUST pass through this before interpolation.
 */
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_MAP[c]!)
}

// ---------------------------------------------------------------------------
// Main render function
// ---------------------------------------------------------------------------

export function renderReportHtml(ctx: ReportContext): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Relatório de Diagnóstico</title>
  <style>${buildInlineStyles(ctx.visualIdentity)}</style>
</head>
<body>
  ${renderHeader(ctx)}
  ${renderScoreSection(ctx)}
  ${ctx.dimensionScores.length > 0 ? renderRadarChart(ctx.dimensionScores) : ''}
  ${ctx.dimensionScores.length > 0 ? renderPillarBars(ctx.dimensionScores) : ''}
  ${renderRecommendation(ctx.recommendationText)}
  ${renderAnswerSummary(ctx.answerSummary)}
  ${renderFooter(ctx.footer)}
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Inline Styles
// ---------------------------------------------------------------------------

function buildInlineStyles(vi: ReportContext['visualIdentity']): string {
  const primary = vi.corPrimaria || '#1a73e8'
  const secondary = vi.corSecundaria || '#34a853'
  const background = vi.corFundo || '#ffffff'

  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: ${esc(background)};
      color: #333;
      line-height: 1.6;
      padding: 40px 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header { text-align: center; margin-bottom: 40px; }
    .header .logo { max-width: 180px; max-height: 80px; margin-bottom: 16px; }
    .header h1 { color: ${esc(primary)}; font-size: 24px; margin-bottom: 8px; }
    .header .respondent-info { color: #666; font-size: 14px; }
    .score-section { text-align: center; margin-bottom: 40px; padding: 32px; border-radius: 12px; background: #f8f9fa; }
    .score-section .score-value { font-size: 48px; font-weight: bold; color: ${esc(primary)}; }
    .score-section .score-label { font-size: 14px; color: #666; margin-top: 4px; }
    .score-section .band-name { font-size: 20px; font-weight: 600; color: ${esc(secondary)}; margin-top: 12px; }
    .score-section .band-description { font-size: 14px; color: #555; margin-top: 8px; max-width: 600px; margin-left: auto; margin-right: auto; }
    .radar-section { text-align: center; margin-bottom: 40px; }
    .radar-section h2 { color: ${esc(primary)}; font-size: 20px; margin-bottom: 16px; }
    .radar-section svg { max-width: 100%; height: auto; }
    .recommendation-section { margin-bottom: 40px; padding: 24px; border-left: 4px solid ${esc(secondary)}; background: #f0fdf4; border-radius: 0 8px 8px 0; }
    .recommendation-section h2 { color: ${esc(primary)}; font-size: 20px; margin-bottom: 12px; }
    .recommendation-section .recommendation-text { font-size: 15px; color: #333; white-space: pre-wrap; }
    .answers-section { margin-bottom: 40px; }
    .answers-section h2 { color: ${esc(primary)}; font-size: 20px; margin-bottom: 16px; }
    .answer-item { margin-bottom: 16px; padding: 16px; background: #f8f9fa; border-radius: 8px; }
    .answer-item .question-text { font-weight: 600; font-size: 14px; color: #333; margin-bottom: 4px; }
    .answer-item .answer-text { font-size: 14px; color: #555; }
    .footer { text-align: center; margin-top: 48px; padding-top: 24px; border-top: 1px solid #e0e0e0; }
    .footer .contact { font-size: 13px; color: #666; margin-bottom: 16px; }
    .footer .cta-link {
      display: inline-block; padding: 12px 32px; background: ${esc(primary)};
      color: #fff; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 600;
    }
    .pillar-bars-section { margin: 0 0 40px; }
    .pillar-bar-row { display: flex; align-items: center; gap: 14px; padding: 11px 0; border-bottom: 1px solid #e0e0e0; }
    .pillar-bar-row:last-child { border-bottom: none; }
    .pillar-bar-name { flex: 1; font-size: 14px; font-weight: 600; }
    .pillar-bar-track { flex: 2; height: 9px; background: #e0e0e0; border-radius: 99px; overflow: hidden; }
    .pillar-bar-fill { display: block; height: 100%; border-radius: 99px; }
    .pillar-bar-score { width: 44px; text-align: right; font-weight: 600; font-size: 14px; }
  `
}

// ---------------------------------------------------------------------------
// Section Renderers
// ---------------------------------------------------------------------------

function renderHeader(ctx: ReportContext): string {
  const logoUrl = buildLogoUrl(ctx.visualIdentity.logoS3Key ?? null)
  const logoHtml = logoUrl
    ? `<img class="logo" src="${esc(logoUrl)}" alt="Logo" />`
    : ''

  const nome = ctx.response.nome ? esc(ctx.response.nome) : ''
  const empresa = ctx.response.empresa ? esc(ctx.response.empresa) : ''

  const respondentParts: string[] = []
  if (nome) respondentParts.push(nome)
  if (empresa) respondentParts.push(empresa)

  const respondentHtml = respondentParts.length > 0
    ? `<p class="respondent-info">${respondentParts.join(' — ')}</p>`
    : ''

  return `<div class="header">
    ${logoHtml}
    <h1>Relatório de Diagnóstico</h1>
    ${respondentHtml}
  </div>`
}

function renderScoreSection(ctx: ReportContext): string {
  const scoreFormatted = ctx.normalizedScore.toFixed(1)

  let bandHtml = ''
  if (ctx.band) {
    bandHtml = `
      <div class="band-name">${esc(ctx.band.nome)}</div>
      <p class="band-description">${esc(ctx.band.descricao)}</p>`
  }

  return `<div class="score-section">
    <div class="score-value">${scoreFormatted}</div>
    <div class="score-label">Pontuação Normalizada (0–100)</div>
    ${bandHtml}
  </div>`
}

function renderRadarChart(dimensionScores: Array<{ dimensao: string; normalized: number }>): string {
  const n = dimensionScores.length
  if (n < 3) {
    // Radar charts need at least 3 axes to be meaningful; fall back to a list
    return renderDimensionList(dimensionScores)
  }

  const size = 400
  const cx = size / 2
  const cy = size / 2
  const radius = 150
  const levels = 5

  // Compute angle for each axis (starting from top, going clockwise)
  const angleStep = (2 * Math.PI) / n
  const startAngle = -Math.PI / 2

  function polarToXY(angle: number, r: number): { x: number; y: number } {
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }

  // Grid circles
  let gridLines = ''
  for (let level = 1; level <= levels; level++) {
    const r = (radius / levels) * level
    const points = Array.from({ length: n }, (_, i) => {
      const angle = startAngle + i * angleStep
      const { x, y } = polarToXY(angle, r)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ')
    gridLines += `<polygon points="${points}" fill="none" stroke="#e0e0e0" stroke-width="1" />\n`
  }

  // Axis lines
  let axisLines = ''
  for (let i = 0; i < n; i++) {
    const angle = startAngle + i * angleStep
    const { x, y } = polarToXY(angle, radius)
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#ccc" stroke-width="1" />\n`
  }

  // Axis labels
  let labels = ''
  for (let i = 0; i < n; i++) {
    const angle = startAngle + i * angleStep
    const labelRadius = radius + 20
    const { x, y } = polarToXY(angle, labelRadius)
    const anchor = x < cx - 5 ? 'end' : x > cx + 5 ? 'start' : 'middle'
    labels += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="11" fill="#555">${esc(dimensionScores[i].dimensao)}</text>\n`
  }

  // Data polygon
  const dataPoints = dimensionScores.map((d, i) => {
    const angle = startAngle + i * angleStep
    const r = (d.normalized / 100) * radius
    const { x, y } = polarToXY(angle, r)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // Data dots
  let dataDots = ''
  dimensionScores.forEach((d, i) => {
    const angle = startAngle + i * angleStep
    const r = (d.normalized / 100) * radius
    const { x, y } = polarToXY(angle, r)
    dataDots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#1a73e8" />\n`
  })

  const svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${axisLines}
    <polygon points="${dataPoints}" fill="rgba(26,115,232,0.2)" stroke="#1a73e8" stroke-width="2" />
    ${dataDots}
    ${labels}
  </svg>`

  return `<div class="radar-section">
    <h2>Resultados por Dimensão</h2>
    ${svg}
  </div>`
}

/**
 * Fallback for fewer than 3 dimensions — renders a simple bar list instead of a radar.
 */
function renderDimensionList(dimensionScores: Array<{ dimensao: string; normalized: number }>): string {
  const items = dimensionScores.map((d) => {
    return `<div class="answer-item">
      <span class="question-text">${esc(d.dimensao)}</span>
      <span class="answer-text">${d.normalized.toFixed(1)}%</span>
    </div>`
  }).join('\n')

  return `<div class="radar-section">
    <h2>Resultados por Dimensão</h2>
    ${items}
  </div>`
}

/**
 * Returns a color based on the maturity level for a given score (0-100).
 */
function scoreColor(score: number): string {
  if (score <= 20) return '#C4453C'
  if (score <= 40) return '#D96B3B'
  if (score <= 60) return '#D99A32'
  if (score <= 80) return '#3E8E5A'
  return '#0E7C86'
}

/**
 * Renders pillar bars below the radar chart showing each dimension's score
 * as a colored progress bar — replicating the Raio-X visual style.
 */
function renderPillarBars(dimensionScores: Array<{ dimensao: string; normalized: number }>): string {
  if (dimensionScores.length === 0) return ''

  const bars = dimensionScores.map((d) => {
    const color = scoreColor(d.normalized)
    const pct = Math.round(d.normalized)
    return `<div class="pillar-bar-row">
      <span class="pillar-bar-name">${esc(d.dimensao)}</span>
      <span class="pillar-bar-track"><span class="pillar-bar-fill" style="width:${pct}%;background:${color}"></span></span>
      <span class="pillar-bar-score" style="color:${color}">${pct}</span>
    </div>`
  }).join('\n')

  return `<div class="pillar-bars-section">${bars}</div>`
}

function renderRecommendation(recommendationText: string): string {
  return `<div class="recommendation-section">
    <h2>Recomendações</h2>
    <div class="recommendation-text">${esc(recommendationText)}</div>
  </div>`
}

function renderAnswerSummary(answerSummary: Array<{ questionText: string; answerText: string }>): string {
  if (answerSummary.length === 0) {
    return ''
  }

  const items = answerSummary.map((item) => {
    return `<div class="answer-item">
      <div class="question-text">${esc(item.questionText)}</div>
      <div class="answer-text">${esc(item.answerText)}</div>
    </div>`
  }).join('\n')

  return `<div class="answers-section">
    <h2>Resumo das Respostas</h2>
    ${items}
  </div>`
}

function renderFooter(footer: ReportContext['footer']): string {
  let ctaHtml = ''

  if (footer.telefoneWhatsapp) {
    // Build WhatsApp link using the survey's telefone_whatsapp (same behavior as concluido page)
    const whatsappUrl = `https://wa.me/${footer.telefoneWhatsapp}`
    ctaHtml = `<a class="cta-link" href="${esc(whatsappUrl)}" target="_blank" rel="noopener noreferrer">Agendar apresentação com um consultor</a>`
  } else if (footer.linkAgendamento && footer.linkAgendamento !== '#') {
    ctaHtml = `<a class="cta-link" href="${esc(footer.linkAgendamento)}" target="_blank" rel="noopener noreferrer">Agendar apresentação com um consultor</a>`
  }

  return `<div class="footer">
    <div class="contact">${esc(footer.contact)}</div>
    ${ctaHtml}
  </div>`
}
