"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Rocket, GitPullRequest, CheckCircle, Zap, Github } from "lucide-react"

const steps = [
  {
    icon: <Zap className="w-6 h-6 text-indigo-400" />,
    title: "Describe",
    description:
      "Paste a plain-English spec or GitHub issue URL. YANTRA parses your intent, extracts acceptance criteria, and identifies what needs to change.",
  },
  {
    icon: <CheckCircle className="w-6 h-6 text-amber-400" />,
    title: "Approve",
    description:
      "Review the AI-generated plan — files to touch, approach, and risks — before a single line of code is written. You're in control.",
  },
  {
    icon: <GitPullRequest className="w-6 h-6 text-emerald-400" />,
    title: "Ship",
    description:
      "YANTRA implements, runs tests in an isolated sandbox, then opens a GitHub PR. Watch every step stream live.",
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <span className="font-bold text-lg tracking-tight">
          <span className="text-indigo-400">Y</span>ANTRA
        </span>
        <div className="flex items-center gap-4">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            <Github className="w-5 h-5" />
          </a>
          <Link
            href="/sign-in"
            className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Start for free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center pt-20 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl"
        >
          <div className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-full px-4 py-1.5 text-sm text-zinc-400 mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Autonomous spec-to-ship agent
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Describe it.{" "}
            <span className="text-indigo-400">Approve it.</span>{" "}
            Ship it.
          </h1>

          <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            YANTRA turns a plain-English spec into a GitHub PR — autonomously.
            Live streaming, isolated sandbox testing, and a{" "}
            <span className="text-zinc-200 font-medium">human approval gate</span>{" "}
            before any code is written.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all hover:scale-105 active:scale-100"
            >
              <Rocket className="w-5 h-5" />
              Start for free
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white font-semibold px-8 py-4 rounded-xl text-lg transition-all"
            >
              <Github className="w-5 h-5" />
              View on GitHub
            </a>
          </div>
        </motion.div>

        {/* Demo terminal */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-20 w-full max-w-3xl bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl"
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
            <span className="w-3 h-3 rounded-full bg-red-500" />
            <span className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="w-3 h-3 rounded-full bg-green-500" />
            <span className="ml-2 text-xs text-zinc-500 font-mono">yantra · run · live</span>
          </div>
          <div className="p-6 font-mono text-sm space-y-2 text-left">
            {[
              { badge: "ingest", color: "text-indigo-400", msg: "Spec parsed. Goal: Add rate limiting to /api/users endpoint" },
              { badge: "index", color: "text-violet-400", msg: "Indexed 847 chunks from 62 files" },
              { badge: "plan", color: "text-amber-400", msg: "Plan ready. Touching 3 files." },
              { badge: "implement", color: "text-blue-400", msg: "Writing middleware/rateLimit.ts..." },
              { badge: "implement", color: "text-blue-400", msg: "Writing api/routes/users.ts..." },
              { badge: "test", color: "text-emerald-400", msg: "All tests passed! (12/12)" },
              { badge: "open_pr", color: "text-green-400", msg: "PR opened: github.com/acme/api/pull/42" },
            ].map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.15 }}
                className="flex items-start gap-3"
              >
                <span className={`${line.color} font-semibold shrink-0 text-xs mt-0.5 uppercase tracking-wider`}>
                  [{line.badge}]
                </span>
                <span className="text-zinc-300">{line.msg}</span>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2 }}
              className="flex items-center gap-2 mt-2"
            >
              <span className="w-2 h-4 bg-indigo-400 animate-pulse" />
            </motion.div>
          </div>
        </motion.div>
      </main>

      {/* Steps */}
      <section className="border-t border-zinc-800 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">How it works</h2>
          <p className="text-center text-zinc-400 mb-16 max-w-xl mx-auto">
            Three steps. No context switching. Full transparency.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 hover:border-zinc-600 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center mb-5">
                  {step.icon}
                </div>
                <div className="text-xs font-mono text-zinc-500 mb-2">Step {i + 1}</div>
                <h3 className="text-xl font-semibold mb-3">{step.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{step.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-8 px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-sm text-zinc-500">
          <span className="text-indigo-400 font-bold">YANTRA</span> — Sanskrit for &quot;machine&quot;
        </span>
        <div className="flex items-center gap-6 text-sm text-zinc-500">
          <a href="https://github.com" className="hover:text-zinc-300 transition-colors">GitHub</a>
          <span className="flex items-center gap-1.5">
            Built with{" "}
            <span className="text-red-400">♥</span>{" "}
            using Claude
          </span>
        </div>
      </footer>
    </div>
  )
}
