"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CitationCard } from "@/components/citation-card"
import { 
  Send, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Lightbulb,
  BookOpen,
  FileText,
  ChevronRight,
  Copy,
  BookmarkPlus
} from "lucide-react"

const pastQuestions = [
  {
    id: 1,
    year: "2025",
    question: "Explain why Kanban can be preferable to Scrum in certain project contexts.",
    marks: 15,
    topic: "Agile",
  },
  {
    id: 2,
    year: "2025",
    question: "Describe the Critical Path Method and explain how float is calculated.",
    marks: 20,
    topic: "Scheduling",
  },
  {
    id: 3,
    year: "2024",
    question: "Discuss the role of stakeholder analysis in project success.",
    marks: 15,
    topic: "Stakeholders",
  },
  {
    id: 4,
    year: "2024",
    question: "Compare and contrast PERT and CPM scheduling techniques.",
    marks: 20,
    topic: "Scheduling",
  },
]

interface ExamResponse {
  structure: string[]
  keyConcepts: string[]
  exampleExplanation: string
  commonMistakes: string[]
  citations: Array<{
    type: "slide" | "reading" | "transcript" | "video"
    title: string
    source: string
    excerpt?: string
  }>
}

const mockResponse: ExamResponse = {
  structure: [
    "Introduction: Define both Kanban and Scrum briefly",
    "Core Differences: Explain iterations vs continuous flow",
    "Context Analysis: Discuss when each is appropriate",
    "Advantages of Kanban: List specific benefits",
    "Conclusion: Summarize key decision factors",
  ],
  keyConcepts: [
    "Continuous flow vs time-boxed sprints",
    "WIP limits in Kanban",
    "Flexibility in changing requirements",
    "Team structure and roles",
    "Visualization and transparency",
    "Predictability vs adaptability trade-offs",
  ],
  exampleExplanation: `Kanban can be preferable to Scrum when projects require continuous delivery or when requirements change frequently mid-iteration. Unlike Scrum's fixed sprints, Kanban's continuous flow model allows teams to respond immediately to priority changes without waiting for sprint boundaries.

For example, in support or maintenance contexts where work items arrive unpredictably, Kanban's pull-based system ensures the team always works on the highest priority items without the overhead of sprint planning. Additionally, Kanban's WIP limits help identify bottlenecks without requiring the full Scrum ceremony structure.

However, it's important to note that Kanban may be less suitable when projects need clear milestones and predictable delivery dates, which Scrum's sprint structure naturally provides.`,
  commonMistakes: [
    "Failing to explain both methodologies before comparing",
    "Not providing specific contexts where Kanban excels",
    "Ignoring the limitations of Kanban",
    "Missing discussion of WIP limits as a key Kanban feature",
    "Not referencing lecture examples or case studies",
  ],
  citations: [
    {
      type: "slide",
      title: "Agile Methodologies Comparison",
      source: "Lecture 8, Slides 14-22",
      excerpt: "Kanban focuses on visualizing workflow and limiting WIP...",
    },
    {
      type: "reading",
      title: "Agile Project Management",
      source: "Chapter 9: Choosing Your Methodology",
    },
    {
      type: "video",
      title: "When to Use Kanban",
      source: "Lecture 8 Recording, 32:15",
    },
  ],
}

export default function ExamPrepPage() {
  const [question, setQuestion] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [response, setResponse] = useState<ExamResponse | null>(null)

  const handleSubmit = async () => {
    if (!question.trim() || isLoading) return
    
    setIsLoading(true)
    
    // Simulate AI response
    setTimeout(() => {
      setResponse(mockResponse)
      setIsLoading(false)
    }, 2000)
  }

  const handlePastQuestion = (q: string) => {
    setQuestion(q)
    setResponse(null)
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Exam Preparation</h1>
        <p className="mt-1 text-muted-foreground">
          Get structured exam answers aligned with lecturer expectations
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Question Input */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enter Exam Question</CardTitle>
              <CardDescription>
                Paste or type an exam question to get a structured answer guide
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="e.g., Explain why Kanban can be preferable to Scrum in certain project contexts."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className="min-h-[100px] resize-none"
              />
              <Button 
                onClick={handleSubmit} 
                disabled={!question.trim() || isLoading}
                className="gap-2"
              >
                {isLoading ? (
                  <>
                    <Sparkles className="h-4 w-4 animate-pulse" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Answer Guide
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Loading State */}
          {isLoading && (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/20">
                    <Sparkles className="h-6 w-6 text-accent animate-pulse" />
                  </div>
                  <p className="mt-4 font-medium">Analyzing your question</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Orion is preparing a structured answer guide...
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Response */}
          {response && !isLoading && (
            <div className="space-y-6">
              {/* Answer Structure */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-2/20">
                      <FileText className="h-4 w-4 text-chart-2" />
                    </div>
                    <CardTitle className="text-base">Suggested Answer Structure</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ol className="space-y-2">
                    {response.structure.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                          {idx + 1}
                        </span>
                        <span className="text-sm leading-relaxed pt-0.5">{item}</span>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>

              {/* Key Concepts */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-1/20">
                      <CheckCircle2 className="h-4 w-4 text-chart-1" />
                    </div>
                    <CardTitle className="text-base">Key Concepts to Include</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {response.keyConcepts.map((concept, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-chart-2" />
                        {concept}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Example Explanation */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
                        <Lightbulb className="h-4 w-4 text-accent" />
                      </div>
                      <CardTitle className="text-base">Example Explanation</CardTitle>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                        <BookmarkPlus className="h-3.5 w-3.5" />
                        Save
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {response.exampleExplanation.split('\n\n').map((para, idx) => (
                      <p key={idx} className="leading-relaxed">{para}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Common Mistakes */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive/20">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    </div>
                    <CardTitle className="text-base">Common Mistakes to Avoid</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {response.commonMistakes.map((mistake, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                        {mistake}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              {/* Citations */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <BookOpen className="h-4 w-4" />
                  Referenced Materials
                </h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {response.citations.map((citation, idx) => (
                    <CitationCard key={idx} {...citation} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Past Questions */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Past Exam Questions</CardTitle>
              <CardDescription>
                Practice with real questions from previous years
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {pastQuestions.map((q) => (
                <button
                  key={q.id}
                  onClick={() => handlePastQuestion(q.question)}
                  className="flex w-full flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{q.year}</Badge>
                    <Badge variant="secondary" className="text-xs">{q.topic}</Badge>
                    <span className="text-xs text-muted-foreground">{q.marks} marks</span>
                  </div>
                  <p className="text-sm line-clamp-2">{q.question}</p>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Tips Card */}
          <Card className="border-accent/30 bg-accent/5">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-accent" />
                Exam Tips
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>Structure your answers clearly with an introduction, main points, and conclusion.</p>
              <p>Always reference specific course concepts and examples from lectures.</p>
              <p>Manage your time - allocate minutes based on marks available.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
