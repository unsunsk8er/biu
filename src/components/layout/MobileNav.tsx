import { Link, useLocation } from 'react-router-dom'
import { Download, ListMusic, Search, Settings } from 'lucide-react'

const items = [
  { to: '/search', label: '搜索', icon: Search },
  { to: '/playlists', label: '歌单', icon: ListMusic },
  { to: '/downloads', label: '下载', icon: Download },
  { to: '/settings', label: '设置', icon: Settings },
]

export default function MobileNav() {
  const { pathname } = useLocation()
  return (
    <nav className="mobile-tabbar" aria-label="主导航">
      {items.map(({ to, label, icon: Icon }) => {
        const active = pathname === to || pathname.startsWith(`${to}/`)
        return (
          <Link key={to} to={to} className={`mobile-tabbar__item ${active ? 'is-active' : ''}`}>
            <Icon size={21} strokeWidth={active ? 2.2 : 1.85} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
