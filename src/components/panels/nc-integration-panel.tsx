'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { NC_VERTICAL_COLORS } from '@/lib/agent-templates'

const log = createClientLogger('NCIntegrationPanel')

// ── Types ────────────────────────────────────────────────────────────────────
interface NCSkillSummary {
  skill_id: string
  label: string
  domain: 'cultivo' | 'medicina' | 'negocio' | 'sistema'
  layer: 'core' | 'auto_generated' | 'experimental'
  status: string
  confidence: number
  risk_level: string
  activation_count: number
  feedback_score?: number
}

interface RegistryStats {
  total: number
  active: number
  pending: number
  rejected: number
  by_domain: Record<string, number>
  by_layer: Record<string, number>
  avg_confidence: number
}

interface DecisionEvent {
  id: string
  timestamp: string
  event_type: string
  vertical?: string
  location?: string
  status: 'decision_ready' | 'blocked_by_risk_guardian' | 'no_skill_matched' | 'pending'
  skill_id?: string
  skill_label?: string
  decision_score?: number
  risk?: number
  actions?: Array<{ target: string; type: string }>
  expected_results?: {
    risk_reduction?: number
    yield_protection?: boolean
  }
}

// ── Domain colors ─────────────────────────────────────────────────────────────
const DOMAIN_COLORS: Record<string, string> = {
  cultivo:  '#4A7C3F',
  medicina: '#6B4E3D',
  negocio:  '#C4A44A',
  sistema:  '#3A5F7D',
}

const DOMAIN_EMOJI: Record<string, string> = {
  cultivo:  '🌱',
  medicina: '🌿',
  negocio:  '📊',
  sistema:  '⚙️',
}

const LAYER_BADGE: Record<string, { label: string; color: string }> = {
  core:            { label: 'CORE',  color: '#2D4A22' },
  auto_generated:  { label: 'AUTO',  color: '#3A5F7D' },
  experimental:    { label: 'EXP',   color: '#8B5E8A' },
}

const STATUS_COLORS: Record<string, string> = {
  decision_ready:          '#4A7C3F',
  blocked_by_risk_guardian: '#C4694A',
  no_skill_matched:        '#6B7280',
  pending:                 '#C4A44A',
}

const STATUS_EMOJI: Record<string, string> = {
  decision_ready:          '✅',
  blocked_by_risk_guardian: '🛡️',
  no_skill_matched:        '❓',
  pending:                 '⏳',
}

const RISK_COLORS: Record<string, string> = {
  low:      '#4A7C3F',
  medium:   '#C4A44A',
  high:     '#C4694A',
  critical: '#EF4444',
}

// ── Demo events para visualizar sin sensor real ───────────────────────────────
const DEMO_EVENTS: DecisionEvent[] = [
  {
    id: 'evt_001',
    timestamp: new Date(Date.now() - 120000).toISOString(),
    event_type: 'humidity_above_75',
    vertical: 'NC FARM',
    location: 'ramos_mejia',
    status: 'decision_ready',
    skill_id: 'nc_auto_humidity_above_75_v1',
    skill_label: 'Control Fúngico Automático',
    decision_score: 0.88,
    risk: 0.15,
    actions: [
      { target: 'airflow', type: 'environment' },
      { target: 'LAB_foliar', type: 'bioinsumo' },
      { target: 'Trichoderma_soil', type: 'bioinsumo' },
    ],
    expected_results: { risk_reduction: 30, yield_protection: true },
  },
  {
    id: 'evt_002',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    event_type: 'compliance_alert_missing_doc',
    vertical: 'NC MËD',
    location: 'monte_grande',
    status: 'blocked_by_risk_guardian',
    skill_id: 'nc_auto_compliance_alert_v1',
    skill_label: 'Alerta Compliance REPROCANN',
    decision_score: 0.95,
    risk: 0.82,
  },
  {
    id: 'evt_003',
    timestamp: new Date(Date.now() - 600000).toISOString(),
    event_type: 'vpd_out_range',
    vertical: 'NC FARM',
    location: 'ramos_mejia',
    status: 'decision_ready',
    skill_id: 'nc_auto_vpd_out_range_v1',
    skill_label: 'Corrección de VPD',
    decision_score: 0.92,
    risk: 0.08,
    actions: [{ target: 'hvac', type: 'environment' }],
    expected_results: { risk_reduction: 20, yield_protection: true },
  },
  {
    id: 'evt_004',
    timestamp: new Date(Date.now() - 900000).toISOString(),
    event_type: 'unknown_sensor_spike',
    vertical: 'NC FARM',
    location: 'ramos_mejia',
    status: 'no_skill_matched',
  },
]

const DEMO_STATS: RegistryStats = {
  total: 9,
  active: 7,
  pending: 1,
  rejected: 1,
  by_domain: { cultivo: 4, medicina: 2, negocio: 1, sistema: 2 },
  by_layer: { core: 3, auto_generated: 5, experimental: 1 },
  avg_confidence: 0.84,
}

const DEMO_SKILLS: NCSkillSummary[] = [
  { skill_id: 'nc_core_vpd_monitor', label: 'Monitor VPD NC', domain: 'cultivo', layer: 'core', status: 'active', confidence: 1.0, risk_level: 'low', activation_count: 142 },
  { skill_id: 'nc_core_reprocann_check', label: 'Verificación REPROCANN', domain: 'medicina', layer: 'core', status: 'active', confidence: 1.0, risk_level: 'low', activation_count: 30 },
  { skill_id: 'nc_core_btc_analysis', label: 'BTC Daily Analysis', domain: 'negocio', layer: 'core', status: 'active', confidence: 1.0, risk_level: 'low', activation_count: 30 },
  { skill_id: 'nc_auto_humidity_above_75_v1', label: 'Control Fúngico', domain: 'cultivo', layer: 'auto_generated', status: 'active', confidence: 0.88, risk_level: 'medium', activation_count: 7, feedback_score: 0.91 },
  { skill_id: 'nc_auto_vpd_out_range_v1', label: 'Corrección VPD', domain: 'cultivo', layer: 'auto_generated', status: 'active', confidence: 0.92, risk_level: 'low', activation_count: 12, feedback_score: 0.96 },
  { skill_id: 'nc_auto_growth_rate_drop_v1', label: 'Boost de Crecimiento', domain: 'cultivo', layer: 'auto_generated', status: 'active', confidence: 0.75, risk_level: 'low', activation_count: 3, feedback_score: 0.75 },
  { skill_id: 'nc_auto_compliance_alert_v1', label: 'Alerta REPROCANN', domain: 'medicina', layer: 'auto_generated', status: 'active', confidence: 0.95, risk_level: 'high', activation_count: 2, feedback_score: 1.0 },
  { skill_id: 'nc_auto_terpene_score_low_v1', label: 'Protocolo NC-TSS', domain: 'cultivo', layer: 'experimental', status: 'pending_validation', confidence: 0.80, risk_level: 'low', activation_count: 0 },
  { skill_id: 'nc_auto_code_commit_v1', label: 'Análisis de Commit', domain: 'sistema', layer: 'auto_generated', status: 'rejected', confidence: 0.55, risk_level: 'low', activation_count: 0 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `hace ${diff}s`
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`
  return `hace ${Math.floor(diff / 3600)}h`
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.85 ? '#4A7C3F' : value >= 0.65 ? '#C4A44A' : '#C4694A'
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 bg-gray-700 rounded-full h-1.5">
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  )
}

// ── Panel Principal ───────────────────────────────────────────────────────────
export function NCIntegrationPanel() {
  const [tab, setTab] = useState<'feed' | 'registry' | 'test'>('feed')
  const [events, setEvents] = useState<DecisionEvent[]>(DEMO_EVENTS)
  const [stats, setStats] = useState<RegistryStats>(DEMO_STATS)
  const [skills, setSkills] = useState<NCSkillSummary[]>(DEMO_SKILLS)
  const [loading, setLoading] = useState(false)
  const [liveMode, setLiveMode] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<DecisionEvent | null>(null)
  const [filterDomain, setFilterDomain] = useState<string>('all')
  const [filterLayer, setFilterLayer] = useState<string>('all')
  const [testPayload, setTestPayload] = useState(JSON.stringify({
    event: {
      event_id: `evt_${Date.now()}`,
      type: 'humidity_above_75',
      source: 'sensor_rm_01',
      timestamp: new Date().toISOString(),
      payload: { humidity: 78 },
      vertical: 'NC FARM',
      location: 'ramos_mejia',
    },
    context: { current_risk: 0.45, location: 'ramos_mejia', phase: 'flowering' }
  }, null, 2))
  const [testResult, setTestResult] = useState<any>(null)
  const [testLoading, setTestLoading] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)

  // Fetch real data
  const fetchRegistry = useCallback(async () => {
    try {
      const res = await fetch('/api/nc-integration/event')
      if (!res.ok) return
      const data = await res.json()
      if (data.stats) setStats(data.stats)
    } catch (e) {
      log.error('Failed to fetch registry:', e)
    }
  }, [])

  useEffect(() => {
    fetchRegistry()
  }, [fetchRegistry])

  // Live mode: simula eventos entrantes
  useEffect(() => {
    if (!liveMode) return
    const LIVE_EVENTS = [
      { event_type: 'humidity_above_75', vertical: 'NC FARM', location: 'ramos_mejia', status: 'decision_ready' as const, skill_label: 'Control Fúngico', decision_score: 0.88, risk: 0.15 },
      { event_type: 'vpd_out_range', vertical: 'NC FARM', location: 'monte_grande', status: 'decision_ready' as const, skill_label: 'Corrección VPD', decision_score: 0.92, risk: 0.08 },
      { event_type: 'growth_rate_drop', vertical: 'NC FARM', location: 'ramos_mejia', status: 'decision_ready' as const, skill_label: 'Boost Crecimiento', decision_score: 0.75, risk: 0.05 },
      { event_type: 'code_commit_push', vertical: 'CORE', location: 'ramos_mejia', status: 'no_skill_matched' as const },
    ]
    const interval = setInterval(() => {
      const template = LIVE_EVENTS[Math.floor(Math.random() * LIVE_EVENTS.length)]
      const newEvt: DecisionEvent = {
        id: `live_${Date.now()}`,
        timestamp: new Date().toISOString(),
        ...template,
      }
      setEvents(prev => [newEvt, ...prev].slice(0, 50))
    }, 4000)
    return () => clearInterval(interval)
  }, [liveMode])

  // Test event
  const fireTestEvent = async () => {
    setTestLoading(true)
    setTestResult(null)
    try {
      const body = JSON.parse(testPayload)
      // Update event_id and timestamp
      body.event.event_id = `evt_${Date.now()}`
      body.event.timestamp = new Date().toISOString()

      const res = await fetch('/api/nc-integration/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setTestResult(data)

      // Add to feed
      const newEvt: DecisionEvent = {
        id: body.event.event_id,
        timestamp: body.event.timestamp,
        event_type: body.event.type,
        vertical: body.event.vertical,
        location: body.event.location,
        status: data.status || 'no_skill_matched',
        skill_id: data.skill_id,
        skill_label: data.skill_label,
        decision_score: data.decision_score,
        risk: data.risk,
        actions: data.actions_to_execute,
        expected_results: data.expected_results,
      }
      setEvents(prev => [newEvt, ...prev])
      setTab('feed')
    } catch (e) {
      setTestResult({ error: String(e) })
    } finally {
      setTestLoading(false)
    }
  }

  const filteredSkills = skills.filter(s => {
    if (filterDomain !== 'all' && s.domain !== filterDomain) return false
    if (filterLayer !== 'all' && s.layer !== filterLayer) return false
    return true
  })

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'feed', label: '📡 Event Feed', count: events.length },
    { id: 'registry', label: '📚 Skill Registry', count: stats.total },
    { id: 'test', label: '🧪 Test Event' },
  ] as const

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-white">⚡ NC Integration Engine</h2>
          <p className="text-xs text-gray-400">ECC v1.9.0 · Pipeline continuo · {stats.total} skills</p>
        </div>

        {/* Stats pills */}
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-xs">
            {[
              { label: 'Activos', val: stats.active, color: '#4A7C3F' },
              { label: 'Pendientes', val: stats.pending, color: '#C4A44A' },
              { label: 'Rechazados', val: stats.rejected, color: '#C4694A' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-800">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-gray-300">{s.val} {s.label}</span>
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded">
            conf. avg <span className="text-white font-mono">{(stats.avg_confidence * 100).toFixed(0)}%</span>
          </div>
          <Button
            onClick={() => setLiveMode(!liveMode)}
            variant={liveMode ? 'success' : 'secondary'}
            size="sm"
          >
            {liveMode ? '● Live' : 'Live'}
          </Button>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-gray-700 px-4">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-green-500 text-green-400'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
            {'count' in t && (
              <span className="ml-1.5 text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-hidden">

        {/* ── EVENT FEED ── */}
        {tab === 'feed' && (
          <div className="h-full flex">
            {/* Feed list */}
            <div ref={feedRef} className="w-2/5 border-r border-gray-700 overflow-y-auto">
              {events.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2 p-8">
                  <span className="text-4xl">📡</span>
                  <p className="text-sm text-center">Sin eventos. Activá Live Mode o enviá un evento de prueba.</p>
                </div>
              )}
              {events.map((evt, i) => {
                const vertColor = NC_VERTICAL_COLORS[evt.vertical || 'CORE'] || '#2D4A22'
                const isSelected = selectedEvent?.id === evt.id
                return (
                  <div
                    key={evt.id}
                    onClick={() => setSelectedEvent(isSelected ? null : evt)}
                    className={`p-3 border-b border-gray-800 cursor-pointer transition-colors ${isSelected ? 'bg-gray-750' : 'hover:bg-gray-800'}`}
                    style={{ borderLeftWidth: '3px', borderLeftColor: STATUS_COLORS[evt.status] }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-sm">{STATUS_EMOJI[evt.status]}</span>
                          <span className="text-xs font-mono text-gray-300 truncate">{evt.event_type}</span>
                        </div>
                        {evt.skill_label && (
                          <p className="text-xs text-gray-400 truncate">→ {evt.skill_label}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {evt.vertical && (
                            <span className="text-xs px-1.5 rounded" style={{ color: vertColor, border: `1px solid ${vertColor}40` }}>
                              {evt.vertical}
                            </span>
                          )}
                          {evt.location && (
                            <span className="text-xs text-gray-500">{evt.location === 'ramos_mejia' ? 'RM' : 'MG'}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-500">{formatTime(evt.timestamp)}</p>
                        {evt.decision_score !== undefined && (
                          <p className="text-xs font-mono text-gray-300 mt-0.5">
                            {(evt.decision_score * 100).toFixed(0)}%
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Event detail */}
            <div className="flex-1 overflow-y-auto p-4">
              {!selectedEvent ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                  <span className="text-3xl">👈</span>
                  <p className="text-sm">Seleccioná un evento</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{STATUS_EMOJI[selectedEvent.status]}</span>
                      <div>
                        <p className="text-sm font-bold text-white font-mono">{selectedEvent.event_type}</p>
                        <p className="text-xs" style={{ color: STATUS_COLORS[selectedEvent.status] }}>
                          {selectedEvent.status.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                      <span>Vertical: <span className="text-white">{selectedEvent.vertical || '—'}</span></span>
                      <span>Loc: <span className="text-white">{selectedEvent.location || '—'}</span></span>
                      <span>Score: <span className="text-white font-mono">{selectedEvent.decision_score !== undefined ? `${(selectedEvent.decision_score * 100).toFixed(0)}%` : '—'}</span></span>
                      <span>Riesgo: <span className="text-white font-mono">{selectedEvent.risk !== undefined ? `${(selectedEvent.risk * 100).toFixed(0)}%` : '—'}</span></span>
                    </div>
                  </div>

                  {/* Skill triggered */}
                  {selectedEvent.skill_id && (
                    <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
                      <p className="text-xs text-gray-400 mb-1">Skill activado</p>
                      <p className="text-sm font-bold text-white">{selectedEvent.skill_label}</p>
                      <p className="text-xs font-mono text-gray-500 mt-0.5">{selectedEvent.skill_id}</p>
                    </div>
                  )}

                  {/* Actions */}
                  {selectedEvent.actions && selectedEvent.actions.length > 0 && (
                    <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
                      <p className="text-xs text-gray-400 mb-2">Acciones a ejecutar</p>
                      <div className="space-y-1.5">
                        {selectedEvent.actions.map((a, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className="px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">{a.type}</span>
                            <span className="text-white font-mono">{a.target}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Expected results */}
                  {selectedEvent.expected_results && (
                    <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
                      <p className="text-xs text-gray-400 mb-2">Resultados esperados</p>
                      <div className="space-y-1 text-xs">
                        {selectedEvent.expected_results.risk_reduction !== undefined && (
                          <p>Reducción de riesgo: <span className="text-green-400 font-mono">-{selectedEvent.expected_results.risk_reduction}%</span></p>
                        )}
                        {selectedEvent.expected_results.yield_protection && (
                          <p>Protección de rendimiento: <span className="text-green-400">✓</span></p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Feedback buttons */}
                  {selectedEvent.status === 'decision_ready' && selectedEvent.skill_id && (
                    <div className="p-3 rounded-lg bg-gray-800 border border-gray-700">
                      <p className="text-xs text-gray-400 mb-2">Feedback real-world</p>
                      <div className="flex gap-2">
                        {(['success', 'partial', 'failure'] as const).map(outcome => (
                          <Button
                            key={outcome}
                            size="sm"
                            variant={outcome === 'success' ? 'success' : outcome === 'partial' ? 'warning' : 'danger'}
                            onClick={async () => {
                              await fetch('/api/nc-integration/event', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  skill_id: selectedEvent.skill_id,
                                  outcome,
                                  decision_id: selectedEvent.id,
                                }),
                              })
                              fetchRegistry()
                            }}
                          >
                            {outcome === 'success' ? '✓ Éxito' : outcome === 'partial' ? '~ Parcial' : '✗ Fallo'}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SKILL REGISTRY ── */}
        {tab === 'registry' && (
          <div className="h-full flex flex-col">
            {/* Domain stats bar */}
            <div className="flex gap-3 p-4 border-b border-gray-700">
              {Object.entries(stats.by_domain).map(([domain, count]) => (
                <div
                  key={domain}
                  className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-xs"
                  style={{
                    backgroundColor: filterDomain === domain ? `${DOMAIN_COLORS[domain]}33` : 'transparent',
                    border: `1px solid ${filterDomain === domain ? DOMAIN_COLORS[domain] : '#374151'}`,
                  }}
                  onClick={() => setFilterDomain(filterDomain === domain ? 'all' : domain)}
                >
                  <span>{DOMAIN_EMOJI[domain]}</span>
                  <span className="text-gray-200 capitalize">{domain}</span>
                  <span className="font-mono" style={{ color: DOMAIN_COLORS[domain] }}>{count}</span>
                </div>
              ))}
              <div className="ml-auto flex gap-2">
                {(['all', 'core', 'auto_generated', 'experimental'] as const).map(layer => (
                  <button
                    key={layer}
                    onClick={() => setFilterLayer(layer)}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      filterLayer === layer ? 'bg-gray-600 text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {layer === 'all' ? 'Todos' : LAYER_BADGE[layer]?.label || layer}
                  </button>
                ))}
              </div>
            </div>

            {/* Skill table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-800 border-b border-gray-700">
                  <tr>
                    {['Skill', 'Domain', 'Layer', 'Estado', 'Confianza', 'Riesgo', 'Activaciones', 'Feedback'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSkills.map((skill, i) => {
                    const layer = LAYER_BADGE[skill.layer]
                    const domainColor = DOMAIN_COLORS[skill.domain]
                    return (
                      <tr key={skill.skill_id} className={`border-b border-gray-800 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-850'} hover:bg-gray-800 transition-colors`}>
                        <td className="px-3 py-2">
                          <p className="text-white font-medium truncate max-w-[200px]">{skill.label}</p>
                          <p className="text-gray-500 font-mono truncate">{skill.skill_id}</p>
                        </td>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1">
                            <span>{DOMAIN_EMOJI[skill.domain]}</span>
                            <span className="capitalize" style={{ color: domainColor }}>{skill.domain}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-bold"
                            style={{ backgroundColor: `${layer?.color}33`, color: layer?.color }}
                          >
                            {layer?.label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`capitalize ${
                            skill.status === 'active' ? 'text-green-400'
                            : skill.status === 'pending_validation' ? 'text-yellow-400'
                            : skill.status === 'rejected' ? 'text-red-400'
                            : 'text-gray-400'
                          }`}>
                            {skill.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2 w-28">
                          <ConfidenceBar value={skill.confidence} />
                        </td>
                        <td className="px-3 py-2">
                          <span className="capitalize" style={{ color: RISK_COLORS[skill.risk_level] }}>
                            {skill.risk_level}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center text-gray-300 font-mono">{skill.activation_count}</td>
                        <td className="px-3 py-2">
                          {skill.feedback_score !== undefined ? (
                            <ConfidenceBar value={skill.feedback_score} />
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TEST EVENT ── */}
        {tab === 'test' && (
          <div className="h-full flex gap-4 p-4">
            {/* Input */}
            <div className="flex-1 flex flex-col gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-1">Payload JSON — POST /api/nc-integration/event</p>
                <textarea
                  value={testPayload}
                  onChange={e => setTestPayload(e.target.value)}
                  className="w-full h-64 bg-gray-800 text-green-400 font-mono text-xs p-3 rounded-lg border border-gray-700 resize-none focus:outline-none focus:border-gray-500"
                  spellCheck={false}
                />
              </div>

              {/* Quick templates */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Templates rápidos</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: '🌱 Humidity High', type: 'humidity_above_75', vertical: 'NC FARM', phase: 'flowering' },
                    { label: '⚗️ VPD fuera rango', type: 'vpd_out_range', vertical: 'NC FARM', phase: 'vegetative' },
                    { label: '🌿 Compliance', type: 'compliance_alert_missing_doc', vertical: 'NC MËD', phase: undefined },
                    { label: '🌾 Terpenos bajos', type: 'terpene_score_low', vertical: 'NC FARM', phase: 'flowering' },
                    { label: '⚙️ Commit push', type: 'code_commit_push', vertical: 'CORE', phase: undefined },
                  ].map(t => (
                    <button
                      key={t.type}
                      onClick={() => setTestPayload(JSON.stringify({
                        event: {
                          event_id: `evt_${Date.now()}`,
                          type: t.type,
                          source: 'test_panel',
                          timestamp: new Date().toISOString(),
                          payload: { test: true },
                          vertical: t.vertical,
                          location: 'ramos_mejia',
                        },
                        context: {
                          current_risk: 0.4,
                          location: 'ramos_mejia',
                          ...(t.phase ? { phase: t.phase } : {}),
                        }
                      }, null, 2))}
                      className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700 transition-colors"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={fireTestEvent} disabled={testLoading}>
                {testLoading ? '⏳ Procesando...' : '🚀 Disparar Evento'}
              </Button>
            </div>

            {/* Output */}
            <div className="flex-1">
              <p className="text-xs text-gray-400 mb-1">Response del Decision Engine</p>
              <div className="h-full bg-gray-800 rounded-lg border border-gray-700 p-3 overflow-y-auto">
                {!testResult ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-600 gap-2">
                    <span className="text-3xl">🧪</span>
                    <p className="text-sm">Disparar un evento para ver la respuesta</p>
                  </div>
                ) : (
                  <pre className={`text-xs font-mono whitespace-pre-wrap ${testResult.error ? 'text-red-400' : 'text-green-300'}`}>
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
