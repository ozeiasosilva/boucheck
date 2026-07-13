import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ResponseParser } from '../../app/support/response_parser.js'

/**
 * Unit tests for ResponseParser
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

describe('ResponseParser.parse', () => {
  it('valid bare JSON array → conforming (Req 4.6)', async () => {
    const raw = JSON.stringify([
      { texto: 'Pergunta 1', tipo: 'aberta', obrigatoria: true, opcoes: [] },
    ])
    const result = await ResponseParser.parse(raw)
    assert.strictEqual(result.kind, 'conforming')
    if (result.kind === 'conforming') {
      assert.strictEqual(result.questions.length, 1)
      assert.strictEqual(result.questions[0].texto, 'Pergunta 1')
      assert.strictEqual(result.questions[0].tipo, 'aberta')
    }
  })

  it('valid JSON with ```json fences → conforming (Req 4.1)', async () => {
    const inner = JSON.stringify([
      {
        texto: 'P1',
        tipo: 'escolha_unica',
        obrigatoria: false,
        opcoes: [
          { texto: 'A', pontuacao: 1 },
          { texto: 'B', pontuacao: 2 },
        ],
      },
    ])
    const raw = '```json\n' + inner + '\n```'
    const result = await ResponseParser.parse(raw)
    assert.strictEqual(result.kind, 'conforming')
  })

  it('valid JSON surrounded by prose → conforming (Req 4.1)', async () => {
    const inner = JSON.stringify([
      {
        texto: 'Q',
        tipo: 'multipla_escolha',
        obrigatoria: true,
        opcoes: [
          { texto: 'X', pontuacao: 5 },
          { texto: 'Y', pontuacao: 3 },
        ],
      },
    ])
    const raw = 'Here are the questions:\n' + inner + '\nHope this helps!'
    const result = await ResponseParser.parse(raw)
    assert.strictEqual(result.kind, 'conforming')
  })

  it('no JSON array found → non_conforming (Req 4.7)', async () => {
    const result = await ResponseParser.parse('not json at all')
    assert.strictEqual(result.kind, 'non_conforming')
  })

  it('empty texto violates minLength → non_conforming (Req 4.3)', async () => {
    const raw = JSON.stringify([
      { texto: '', tipo: 'aberta', obrigatoria: true, opcoes: [] },
    ])
    const result = await ResponseParser.parse(raw)
    assert.strictEqual(result.kind, 'non_conforming')
  })

  it('empty input → non_conforming (Req 4.7)', async () => {
    const result = await ResponseParser.parse('')
    assert.strictEqual(result.kind, 'non_conforming')
  })

  it('invalid tipo value → non_conforming (Req 4.3)', async () => {
    const raw = JSON.stringify([
      { texto: 'Q', tipo: 'invalido', obrigatoria: true, opcoes: [] },
    ])
    const result = await ResponseParser.parse(raw)
    assert.strictEqual(result.kind, 'non_conforming')
  })

  it('missing obrigatoria field → non_conforming (Req 4.3)', async () => {
    const raw = JSON.stringify([{ texto: 'Q', tipo: 'aberta', opcoes: [] }])
    const result = await ResponseParser.parse(raw)
    assert.strictEqual(result.kind, 'non_conforming')
  })

  it('multiple questions all valid → conforming with correct count (Req 4.2)', async () => {
    const raw = JSON.stringify([
      { texto: 'Q1', tipo: 'aberta', obrigatoria: true, opcoes: [] },
      {
        texto: 'Q2',
        tipo: 'escolha_unica',
        obrigatoria: false,
        opcoes: [
          { texto: 'A', pontuacao: 1 },
          { texto: 'B', pontuacao: 2 },
        ],
      },
    ])
    const result = await ResponseParser.parse(raw)
    assert.strictEqual(result.kind, 'conforming')
    if (result.kind === 'conforming') {
      assert.strictEqual(result.questions.length, 2)
    }
  })

  it('opcoes with empty texto → non_conforming (Req 4.4)', async () => {
    const raw = JSON.stringify([
      {
        texto: 'Q1',
        tipo: 'escolha_unica',
        obrigatoria: true,
        opcoes: [
          { texto: '', pontuacao: 1 },
          { texto: 'B', pontuacao: 2 },
        ],
      },
    ])
    const result = await ResponseParser.parse(raw)
    assert.strictEqual(result.kind, 'non_conforming')
  })
})
