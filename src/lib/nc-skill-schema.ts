/**
 * NC Integration Engine — Skill Schema
 * NC_ECC_INTEGRATION_ENGINE v1.0
 *
 * Tipos base para el sistema de skills auto-generados del ECC.
 * Domain: cultivo | medicina | negocio | sistema
 */

export type NCSkillDomain = 'cultivo' | 'medicina' | 'negocio' | 'sistema'

export type NCSkillLayer = 'core' | 'auto_generated' | 'experimental'

export type NCSkillStatus = 'active' | 'pending_validation' | 'rejected' | 'deprecated'

export type NCRiskLevel = 'low' | 'medium' | 'high' | 'critical'

// ── Trigger ──────────────────────────────────────────────────────────────────
export interface NCSkillTrigger {
  event?: string                              // e.g. "humidity_above_75"
  conditions?: Record<string, string | number> // e.g. { humidity: ">70", vpd: "<0.8" }
  source?: 'sensor' | 'schedule' | 'manual' | 'agent' | 'github_commit'
  cooldown_minutes?: number                   // Mínimo tiempo entre activaciones
}

// ── Action ───────────────────────────────────────────────────────────────────
export interface NCSkillAction {
  id: string
  type: 'bioinsumo' | 'environment' | 'notification' | 'data_log' | 'agent_dispatch' | 'api_call'
  target: string                              // e.g. "airflow", "LAB_serum", "nc-farm-agent"
  parameters?: Record<string, unknown>
  requires_confirmation?: boolean             // Acciones de alto impacto
}

// ── Effects ──────────────────────────────────────────────────────────────────
export interface NCSkillEffects {
  risk_delta?: number                         // -1.0 a +1.0
  yield_delta?: number                        // Impacto estimado en rendimiento %
  terpene_delta?: Record<string, number>      // e.g. { myrcene: +0.05 }
  cost_delta?: number                         // ARS estimado
  side_effects?: string[]
}

// ── Validation ───────────────────────────────────────────────────────────────
export interface NCSkillValidation {
  biological_plausibility: boolean
  conflict_detection: boolean
  risk_threshold_ok: boolean
  min_confidence_ok: boolean
  rejection_reason?: string
}

// ── Skill Principal ──────────────────────────────────────────────────────────
export interface NCSkill {
  skill_id: string                            // e.g. "nc_auto_fungal_defense_v1"
  version: string                             // semver
  domain: NCSkillDomain
  layer: NCSkillLayer
  status: NCSkillStatus
  label: string
  description: string
  trigger: NCSkillTrigger
  actions: NCSkillAction[]
  effects: NCSkillEffects
  confidence: number                          // 0.0 – 1.0
  risk_level: NCRiskLevel
  validation?: NCSkillValidation
  source_commit?: string                      // SHA del commit que generó el skill
  source_agent?: string                       // Agente que generó el skill
  created_at: string                          // ISO 8601
  updated_at: string
  feedback_score?: number                     // Promedio de real_world_feedback
  activation_count: number
}

// ── Registro de Skills ───────────────────────────────────────────────────────
export interface NCSkillRegistry {
  version: string
  last_updated: string
  core_skills: NCSkill[]
  auto_generated_skills: NCSkill[]
  experimental_skills: NCSkill[]
}

// ── Evento de entrada ────────────────────────────────────────────────────────
export interface NCECCEvent {
  event_id: string
  type: string                                // e.g. "humidity_high", "growth_rate_drop"
  source: string                              // sensor_id, agent_name, etc.
  timestamp: string
  payload: Record<string, unknown>
  vertical?: string                           // NC vertical afectado
  location?: 'ramos_mejia' | 'monte_grande'
}

// ── Output del Decision Engine ───────────────────────────────────────────────
export interface NCDecisionOutput {
  decision_id: string
  triggered_skill: NCSkill
  actions: NCSkillAction[]
  decision_score: number                      // 0.0 – 1.0
  risk: number                                // 0.0 – 1.0
  expected_results: {
    risk_reduction?: number
    yield_protection?: boolean
    terpene_impact?: Record<string, number>
  }
  executed_at?: string
  real_world_feedback?: {
    observed_at: string
    outcome: 'success' | 'partial' | 'failure'
    notes?: string
    yield_delta_actual?: number
    risk_delta_actual?: number
  }
}

// ── Constantes de validación ─────────────────────────────────────────────────
export const VALIDATION_THRESHOLDS = {
  MAX_RISK: 0.8,
  MIN_CONFIDENCE: 0.6,
  MAX_CONCURRENT_SKILLS: 5,
  COOLDOWN_DEFAULT_MINUTES: 30,
} as const
