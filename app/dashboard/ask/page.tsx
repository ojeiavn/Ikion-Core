"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CitationCard } from "@/components/citation-card"
import { VideoPlayerCard } from "@/components/video-player-card"
import { cn } from "@/lib/utils"
import { 
  Send, 
  Sparkles, 
  Plus,
  Clock,
  ChevronRight,
  Copy,
  BookmarkPlus,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Video,
  BookOpen
} from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  citations?: Array<{
    type: "slide" | "reading" | "transcript" | "video"
    title: string
    source: string
    excerpt?: string
    timestamp?: string
    page?: number
  }>
  videoReference?: {
    title: string
    lectureNumber: number
    timestamp: string
    summary: string
  }
}

const conversationHistory = [
  { id: "1", title: "Critical Path Method explanation", time: "2 hours ago" },
  { id: "2", title: "Risk register components", time: "Yesterday" },
  { id: "3", title: "Kanban vs Scrum comparison", time: "2 days ago" },
  { id: "4", title: "Stakeholder analysis techniques", time: "3 days ago" },
  { id: "5", title: "Project scheduling basics", time: "Last week" },
]

const suggestedQuestions = [
  "Explain the Critical Path Method",
  "How do Kanban boards differ from Scrum?",
  "What is float in project scheduling?",
  "Show me where risk management was explained in lecture",
]

const mockMessages: Message[] = [
  {
    id: "1",
    role: "user",
    content: "Explain the Critical Path Method in project management",
  },
  {
    id: "2",
    role: "assistant",
    content: `<p>The <strong>Critical Path Method (CPM)</strong> is a project scheduling technique used to identify the longest sequence of dependent tasks that determines the minimum project duration.</p>

<h4>Key Concepts:</h4>
<ul>
  <li><strong>Critical Path:</strong> The longest path through the project network, determining the shortest possible project completion time.</li>
  <li><strong>Float (Slack):</strong> The amount of time an activity can be delayed without delaying the project. Activities on the critical path have zero float.</li>
  <li><strong>Early Start/Early Finish:</strong> The earliest times an activity can start or finish.</li>
  <li><strong>Late Start/Late Finish:</strong> The latest times an activity can start or finish without delaying the project.</li>
</ul>

<h4>Steps to Calculate CPM:</h4>
<ol>
  <li>List all activities and their dependencies</li>
  <li>Draw the network diagram</li>
  <li>Perform forward pass to calculate early times</li>
  <li>Perform backward pass to calculate late times</li>
  <li>Calculate float for each activity</li>
  <li>Identify the critical path (activities with zero float)</li>
</ol>

<p>Understanding CPM helps project managers focus resources on critical activities and identify where delays would impact the overall project timeline.</p>`,
    citations: [
      {
        type: "slide",
        title: "Critical Path Analysis",
        source: "Lecture 6, Slide 24-28",
        excerpt: "The critical path is defined as the longest path through the project network...",
        page: 24,
      },
      {
        type: "video",
        title: "CPM Calculation Example",
        source: "Lecture 6 Recording",
        timestamp: "13:42",
      },
      {
        type: "reading",
        title: "Project Management Fundamentals",
        source: "Chapter 5: Scheduling Techniques",
        page: 142,
        excerpt: "Float calculations are essential for understanding schedule flexibility...",
      },
    ],
    videoReference: {
      title: "Introduction to Critical Path Analysis",
      lectureNumber: 6,
      timestamp: "13:42",
      summary: "Dr. Mitchell demonstrates CPM calculation with a construction project example, showing how to identify the critical path and calculate float values.",
    },
  },
]

export default function AskOrionPage() {
  const [messages, setMessages] = useState<Message[]>(mockMessages)
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    // Simulate AI response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `<p>Based on your course materials, here's what I found about "${input}"...</p><p>This is a simulated response. In the full implementation, Orion would provide a comprehensive answer with citations from your lecture slides, readings, and video recordings.</p>`,
        citations: [
          {
            type: "slide",
            title: "Related Concept",
            source: "Lecture Materials",
            excerpt: "Relevant content from your course...",
          },
        ],
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsLoading(false)
    }, 1500)
  }

  const handleSuggestedQuestion = (question: string) => {
    setInput(question)
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Conversation History Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-background lg:block">
        <div className="flex h-full flex-col">
          <div className="border-b border-border p-4">
            <Button className="w-full gap-2" size="sm">
              <Plus className="h-4 w-4" />
              New Conversation
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1">
              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Recent
              </p>
              {conversationHistory.map((conv) => (
                <button
                  key={conv.id}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                >
                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{conv.title}</p>
                    <p className="text-xs text-muted-foreground">{conv.time}</p>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </aside>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-4xl p-6 lg:p-8">
            {messages.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center py-16">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
                  <Sparkles className="h-8 w-8 text-accent" />
                </div>
                <h2 className="mt-6 text-2xl font-bold">Ask Orion</h2>
                <p className="mt-2 text-center text-muted-foreground max-w-md">
                  Ask questions about your course. Orion will answer using lecture slides, readings, and recordings with citations.
                </p>
                
                {/* Suggested Questions */}
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {suggestedQuestions.map((question) => (
                    <button
                      key={question}
                      onClick={() => handleSuggestedQuestion(question)}
                      className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-left text-sm transition-all hover:border-accent/50 hover:bg-muted/50"
                    >
                      <span className="flex-1">{question}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Messages */
              <div className="space-y-6">
                {messages.map((message) => (
                  <div key={message.id}>
                    {message.role === "user" ? (
                      /* User Message */
                      <div className="flex justify-end">
                        <div className="max-w-2xl rounded-2xl rounded-tr-sm bg-primary px-5 py-3 text-primary-foreground">
                          <p>{message.content}</p>
                        </div>
                      </div>
                    ) : (
                      /* Assistant Message */
                      <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-card">
                          {/* Header */}
                          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
                              <Sparkles className="h-4 w-4 text-accent" />
                            </div>
                            <div>
                              <span className="text-sm font-semibold">Orion</span>
                              <span className="ml-2 text-xs text-muted-foreground">AI Assistant</span>
                            </div>
                          </div>

                          {/* Content */}
                          <div className="p-5">
                            <div 
                              className="prose prose-sm dark:prose-invert max-w-none leading-relaxed [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-4 [&_h4]:mb-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5"
                              dangerouslySetInnerHTML={{ __html: message.content }}
                            />
                          </div>

                          {/* Actions */}
                          <div className="flex items-center justify-between border-t border-border px-5 py-3">
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                                <Copy className="h-3.5 w-3.5" />
                                Copy
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                                <BookmarkPlus className="h-3.5 w-3.5" />
                                Save to Notes
                              </Button>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ThumbsUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <ThumbsDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Citations */}
                        {message.citations && message.citations.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                              <FileText className="h-3.5 w-3.5" />
                              Sources
                            </p>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {message.citations.map((citation, idx) => (
                                <CitationCard key={idx} {...citation} />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Video Reference */}
                        {message.videoReference && (
                          <div className="space-y-2">
                            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                              <Video className="h-3.5 w-3.5" />
                              Related Lecture
                            </p>
                            <div className="max-w-md">
                              <VideoPlayerCard {...message.videoReference} />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading State */}
                {isLoading && (
                  <div className="rounded-xl border border-border bg-card p-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/20">
                        <Sparkles className="h-4 w-4 text-accent animate-pulse" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">Orion is thinking</span>
                          <span className="flex gap-1">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent" />
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                      <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border bg-background p-4">
          <form onSubmit={handleSubmit} className="mx-auto max-w-4xl">
            <div className="relative">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about your course..."
                className="h-12 pr-12 text-base"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                className="absolute right-1.5 top-1.5 h-9 w-9"
                disabled={!input.trim() || isLoading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Orion answers using only your course materials with full citations
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
