import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-cobalt text-white hover:bg-cobalt-dark disabled:bg-cobalt/50",
  secondary: "bg-white text-ink border border-line hover:border-slate/50 disabled:text-slate",
  ghost: "text-ink hover:bg-ink/5 disabled:text-slate/60",
  danger: "bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed",
        size === "sm" && "h-8 px-3 text-sm",
        size === "md" && "h-10 px-4 text-[15px]",
        size === "lg" && "h-12 px-6 text-base",
        styles[variant],
        className,
      )}
    />
  );
}
