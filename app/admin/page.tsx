"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { 
  BookOpen,
  Users,
  Upload,
  Settings,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertCircle,
  Database,
  Link2,
  BarChart3
} from "lucide-react"

const stats = [
  { label: "Active Modules", value: "12", icon: BookOpen, change: "+2 this term" },
  { label: "Total Users", value: "2,847", icon: Users, change: "+156 this month" },
  { label: "Materials Uploaded", value: "1,432", icon: Upload, change: "98% processed" },
  { label: "System Health", value: "99.9%", icon: BarChart3, change: "All systems operational" },
]

const modules = [
  {
    code: "PM301",
    name: "Project Management",
    students: 156,
    materials: 124,
    status: "active",
    lastSync: "2 hours ago",
  },
  {
    code: "CS201",
    name: "Data Structures",
    students: 203,
    materials: 98,
    status: "active",
    lastSync: "4 hours ago",
  },
  {
    code: "BA401",
    name: "Business Analytics",
    students: 89,
    materials: 76,
    status: "active",
    lastSync: "1 hour ago",
  },
  {
    code: "EC101",
    name: "Microeconomics",
    students: 312,
    materials: 145,
    status: "syncing",
    lastSync: "In progress",
  },
]

const recentUploads = [
  {
    name: "Lecture 8 - Agile Methods.pdf",
    module: "PM301",
    type: "Slides",
    status: "processed",
    time: "1 hour ago",
  },
  {
    name: "Week 8 Recording.mp4",
    module: "PM301",
    type: "Video",
    status: "processing",
    time: "2 hours ago",
    progress: 67,
  },
  {
    name: "Chapter 9 Reading.pdf",
    module: "PM301",
    type: "Reading",
    status: "processed",
    time: "Yesterday",
  },
  {
    name: "Past Exam 2025.pdf",
    module: "PM301",
    type: "Exam",
    status: "processed",
    time: "Yesterday",
  },
]

const integrations = [
  { name: "Panopto", status: "connected", description: "Lecture capture system" },
  { name: "Moodle LMS", status: "connected", description: "Learning management system" },
  { name: "Microsoft Teams", status: "pending", description: "Awaiting configuration" },
]

export default function AdminDashboard() {
  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">University Control Panel</h1>
          <p className="mt-1 text-muted-foreground">
            Manage modules, materials, and system configuration
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/modules">
            <Button variant="outline" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Manage Modules
            </Button>
          </Link>
          <Link href="/admin/users">
            <Button className="gap-2">
              <Users className="h-4 w-4" />
              User Management
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10">
                  <stat.icon className="h-5 w-5 text-accent" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.change}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Modules */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Active Modules</CardTitle>
                <CardDescription>Modules currently deployed with Orion</CardDescription>
              </div>
              <Link href="/admin/modules">
                <Button variant="ghost" size="sm" className="gap-1">
                  View All
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {modules.map((module) => (
              <div
                key={module.code}
                className="flex items-center gap-4 rounded-lg border border-border p-3"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{module.code}</span>
                    <span className="font-medium truncate">{module.name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{module.students} students</span>
                    <span className="text-border">|</span>
                    <span>{module.materials} materials</span>
                  </div>
                </div>
                <div className="text-right">
                  {module.status === 'active' ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Active
                    </Badge>
                  ) : (
                    <Badge className="gap-1 bg-accent">
                      <Clock className="h-3 w-3 animate-spin" />
                      Syncing
                    </Badge>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{module.lastSync}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Uploads */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Uploads</CardTitle>
                <CardDescription>Latest materials added to Orion</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentUploads.map((upload, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{upload.name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{upload.module}</span>
                      <span className="text-border">|</span>
                      <span>{upload.type}</span>
                      <span className="text-border">|</span>
                      <span>{upload.time}</span>
                    </div>
                  </div>
                  {upload.status === 'processed' ? (
                    <CheckCircle2 className="h-4 w-4 text-chart-2" />
                  ) : (
                    <Clock className="h-4 w-4 text-accent animate-spin" />
                  )}
                </div>
                {upload.status === 'processing' && upload.progress && (
                  <Progress value={upload.progress} className="h-1" />
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Integrations */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">System Integrations</CardTitle>
                <CardDescription>Connected services and data sources</CardDescription>
              </div>
              <Link href="/admin/integrations">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Settings className="h-4 w-4" />
                  Configure
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {integrations.map((integration) => (
                <div
                  key={integration.name}
                  className={`rounded-lg border p-4 ${
                    integration.status === 'connected' 
                      ? 'border-chart-2/30 bg-chart-2/5' 
                      : 'border-accent/30 bg-accent/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      integration.status === 'connected' 
                        ? 'bg-chart-2/20' 
                        : 'bg-accent/20'
                    }`}>
                      <Link2 className={`h-5 w-5 ${
                        integration.status === 'connected' 
                          ? 'text-chart-2' 
                          : 'text-accent'
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{integration.name}</p>
                        {integration.status === 'connected' ? (
                          <Badge variant="secondary" className="text-xs">Connected</Badge>
                        ) : (
                          <Badge className="text-xs bg-accent">Pending</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{integration.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
