import type { HTMLAttributes, ReactNode } from "react"

import styles from "./style.module.css"

type TooltipProps = Omit<HTMLAttributes<HTMLSpanElement>, "content"> & {
  content: ReactNode
  /** Above-placement alignment of the floating box. Structural, not a theme. */
  align?: "start" | "end"
}

// Hover tooltip with a layout-neutral wrapper: the anchor takes no box
// (`display: contents`), so it can wrap triggers inside flex and grid
// parents without changing layout. Reveal on hover and focus-within and the
// shared floating-box chrome live here; content-specific layout and colors
// live in application classes.
export function Tooltip({ content, align = "start", className, children, ...rest }: TooltipProps) {
  return (
    <span {...rest} className={styles.anchor}>
      {children}
      <span
        role="tooltip"
        className={`${styles.tooltip}${align === "end" ? ` ${styles.alignEnd}` : ""}${className ? ` ${className}` : ""}`}
      >
        {content}
      </span>
    </span>
  )
}
