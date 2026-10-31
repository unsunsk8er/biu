try {
  const savedTheme = localStorage.getItem('theme-mode')
  const lightDefaultApplied = localStorage.getItem('theme-light-default-v103') === '1'
  document.documentElement.setAttribute(
    'data-theme',
    savedTheme === 'dark' && lightDefaultApplied ? 'dark' : 'light',
  )
} catch {
  document.documentElement.setAttribute('data-theme', 'light')
}
