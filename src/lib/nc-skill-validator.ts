/**
 * NC Integration Engine — Skill Validation Layer
 * NC_ECC_INTEGRATION_ENGINE v1.0
 *
 * Valida skills auto-generados antes de registrarlos.
 * Checks: biological_plausibility · conflict_detection · risk_thresholds
 */

import type {
  NCSkill, NCSkillValidation, NCSkillRegistry, NCECCEvent, VALIDATION_THRESHOLDS
} from './nc-skill-schema'

// ── Reglas de plausibilidad biológica NC ─────────────────────────────────────
// Basadas en el COGOLITERO (F.P. Courrèges 2023) y protocolos KNF
const BIOLOGICAL_RULES: Array<{
  description: string
  check: (skill: NCSkill, event?: NCECCEvent) => boolean
}> = [
  {
    description: 'No aplicar más de 2 bioinsumos simultáneos al sustrato',
    check: (skill) => {
      const bioActions = skill.actions.filter(a => a.type === 'bioinsumo')
      return bioActions.length <= 2
    },
  },
  {
    description: 'LAB (Lactobacillus) no compatible con fungicidas de síntesis',
    check: (skill) => {
      const hasLAB = skill.actions.some(a => a.target.toLowerCase().includes('lab'))
      const hasFungicide = skill.actions.some(a =>
        (a.parameters?.product as string)?.toLowerCase().includes('fungicida')
      )
      return !(hasLAB && hasFungicide)
    },
  },
  {
    description: 'Ajuste de VPD solo válido en rango 0.4–1.6 kPa',
    check: (skill) => {
      const vpdAction = skill.actions.find(a => a.target === 'vpd')
      if (!vpdAction) return true
      const target = vpdAction.parameters?.target_kpa as number
      return !target || (target >= 0.4 && target <= 1.6)
    },
  },
  {
    description: 'Skills de floración no aplican en fase vegetativa',
    check: (skill, event) => {
      if (skill.domain !== 'cultivo') return true
      const isFlowering = skill.skill_id.includes('flower') || skill.skill_id.includes('floracion')
      const isVeg = event?.payload?.phase === 'vegetative'
      return !(isFlowering && isVeg)
    },
  },
  {
    description: 'Intervención en compliance requiere confirmación manual',
    check: (skill) => {
      if (skill.domain !== 'medicina') return true
      const hasUnconfirmed = skill.actions.some(
        a => a.type === 'agent_dispatch' && !a.requires_confirmation
      )
      return !hasUnconfirmed
    },
  },
]

// ── Detección de conflictos entre skills activos ─────────────────────────────
function detectConflicts(candidate: NCSkill, registry: NCSkillRegistry): string[] {
  const conflicts: string[] = []
  const allActive = [
    ...registry.core_skills,
    ...registry.auto_generated_skills,
    ...registry.experimental_skills,
  ].filter(s => s.status === 'active')

  for (const existing of allActive) {
    // Conflicto de targets opuestos
    const candidateTargets = candidate.actions.map(a => a.target)
    const existingTargets = existing.actions.map(a => a.target)
    const sharedTargets = candidateTargets.filter(t => existingTargets.includes(t))

    if (sharedTargets.length > 0) {
      const candidateRisk = candidate.effects.risk_delta ?? 0
      const existingRisk = existing.effects.risk_delta ?? 0
      // Skills con efectos opuestos sobre el mismo target
      if (Math.sign(candidateRisk) !== Math.sign(existingRisk) && sharedTargets.length > 0) {
        conflicts.push(
          `Conflicto de efecto en target [${sharedTargets.join(', ')}] con skill activo "${existing.skill_id}"`
        )
      }
    }

    // Cooldown overlap
    if (
      existing.trigger.event === candidate.trigger.event &&
      existing.skill_id !== candidate.skill_id
    ) {
      conflicts.push(
        `Mismo trigger event "${candidate.trigger.event}" ya manejado por "${existing.skill_id}"`
      )
    }
  }

  return conflicts
}

// ── Validador principal ───────────────────────────────────────────────────────
export function validateSkill(
  skill: NCSkill,
  registry: NCSkillRegistry,
  event?: NCECCEvent
): NCSkillValidation {
  const MAX_RISK = 0.8
  const MIN_CONFIDENCE = 0.6

  // 1. Plausibilidad biológica
  const bioFailures = BIOLOGICAL_RULES
    .filter(rule => !rule.check(skill, event))
    .map(rule => rule.description)

  const biological_plausibility = bioFailures.length === 0

  // 2. Detección de conflictos
  const conflictList = detectConflicts(skill, registry)
  const conflict_detection = conflictList.length === 0

  // 3. Umbrales de riesgo y confianza
  const risk_threshold_ok = skill.risk_level !== 'critical' &&
    (skill.effects.risk_delta ?? 0) <= MAX_RISK
  const min_confidence_ok = skill.confidence >= MIN_CONFIDENCE

  // 4. Razón de rechazo consolidada
  const rejectionReasons: string[] = []
  if (!biological_plausibility) rejectionReasons.push(...bioFailures)
  if (!conflict_detection) rejectionReasons.push(...conflictList)
  if (!risk_threshold_ok) rejectionReasons.push(`Riesgo excede umbral máximo (${MAX_RISK})`)
  if (!min_confidence_ok) rejectionReasons.push(`Confianza insuficiente (mín. ${MIN_CONFIDENCE})`)

  return {
    biological_plausibility,
    conflict_detection,
    risk_threshold_ok,
    min_confidence_ok,
    rejection_reason: rejectionReasons.length > 0 ? rejectionReasons.join(' | ') : undefined,
  }
}

// ── Decisión final: aprobado o rechazado ─────────────────────────────────────
export function isSkillApproved(validation: NCSkillValidation): boolean {
  return (
    validation.biological_plausibility &&
    validation.conflict_detection &&
    validation.risk_threshold_ok &&
    validation.min_confidence_ok
  )
}
