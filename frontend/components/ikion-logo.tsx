import Image from "next/image"
import { cn } from "@/lib/utils"

interface IkionLogoProps {
  className?: string
  size?: "sm" | "md" | "lg"
  showText?: boolean
}

export function IkionLogo({
  className,
  size = "lg",
  showText = true,
}: IkionLogoProps) {
  const sizes = {
    sm: { icon: "h-10 w-10", text: "text-lg" },
    md: { icon: "h-14 w-14", text: "text-[1.95rem]" },
    lg: { icon: "h-[4.6rem] w-[4.6rem]", text: "text-[2.15rem]" },
  }

  return (
    <div className={cn("inline-flex items-center gap-2 leading-none", className)}>
      <div className={cn("ikion-logo-mark relative shrink-0 overflow-hidden translate-y-[6px]", sizes[size].icon)}>
        <Image
          src="/Ikion Logo.png"
          alt="Ikion"
          fill
          className="ikion-logo-image object-contain [object-position:56%_50%] scale-[2.12]"
        />
      </div>

      {showText && (
        <span
          className={cn(
            "ikion-logo-text leading-none font-semibold tracking-tight text-sidebar-foreground translate-y-[-1px]",
            sizes[size].text
          )}
        >
          Ikion
        </span>
      )}
    </div>
  )
}
