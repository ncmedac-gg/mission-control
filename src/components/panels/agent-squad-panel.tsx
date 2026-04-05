'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Loader } from '@/components/ui/loader'
import { createClientLogger } from '@/lib/client-logger'
import { NC_VERTICAL_COLORS } from '@/lib/agent-templates'

const log = createClientLogger('AgentSquadPanel')

interface Agent {
  id: number
  name: string
  role: string
  session_key?: string
  soul_content?: string
  status: 'offline' | 'idle' | 'busy' | 'error'
  last_seen?: number
  last_activity?: string
  created_at: number
  updated_at: number
  config?: any
  taskStats?: {
    total: number
    assigned: number
    in_progress: number
    completed: number
  }
  runtime_type?: string
}

// ── NC ECC v1.9.0 — Mapeo de agentes a verticales ──────────────────────────
const NC_AGENT_VERTICAL: Record<string, string> = {
  'nc-orchestrator':    'CORE',
  'nc-farm-agent':      'NC FARM',
  'nc-med-agent':       'NC MËD',
  'nc-lab-agent':       'NC LAB',
  'nc-beauty-agent':    'NC BEAUTY',
  'nc-espelta-agent':   'NC ESPELTA',
  'nc-content-agent':   'NC CLUB',
  'nc-data-agent':      'CORE',
  'nc-compliance-agent':'NC MËD',
}

const NC_AGENT_EMOJI: Record<string, string> = {
  'nc-orchestrator':    '🧭',
  'nc-farm-agent':      '🌱',
  'nc-med-agent':       '🌿',
  'nc-lab-agent':       '⚗️',
  'nc-beauty-agent':    '🌸',
  'nc-espelta-agent':   '🌾',
  'nc-content-agent':   '🎬',
  'nc-data-agent':      '📊',
  'nc-compliance-agent':'🛡️',
}

// Determina el vertical de un agente por nombre o role
function getAgentVertical(agent: Agent): string {
  const key = agent.name?.toLowerCase().replace(/\s+/g, '-') || ''
  return NC_AGENT_VERTICAL[key] || NC_AGENT_VERTICAL[agent.role] || 'CORE'
}

function getAgentEmoji(agent: Agent): string {
  const key = agent.name?.toLowerCase().replace(/\s+/g, '-') || ''
  return NC_AGENT_EMOJI[key] || agent.config?.identity?.emoji || '🤖'
}

// Vertical color como hex → border color inline
function getVerticalColor(vertical: string): string {
  return NC_VERTICAL_COLORS[vertical] || '#2D4A22'
}

const statusColors: Record<string, string> = {
  offline: 'bg-gray-500',
  idle:    'bg-green-500',
  busy:    'bg-yellow-500',
  error:   'bg-red-500',
}

const statusDot: Record<string, string> = {
  offline: '⚫',
  idle:    '🟢',
  busy:    '🟡',
  error:   '🔴',
}

// Orden de display de verticales
const VERTICAL_ORDER = ['CORE', 'NC FARM', 'NC MËD', 'NC LAB', 'NC BEAUTY', 'NC ESPELTA', 'NC CLUB']

export function AgentSquadPanel() {
  const t = useTranslations('agentSquad')
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [groupByVertical, setGroupByVertical] = useState(true)

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    try {
      setError(null)
      if (agents.length === 0) setLoading(true)
      const response = await fetch('/api/agents')
      if (!response.ok) throw new Error(t('failedToFetch'))
      const data = await response.json()
      setAgents(data.agents || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorOccurred'))
    } finally {
      setLoading(false)
    }
  }, [agents.length])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchAgents, 10000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchAgents])

  const updateAgentStatus = async (agentName: string, status: Agent['status'], activity?: string) => {
    try {
      const response = await fetch('/api/agents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: agentName, status, last_activity: activity || `Status → ${status}` })
      })
      if (!response.ok) throw new Error(t('failedToUpdateStatus'))
      setAgents(prev => prev.map(a =>
        a.name === agentName
          ? { ...a, status, last_activity: activity || `Status → ${status}`, last_seen: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) }
          : a
      ))
    } catch (err) {
      log.error('Failed to update agent status:', err)
      setError(t('failedToUpdateStatus'))
    }
  }

  const formatLastSeen = (timestamp?: number) => {
    if (!timestamp) return t('never')
    const diffMs = Date.now() - timestamp * 1000
    const m = Math.floor(diffMs / 60000)
    const h = Math.floor(diffMs / 3600000)
    const d = Math.floor(diffMs / 86400000)
    if (m < 1) return t('justNow')
    if (m < 60) return t('minutesAgo', { count: m })
    if (h < 24) return t('hoursAgo', { count: h })
    if (d < 7) return t('daysAgo', { count: d })
    return new Date(timestamp * 1000).toLocaleDateString()
  }

  const statusCounts = agents.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Agrupar agentes por vertical
  const agentsByVertical = agents.reduce((acc, agent) => {
    const v = getAgentVertical(agent)
    if (!acc[v]) acc[v] = []
    acc[v].push(agent)
    return acc
  }, {} as Record<string, Agent[]>)

  const orderedVerticals = [
    ...VERTICAL_ORDER.filter(v => agentsByVertical[v]),
    ...Object.keys(agentsByVertical).filter(v => !VERTICAL_ORDER.includes(v))
  ]

  if (loading && agents.length === 0) {
    return <Loader variant="panel" label={t('loadingAgents')} />
  }

  // ── Agent Card ──────────────────────────────────────────────────────────
  const AgentCard = ({ agent }: { agent: Agent }) => {
    const vertical = getAgentVertical(agent)
    const vertColor = getVerticalColor(vertical)
    const emoji = getAgentEmoji(agent)
    const isSelected = selectedAgent?.id === agent.id

    return (
      <div
        onClick={() => setSelectedAgent(isSelected ? null : agent)}
        className={`
          relative rounded-lg p-4 cursor-pointer transition-all border
          ${isSelected ? 'bg-gray-700 border-opacity-100' : 'bg-gray-800 border-gray-700 hover:bg-gray-750'}
        `}
        style={{ borderLeftWidth: '3px', borderLeftColor: vertColor }}
      >
        {/* Status dot */}
        <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${statusColors[agent.status]}`} />

        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{emoji}</span>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">{agent.name || agent.role}</p>
            <p className="text-xs" style={{ color: vertColor }}>{vertical}</p>
          </div>
        </div>

        {/* Status + last seen */}
        <div className="flex items-center justify-between text-xs text-gray-400 mt-2">
          <span className="flex items-center gap-1">
            {statusDot[agent.status]}
            <span className="capitalize">{agent.status}</span>
          </span>
          <span>{formatLastSeen(agent.last_seen)}</span>
        </div>

        {/* Task stats */}
        {agent.taskStats && (
          <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
            {[
              { label: 'Total', val: agent.taskStats.total, color: 'text-gray-400' },
              { label: 'Asig.', val: agent.taskStats.assigned, color: 'text-blue-400' },
              { label: 'Activ', val: agent.taskStats.in_progress, color: 'text-yellow-400' },
              { label: 'Done', val: agent.taskStats.completed, color: 'text-green-400' },
            ].map(s => (
              <div key={s.label} className="bg-gray-900 rounded px-1 py-0.5">
                <p className={`font-bold ${s.color}`}>{s.val}</p>
                <p className="text-gray-500">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Expandido: last activity + controls */}
        {isSelected && (
          <div className="mt-3 pt-3 border-t border-gray-600">
            {agent.last_activity && (
              <p className="text-xs text-gray-400 mb-2 italic">"{agent.last_activity}"</p>
            )}
            <div className="flex gap-1 flex-wrap">
              {agent.status !== 'idle' && (
                <Button size="sm" variant="success" onClick={e => { e.stopPropagation(); updateAgentStatus(agent.name, 'idle') }}>
                  Activar
                </Button>
              )}
              {agent.status !== 'offline' && (
                <Button size="sm" variant="secondary" onClick={e => { e.stopPropagation(); updateAgentStatus(agent.name, 'offline') }}>
                  Offline
                </Button>
              )}
              {agent.status !== 'busy' && (
                <Button size="sm" variant="warning" onClick={e => { e.stopPropagation(); updateAgentStatus(agent.name, 'busy', 'Despachado manualmente') }}>
                  Despachar
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">NC ECC — Agentes</h2>
            <p className="text-xs text-gray-400">Ecosystem Control Center v1.9.0 · {agents.length} agentes</p>
          </div>
          {/* Status summary */}
          <div className="flex gap-2 text-sm">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
                <span className="text-gray-400">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => setGroupByVertical(!groupByVertical)} variant="secondary" size="sm">
            {groupByVertical ? 'Vista plana' : 'Por vertical'}
          </Button>
          <Button onClick={() => setAutoRefresh(!autoRefresh)} variant={autoRefresh ? 'success' : 'secondary'} size="sm">
            {autoRefresh ? '● Live' : 'Manual'}
          </Button>
          <Button onClick={fetchAgents} variant="secondary">
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-500 text-red-400 p-3 m-4 rounded">
          {error}
          <Button onClick={() => setError(null)} variant="ghost" size="icon-sm" className="float-right">×</Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-2">
            <span className="text-4xl">🧭</span>
            <p className="text-sm">No hay agentes registrados en el ECC.</p>
            <p className="text-xs">Registrá el primer agente via <code>/api/agents/register</code></p>
          </div>
        ) : groupByVertical ? (
          // ── Vista agrupada por vertical NC ──
          <div className="space-y-6">
            {orderedVerticals.map(vertical => (
              <div key={vertical}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1" style={{ backgroundColor: getVerticalColor(vertical) }} />
                  <span
                    className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{ color: getVerticalColor(vertical), border: `1px solid ${getVerticalColor(vertical)}` }}
                  >
                    {vertical}
                  </span>
                  <div className="h-px flex-1" style={{ backgroundColor: getVerticalColor(vertical) }} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {agentsByVertical[vertical]?.map(agent => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // ── Vista plana ──
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {agents.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
