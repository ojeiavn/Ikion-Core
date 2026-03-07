"use client"

import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { 
  Calendar, 
  Clock, 
  MessageSquare, 
  Play, 
  ArrowRight,
  BookOpen,
  TrendingUp,
  AlertCircle
} from "lucide-react"

const upcomingLectures = [
  {
    id: 1,
    title: "Critical Path Analysis",
    module: "PM301",
    date: "Today",
    time: "14:00",
    isNew: true,
  },
  {
    id: 2,
    title: "Risk Management Frameworks",
    module: "PM301",
    date: "Tomorrow",
    time: "10:00",
    isNew: false,
  },
  {
    id: 3,
    title: "Agile vs Waterfall Methodologies",
    module: "PM301",
    date: "Friday",
    time: "11:00",
    isNew: false,
  },
]

const revisionTopics = [
  { topic: "Project Scheduling", progress: 85, status: "strong" },
  { topic: "Risk Assessment", progress: 62, status: "moderate" },
  { topic: "Stakeholder Analysis", progress: 45, status: "needs-work" },
  { topic: "Quality Management", progress: 30, status: "needs-work" },
]

const recentQuestions = [
  {
    id: 1,
    question: "Explain the difference between CPM and PERT",
    time: "2 hours ago",
    hasVideo: true,
  },
  {
    id: 2,
    question: "What are the key components of a risk register?",
    time: "Yesterday",
    hasVideo: false,
  },
  {
    id: 3,
    question: "How do Kanban boards differ from Scrum?",
    time: "2 days ago",
    hasVideo: true,
  },
]

const recommendedReview = [
  {
    topic: "Float Calculations",
    reason: "Revisited multiple times",
    lectures: ["Lecture 6", "Lecture 7"],
  },
  {
    topic: "Earned Value Analysis",
    reason: "Low quiz performance",
    lectures: ["Lecture 8"],
  },
]

export default function StudentDashboard() {
  return (
    <div className="p-6 lg:p-8">
      {/* Welcome Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Welcome back, James</h1>
        <p className="mt-1 text-muted-foreground">
          Continue your studies in PM301: Project Management
        </p>
      </div>

      {/* Quick Actions */}
      <div className="mb-8 flex flex-wrap gap-3">
        <Link href="/dashboard/ask">
          <Button className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Ask Orion
          </Button>
        </Link>
        <Link href="/dashboard/exam-prep">
          <Button variant="outline" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Exam Prep
          </Button>
        </Link>
        <Link href="/dashboard/lectures">
          <Button variant="outline" className="gap-2">
            <Play className="h-4 w-4" />
            Browse Lectures
          </Button>
        </Link>
      </div>

      {/* Dashboard Grid */}
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {/* Upcoming Lectures */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Upcoming Lectures</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>Recent and scheduled content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingLectures.map((lecture) => (
              <div
                key={lecture.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <Play className="h-4 w-4 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{lecture.title}</p>
                    {lecture.isNew && (
                      <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">
                        New
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{lecture.module}</span>
                    <span className="text-border">|</span>
                    <Clock className="h-3 w-3" />
                    <span>{lecture.date}, {lecture.time}</span>
                  </div>
                </div>
              </div>
            ))}
            <Link href="/dashboard/lectures">
              <Button variant="ghost" size="sm" className="w-full mt-2 gap-1">
                View All Lectures
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Revision Progress */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Revision Progress</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>Topic mastery based on your activity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {revisionTopics.map((item) => (
              <div key={item.topic} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{item.topic}</span>
                  <span className="text-xs text-muted-foreground">{item.progress}%</span>
                </div>
                <Progress 
                  value={item.progress} 
                  className="h-2"
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent Questions */}
        <Card className="xl:col-span-1">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Questions</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardDescription>Your conversation history</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentQuestions.map((q) => (
              <Link
                key={q.id}
                href="/dashboard/ask"
                className="block rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <p className="text-sm font-medium line-clamp-2">{q.question}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{q.time}</span>
                  {q.hasVideo && (
                    <>
                      <span className="text-border">|</span>
                      <Play className="h-3 w-3" />
                      <span>Video reference</span>
                    </>
                  )}
                </div>
              </Link>
            ))}
            <Link href="/dashboard/ask">
              <Button variant="ghost" size="sm" className="w-full mt-2 gap-1">
                View All Questions
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recommended Review */}
        <Card className="lg:col-span-2 xl:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">Recommended Review</CardTitle>
                <CardDescription>Topics Orion suggests revisiting</CardDescription>
              </div>
              <AlertCircle className="h-4 w-4 text-accent" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              {recommendedReview.map((item) => (
                <div
                  key={item.topic}
                  className="flex items-start gap-4 rounded-lg border border-accent/30 bg-accent/5 p-4"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/20">
                    <BookOpen className="h-5 w-5 text-accent" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">{item.topic}</h4>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.reason}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.lectures.map((lec) => (
                        <span
                          key={lec}
                          className="rounded-md bg-background px-2 py-0.5 text-xs font-medium"
                        >
                          {lec}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link href="/dashboard/ask">
                    <Button size="sm" variant="ghost">
                      Review
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
