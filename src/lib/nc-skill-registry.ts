/**
 * NC Integration Engine — Skill Registry
 * NC_ECC_INTEGRATION_ENGINE v1.0
 *
 * Registro híbrido de skills NC: core | auto_generated | experimental
 * Storage: in-memory con persistencia a SQLite (via Mission Control DB)
 */

import type { NCSkill, NCSkillRegistry, NCSkillLayer, NCSkillStatus } from './nc-skill-schema'
import { validateSkill, isSkillApproved } from './nc-skill-validator'
import type { NCECCEvent } from './nc-skill-schema'

// ── Skills core predefinidos (inmutables) ────────────────────────────────────
const CORE_SKILLS: NCSkill[] = [
  {
    skill_id: 'nc_core_vpd_monitor',
    version: '1.0.0',
    domain: 'cultivo',
    layer: 'core',
    status: 'active',
    label: 'Monitor VPD NC',
    description: 'Monitoreo continuo de VPD día/noche. Base para todos los skills de ambiente.',
    trigger: { event: 'vpd_reading', source: 'sensor', cooldown_minutes: 5 },
    actions: [{ id: 'log_vpd', type: 'data_log', target: 'nc_farm_log', parameters: { metric: 'vpd' } }],
    effects: {},
    confidence: 1.0,
    risk_level: 'low',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    activation_count: 0,
  },
  {
    skill_id: 'nc_core_reprocann_check',
    version: '1.0.0',
    domain: 'medicina',
    layer: 'core',
    status: 'active',
    label: 'Verificación REPROCANN',
    description: 'Verifica vencimientos de autorizaciones REPROCANN/Ley 27.350 diariamente.',
    trigger: { event: 'daily_cron', source: 'schedule', cooldown_minutes: 1440 },
    actions: [{ id: 'check_docs', type: 'agent_dispatch', target: 'nc-compliance-agent', parameters: { task: 'daily_check' } }],
    effects: { risk_delta: -0.05 },
    confidence: 1.0,
    risk_level: 'low',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    activation_count: 0,
  },
  {
    skill_id: 'nc_core_btc_analysis',
    version: '1.0.0',
    domain: 'negocio',
    layer: 'core',
    status: 'active',
    label: 'BTC Daily Analysis',
    description: 'Dispara el Framework Institucional BTC v3 una vez por día. Salida a Notion.',
    trigger: { event: 'daily_cron', source: 'schedule', cooldown_minutes: 1440 },
    actions: [{ id: 'run_btc', type: 'agent_dispatch', target: 'nc-data-agent', parameters: { task: 'btc_framework_v3' } }],
    effects: {},
    confidence: 1.0,
    risk_level: 'low',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    activation_count: 0,
  },
]

// ── Clase NCSkillRegistry ────────────────────────────────────────────────────
export class NCSkillRegistryManager {
  private registry: NCSkillRegistry

  constructor() {
    this.registry = {
      version: '1.0.0',
      last_updated: new Date().toISOString(),
      core_skills: CORE_SKILLS,
      auto_generated_skills: [],
      experimental_skills: [],
    }
  }

  // ── Agregar skill con validación ────────────────────────────────────────
  registerSkill(skill: NCSkill, event?: NCECCEvent): {
    success: boolean
    skill: NCSkill
    reason?: string
  } {
    // 1. Validar
    const validation = validateSkill(skill, this.registry, event)
    skill.validation = validation

    if (!isSkillApproved(validation)) {
      skill.status = 'rejected'
      skill.updated_at = new Date().toISOString()
      return {
        success: false,
        skill,
        reason: validation.rejection_reason,
      }
    }

    // 2. Promover a experimental si es auto_generated, a active si pasa validación
    skill.status = skill.layer === 'core' ? 'active' : 'active'
    skill.updated_at = new Date().toISOString()

    // 3. Insertar en la capa correcta (evitar duplicados por skill_id)
    const layer = skill.layer as NCSkillLayer
    const target = layer === 'core' ? 'core_skills'
      : layer === 'experimental' ? 'experimental_skills'
      : 'auto_generated_skills'

    const existing = this.registry[target].findIndex(s => s.skill_id === skill.skill_id)
    if (existing >= 0) {
      // Actualizar versión
      this.registry[target][existing] = skill
    } else {
      this.registry[target].push(skill)
    }

    this.registry.last_updated = new Date().toISOString()

    return { success: true, skill }
  }

  // ── Buscar skill por ID ─────────────────────────────────────────────────
  getSkill(skill_id: string): NCSkill | undefined {
    return [
      ...this.registry.core_skills,
      ...this.registry.auto_generated_skills,
      ...this.registry.experimental_skills,
    ].find(s => s.skill_id === skill_id)
  }

  // ── Buscar skills por trigger event ────────────────────────────────────
  getSkillsByEvent(event_type: string): NCSkill[] {
    return [
      ...this.registry.core_skills,
      ...this.registry.auto_generated_skills,
      ...this.registry.experimental_skills,
    ].filter(s =>
      s.status === 'active' && s.trigger.event === event_type
    )
  }

  // ── Buscar skills activos por dominio ───────────────────────────────────
  getActiveByDomain(domain: NCSkill['domain']): NCSkill[] {
    return [
      ...this.registry.core_skills,
      ...this.registry.auto_generated_skills,
      ...this.registry.experimental_skills,
    ].filter(s => s.domain === domain && s.status === 'active')
  }

  // ── Actualizar feedback real-world ──────────────────────────────────────
  updateFeedback(skill_id: string, outcome: 'success' | 'partial' | 'failure', notes?: string): boolean {
    const skill = this.getSkill(skill_id)
    if (!skill) return false

    const scoreMap = { success: 1.0, partial: 0.5, failure: 0.0 }
    const prev = skill.feedback_score ?? 0.5
    skill.feedback_score = (prev + scoreMap[outcome]) / 2
    skill.activation_count += 1
    skill.updated_at = new Date().toISOString()

    // Ajuste de confianza basado en feedback
    if (outcome === 'failure' && skill.activation_count > 3) {
      skill.confidence = Math.max(0, skill.confidence - 0.1)
      if (skill.confidence < 0.4) {
        skill.status = 'deprecated'
      }
    } else if (outcome === 'success') {
      skill.confidence = Math.min(1, skill.confidence + 0.02)
    }

    return true
  }

  // ── Snapshot del registry ───────────────────────────────────────────────
  getSnapshot(): NCSkillRegistry {
    return structuredClone(this.registry)
  }

  // ── Stats del registry ──────────────────────────────────────────────────
  getStats() {
    const all = [
      ...this.registry.core_skills,
      ...this.registry.auto_generated_skills,
      ...this.registry.experimental_skills,
    ]
    return {
      total: all.length,
      active: all.filter(s => s.status === 'active').length,
      pending: all.filter(s => s.status === 'pending_validation').length,
      rejected: all.filter(s => s.status === 'rejected').length,
      by_domain: {
        cultivo: all.filter(s => s.domain === 'cultivo').length,
        medicina: all.filter(s => s.domain === 'medicina').length,
        negocio: all.filter(s => s.domain === 'negocio').length,
        sistema: all.filter(s => s.domain === 'sistema').length,
      },
      by_layer: {
        core: this.registry.core_skills.length,
        auto_generated: this.registry.auto_generated_skills.length,
        experimental: this.registry.experimental_skills.length,
      },
      avg_confidence: all.reduce((sum, s) => sum + s.confidence, 0) / (all.length || 1),
    }
  }
}

// Singleton exportado
export const skillRegistry = new NCSkillRegistryManager()
