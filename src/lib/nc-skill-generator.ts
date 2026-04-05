/**
 * NC Integration Engine — Skill Generator Agent
 * NC_ECC_INTEGRATION_ENGINE v1.0
 *
 * Convierte eventos ECC en skills NC auto-generados.
 * Implementa el "nc_skill_generator" agent del pipeline.
 *
 * Mapping: event_type → pattern → NCSkill draft
 */

import type { NCSkill, NCECCEvent, NCSkillDomain, NCSkillLayer } from './nc-skill-schema'

// ── Biblioteca de patrones ECC → Skill ──────────────────────────────────────
// Basada en el COGOLITERO y protocolos KNF de NC FARM / NC MËD
const ECC_PATTERN_LIBRARY: Array<{
  event_pattern: RegExp | string
  domain: NCSkillDomain
  label: string
  description: string
  confidence_base: number
  generate: (event: NCECCEvent) => Partial<NCSkill>
}> = [
  // ── Humedad alta → riesgo fúngico ─────────────────────────────────────────
  {
    event_pattern: /humidity.*(high|above|over)/i,
    domain: 'cultivo',
    label: 'Control Fúngico Automático',
    description: 'Detecta humedad elevada y activa protocolo anti-fúngico: airflow + LAB + Trichoderma.',
    confidence_base: 0.88,
    generate: (event) => ({
      trigger: {
        event: event.type,
        conditions: { humidity: '>70', vpd: '<0.8' },
        source: 'sensor',
        cooldown_minutes: 60,
      },
      actions: [
        { id: 'act_airflow', type: 'environment', target: 'airflow', parameters: { increase_pct: 20 } },
        { id: 'act_lab', type: 'bioinsumo', target: 'LAB_foliar', parameters: { dilution: '1:500', ml_per_m2: 50 } },
        { id: 'act_tricho', type: 'bioinsumo', target: 'Trichoderma_soil', parameters: { g_per_L: 2 } },
        { id: 'act_log', type: 'data_log', target: 'nc_farm_log', parameters: { severity: 'medium' } },
      ],
      effects: { risk_delta: -0.3, yield_delta: 0.05, cost_delta: -150 },
      risk_level: 'medium' as const,
    }),
  },

  // ── Caída de tasa de crecimiento ──────────────────────────────────────────
  {
    event_pattern: /growth.*(drop|slow|low|rate)/i,
    domain: 'cultivo',
    label: 'Boost de Crecimiento',
    description: 'Caída de tasa de crecimiento detectada. Aplica FPJ + IMO3 para reactivar microbioma y nutrición.',
    confidence_base: 0.75,
    generate: (event) => ({
      trigger: {
        event: event.type,
        conditions: { growth_rate_pct: '<80' },
        source: 'sensor',
        cooldown_minutes: 120,
      },
      actions: [
        { id: 'act_fpj', type: 'bioinsumo', target: 'FPJ_growth', parameters: { dilution: '1:1000', apply: 'foliar' } },
        { id: 'act_imo3', type: 'bioinsumo', target: 'IMO3_soil', parameters: { L_per_m2: 0.5 } },
        { id: 'act_dispatch', type: 'agent_dispatch', target: 'nc-farm-agent', parameters: { task: 'evaluate_growth_recovery' }, requires_confirmation: false },
      ],
      effects: { risk_delta: -0.1, yield_delta: 0.15 },
      risk_level: 'low' as const,
    }),
  },

  // ── VPD fuera de rango ────────────────────────────────────────────────────
  {
    event_pattern: /vpd.*(out|high|low|range)/i,
    domain: 'cultivo',
    label: 'Corrección de VPD',
    description: 'VPD fuera del rango óptimo. Ajusta temperatura/humedad para volver al rango target (0.8–1.2 kPa veg / 1.0–1.5 kPa flor).',
    confidence_base: 0.92,
    generate: (event) => ({
      trigger: {
        event: event.type,
        conditions: { vpd: '<0.6 OR >1.6' },
        source: 'sensor',
        cooldown_minutes: 15,
      },
      actions: [
        { id: 'act_hvac', type: 'environment', target: 'hvac', parameters: { mode: 'auto_vpd', target_kpa: 1.0 } },
        { id: 'act_log', type: 'data_log', target: 'nc_farm_log', parameters: { metric: 'vpd' } },
      ],
      effects: { risk_delta: -0.2, yield_delta: 0.1 },
      risk_level: 'low' as const,
    }),
  },

  // ── Terpenos bajos en cupping ─────────────────────────────────────────────
  {
    event_pattern: /terpene.*(low|drop|score)/i,
    domain: 'cultivo',
    label: 'Protocolo Terpénico NC-TSS',
    description: 'Score terpénico bajo en NC Cupping Protocol. Activa protocolo de acompañamiento a la maduración: reducción de N, aporte de K/P, estrés hídrico leve.',
    confidence_base: 0.80,
    generate: (event) => ({
      trigger: {
        event: event.type,
        conditions: { terpene_score: '<6.5', phase: 'flowering' },
        source: 'agent',
        cooldown_minutes: 1440,  // 24h
      },
      actions: [
        { id: 'act_faa', type: 'bioinsumo', target: 'FAA_foliar', parameters: { dilution: '1:1000', apply_days: [40, 45, 50] } },
        { id: 'act_water', type: 'environment', target: 'irrigation', parameters: { reduce_pct: 15, duration_days: 3 } },
        { id: 'act_dispatch', type: 'agent_dispatch', target: 'nc-med-agent', parameters: { task: 'log_terpene_intervention' }, requires_confirmation: false },
      ],
      effects: { risk_delta: -0.05, terpene_delta: { myrcene: 0.08, limonene: 0.05 } },
      risk_level: 'low' as const,
    }),
  },

  // ── Commit de código → análisis y skill de sistema ────────────────────────
  {
    event_pattern: /code.*(commit|push|deploy)/i,
    domain: 'sistema',
    label: 'Análisis de Commit ECC',
    description: 'Nuevo commit detectado en el repo NC. Analiza cambios y genera skill de sistema si hay nuevos patrones.',
    confidence_base: 0.70,
    generate: (event) => ({
      trigger: {
        event: event.type,
        source: 'github_commit',
        cooldown_minutes: 0,
      },
      actions: [
        { id: 'act_analyze', type: 'agent_dispatch', target: 'nc-data-agent', parameters: { task: 'analyze_commit', commit_sha: event.payload?.sha } },
        { id: 'act_registry', type: 'data_log', target: 'skill_registry', parameters: { action: 'update_check' } },
      ],
      effects: { risk_delta: 0 },
      risk_level: 'low' as const,
    }),
  },

  // ── Riesgo de compliance / REPROCANN ─────────────────────────────────────
  {
    event_pattern: /compliance.*(alert|missing|expired)/i,
    domain: 'medicina',
    label: 'Alerta Compliance REPROCANN',
    description: 'Documento o vencimiento REPROCANN/Ley 27.350 en riesgo. Notifica al NC Compliance Agent para intervención manual.',
    confidence_base: 0.95,
    generate: (event) => ({
      trigger: {
        event: event.type,
        source: 'agent',
        cooldown_minutes: 0,
      },
      actions: [
        { id: 'act_compliance', type: 'agent_dispatch', target: 'nc-compliance-agent', parameters: { task: 'review_document', urgency: 'high' }, requires_confirmation: true },
        { id: 'act_notify', type: 'notification', target: 'admin', parameters: { channel: 'email', priority: 'high' } },
      ],
      effects: { risk_delta: -0.4 },
      risk_level: 'high' as const,
    }),
  },
]

// ── Función principal de generación ──────────────────────────────────────────
export function generateSkillFromEvent(event: NCECCEvent, sourceCommit?: string): NCSkill | null {
  const now = new Date().toISOString()

  for (const pattern of ECC_PATTERN_LIBRARY) {
    const matches = typeof pattern.event_pattern === 'string'
      ? event.type.includes(pattern.event_pattern)
      : pattern.event_pattern.test(event.type)

    if (!matches) continue

    const partial = pattern.generate(event)

    const skill: NCSkill = {
      skill_id: `nc_auto_${event.type.toLowerCase().replace(/[^a-z0-9]/g, '_')}_v1`,
      version: '1.0.0',
      domain: pattern.domain,
      layer: 'auto_generated',
      status: 'pending_validation',
      label: pattern.label,
      description: pattern.description,
      trigger: partial.trigger ?? { event: event.type, source: 'sensor' },
      actions: partial.actions ?? [],
      effects: partial.effects ?? {},
      confidence: pattern.confidence_base,
      risk_level: partial.risk_level ?? 'medium',
      source_commit: sourceCommit,
      source_agent: 'nc_skill_generator',
      created_at: now,
      updated_at: now,
      activation_count: 0,
    }

    return skill
  }

  return null  // No pattern matched
}

// ── Batch: procesar múltiples eventos ─────────────────────────────────────────
export function generateSkillsFromEvents(
  events: NCECCEvent[],
  sourceCommit?: string
): NCSkill[] {
  return events
    .map(e => generateSkillFromEvent(e, sourceCommit))
    .filter((s): s is NCSkill => s !== null)
}
