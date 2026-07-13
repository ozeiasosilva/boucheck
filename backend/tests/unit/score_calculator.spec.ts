import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ScoreCalculator } from '../../app/services/score_calculator.js'
import type { AnsweredChoice, MaturityBandDef } from '../../app/services/score_calculator.js'

/**
 * Unit tests for ScoreCalculator.compute
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.1, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.5
 */

describe('ScoreCalculator.compute', () => {
  describe('raw score summation (Req 2.1, 2.3)', () => {
    it('sums pontuacao × peso for single-select questions', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 2, dimensao: null, selectedPontuacoes: [3], maxOptionPontuacao: 5 },
        { questionId: 2, peso: 1, dimensao: null, selectedPontuacoes: [4], maxOptionPontuacao: 5 },
      ]
      const result = ScoreCalculator.compute(answers, [])
      // (3*2) + (4*1) = 6 + 4 = 10
      assert.strictEqual(result.rawScore, 10)
    })

    it('includes every selected option for multi-select questions (Req 2.3)', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 2, dimensao: null, selectedPontuacoes: [3, 2], maxOptionPontuacao: 5 },
      ]
      const result = ScoreCalculator.compute(answers, [])
      // (3*2 + 2*2) = 6 + 4 = 10
      assert.strictEqual(result.rawScore, 10)
    })
  })

  describe('max possible score (Req 5.1)', () => {
    it('sums maxOptionPontuacao × peso over all questions', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 2, dimensao: null, selectedPontuacoes: [3], maxOptionPontuacao: 5 },
        { questionId: 2, peso: 3, dimensao: null, selectedPontuacoes: [1], maxOptionPontuacao: 4 },
      ]
      const result = ScoreCalculator.compute(answers, [])
      // (5*2) + (4*3) = 10 + 12 = 22
      assert.strictEqual(result.maxPossibleScore, 22)
    })
  })

  describe('normalization (Req 5.2, 5.3, 5.5)', () => {
    it('normalizes raw score as a percentage of max possible', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 1, dimensao: null, selectedPontuacoes: [3], maxOptionPontuacao: 6 },
      ]
      const result = ScoreCalculator.compute(answers, [])
      // (3/6) * 100 = 50
      assert.strictEqual(result.normalizedScore, 50)
    })

    it('returns 0 when max possible score is zero (Req 5.3)', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 0, dimensao: null, selectedPontuacoes: [5], maxOptionPontuacao: 10 },
      ]
      const result = ScoreCalculator.compute(answers, [])
      assert.strictEqual(result.normalizedScore, 0)
    })

    it('returns 0 when answers array is empty', () => {
      const result = ScoreCalculator.compute([], [])
      assert.strictEqual(result.rawScore, 0)
      assert.strictEqual(result.maxPossibleScore, 0)
      assert.strictEqual(result.normalizedScore, 0)
    })

    it('clamps normalized score to [0, 100] (Req 5.5)', () => {
      // This can't naturally exceed 100 with the algorithm since raw <= max,
      // but if negative pontuacoes are involved, it could go below 0
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 1, dimensao: null, selectedPontuacoes: [-5], maxOptionPontuacao: 10 },
      ]
      const result = ScoreCalculator.compute(answers, [])
      assert.strictEqual(result.normalizedScore, 0)
    })
  })

  describe('maturity band classification (Req 3.1, 3.3, 3.4)', () => {
    const bands: MaturityBandDef[] = [
      { id: 1, min: 0, max: 33 },
      { id: 2, min: 34, max: 66 },
      { id: 3, min: 67, max: 100 },
    ]

    it('classifies into the correct band (inclusive bounds)', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 1, dimensao: null, selectedPontuacoes: [5], maxOptionPontuacao: 10 },
      ]
      const result = ScoreCalculator.compute(answers, bands)
      // normalized = 50, falls in band 2 (34-66)
      assert.strictEqual(result.faixaId, 2)
    })

    it('matches on lower bound inclusive', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 1, dimensao: null, selectedPontuacoes: [0], maxOptionPontuacao: 10 },
      ]
      const result = ScoreCalculator.compute(answers, bands)
      // normalized = 0, falls in band 1 (0-33)
      assert.strictEqual(result.faixaId, 1)
    })

    it('matches on upper bound inclusive', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 1, dimensao: null, selectedPontuacoes: [10], maxOptionPontuacao: 10 },
      ]
      const result = ScoreCalculator.compute(answers, bands)
      // normalized = 100, falls in band 3 (67-100)
      assert.strictEqual(result.faixaId, 3)
    })

    it('returns null when no bands configured (Req 3.3)', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 1, dimensao: null, selectedPontuacoes: [5], maxOptionPontuacao: 10 },
      ]
      const result = ScoreCalculator.compute(answers, [])
      assert.strictEqual(result.faixaId, null)
    })

    it('returns null when score falls outside all bands (Req 3.4)', () => {
      const gappedBands: MaturityBandDef[] = [
        { id: 1, min: 0, max: 30 },
        { id: 2, min: 70, max: 100 },
      ]
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 1, dimensao: null, selectedPontuacoes: [5], maxOptionPontuacao: 10 },
      ]
      const result = ScoreCalculator.compute(answers, gappedBands)
      // normalized = 50, falls in gap between bands
      assert.strictEqual(result.faixaId, null)
    })
  })

  describe('per-dimension scoring (Req 4.1, 4.2, 4.3)', () => {
    it('computes dimension scores for questions with non-null dimensao (Req 4.1)', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 1, dimensao: 'Liderança', selectedPontuacoes: [3], maxOptionPontuacao: 5 },
        { questionId: 2, peso: 1, dimensao: 'Liderança', selectedPontuacoes: [4], maxOptionPontuacao: 5 },
        { questionId: 3, peso: 1, dimensao: 'Inovação', selectedPontuacoes: [2], maxOptionPontuacao: 5 },
      ]
      const result = ScoreCalculator.compute(answers, [])

      const lideranca = result.dimensionScores.get('Liderança')
      assert.ok(lideranca)
      assert.strictEqual(lideranca.raw, 7)  // 3+4
      assert.strictEqual(lideranca.max, 10) // 5+5
      assert.strictEqual(lideranca.normalized, 70) // 7/10 * 100

      const inovacao = result.dimensionScores.get('Inovação')
      assert.ok(inovacao)
      assert.strictEqual(inovacao.raw, 2)
      assert.strictEqual(inovacao.max, 5)
      assert.strictEqual(inovacao.normalized, 40) // 2/5 * 100
    })

    it('normalizes each dimension independently (Req 4.2)', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 2, dimensao: 'A', selectedPontuacoes: [4], maxOptionPontuacao: 4 },
        { questionId: 2, peso: 1, dimensao: 'B', selectedPontuacoes: [1], maxOptionPontuacao: 10 },
      ]
      const result = ScoreCalculator.compute(answers, [])

      const dimA = result.dimensionScores.get('A')
      assert.ok(dimA)
      assert.strictEqual(dimA.normalized, 100) // 8/8 * 100

      const dimB = result.dimensionScores.get('B')
      assert.ok(dimB)
      assert.strictEqual(dimB.normalized, 10) // 1/10 * 100
    })

    it('produces zero dimension scores when no questions have dimensao (Req 4.3)', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 1, dimensao: null, selectedPontuacoes: [5], maxOptionPontuacao: 10 },
      ]
      const result = ScoreCalculator.compute(answers, [])
      assert.strictEqual(result.dimensionScores.size, 0)
    })

    it('excludes null-dimensao questions from dimension maps', () => {
      const answers: AnsweredChoice[] = [
        { questionId: 1, peso: 1, dimensao: null, selectedPontuacoes: [5], maxOptionPontuacao: 10 },
        { questionId: 2, peso: 1, dimensao: 'X', selectedPontuacoes: [3], maxOptionPontuacao: 10 },
      ]
      const result = ScoreCalculator.compute(answers, [])
      assert.strictEqual(result.dimensionScores.size, 1)
      assert.ok(result.dimensionScores.has('X'))
      assert.ok(!result.dimensionScores.has('null'))
    })
  })
})
