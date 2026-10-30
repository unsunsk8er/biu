import { type ReactNode } from 'react'
import {
  CloudDownload,
  Moon,
  Music2,
  Palette,
  Sun,
} from 'lucide-react'
import { MusicHero, MusicPageShell, MusicSection } from '@/components/AppleMusicPage'
import { useTheme } from '@/hooks/useTheme'
import { useAppSettings } from '@/hooks/useAppSettings'
import PlaylistSyncPanel from '@/components/PlaylistSyncPanel'
import AppSelect from '@/components/AppSelect'
import { isMobileApp } from '@/utils/mobile'
import type { AppSettings, SidebarState, ThemeMode } from '@/types'

export default function Settings() {
  const { mode, setMode } = useTheme()
  const { settings, setAppSettings } = useAppSettings()
  const mobile = isMobileApp()

  return (
    <div className="settings-page">
      <MusicPageShell>
        <MusicHero
        title="设置"
        subtitle="管理外观、播放、同步与本地数据"
        tone="red"
      />

      <div className="settings-wide">
        <SettingsGroup title="同步" icon={<CloudDownload size={20} />}>
          <PlaylistSyncPanel />
        </SettingsGroup>
      </div>

      <div className={`settings-grid ${mobile ? 'settings-grid--single' : ''}`}>

        <div className="settings-column">
          <SettingsGroup title="外观" icon={<Palette size={20} />}>
            <SettingsRow label="主题模式">
              <SegmentedControl
                options={[
                  { value: 'light' as ThemeMode, label: '浅色', icon: <Sun size={14} /> },
                  { value: 'dark' as ThemeMode, label: '深色', icon: <Moon size={14} /> },
                ]}
                value={mode}
                onChange={setMode}
              />
            </SettingsRow>
            {!mobile && (
              <SettingsRow label="侧边栏">
                <SegmentedControl
                  options={[
                    { value: 'expanded' as SidebarState, label: '展开' },
                    { value: 'collapsed' as SidebarState, label: '折叠' },
                    { value: 'auto' as SidebarState, label: '自动' },
                  ]}
                  value={settings.sidebarState}
                  onChange={(sidebarState) => setAppSettings({ sidebarState })}
                />
              </SettingsRow>
            )}
          </SettingsGroup>

          <SettingsGroup title="播放" icon={<Music2 size={20} />}>
            <SettingsRow label="音质">
              <StyledSelect
                value={settings.playQuality}
                onChange={(playQuality) => setAppSettings({ playQuality: playQuality as AppSettings['playQuality'] })}
                options={['标准', '高品质', '无损']}
              />
            </SettingsRow>
            <p className="settings-note settings-quality-note">
              音质在下一首或重新加载时生效；实际档位取决于 B 站是否提供该流。无损需要 FLAC/杜比可用，否则自动回退到高品质 AAC。
            </p>
          </SettingsGroup>

        </div>
        </div>
      </MusicPageShell>
    </div>
  )
}

function SettingsGroup({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <MusicSection title={title} icon={icon}>
      <div className="settings-panel">{children}</div>
    </MusicSection>
  )
}

function SettingsRow({
  label,
  description,
  children,
  className,
}: {
  label: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`settings-row${className ? ` ${className}` : ''}`}>
      <div className="settings-row__text">
        <strong>{label}</strong>
        {description && <span>{description}</span>}
      </div>
      <div className="settings-row__control">{children}</div>
    </div>
  )
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="settings-segment">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={value === opt.value ? 'is-active' : ''}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function StyledSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <AppSelect
      value={value}
      onChange={onChange}
      options={options.map(option => ({ value: option, label: option }))}
      ariaLabel="选择音质"
    />
  )
}
