export function isAndroidApp(): boolean {
  return typeof navigator !== 'undefined' && /\bBiuAndroid\b/.test(navigator.userAgent)
}

/**
 * Use the stable physical screen dimensions for the large-screen decision.
 * WebView `innerHeight` shrinks while the soft keyboard is open; using it made
 * the layout flip to phone mode, remount the current route and dismiss the
 * keyboard immediately on HarmonyOS smart screens.
 */
function stableScreenShortestSide(): number {
  if (typeof window === 'undefined' || !window.screen) return 0
  const candidates = [
    window.screen.width,
    window.screen.height,
    window.screen.availWidth,
    window.screen.availHeight,
  ].filter((value) => Number.isFinite(value) && value > 0)
  return candidates.length ? Math.min(...candidates) : 0
}

export function isLargeScreen(): boolean {
  if (typeof window === 'undefined') return false
  if (window.innerWidth < 720) return false
  const shortestSide = stableScreenShortestSide()
  // Fallback for WebViews that report no usable screen metrics.
  if (!shortestSide) return window.innerHeight >= 500
  return shortestSide >= 500
}

export function isAndroidPhone(): boolean {
  return isAndroidApp() && !isLargeScreen()
}
