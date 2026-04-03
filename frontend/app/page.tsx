"use client"

import { useState } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { OrionLogo } from "@/components/orion-logo"
import { Button } from "@/components/ui/button"
import { 
  ArrowRight, 
  BookOpen, 
  Video, 
  FileText, 
  BarChart3,
  CheckCircle2,
  Play,
  Quote,
  Moon,
  Sun,
  Menu,
  X
} from "lucide-react"

const features = [
  {
    icon: BookOpen,
    title: "Course-Grounded AI",
    description: "Answers questions using only your course materials. No hallucinations, just reliable academic content.",
  },
  {
    icon: Video,
    title: "Lecture Video Navigation",
    description: "Jump to the exact moment in a lecture recording where a concept is explained.",
  },
  {
    icon: FileText,
    title: "Exam Preparation Guidance",
    description: "AI responses aligned with lecturer expectations and marking criteria.",
  },
  {
    icon: BarChart3,
    title: "Query Insight Reports",
    description: "Analytics showing student misunderstandings across the cohort for targeted intervention.",
  },
]

const benefits = [
  "Improve student learning outcomes",
  "Reduce AI hallucination risks",
  "Gain insight into student misconceptions",
  "Integrate with existing lecture capture systems",
]

const universities = [
  "University of Oxford",
  "MIT",
  "University of Warwick",
  "Imperial College London",
  "Stanford University",
]

export default function LandingPage() {
  const { theme, setTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <OrionLogo size="md" />
          
          {/* Desktop Nav */}
          <nav className="hidden items-center gap-8 md:flex">
            <Link href="#features" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Features
            </Link>
            <Link href="#universities" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Universities
            </Link>
            <Link href="#security" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Security
            </Link>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-9 w-9"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/login">
              <Button size="sm" className="gap-1.5">
                Request Demo
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile Nav */}
        {mobileMenuOpen && (
          <div className="border-t border-border bg-background p-4 md:hidden">
            <nav className="flex flex-col gap-4">
              <Link href="#features" className="text-sm font-medium">Features</Link>
              <Link href="#universities" className="text-sm font-medium">Universities</Link>
              <Link href="#security" className="text-sm font-medium">Security</Link>
              <hr className="border-border" />
              <Link href="/login">
                <Button className="w-full">Request Demo</Button>
              </Link>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="orion-neon-orb orion-neon-orb-cyan left-[-6rem] top-[4rem]" />
          <div className="orion-neon-orb orion-neon-orb-violet right-[-8rem] top-[7rem]" />
          <div className="orion-neon-orb orion-neon-orb-indigo bottom-[-8rem] left-[42%]" />
        </div>
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/5 blur-3xl" />
        </div>
        
        <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm">
              <span className="flex h-2 w-2 rounded-full bg-accent" />
              Trusted by leading universities
            </div>
            
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              <span className="text-balance">AI that actually understands</span>
              <br />
              <span className="text-accent">your course.</span>
            </h1>
            
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
              Orion answers student questions using lecture slides, readings, and recordings — with citations and exact video timestamps.
            </p>
            
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/login">
                <Button size="lg" className="gap-2 px-8">
                  Request Demo
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline" className="gap-2 px-8">
                  <Play className="h-4 w-4" />
                  Watch Video
                </Button>
              </Link>
            </div>
          </div>

          {/* Hero Visual - Mock Interface */}
          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="rounded-xl border border-border bg-card p-1 shadow-2xl shadow-primary/5">
              <div className="rounded-lg bg-muted/30">
                {/* Mock Browser Chrome */}
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-destructive/60" />
                    <div className="h-3 w-3 rounded-full bg-chart-4/60" />
                    <div className="h-3 w-3 rounded-full bg-chart-2/60" />
                  </div>
                  <div className="mx-auto rounded-md bg-muted px-4 py-1 text-xs text-muted-foreground">
                    app.orion.edu/ask
                  </div>
                </div>
                
                {/* Mock Content */}
                <div className="p-6 sm:p-8">
                  <div className="flex gap-6">
                    {/* Chat Area */}
                    <div className="flex-1 space-y-4">
                      {/* User Question */}
                      <div className="flex justify-end">
                        <div className="max-w-md rounded-xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
                          Explain the Critical Path Method in project management
                        </div>
                      </div>
                      
                      {/* AI Response */}
                      <div className="rounded-xl border border-border bg-card p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/20">
                            <span className="text-xs font-semibold text-accent">O</span>
                          </div>
                          <span className="text-sm font-medium">Orion</span>
                        </div>
                        <div className="space-y-3 text-sm text-muted-foreground">
                          <p>The Critical Path Method (CPM) is a project scheduling technique that identifies the longest sequence of dependent tasks...</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md bg-chart-1/10 px-2 py-1 text-xs text-chart-1">
                              <FileText className="h-3 w-3" />
                              Lecture 6, Slide 24
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-chart-4/10 px-2 py-1 text-xs text-chart-4">
                              <Video className="h-3 w-3" />
                              13:42
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Video Panel (hidden on mobile) */}
                    <div className="hidden w-64 shrink-0 lg:block">
                      <div className="rounded-lg border border-border bg-muted/50 p-3">
                        <div className="aspect-video rounded-md bg-primary/10 flex items-center justify-center">
                          <Play className="h-8 w-8 text-primary/50" />
                        </div>
                        <div className="mt-3">
                          <p className="text-xs text-accent font-medium">Lecture 6</p>
                          <p className="text-sm font-medium mt-0.5">Critical Path Analysis</p>
                          <p className="text-xs text-muted-foreground mt-1 font-mono">13:42</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* University Logos */}
      <section className="border-y border-border bg-muted/30 py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-muted-foreground mb-8">
            Trusted by leading institutions
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
            {universities.map((uni) => (
              <span key={uni} className="text-sm font-medium text-muted-foreground/70 hover:text-foreground transition-colors">
                {uni}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Built for academic integrity
            </h2>
            <p className="mt-4 text-lg text-muted-foreground text-pretty">
              Every answer grounded in your course materials, with full transparency on sources.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-xl border border-border bg-card p-6 transition-all hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section id="universities" className="border-y border-border bg-muted/30 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Why universities choose Orion
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Deploy AI that enhances learning outcomes while maintaining academic standards.
              </p>
              
              <ul className="mt-8 space-y-4">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-accent" />
                    <span className="text-muted-foreground">{benefit}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10">
                <Link href="/login">
                  <Button size="lg" className="gap-2">
                    Schedule a Demo
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Testimonial */}
            <div className="rounded-xl border border-border bg-card p-8">
              <Quote className="h-10 w-10 text-accent/30" />
              <blockquote className="mt-4 text-lg leading-relaxed">
                Orion has transformed how our students engage with course materials. The citation system means they can trust the answers and deepen their understanding.
              </blockquote>
              <div className="mt-6 flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-accent/20" />
                <div>
                  <p className="font-semibold">Dr. Sarah Mitchell</p>
                  <p className="text-sm text-muted-foreground">Professor of Management, University of Warwick</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-2xl bg-primary px-8 py-16 text-center text-primary-foreground sm:px-16">
            <div className="absolute inset-0 -z-10">
              <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-3xl" />
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to transform learning?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-primary-foreground/80">
              See how Orion can support your students and provide insights for your teaching team.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link href="/dashboard">
                <Button size="lg" variant="secondary" className="gap-2 px-8">
                  Request Demo
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/dashboard">
                <Button size="lg" variant="ghost" className="px-8 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground">
                  Contact Sales
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <OrionLogo size="sm" />
            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <Link href="#" className="hover:text-foreground transition-colors">About</Link>
              <Link href="#" className="hover:text-foreground transition-colors">Security</Link>
              <Link href="#" className="hover:text-foreground transition-colors">Universities</Link>
              <Link href="#" className="hover:text-foreground transition-colors">Contact</Link>
              <Link href="#" className="hover:text-foreground transition-colors">Privacy</Link>
            </nav>
            <p className="text-sm text-muted-foreground">
              2026 Orion Education
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
