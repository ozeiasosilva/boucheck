import { renderReportHtml, esc } from './app/support/report_html_template.js'

// Test esc
console.log('esc test:', esc('<script>alert("xss")</script>'))

// Test render with band and dimensions
const html = renderReportHtml({
  response: { nome: 'João', empresa: 'Acme Corp' },
  visualIdentity: { corPrimaria: '#ff0000' },
  normalizedScore: 72.5,
  band: { nome: 'Avançado', descricao: 'Maturidade elevada' },
  dimensionScores: [
    { dimensao: 'Gestão', normalized: 80 },
    { dimensao: 'Tecnologia', normalized: 65 },
    { dimensao: 'Processos', normalized: 72 },
  ],
  answerSummary: [
    { questionText: 'Qual seu nível?', answerText: 'Intermediário' },
  ],
  recommendationText: 'Continue investindo em capacitação.',
  footer: { contact: 'contato@beonup.com.br', linkAgendamento: 'https://calendly.com/beonup' },
})

console.log('HTML length:', html.length)
console.log('Has DOCTYPE:', html.includes('<!DOCTYPE html>'))
console.log('Has nome:', html.includes('João'))
console.log('Has empresa:', html.includes('Acme Corp'))
console.log('Has score:', html.includes('72.5'))
console.log('Has band:', html.includes('Avançado'))
console.log('Has radar SVG:', html.includes('<svg'))
console.log('Has recommendation:', html.includes('Continue investindo'))
console.log('Has answer:', html.includes('Qual seu nível?'))
console.log('Has footer contact:', html.includes('contato@beonup.com.br'))
console.log('Has CTA link:', html.includes('calendly.com/beonup'))

// Test without band (Req 6.3)
const htmlNoBand = renderReportHtml({
  response: { nome: null, empresa: null },
  visualIdentity: {},
  normalizedScore: 50,
  band: null,
  dimensionScores: [],
  answerSummary: [],
  recommendationText: 'Texto padrão.',
  footer: { contact: 'contato@beonup.com.br', linkAgendamento: 'https://calendly.com/beonup' },
})

console.log('\n--- No band, no dimensions ---')
// The CSS still contains .band-name style definition, but no rendered element should exist
console.log('No band element rendered:', !htmlNoBand.includes('<div class="band-name">'))
console.log('No SVG:', !htmlNoBand.includes('<svg'))
console.log('Has score 50.0:', htmlNoBand.includes('50.0'))
