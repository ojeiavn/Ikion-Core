"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { AppHeader } from "@/components/app-header"
import { AppSidebar } from "@/components/app-sidebar"
import { roleHomePath, useAuth } from "@/components/auth-provider"
import { OrionUserRole } from "@/lib/orion-api"

interface ProtectedShellProps {
  children: React.ReactNode
  allowedRoles: OrionUserRole[]
}

export function ProtectedShell({ children, allowedRoles }: ProtectedShellProps) {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (isLoading) return

    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`)
      return
    }

    if (!allowedRoles.includes(user.role)) {
      router.replace(roleHomePath(user.role))
    }
  }, [allowedRoles, isLoading, pathname, router, user])

  useEffect(() => {
    if (typeof window === "undefined") return
    const saved = window.localStorage.getItem("orion.sidebar.collapsed")
    if (saved === "1") {
      setSidebarCollapsed(true)
    }
  }, [])

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current
      if (typeof window !== "undefined") {
        window.localStorage.setItem("orion.sidebar.collapsed", next ? "1" : "0")
      }
      return next
    })
  }

  if (isLoading || !user || !allowedRoles.includes(user.role)) {
    return <div className="p-6 text-sm text-muted-foreground">Loading session...</div>
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar userRole={user.role} collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppHeader userRole={user.role} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
        <main className="flex-1 overflow-y-auto bg-muted/30">{children}</main>
      </div>
    </div>
  )
}
