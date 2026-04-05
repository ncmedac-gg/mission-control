/**
 * NC Integration Engine — Decision Engine
 * NC_ECC_INTEGRATION_ENGINE v1.0
 *
 * Recibe contexto + skill_registry → ejecuta skill con mayor score.
 * Implementa: skill_activation · priority_scoring · conflict_resolution
 */

import type { NCSkill, NCECCEvent, NCDecisionOutput, NCSkillAction } from './nc-skill-schema'
import { skillRegistry } from './nc-skill-registry'
import { generateSkillFromEvent } from './nc-skill-generator'

// ── Context de ejecución ──────────────────────────────────────────────────────
export interface NCDecisionContext {
  event: NCECCEvent
  current_risk: number        // 0.0 – 1.0 riesgo sistémico actual
  location: 'ramos_mejia' | 'monte_grande'
  phase?: 'vegetative' | 'flowering' | 'drying' | 'curing'
  active_skill_ids?: string[] // Skills ya en ejecución
  source_commit?: string
}

// ── Priority Scorer ───────────────────────────────────────────────────────────
function scoreSkill(skill: NCSkill, context: NCDecisionContext): number {
  let score = skill.confidence

  // Boost por reducción de riesgo cuando el riesgo actual es alto
  const riskReduction = -(skill.effects.risk_delta ?? 0)
  if (context.current_risk > 0.6 && riskReduction > 0) {
    score += riskReduction * 0.3
  }

  // Boost por feedback histórico positivo
  if (skill.feedback_score !== undefined) {
    score += (skill.feedback_score - 0.5) * 0.2
  }

  // Penalización si hay skills activos que tocan los mismos targets
  if (context.active_skill_ids?.length) {
    const activeSkills = context.active_skill_ids
      .map(id => skillRegistry.getSkill(id))
      .filter(Boolean) as NCSkill[]

    const myTargets = new Set(skill.actions.map(a => a.target))
    for (const active of activeSkills) {
      const sharedTargets = active.actions.filter(a => myTargets.has(a.target))
      score -= sharedTargets.length * 0.15
    }
  }

  // Boost por dominio de alta prioridad en contexto medicina
  if (skill.domain === 'medicina' && context.event.vertical === 'NC MËD') {
    score += 0.1
  }

  return Math.min(1.0, Math.max(0.0, score))
}

// ── Conflict Resolver ─────────────────────────────────────────────────────────
function resolveConflicts(candidates: NCSkill[], context: NCDecisionContext): NCSkill[] {
  // Ordenar por score descendente
  const scored = candidates.map(s => ({ skill: s, score: scoreSkill(s, context) }))
  scored.sort((a, b) => b.score - a.score)

  // Tomar solo el mejor skill por target para evitar conflictos
  const usedTargets = new Set<string>()
  const resolved: NCSkill[] = []

  for (const { skill } of scored) {
    const myTargets = skill.actions.map(a => a.target)
    const hasConflict = myTargets.some(t => usedTargets.has(t))

    if (!hasConflict) {
      resolved.push(skill)
      myTargets.forEach(t => usedTargets.add(t))
    }
  }

  return resolved
}

// ── Main: process event → decision ───────────────────────────────────────────
export async function processEvent(context: NCDecisionContext): Promise<NCDecisionOutput | null> {
  const { event, source_commit } = context

  // 1. Buscar skills activos que matcheen el evento
  let candidates = skillRegistry.getSkillsByEvent(event.type)

  // 2. Si no hay skills, intentar generar uno nuevo
  if (candidates.length === 0) {
    const generated = generateSkillFromEvent(event, source_commit)
    if (generated) {
      const result = skillRegistry.registerSkill(generated, event)
      if (result.success) {
        candidates = [result.skill]
      }
    }
  }

  if (candidates.length === 0) return null

  // 3. Resolver conflictos y seleccionar mejor skill
  const resolved = resolveConflicts(candidates, context)
  if (resolved.length === 0) return null

  const selectedSkill = resolved[0]
  const decision_score = scoreSkill(selectedSkill, context)
  const risk = Math.max(0, (context.current_risk ?? 0.5) + (selectedSkill.effects.risk_delta ?? 0))

  const output: NCDecisionOutput = {
    decision_id: `dec_${Date.now()}_${selectedSkill.skill_id}`,
    triggered_skill: selectedSkill,
    actions: selectedSkill.actions,
    decision_score,
    risk,
    expected_results: {
      risk_reduction: selectedSkill.effects.risk_delta
        ? Math.abs(selectedSkill.effects.risk_delta) * 100
        : undefined,
      yield_protection: (selectedSkill.effects.yield_delta ?? 0) >= 0,
      terpene_impact: selectedSkill.effects.terpene_delta,
    },
    executed_at: new Date().toISOString(),
  }

  return output
}

// ── Risk Guardian ─────────────────────────────────────────────────────────────
// Implementa el agente nc_risk_guardian: bloquea acciones de alto riesgo
export function guardRisk(output: NCDecisionOutput): {
  allowed: boolean
  reason?: string
  safe_actions: NCSkillAction[]
} {
  const MAX_RISK = 0.8

  if (output.risk >= MAX_RISK) {
    return {
      allowed: false,
      reason: `Riesgo post-ejecución estimado ${(output.risk * 100).toFixed(0)}% excede umbral máximo (${MAX_RISK * 100}%)`,
      safe_actions: [],
    }
  }

  // Filtrar acciones que requieren confirmación
  const safe = output.actions.filter(a => !a.requires_confirmation)
  const blocked = output.actions.filter(a => a.requires_confirmation)

  return {
    allowed: true,
    reason: blocked.length > 0
      ? `${blocked.length} acción(es) requieren confirmación manual: ${blocked.map(a => a.id).join(', ')}`
      : undefined,
    safe_actions: safe,
  }
}

// ── Optimizer ────────────────────────────────────────────────────────────────
// Implementa nc_optimizer: aplica feedback real-world al registry
export function applyFeedback(
  decision_id: string,
  skill_id: string,
  outcome: 'success' | 'partial' | 'failure',
  observed: {
    yield_delta_actual?: number
    risk_delta_actual?: number
    notes?: string
  }
): boolean {
  return skillRegistry.updateFeedback(skill_id, outcome, observed.notes)
}
