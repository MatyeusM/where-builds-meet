import type { ButtonHTMLAttributes } from "react"

import styles from "./style.module.css"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger"
  size?: "small"
}

export function Button({ type = "button", variant, size, className, ...rest }: ButtonProps) {
  const classes = [styles.button]
  if (variant) classes.push(styles[variant])
  if (size) classes.push(styles[size])
  if (className) classes.push(className)

  return <button type={type} data-button="" className={classes.join(" ")} {...rest} />
}
