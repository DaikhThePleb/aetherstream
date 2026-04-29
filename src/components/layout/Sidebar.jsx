import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gift,
  List,
  Mic,
  Monitor,
  Palette,
  RotateCcw,
  ShieldAlert,
  Twitch,
  Users,
  Volume2,
} from 'lucide-react'

const settingsItems = [
  {
    key: 'azure',
    labelKey: 'menu_azure',
    icon: Mic,
  },
  {
    key: 'audio',
    labelKey: 'menu_audio',
    icon: Volume2,
  },
  {
    key: 'twitch',
    labelKey: 'menu_twitch',
    icon: Twitch,
  },
  {
    key: 'rewards',
    labelKey: 'menu_rewards',
    icon: Gift,
  },
  {
    key: 'appearance',
    labelKey: 'menu_visuals',
    icon: Palette,
  },
  {
    key: 'visuals',
    labelKey: 'menu_visuals_vts',
    icon: Monitor,
  },
]

const adminItems = [
  {
    key: 'voices',
    labelKey: 'menu_voices',
    icon: Users,
  },
  {
    key: 'blacklist',
    labelKey: 'menu_blacklist',
    icon: ShieldAlert,
  },
]

const monitoringItems = [
  {
    key: 'logs',
    labelKey: 'menu_logs',
    icon: List,
  },
]

function SidebarSectionHeader({ children }) {
  return (
    <div
      className="sidebar-header"
      style={{
        background: 'var(--brand-gradient)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundSize: '200% auto',
        animation: 'gradient-flow 3s linear infinite',
      }}
    >
      {children}
    </div>
  )
}

function SidebarItem({ item, activeSection, onSelect, label, danger = false, collapsed = false }) {
  const Icon = item.icon
  const active = activeSection === item.key
  const activeClasses = active
    ? (danger
      ? 'border border-red-500/40 bg-red-600/20 shadow-[0_4px_20px_rgba(239,68,68,0.25)]'
      : 'active')
    : ''
  const dangerClasses = danger
    ? 'danger text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors'
    : ''

  return (
    <div
      onClick={() => onSelect(item.key)}
      className={`sidebar-item flex items-center gap-3 ${activeClasses} ${dangerClasses}`}
      data-section={item.key}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect(item.key)
      }}
    >
      <Icon className="w-5 h-5" />
      {!collapsed && <span>{label}</span>}
    </div>
  )
}

function SidebarStatusIcon({ twitchState, ttsStatus }) {
  if (ttsStatus === 'PLAYING') return <span className="sidebar-status-dot sidebar-status-dot-playing" aria-hidden="true" />
  if (ttsStatus === 'PAUSED') return <span className="sidebar-status-dot sidebar-status-dot-paused" aria-hidden="true" />
  if (twitchState === 'connecting') return <span className="sidebar-status-dot sidebar-status-dot-connecting" aria-hidden="true" />
  if (twitchState === 'online') return <span className="sidebar-status-dot sidebar-status-dot-online" aria-hidden="true" />
  return <span className="sidebar-status-dot sidebar-status-dot-offline" aria-hidden="true" />
}

export function Sidebar({ activeSection, onSelectSection, appVersion, twitchConnection, ttsState, collapsed = false, onToggleCollapsed, t }) {
  const twitchState = twitchConnection?.state || 'offline'
  const twitchUsername = twitchConnection?.username || ''
  const ttsStatus = ttsState?.status || 'IDLE'
  const formatStatus = (label) => String(label || '').replace(/^•\s*/, '')

  let statusClassName = 'rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-[10px] font-bold uppercase text-red-500'
  let statusText = formatStatus(t('offline'))

  if (ttsStatus === 'PLAYING') {
    statusClassName = 'rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-center text-[10px] font-bold uppercase text-sky-400 animate-pulse'
    statusText = formatStatus(t('speaking'))
  } else if (ttsStatus === 'PAUSED') {
    statusClassName = 'rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-center text-[10px] font-bold uppercase text-yellow-500'
    statusText = formatStatus(t('badge_paused'))
  } else if (twitchState === 'connecting') {
    statusClassName = 'rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-center text-[10px] font-bold uppercase text-yellow-500'
    statusText = formatStatus(t('status_connecting'))
  } else if (twitchState === 'online' && twitchUsername) {
    statusClassName = 'rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-center text-[10px] font-bold uppercase text-green-500 animate-pulse'
    statusText = `${formatStatus(t('status_online'))}: ${twitchUsername.toUpperCase()}`
  }

  return (
    <nav className={`sidebar flex h-full flex-shrink-0 flex-col ${collapsed ? 'sidebar-collapsed w-20' : 'w-64'}`}>
      <div className={`logo-container ${collapsed ? 'sidebar-logo-collapsed' : 'items-start pt-6 pb-4'}`}>
        <img src="/assets/logo.png" alt="Logo" className="logo-img mt-1 h-10 w-10" />
        {!collapsed && (
          <div className="flex flex-col">
            <h1 className="app-title-text text-xl leading-tight">
              Aether<span className="text-brand-gradient">Stream</span>
            </h1>
            <div className="mt-2 flex select-none items-center gap-2 text-[11px] font-medium text-gray-400 whitespace-nowrap">
              <span id="app-version-display" className="version-badge">
                v{appVersion}
              </span>
              <span className="opacity-60">© 2025-2026</span>
            </div>
          </div>
        )}
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? t('sidebar_expand', 'Expand sidebar') : t('sidebar_collapse', 'Collapse sidebar')}
          title={collapsed ? t('sidebar_expand', 'Expand sidebar') : t('sidebar_collapse', 'Collapse sidebar')}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {!collapsed && <SidebarSectionHeader>{t('header_settings')}</SidebarSectionHeader>}
      {settingsItems.map((item) => (
        <SidebarItem
          key={item.key}
          item={item}
          label={t(item.labelKey)}
          activeSection={activeSection}
          onSelect={onSelectSection}
          collapsed={collapsed}
        />
      ))}

      {!collapsed && <SidebarSectionHeader>{t('header_admin')}</SidebarSectionHeader>}
      {adminItems.map((item) => (
        <SidebarItem
          key={item.key}
          item={item}
          label={t(item.labelKey)}
          activeSection={activeSection}
          onSelect={onSelectSection}
          collapsed={collapsed}
        />
      ))}

      {!collapsed && <SidebarSectionHeader>{t('header_monitoring')}</SidebarSectionHeader>}
      {monitoringItems.map((item) => (
        <SidebarItem
          key={item.key}
          item={item}
          label={t(item.labelKey)}
          activeSection={activeSection}
          onSelect={onSelectSection}
          collapsed={collapsed}
        />
      ))}

      {!collapsed && <SidebarSectionHeader>{t('header_system')}</SidebarSectionHeader>}
      <SidebarItem
        item={{
          key: 'reset',
          labelKey: 'menu_reset',
          icon: RotateCcw,
        }}
        label={t('menu_reset')}
        activeSection={activeSection}
        onSelect={onSelectSection}
        collapsed={collapsed}
      />
      <SidebarItem
        item={{
          key: 'about',
          labelKey: 'menu_about',
          icon: ExternalLink,
        }}
        label={t('menu_about')}
        activeSection={activeSection}
        onSelect={onSelectSection}
        collapsed={collapsed}
      />

      <div className="mt-auto">
        <div className="mx-6 mb-4 mt-2 h-px bg-white/5" />
        <div className="p-6">
          <div id="status-badge" className={collapsed ? 'sidebar-status-compact' : `flex items-center justify-center gap-2 ${statusClassName}`}>
            <SidebarStatusIcon twitchState={twitchState} ttsStatus={ttsStatus} />
            {!collapsed && <span>{statusText}</span>}
          </div>
        </div>
      </div>
    </nav>
  )
}
