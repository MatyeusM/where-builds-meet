import type { ButtonHTMLAttributes } from "react"

import styles from "./style.module.css"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

// Reusable button behavior and base presentation. Visual variants
// (button-primary, button-secondary, button-danger, button-small, ...) live
// in application CSS and use the shared design tokens directly.
export function Button({ type = "button", className, ...rest }: ButtonProps) {
  return <button type={type} className={className ? `${styles.button} ${className}` : styles.button} {...rest} />
}
