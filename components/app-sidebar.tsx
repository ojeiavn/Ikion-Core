"use client"

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

const courses = [
  { id: "pm301", name: "PM301: Project Management", code: "PM301" },
  { id: "cs201", name: "CS201: Data Structures", code: "CS201" },
  { id: "ba401", name: "BA401: Business Analytics", code: "BA401" },
]

interface AppSidebarProps {
  userRole?: "student" | "lecturer" | "admin"
}

export function AppSidebar({ userRole = "student" }: AppSidebarProps) {
  const pathname = usePathname()
  
  const navItems = userRole === "lecturer" 
    ? lecturerNavItems 
    : userRole === "admin" 
      ? adminNavItems 
      : studentNavItems

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
        <OrionLogo size="md" />
      </div>

      {/* Course Selector (for students) */}
      {userRole === "student" && (
        <div className="border-b border-sidebar-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-lg bg-sidebar-accent px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent/80">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-sidebar-primary" />
                <span className="truncate">PM301: Project Management</span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {courses.map((course) => (
                <DropdownMenuItem key={course.id} className="cursor-pointer">
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
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
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
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            pathname === "/dashboard/settings"
              ? "bg-sidebar-primary text-sidebar-primary-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          )}
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  )
}
