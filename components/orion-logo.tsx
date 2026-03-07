import { cn } from "@/lib/utils"

interface OrionLogoProps {
  className?: string
  size?: "sm" | "md" | "lg"
  showText?: boolean
}

export function OrionLogo({ className, size = "md", showText = true }: OrionLogoProps) {
  const sizes = {
    sm: { icon: "h-6 w-6", text: "text-base" },
    md: { icon: "h-8 w-8", text: "text-xl" },
    lg: { icon: "h-10 w-10", text: "text-2xl" },
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className={cn("relative", sizes[size].icon)}>
        {/* Orion constellation-inspired mark */}
        <svg
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-full w-full"
        >
          {/* Outer ring */}
          <circle
            cx="16"
            cy="16"
            r="14"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-foreground/20"
          />
          {/* Inner constellation dots */}
          <circle cx="16" cy="8" r="2" fill="currentColor" className="text-accent" />
          <circle cx="10" cy="14" r="1.5" fill="currentColor" className="text-foreground" />
          <circle cx="22" cy="14" r="1.5" fill="currentColor" className="text-foreground" />
          <circle cx="16" cy="18" r="2.5" fill="currentColor" className="text-accent" />
          <circle cx="12" cy="24" r="1.5" fill="currentColor" className="text-foreground" />
          <circle cx="20" cy="24" r="1.5" fill="currentColor" className="text-foreground" />
          {/* Connecting lines */}
          <path
            d="M16 10 L10 14 M16 10 L22 14 M10 14 L16 18 M22 14 L16 18 M16 18 L12 24 M16 18 L20 24"
            stroke="currentColor"
            strokeWidth="0.75"
            className="text-foreground/30"
          />
        </svg>
      </div>
      {showText && (
        <span className={cn("font-semibold tracking-tight", sizes[size].text)}>
          Orion
        </span>
      )}
    </div>
  )
}
