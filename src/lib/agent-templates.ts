/**
 * NC Agent Templates Library — ECC v1.9.0
 *
 * Mapea los 9 agentes del Ecosystem Control Center de NC Digital Twin Pro v2.0
 * a la arquitectura OpenClaw de Mission Control.
 *
 * Verticales: NC FARM · NC MËD · NC LAB · NC BEAUTY · NC ESPELTA · NC RESTO · NC JUNGLE · NC CLUB
 */

export interface AgentToolsConfig {
  allow: string[]
  deny: string[]
}

export interface AgentSandboxConfig {
  mode: 'all' | 'non-main'
  workspaceAccess: 'rw' | 'ro' | 'none'
  scope: 'agent'
  docker?: {
    network: 'none' | 'bridge'
  }
}

export interface AgentModelConfig {
  primary: string
  fallbacks: string[]
}

export interface AgentIdentityConfig {
  name: string
  theme: string
  emoji: string
}

export interface AgentSubagentsConfig {
  allowAgents?: string[]
  model?: string
}

export interface AgentMemorySearchConfig {
  sources: string[]
  experimental?: {
    sessionMemory?: boolean
  }
}

export interface OpenClawAgentConfig {
  id: string
  name?: string
  workspace?: string
  agentDir?: string
  model: AgentModelConfig
  identity: AgentIdentityConfig
  subagents?: AgentSubagentsConfig
  sandbox: AgentSandboxConfig
  tools: AgentToolsConfig
  memorySearch?: AgentMemorySearchConfig
}

export interface AgentTemplate {
  type: string
  label: string
  description: string
  emoji: string
  modelTier: 'opus' | 'sonnet' | 'haiku'
  toolCount: number
  vertical: string // NC vertical al que pertenece
  config: Omit<OpenClawAgentConfig, 'id' | 'workspace' | 'agentDir'>
}

// ── Tool groups ──────────────────────────────────────────────────────────────
const TOOL_GROUPS: Record<string, readonly string[]> = {
  coding:   ['read', 'write', 'edit', 'apply_patch', 'exec', 'bash', 'process'],
  browser:  ['browser', 'web'],
  memory:   ['memory_search', 'memory_get'],
  session:  ['agents_list', 'sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn', 'session_status'],
  subagent: ['subagents', 'lobster', 'llm-task'],
  thinking: ['thinking', 'reactions', 'skills'],
  readonly: ['read', 'memory_search', 'memory_get', 'agents_list'],
}

const COMMON_DENY = ['clawhub', 'cron', 'gateway', 'nodes']

// ── Model fallbacks ──────────────────────────────────────────────────────────
const SONNET_FALLBACKS = [
  'openrouter/anthropic/claude-sonnet-4',
  'openai/codex-mini-latest',
  'ollama/qwen2.5-coder:14b',
]

const OPUS_FALLBACKS = [
  'anthropic/claude-sonnet-4-20250514',
  'openai/codex-mini-latest',
]

const HAIKU_FALLBACKS = [
  'anthropic/claude-sonnet-4-20250514',
  'ollama/qwen2.5-coder:14b',
]

// ── NC ECC v1.9.0 — 9 Agentes ────────────────────────────────────────────────
export const AGENT_TEMPLATES: AgentTemplate[] = [

  // 1. NC-ORCHESTRATOR — Coordinador maestro del ecosistema
  {
    type: 'nc-orchestrator',
    label: 'NC Orchestrator',
    description: 'Coordinador maestro del ecosistema NC. Enruta tareas a agentes especializados, gestiona workflows multi-vertical y toma decisiones estratégicas sobre el Digital Twin.',
    emoji: '🧭',
    modelTier: 'opus',
    toolCount: 23,
    vertical: 'CORE',
    config: {
      model: {
        primary: 'anthropic/claude-opus-4-5',
        fallbacks: OPUS_FALLBACKS,
      },
      identity: {
        name: 'NC Orchestrator',
        theme: 'ecosystem strategist regenerativo',
        emoji: '🧭',
      },
      subagents: {
        allowAgents: [
          'nc-farm-agent',
          'nc-med-agent',
          'nc-lab-agent',
          'nc-beauty-agent',
          'nc-espelta-agent',
          'nc-content-agent',
          'nc-data-agent',
          'nc-compliance-agent',
        ],
      },
      sandbox: {
        mode: 'non-main',
        workspaceAccess: 'rw',
        scope: 'agent',
      },
      tools: {
        allow: [
          ...TOOL_GROUPS.coding,
          ...TOOL_GROUPS.browser,
          ...TOOL_GROUPS.memory,
          ...TOOL_GROUPS.session,
          ...TOOL_GROUPS.subagent,
          ...TOOL_GROUPS.thinking,
        ],
        deny: COMMON_DENY,
      },
      memorySearch: {
        sources: ['memory', 'sessions'],
        experimental: { sessionMemory: true },
      },
    },
  },

  // 2. NC-FARM — Agente de cultivo KNF / Paraná Delta
  {
    type: 'nc-farm-agent',
    label: 'NC FARM Agent',
    description: 'Especialista en cultivo KNF y living soil. Gestiona tareas de NC FARM (Ramos Mejía + Monte Grande), bioinsumos, VPD, calendario lunar, red trófica del suelo. Base: COGOLITERO.',
    emoji: '🌱',
    modelTier: 'sonnet',
    toolCount: 15,
    vertical: 'NC FARM',
    config: {
      model: {
        primary: 'anthropic/claude-sonnet-4-20250514',
        fallbacks: SONNET_FALLBACKS,
      },
      identity: {
        name: 'NC FARM Agent',
        theme: 'cultivador KNF living soil regenerativo',
        emoji: '🌱',
      },
      subagents: {
        model: 'anthropic/claude-haiku-4-5',
      },
      sandbox: {
        mode: 'all',
        workspaceAccess: 'rw',
        scope: 'agent',
        docker: { network: 'bridge' },
      },
      tools: {
        allow: [
          ...TOOL_GROUPS.coding,
          ...TOOL_GROUPS.memory,
          'agents_list', 'sessions_spawn', 'session_status',
          'subagents', 'llm-task',
          'thinking', 'reactions', 'skills',
          'web',
        ],
        deny: [...COMMON_DENY, 'sessions_send', 'browser', 'lobster'],
      },
      memorySearch: {
        sources: ['memory', 'sessions'],
        experimental: { sessionMemory: true },
      },
    },
  },

  // 3. NC-MED — Agente clínico cannabis / NCMed app
  {
    type: 'nc-med-agent',
    label: 'NC MËD Agent',
    description: 'Gestión clínica de pacientes cannabis bajo REPROCANN/Ley 27.350. Opera sobre la app NCMed v7f: tareas de cultivo, VPD, Leaf VPD, Cupping Protocol, Terpene Signature System (NC-TSS v1.0).',
    emoji: '🌿',
    modelTier: 'sonnet',
    toolCount: 18,
    vertical: 'NC MËD',
    config: {
      model: {
        primary: 'anthropic/claude-sonnet-4-20250514',
        fallbacks: SONNET_FALLBACKS,
      },
      identity: {
        name: 'NC MËD Agent',
        theme: 'clínico cannabis medicinal',
        emoji: '🌿',
      },
      subagents: {
        model: 'anthropic/claude-haiku-4-5',
      },
      sandbox: {
        mode: 'all',
        workspaceAccess: 'rw',
        scope: 'agent',
        docker: { network: 'bridge' },
      },
      tools: {
        allow: [
          ...TOOL_GROUPS.coding,
          ...TOOL_GROUPS.browser,
          ...TOOL_GROUPS.memory,
          'agents_list', 'sessions_spawn', 'sessions_history', 'session_status',
          ...TOOL_GROUPS.subagent,
          ...TOOL_GROUPS.thinking,
        ],
        deny: [...COMMON_DENY, 'sessions_send'],
      },
      memorySearch: {
        sources: ['memory', 'sessions'],
        experimental: { sessionMemory: true },
      },
    },
  },

  // 4. NC-LAB — Agente de extracción y formulación
  {
    type: 'nc-lab-agent',
    label: 'NC LAB Agent',
    description: 'Especialista en extracción supercrítica CO₂, formulación, control de calidad y trazabilidad de lotes. Gestiona protocolos de laboratorio y análisis de terpenos.',
    emoji: '⚗️',
    modelTier: 'sonnet',
    toolCount: 14,
    vertical: 'NC LAB',
    config: {
      model: {
        primary: 'anthropic/claude-sonnet-4-20250514',
        fallbacks: SONNET_FALLBACKS,
      },
      identity: {
        name: 'NC LAB Agent',
        theme: 'extracción formulación control de calidad',
        emoji: '⚗️',
      },
      sandbox: {
        mode: 'all',
        workspaceAccess: 'rw',
        scope: 'agent',
        docker: { network: 'bridge' },
      },
      tools: {
        allow: [
          ...TOOL_GROUPS.coding,
          ...TOOL_GROUPS.memory,
          'agents_list', 'sessions_spawn', 'session_status',
          'subagents', 'llm-task',
          'thinking', 'reactions', 'skills',
          'web',
        ],
        deny: [...COMMON_DENY, 'sessions_send', 'browser', 'lobster'],
      },
      memorySearch: {
        sources: ['memory', 'sessions'],
      },
    },
  },

  // 5. NC-BEAUTY — Agente biocosmética Ayurvédica
  {
    type: 'nc-beauty-agent',
    label: 'NC BEAUTY Agent',
    description: 'Especialista en biocosmética de influencia Ayurvédica. Gestiona formulaciones (ghee de pasturas, infusiones botánicas), fichas técnicas de producto y estrategia de línea.',
    emoji: '🌸',
    modelTier: 'haiku',
    toolCount: 10,
    vertical: 'NC BEAUTY',
    config: {
      model: {
        primary: 'anthropic/claude-haiku-4-5',
        fallbacks: HAIKU_FALLBACKS,
      },
      identity: {
        name: 'NC BEAUTY Agent',
        theme: 'biocosmética ayurvédica formulación natural',
        emoji: '🌸',
      },
      sandbox: {
        mode: 'all',
        workspaceAccess: 'none',
        scope: 'agent',
      },
      tools: {
        allow: [
          'write', 'edit',
          ...TOOL_GROUPS.memory,
          'agents_list',
          ...TOOL_GROUPS.thinking,
          'web',
        ],
        deny: [
          ...COMMON_DENY,
          'read', 'apply_patch', 'exec', 'bash', 'process',
          'browser', 'sessions_send', 'sessions_spawn', 'lobster',
          'subagents', 'llm-task',
        ],
      },
      memorySearch: {
        sources: ['memory'],
      },
    },
  },

  // 6. NC-ESPELTA — Agente panadería artesanal / granos ancestrales
  {
    type: 'nc-espelta-agent',
    label: 'NC ESPELTA Agent',
    description: 'Especialista en panadería artesanal con masa madre y granos ancestrales. Gestiona el catálogo 2026 (16 recetas espelta, 5 maestros panaderos), fichas técnicas y protocolo de fermentación.',
    emoji: '🌾',
    modelTier: 'haiku',
    toolCount: 10,
    vertical: 'NC ESPELTA',
    config: {
      model: {
        primary: 'anthropic/claude-haiku-4-5',
        fallbacks: HAIKU_FALLBACKS,
      },
      identity: {
        name: 'NC ESPELTA Agent',
        theme: 'panadería artesanal fermentación ancestral',
        emoji: '🌾',
      },
      sandbox: {
        mode: 'all',
        workspaceAccess: 'none',
        scope: 'agent',
      },
      tools: {
        allow: [
          'write', 'edit',
          ...TOOL_GROUPS.memory,
          'agents_list',
          ...TOOL_GROUPS.thinking,
          'web',
        ],
        deny: [
          ...COMMON_DENY,
          'read', 'apply_patch', 'exec', 'bash', 'process',
          'browser', 'sessions_send', 'sessions_spawn', 'lobster',
          'subagents', 'llm-task',
        ],
      },
      memorySearch: {
        sources: ['memory'],
      },
    },
  },

  // 7. NC-CONTENT — Agente de contenido / producción AI (YouTube + redes)
  {
    type: 'nc-content-agent',
    label: 'NC Content Agent',
    description: 'Producción de contenido AI para NC. Opera el pipeline ElevenLabs + Kling v2.5 (VibeFrame), gestiona los 12 scripts documentales de YouTube (Medicina·Tierra·Alimento), calendario editorial y estrategia de redes.',
    emoji: '🎬',
    modelTier: 'sonnet',
    toolCount: 14,
    vertical: 'NC CLUB',
    config: {
      model: {
        primary: 'anthropic/claude-sonnet-4-20250514',
        fallbacks: SONNET_FALLBACKS,
      },
      identity: {
        name: 'NC Content Agent',
        theme: 'productor contenido AI regenerativo',
        emoji: '🎬',
      },
      sandbox: {
        mode: 'all',
        workspaceAccess: 'none',
        scope: 'agent',
      },
      tools: {
        allow: [
          'write', 'edit',
          ...TOOL_GROUPS.browser,
          ...TOOL_GROUPS.memory,
          'agents_list',
          ...TOOL_GROUPS.thinking,
        ],
        deny: [
          ...COMMON_DENY,
          'read', 'apply_patch', 'exec', 'bash', 'process',
          'sessions_send', 'sessions_spawn', 'lobster',
          'subagents', 'llm-task',
        ],
      },
      memorySearch: {
        sources: ['memory', 'sessions'],
      },
    },
  },

  // 8. NC-DATA — Agente análisis de datos / BTC / métricas
  {
    type: 'nc-data-agent',
    label: 'NC Data Agent',
    description: 'Análisis de datos institucional. Opera el Framework Institucional BTC v3 (OHLC, EMA/RSI/MACD/ATR, on-chain, Elliott Wave), métricas operativas del ecosistema NC y reportes financieros.',
    emoji: '📊',
    modelTier: 'sonnet',
    toolCount: 16,
    vertical: 'CORE',
    config: {
      model: {
        primary: 'anthropic/claude-sonnet-4-20250514',
        fallbacks: SONNET_FALLBACKS,
      },
      identity: {
        name: 'NC Data Agent',
        theme: 'analista de datos institucional cuantitativo',
        emoji: '📊',
      },
      sandbox: {
        mode: 'all',
        workspaceAccess: 'ro',
        scope: 'agent',
        docker: { network: 'bridge' },
      },
      tools: {
        allow: [
          'read', 'exec', 'bash',
          ...TOOL_GROUPS.browser,
          ...TOOL_GROUPS.memory,
          'agents_list',
          ...TOOL_GROUPS.thinking,
          'web',
        ],
        deny: [
          ...COMMON_DENY,
          'write', 'edit', 'apply_patch', 'process',
          'sessions_send', 'sessions_spawn', 'lobster',
          'subagents', 'llm-task',
        ],
      },
      memorySearch: {
        sources: ['memory', 'sessions'],
        experimental: { sessionMemory: true },
      },
    },
  },

  // 9. NC-COMPLIANCE — Agente regulatorio / auditoría REPROCANN
  {
    type: 'nc-compliance-agent',
    label: 'NC Compliance Agent',
    description: 'Auditoría regulatoria y compliance bajo Ley 27.350 / REPROCANN. Verifica documentación de pacientes, trazabilidad de lotes, cumplimiento de la Asociación Civil y reportes para autoridades.',
    emoji: '🛡️',
    modelTier: 'haiku',
    toolCount: 8,
    vertical: 'NC MËD',
    config: {
      model: {
        primary: 'anthropic/claude-haiku-4-5',
        fallbacks: HAIKU_FALLBACKS,
      },
      identity: {
        name: 'NC Compliance Agent',
        theme: 'auditor regulatorio REPROCANN cannabis medicinal',
        emoji: '🛡️',
      },
      sandbox: {
        mode: 'all',
        workspaceAccess: 'ro',
        scope: 'agent',
      },
      tools: {
        allow: [
          'read',
          ...TOOL_GROUPS.memory,
          'agents_list',
          ...TOOL_GROUPS.thinking,
          'web',
        ],
        deny: [
          ...COMMON_DENY,
          'write', 'edit', 'apply_patch', 'exec', 'bash', 'process',
          'browser', 'sessions_send', 'sessions_spawn', 'lobster',
          'subagents', 'llm-task',
        ],
      },
      memorySearch: {
        sources: ['memory'],
      },
    },
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Get a template by type name */
export function getTemplate(type: string): AgentTemplate | undefined {
  return AGENT_TEMPLATES.find(t => t.type === type)
}

/** Get all templates for a given NC vertical */
export function getTemplatesByVertical(vertical: string): AgentTemplate[] {
  return AGENT_TEMPLATES.filter(t => t.vertical === vertical)
}

/** Build a full OpenClaw agent config from a template + overrides */
export function buildAgentConfig(
  template: AgentTemplate,
  overrides: {
    id: string
    name: string
    workspace?: string
    agentDir?: string
    emoji?: string
    theme?: string
    model?: string
    workspaceAccess?: 'rw' | 'ro' | 'none'
    sandboxMode?: 'all' | 'non-main'
    dockerNetwork?: 'none' | 'bridge'
    subagentAllowAgents?: string[]
  }
): OpenClawAgentConfig {
  const config = structuredClone(template.config)

  config.identity.name = overrides.name
  if (overrides.emoji) config.identity.emoji = overrides.emoji
  if (overrides.theme) config.identity.theme = overrides.theme
  if (overrides.model) config.model.primary = overrides.model
  if (overrides.workspaceAccess) config.sandbox.workspaceAccess = overrides.workspaceAccess
  if (overrides.sandboxMode) config.sandbox.mode = overrides.sandboxMode

  if (overrides.dockerNetwork) {
    config.sandbox.docker = { network: overrides.dockerNetwork }
  }

  if (overrides.subagentAllowAgents && config.subagents) {
    config.subagents.allowAgents = overrides.subagentAllowAgents
  }

  return {
    id: overrides.id,
    name: overrides.name,
    workspace: overrides.workspace,
    agentDir: overrides.agentDir,
    ...config,
  }
}

/** Model tier display info for UI */
export const MODEL_TIERS = {
  opus:   { label: 'Opus',   color: 'purple', costIndicator: '$$$' },
  sonnet: { label: 'Sonnet', color: 'blue',   costIndicator: '$$'  },
  haiku:  { label: 'Haiku',  color: 'green',  costIndicator: '$'   },
} as const

/** NC vertical colors for UI */
export const NC_VERTICAL_COLORS: Record<string, string> = {
  'CORE':       '#2D4A22',  // verde oscuro NC
  'NC FARM':    '#4A7C3F',  // verde vivo
  'NC MËD':    '#6B4E3D',  // terracota
  'NC LAB':     '#3A5F7D',  // azul ciencia
  'NC BEAUTY':  '#8B5E8A',  // violeta botánico
  'NC ESPELTA': '#C4A44A',  // dorado trigo
  'NC RESTO':   '#C4694A',  // naranja gastronómico
  'NC JUNGLE':  '#1A5C40',  // verde selva
  'NC CLUB':    '#2A2A4A',  // índigo oscuro
}

/** Tool group labels for UI */
export const TOOL_GROUP_LABELS = {
  coding:   'Coding (read/write/exec)',
  browser:  'Browser & Web',
  memory:   'Memory Search',
  session:  'Session Management',
  subagent: 'Subagents & LLM Tasks',
  thinking: 'Thinking & Skills',
  readonly: 'Read-only',
} as const
