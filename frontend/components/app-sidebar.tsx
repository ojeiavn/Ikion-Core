"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { OrionLogo } from "@/components/orion-logo"
import {
  Home,
  BookOpen,
  MessageSquare,
  Video,
  FileText,
  StickyNote,
  BarChart3,
  Settings,
  GraduationCap,
  Users,
  ChevronDown,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { OrionWorkspaceSummary, orionFetch } from "@/lib/orion-api"
import { setActiveWorkspaceId } from "@/lib/workspace-store"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

const studentNavItems: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Courses", href: "/dashboard/courses", icon: BookOpen },
  { label: "Ask Orion", href: "/dashboard/ask", icon: MessageSquare },
  { label: "Lecture Explorer", href: "/dashboard/lectures", icon: Video },
  { label: "Exam Prep", href: "/dashboard/exam-prep", icon: FileText },
  { label: "Notes", href: "/dashboard/notes", icon: StickyNote },
  { label: "Insights", href: "/dashboard/insights", icon: BarChart3 },
]

const lecturerNavItems: NavItem[] = [
  { label: "Dashboard", href: "/lecturer", icon: Home },
  { label: "Query Insights", href: "/lecturer/aqir", icon: BarChart3 },
  { label: "Guidance Editor", href: "/lecturer/guidance", icon: FileText },
  { label: "Courses", href: "/lecturer/courses", icon: BookOpen },
]

const adminNavItems: NavItem[] = [
  { label: "Overview", href: "/admin", icon: Home },
  { label: "Modules", href: "/admin/modules", icon: BookOpen },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Integrations", href: "/admin/integrations", icon: Settings },
]

interface AppSidebarProps {
  userRole?: "student" | "lecturer" | "admin"
  collapsed?: boolean
  onToggleCollapse?: () => void
}

export function AppSidebar({
  userRole = "student",
  collapsed = false,
  onToggleCollapse: _onToggleCollapse,
}: AppSidebarProps) {
  const pathname = usePathname()
  const { workspaceId, refreshWorkspaceId } = useActiveWorkspaceId()
  const [courses, setCourses] = useState<OrionWorkspaceSummary[]>([])

  useEffect(() => {
    if (userRole !== "student") return
    const loadCourses = async () => {
      try {
        const workspaceList = await orionFetch<OrionWorkspaceSummary[]>("/me/workspaces")
        setCourses(workspaceList)
        if (!workspaceId && workspaceList.length > 0) {
          setActiveWorkspaceId(workspaceList[0].id)
          refreshWorkspaceId()
        }
      } catch {
        setCourses([])
      }
    }
    void loadCourses()
  }, [userRole, workspaceId, refreshWorkspaceId])

  const activeCourse = useMemo(
    () => courses.find((course) => course.id === workspaceId) ?? courses[0] ?? null,
    [courses, workspaceId],
  )
  
  const navItems = userRole === "lecturer" 
    ? lecturerNavItems 
    : userRole === "admin" 
      ? adminNavItems 
      : studentNavItems

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-300 ease-out",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "relative flex h-20 items-center border-b border-sidebar-border px-3",
          collapsed ? "justify-center" : "justify-start"
        )}
      >
        <OrionLogo size={collapsed ? "md" : "lg"} showText={!collapsed} />
      </div>

      {/* Course Selector (for students) */}
      {userRole === "student" && !collapsed && (
        <div className="border-b border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-lg bg-sidebar-accent px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent/80">
              <div className="flex min-w-0 items-center gap-2">
                <GraduationCap className="h-4 w-4 text-sidebar-primary" />
                <span className="min-w-0 flex-1 truncate">{activeCourse?.name ?? "Select a course"}</span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {courses.map((course) => (
                <DropdownMenuItem
                  key={course.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setActiveWorkspaceId(course.id)
                    refreshWorkspaceId()
                  }}
                >
                  <span>{course.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center rounded-lg py-2.5 text-sm font-medium transition-all duration-150",
                    collapsed ? "justify-center px-2" : "gap-3 px-3",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="h-4 w-4" />
                  {!collapsed && item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Settings */}
      <div className="border-t border-sidebar-border p-3">
        <Link
          href="/dashboard/settings"
          className={cn(
            "flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
            collapsed ? "justify-center px-2" : "gap-3 px-3",
            pathname === "/dashboard/settings"
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          )}
          title={collapsed ? "Settings" : undefined}
        >
          <Settings className="h-4 w-4" />
          {!collapsed && "Settings"}
        </Link>
      </div>
    </aside>
  )
}
