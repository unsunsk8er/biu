import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface AppSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface AppSelectProps {
  value: string
  options: AppSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

export default function AppSelect({
  value,
  options,
  onChange,
  placeholder = '请选择',
  disabled = false,
  ariaLabel,
  className = '',
}: AppSelectProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 180, maxHeight: 320 })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value)

  const close = () => {
    setOpen(false)
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = Math.min(Math.max(rect.width, 168), window.innerWidth - 16)
    const maxHeight = Math.min(340, window.innerHeight - 16)
    const menuHeight = Math.min(menuRef.current?.scrollHeight || 0, maxHeight)
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))
    let top = rect.bottom + 6
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - 6)
    }
    setPosition({ left, top, width, maxHeight })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const onViewportChange = () => updatePosition()
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => {
      const menu = menuRef.current
      const selectedOption = menu?.querySelector<HTMLButtonElement>('[data-selected="true"]')
      const firstOption = menu?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)')
      ;(selectedOption || firstOption)?.focus()
    })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (option: AppSelectOption) => {
    if (option.disabled) return
    onChange(option.value)
    close()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`settings-select app-select__trigger ${open ? 'is-open' : ''} ${className}`.trim()}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="app-select__value">{selected?.label || placeholder}</span>
        <ChevronDown size={14} className="app-select__chevron" aria-hidden="true" />
      </button>

      {open && createPortal(
        <div className="app-select__layer" onMouseDown={close}>
          <div
            ref={menuRef}
            className="app-select__menu"
            role="listbox"
            aria-label={ariaLabel}
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="app-select__handle" aria-hidden="true" />
            {options.length === 0 ? (
              <div className="app-select__empty">{placeholder}</div>
            ) : options.map((option) => {
              const active = option.value === value
              return (
                <button
                  key={`${option.value}-${option.label}`}
                  type="button"
                  role="option"
                  aria-selected={active}
                  data-selected={active ? 'true' : undefined}
                  className={`app-select__option ${active ? 'is-selected' : ''}`}
                  disabled={option.disabled}
                  onClick={() => choose(option)}
                >
                  <span>{option.label}</span>
                  {active && <Check size={14} className="app-select__check" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
