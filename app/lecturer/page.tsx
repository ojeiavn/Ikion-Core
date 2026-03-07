"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { 
  MessageSquare, 
  TrendingUp, 
  AlertTriangle, 
  Users,
  ArrowRight,
  BarChart3,
  HelpCircle,
  Clock,
  ChevronRight
} from "lucide-react"

const stats = [
  { label: "Total Questions", value: "1,247", change: "+12%", icon: MessageSquare },
  { label: "Active Students", value: "156", change: "+8%", icon: Users },
  { label: "Avg. Questions/Day", value: "42", change: "+15%", icon: TrendingUp },
  { label: "Topics Flagged", value: "3", change: "-2", icon: AlertTriangle },
]

const topQuestions = [
  {
    question: "How is float calculated in CPM?",
    count: 47,
    trend: "up",
    topic: "Scheduling",
  },
  {
    question: "Difference between Kanban and Scrum",
    count: 38,
    trend: "up",
    topic: "Agile",
  },
  {
    question: "What is a risk register?",
    count: 31,
    trend: "stable",
    topic: "Risk",
  },
  {
    question: "How to identify stakeholders?",
    count: 28,
    trend: "down",
    topic: "Stakeholders",
  },
  {
    question: "PERT vs CPM differences",
    count: 24,
    trend: "up",
    topic: "Scheduling",
  },
]

const misconceptionClusters = [
  {
    topic: "Float Calculations",
    severity: "high",
    studentCount: 34,
    description: "Students confuse total float with free float",
    lectures: ["Lecture 6"],
  },
  {
    topic: "Sprint vs Iteration",
    severity: "medium",
    studentCount: 22,
    description: "Unclear distinction between Scrum sprints and generic iterations",
    lectures: ["Lecture 8"],
  },
  {
    topic: "Risk vs Issue",
    severity: "medium",
    studentCount: 18,
    description: "Conflating potential risks with actual project issues",
    lectures: ["Lecture 7"],
  },
]

const recentActivity = [
  { time: "2 hours ago", event: "Peak question activity about Critical Path Method" },
  { time: "Yesterday", event: "New misconception cluster identified: Float calculations" },
  { time: "2 days ago", event: "32 students accessed Lecture 6 materials" },
  { time: "3 days ago", event: "Weekly insight report generated" },
]

export default function LecturerDashboard() {
  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lecturer Dashboard</h1>
          <p className="mt-1 text-muted-foreground">
            PM301: Project Management — Overview
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/lecturer/aqir">
            <Button variant="outline" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              View Full Report
            </Button>
          </Link>
          <Link href="/lecturer/guidance">
            <Button className="gap-2">
              Edit Guidance
              <ArrowRight className="h-4 w-4" />
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
                <Badge 
                  variant={stat.change.startsWith('+') ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {stat.change}
                </Badge>
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Questions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Most Common Questions</CardTitle>
                <CardDescription>What students are asking most</CardDescription>
              </div>
              <HelpCircle className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {topQuestions.map((q, idx) => (
              <div
                key={idx}
                className="flex items-center gap-4 rounded-lg border border-border p-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-sm font-semibold">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{q.question}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">{q.topic}</Badge>
                    <span className="text-xs text-muted-foreground">{q.count} times</span>
                  </div>
                </div>
                <TrendingUp className={`h-4 w-4 ${
                  q.trend === 'up' ? 'text-chart-1' : 
                  q.trend === 'down' ? 'text-chart-2' : 'text-muted-foreground'
                }`} />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Misconception Clusters */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Misconception Clusters</CardTitle>
                <CardDescription>Topics students struggle with</CardDescription>
              </div>
              <AlertTriangle className="h-5 w-5 text-accent" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {misconceptionClusters.map((cluster, idx) => (
              <div
                key={idx}
                className={`rounded-lg border p-4 ${
                  cluster.severity === 'high' 
                    ? 'border-destructive/30 bg-destructive/5' 
                    : 'border-accent/30 bg-accent/5'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{cluster.topic}</h4>
                      <Badge 
                        variant={cluster.severity === 'high' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {cluster.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {cluster.description}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{cluster.studentCount} students affected</span>
                      <span className="text-border">|</span>
                      <span>{cluster.lectures.join(', ')}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <Link href="/lecturer/aqir">
              <Button variant="ghost" size="sm" className="w-full gap-1">
                View All Insights
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <CardDescription>Latest events and notifications</CardDescription>
              </div>
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative space-y-4">
              {recentActivity.map((activity, idx) => (
                <div key={idx} className="flex gap-4">
                  <div className="relative flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-accent" />
                    {idx < recentActivity.length - 1 && (
                      <div className="absolute top-2 h-full w-px bg-border" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-sm">{activity.event}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
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
