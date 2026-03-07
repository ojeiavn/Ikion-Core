"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  BarChart3, 
  TrendingUp, 
  AlertTriangle, 
  Download,
  Calendar,
  Lightbulb,
  MessageSquare,
  Users,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react"

// Mock chart data
const questionsByTopic = [
  { topic: "Scheduling", count: 312, percentage: 25 },
  { topic: "Agile", count: 248, percentage: 20 },
  { topic: "Risk Management", count: 186, percentage: 15 },
  { topic: "Stakeholders", count: 161, percentage: 13 },
  { topic: "Quality", count: 137, percentage: 11 },
  { topic: "Resources", count: 112, percentage: 9 },
  { topic: "Other", count: 91, percentage: 7 },
]

const confusionByLecture = [
  { lecture: "Lecture 1", confusion: 15, questions: 89 },
  { lecture: "Lecture 2", confusion: 22, questions: 124 },
  { lecture: "Lecture 3", confusion: 18, questions: 97 },
  { lecture: "Lecture 4", confusion: 35, questions: 156 },
  { lecture: "Lecture 5", confusion: 28, questions: 143 },
  { lecture: "Lecture 6", confusion: 52, questions: 201 },
  { lecture: "Lecture 7", confusion: 41, questions: 178 },
  { lecture: "Lecture 8", confusion: 38, questions: 159 },
]

const topMisunderstandings = [
  {
    concept: "Total Float vs Free Float",
    queries: 47,
    trend: "up",
    relatedLectures: ["Lecture 6"],
    severity: "high",
  },
  {
    concept: "Sprint Velocity Calculation",
    queries: 38,
    trend: "up",
    relatedLectures: ["Lecture 8"],
    severity: "medium",
  },
  {
    concept: "Risk Register vs Issue Log",
    queries: 31,
    trend: "stable",
    relatedLectures: ["Lecture 7"],
    severity: "medium",
  },
  {
    concept: "RACI Matrix Application",
    queries: 28,
    trend: "down",
    relatedLectures: ["Lecture 5"],
    severity: "low",
  },
  {
    concept: "Earned Value Metrics",
    queries: 24,
    trend: "up",
    relatedLectures: ["Lecture 6"],
    severity: "high",
  },
]

const exampleQueries = [
  {
    query: "I don't understand the difference between total float and free float. Aren't they the same?",
    count: 23,
    topic: "Float Calculations",
  },
  {
    query: "How do I know if an activity is on the critical path?",
    count: 19,
    topic: "Critical Path",
  },
  {
    query: "When should I use Kanban instead of Scrum? They seem similar.",
    count: 17,
    topic: "Agile",
  },
  {
    query: "What's the point of a risk register if issues happen anyway?",
    count: 14,
    topic: "Risk Management",
  },
]

const suggestedInterventions = [
  {
    title: "Float Calculations Workshop",
    description: "Students are repeatedly confused about Critical Path float calculations. Consider adding a practical workshop with worked examples.",
    priority: "high",
    affectedStudents: 47,
  },
  {
    title: "Agile Comparison Guide",
    description: "Create a reference guide comparing Kanban, Scrum, and XP methodologies side-by-side.",
    priority: "medium",
    affectedStudents: 38,
  },
  {
    title: "Risk Management Case Study",
    description: "Add a real-world case study demonstrating risk identification and mitigation in practice.",
    priority: "medium",
    affectedStudents: 31,
  },
]

export default function AQIRPage() {
  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Automated Query Insight Reports</h1>
          <p className="mt-1 text-muted-foreground">
            PM301: Project Management — Analytics Dashboard
          </p>
        </div>
        <div className="flex gap-3">
          <Select defaultValue="30days">
            <SelectTrigger className="w-[140px]">
              <Calendar className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 days</SelectItem>
              <SelectItem value="30days">Last 30 days</SelectItem>
              <SelectItem value="90days">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Queries</span>
            </div>
            <p className="mt-2 text-3xl font-bold">1,247</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-chart-2">
              <ArrowUpRight className="h-3 w-3" />
              <span>+12% from last month</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Unique Students</span>
            </div>
            <p className="mt-2 text-3xl font-bold">156</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-chart-2">
              <ArrowUpRight className="h-3 w-3" />
              <span>+8% engagement</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Confusion Clusters</span>
            </div>
            <p className="mt-2 text-3xl font-bold">5</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
              <ArrowUpRight className="h-3 w-3" />
              <span>2 high severity</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Avg Daily Queries</span>
            </div>
            <p className="mt-2 text-3xl font-bold">42</p>
            <div className="mt-1 flex items-center gap-1 text-xs text-chart-2">
              <ArrowUpRight className="h-3 w-3" />
              <span>Peak: Week 6</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="concepts">Misunderstood Concepts</TabsTrigger>
          <TabsTrigger value="queries">Example Queries</TabsTrigger>
          <TabsTrigger value="interventions">Suggested Interventions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Questions by Topic */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Question Distribution by Topic</CardTitle>
                <CardDescription>What students are asking about most</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {questionsByTopic.map((item) => (
                  <div key={item.topic} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{item.topic}</span>
                      <span className="text-muted-foreground">{item.count} queries ({item.percentage}%)</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div 
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Confusion Heatmap by Lecture */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Confusion Index by Lecture</CardTitle>
                <CardDescription>Higher values indicate more repeated questions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2">
                  {confusionByLecture.map((lecture) => {
                    const intensity = lecture.confusion / 60
                    return (
                      <div
                        key={lecture.lecture}
                        className="aspect-square rounded-lg flex flex-col items-center justify-center text-center p-2 transition-colors"
                        style={{
                          backgroundColor: `oklch(${0.9 - intensity * 0.4} ${0.1 + intensity * 0.15} 27)`,
                        }}
                      >
                        <span className="text-xs font-medium">{lecture.lecture.replace('Lecture ', 'L')}</span>
                        <span className="text-lg font-bold">{lecture.confusion}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Low confusion</span>
                  <div className="flex gap-1">
                    {[0.2, 0.4, 0.6, 0.8, 1].map((i) => (
                      <div
                        key={i}
                        className="h-3 w-6 rounded"
                        style={{
                          backgroundColor: `oklch(${0.9 - i * 0.4} ${0.1 + i * 0.15} 27)`,
                        }}
                      />
                    ))}
                  </div>
                  <span>High confusion</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="concepts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Misunderstood Concepts</CardTitle>
              <CardDescription>Concepts students struggle with most, based on query analysis</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topMisunderstandings.map((item, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg border p-4 ${
                      item.severity === 'high' 
                        ? 'border-destructive/30 bg-destructive/5' 
                        : item.severity === 'medium'
                          ? 'border-accent/30 bg-accent/5'
                          : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{item.concept}</h4>
                          <Badge 
                            variant={item.severity === 'high' ? 'destructive' : 'secondary'}
                          >
                            {item.severity}
                          </Badge>
                          {item.trend === 'up' && (
                            <ArrowUpRight className="h-4 w-4 text-destructive" />
                          )}
                          {item.trend === 'down' && (
                            <ArrowDownRight className="h-4 w-4 text-chart-2" />
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {item.queries} related queries • {item.relatedLectures.join(', ')}
                        </p>
                      </div>
                      <Button variant="outline" size="sm">
                        View Queries
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queries" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Example Student Queries</CardTitle>
              <CardDescription>Anonymized queries showing common patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {exampleQueries.map((item, idx) => (
                  <div key={idx} className="rounded-lg border border-border p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                        {item.count}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm italic text-muted-foreground">"{item.query}"</p>
                        <div className="mt-2">
                          <Badge variant="secondary">{item.topic}</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="interventions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-accent" />
                Suggested Interventions
              </CardTitle>
              <CardDescription>AI-generated recommendations based on query patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {suggestedInterventions.map((item, idx) => (
                  <div
                    key={idx}
                    className={`rounded-lg border p-4 ${
                      item.priority === 'high' 
                        ? 'border-accent/50 bg-accent/5' 
                        : 'border-border'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold">{item.title}</h4>
                          <Badge variant={item.priority === 'high' ? 'default' : 'secondary'}>
                            {item.priority} priority
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {item.description}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Would benefit approximately {item.affectedStudents} students
                        </p>
                      </div>
                      <Button size="sm">Take Action</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
