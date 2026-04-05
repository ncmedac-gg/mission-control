/**
 * NC Integration Engine — Entry Point
 * NC_ECC_INTEGRATION_ENGINE v1.0
 *
 * API Route: POST /api/nc-integration/event
 * Recibe eventos externos (sensor, GitHub webhook, agentes) y los procesa.
 */

import { NextRequest, NextResponse } from 'next/server'
import { processEvent, guardRisk, applyFeedback } from '@/lib/nc-decision-engine'
import { skillRegistry } from '@/lib/nc-skill-registry'
import { logger } from '@/lib/logger'
import type { NCECCEvent, NCDecisionContext } from '@/lib/nc-skill-schema'

const log = logger.child({ module: 'NCIntegrationEngine' })

/**
 * POST /api/nc-integration/event
 *
 * Body:
 * {
 *   event: NCECCEvent,
 *   context: { current_risk, location, phase, active_skill_ids, source_commit }
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { event, context: ctx } = body as {
      event: NCECCEvent
      context: Omit<NCDecisionContext, 'event'>
    }

    if (!event?.type || !event?.event_id) {
      return NextResponse.json({ error: 'event.type y event.event_id son requeridos' }, { status: 400 })
    }

    log.info({ event_id: event.event_id, type: event.type }, 'Processing ECC event')

    // 1. Build context
    const decisionContext: NCDecisionContext = {
      event,
      current_risk: ctx?.current_risk ?? 0.5,
      location: ctx?.location ?? 'ramos_mejia',
      phase: ctx?.phase,
      active_skill_ids: ctx?.active_skill_ids ?? [],
      source_commit: ctx?.source_commit,
    }

    // 2. Decision Engine
    const decision = await processEvent(decisionContext)

    if (!decision) {
      return NextResponse.json({
        status: 'no_skill_matched',
        event_id: event.event_id,
        message: 'No se encontró skill aplicable para este evento',
        registry_stats: skillRegistry.getStats(),
      })
    }

    // 3. Risk Guardian
    const guard = guardRisk(decision)

    if (!guard.allowed) {
      log.warn({ decision_id: decision.decision_id, reason: guard.reason }, 'Risk guardian blocked execution')
      return NextResponse.json({
        status: 'blocked_by_risk_guardian',
        decision_id: decision.decision_id,
        skill_id: decision.triggered_skill.skill_id,
        reason: guard.reason,
        decision_score: decision.decision_score,
        risk: decision.risk,
      }, { status: 422 })
    }

    // 4. Respuesta de éxito
    return NextResponse.json({
      status: 'decision_ready',
      decision_id: decision.decision_id,
      skill_id: decision.triggered_skill.skill_id,
      skill_label: decision.triggered_skill.label,
      decision_score: decision.decision_score,
      risk: decision.risk,
      actions_to_execute: guard.safe_actions,
      actions_pending_confirmation: decision.actions.filter(a => a.requires_confirmation),
      expected_results: decision.expected_results,
      guardian_note: guard.reason,
      registry_stats: skillRegistry.getStats(),
    })

  } catch (err) {
    log.error({ err }, 'NC Integration Engine error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/nc-integration/feedback
 *
 * Body: { decision_id, skill_id, outcome, yield_delta_actual?, risk_delta_actual?, notes? }
 */
export async function PUT(req: NextRequest) {
  try {
    const { decision_id, skill_id, outcome, ...observed } = await req.json()

    if (!skill_id || !outcome) {
      return NextResponse.json({ error: 'skill_id y outcome son requeridos' }, { status: 400 })
    }

    const updated = applyFeedback(decision_id, skill_id, outcome, observed)

    return NextResponse.json({
      status: updated ? 'feedback_applied' : 'skill_not_found',
      skill_id,
      registry_stats: skillRegistry.getStats(),
    })

  } catch (err) {
    log.error({ err }, 'Feedback endpoint error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * GET /api/nc-integration/registry
 * Stats del registry de skills
 */
export async function GET() {
  return NextResponse.json({
    stats: skillRegistry.getStats(),
    snapshot: skillRegistry.getSnapshot(),
  })
}
