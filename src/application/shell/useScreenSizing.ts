import { useLayoutEffect } from "react"

/** Screen sizing stays constant as a window is resized on the same monitor. */
export function useScreenSizing(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return

    const root = document.documentElement
    const update = () => {
      // The reference monitor is 2560 CSS pixels wide with a 16px base font.
      root.style.setProperty("--desktop-screen-font-size", `${(window.screen.width * 16) / 2560}px`)
    }

    update()
    window.addEventListener("resize", update)
    window.addEventListener("focus", update)
    window.screen.orientation?.addEventListener("change", update)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("focus", update)
      window.screen.orientation?.removeEventListener("change", update)
      root.style.removeProperty("--desktop-screen-font-size")
    }
  }, [active])
}
