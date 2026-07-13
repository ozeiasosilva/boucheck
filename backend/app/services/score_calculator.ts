// ---------------------------------------------------------------------------
// Score Calculator (Req 2, 3, 4, 5)
//
// Pure, side-effect-free scoring module. Computes raw score summation,
// max-possible-score summation, divide-by-zero-safe normalization with
// clamping to [0, 100], per-dimension scoring, and inclusive-bounds
// Maturity_Band classification.
//
// This module has no I/O and no framework dependencies — it operates entirely
// on plain data structures so it can be property-tested without a database.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Represents one answered Choice_Question mapped from the Answered_Path.
 * Open_Questions (`tipo = 'aberta'`) are excluded at the query layer before
 * reaching this interface (Req 2.2).
 */
export interface AnsweredChoice {
  questionId: number
  /** `questions.peso` — the weight multiplier for this question */
  peso: number
  /** `questions.dimensao` — null when the question has no dimension */
  dimensao: string | null
  /** pontuacao values for each selected option; multi-select can have >1 (Req 2.3) */
  selectedPontuacoes: number[]
  /** Highest `pontuacao` among the question's answer options */
  maxOptionPontuacao: number
}

/**
 * A maturity band (score_range row) definition for classification.
 * Bounds are inclusive: a normalizedScore within [min, max] matches.
 */
export interface MaturityBandDef {
  id: number
  min: number
  max: number
}

/**
 * The complete scoring result for a Response_Session.
 */
export interface ScoreResult {
  /** Sum of pontuacao × peso over every selected option in the Answered_Path */
  rawScore: number
  /** Sum of maxOptionPontuacao × peso over every Choice_Question in the Answered_Path */
  maxPossibleScore: number
  /** rawScore / maxPossibleScore × 100, bounded to [0, 100] (Req 5.2, 5.5) */
  normalizedScore: number
  /** Per-dimension breakdown keyed by dimensao value */
  dimensionScores: Map<string, { raw: number; max: number; normalized: number }>
  /** Classified Maturity_Band id, or null when no band matches (Req 3.3, 3.4) */
  faixaId: number | null
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x))
}

// ---------------------------------------------------------------------------
// Score Calculator
// ---------------------------------------------------------------------------

export class ScoreCalculator {
  /**
   * Computes the full scoring result for a Response_Session's answered
   * Choice_Questions.
   *
   * - Req 2.1–2.4: rawScore sums pontuacao × peso for every selected option
   *   of every Choice_Question in the Answered_Path; multipla_escolha
   *   contributes once per selected option.
   * - Req 5.1–5.3, 5.5: maxPossibleScore sums peso × maxOptionPontuacao;
   *   division guarded by the maxPossibleScore === 0 check (Req 5.3);
   *   clamp bounds to [0, 100] (Req 5.5).
   * - Req 3.1, 3.3, 3.4: band lookup is an inclusive [min, max] scan; zero
   *   bands or no matching band → faixaId: null.
   * - Req 4.1–4.3: dimension maps populated only for non-null dimensao; a
   *   survey with none produces empty maps (zero Dimension_Score values).
   */
  static compute(answers: AnsweredChoice[], bands: MaturityBandDef[]): ScoreResult {
    let rawScore = 0
    let maxPossibleScore = 0
    const dimensionRaw = new Map<string, number>()
    const dimensionMax = new Map<string, number>()

    for (const a of answers) {
      const contribution = a.selectedPontuacoes.reduce((sum, p) => sum + p * a.peso, 0)
      const maxContribution = a.maxOptionPontuacao * a.peso

      rawScore += contribution
      maxPossibleScore += maxContribution

      if (a.dimensao !== null) {
        dimensionRaw.set(a.dimensao, (dimensionRaw.get(a.dimensao) ?? 0) + contribution)
        dimensionMax.set(a.dimensao, (dimensionMax.get(a.dimensao) ?? 0) + maxContribution)
      }
    }

    const normalizedScore =
      maxPossibleScore === 0 ? 0 : clamp((rawScore / maxPossibleScore) * 100, 0, 100)

    const dimensionScores = new Map<string, { raw: number; max: number; normalized: number }>()
    for (const [dim, raw] of dimensionRaw) {
      const max = dimensionMax.get(dim) ?? 0
      const normalized = max === 0 ? 0 : clamp((raw / max) * 100, 0, 100)
      dimensionScores.set(dim, { raw, max, normalized })
    }

    const band = bands.find((b) => normalizedScore >= b.min && normalizedScore <= b.max)

    return {
      rawScore,
      maxPossibleScore,
      normalizedScore,
      dimensionScores,
      faixaId: band?.id ?? null,
    }
  }
}
