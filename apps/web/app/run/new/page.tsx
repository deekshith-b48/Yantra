"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { Rocket, Eye, EyeOff, HelpCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { api } from "@/lib/api"
import { RepoConnect } from "@/components/repo-connect"

const PLACEHOLDER_SPECS = [
  "Add rate limiting to the /api/users endpoint using Redis",
  "Migrate the users table from MySQL to PostgreSQL format",
  "Add dark mode toggle using next-themes",
  "Write unit tests for the authentication service",
  "Add pagination to the /api/posts endpoint",
]

export default function NewRunPage() {
  const router = useRouter()
  const { getToken } = useAuth()

  const [spec, setSpec] = useState("")
  const [repoUrl, setRepoUrl] = useState("")
  const [githubToken, setGithubToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const [repoValid, setRepoValid] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [placeholderIdx, setPlaceholderIdx] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Cycle placeholder examples every 4s
  useEffect(() => {
    const id = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_SPECS.length)
    }, 4000)
    return () => clearInterval(id)
  }, [])

  // Auto-resize textarea
  const handleSpecChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSpec(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = "auto"
      ta.style.height = ta.scrollHeight + "px"
    }
  }

  const canSubmit = spec.trim().length >= 10 && repoUrl.trim() && repoValid && githubToken.trim() && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)

    try {
      const token = await getToken()
      if (!token) throw new Error("Not authenticated")

      const { run_id } = await api.createRun(
        { spec: spec.trim(), repo_url: repoUrl.trim(), github_token: githubToken.trim() },
        token,
      )

      router.push(`/run/${run_id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start run"
      toast.error(msg)
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <a href="/dashboard" className="font-bold text-lg tracking-tight">
          <span className="text-indigo-400">Y</span>ANTRA
        </a>
        <span className="text-sm text-zinc-500">New run</span>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Left: Form */}
        <div>
          <h1 className="text-2xl font-bold mb-2">Launch a new run</h1>
          <p className="text-zinc-400 text-sm mb-8">
            Describe what to build. YANTRA will plan, implement, test, and open a PR — with your approval.
          </p>

          <div className="space-y-6">
            {/* Spec textarea */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                What should YANTRA build?
              </label>
              <div className="relative">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={placeholderIdx}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute top-3 left-4 text-sm text-zinc-600 pointer-events-none select-none"
                    style={{ display: spec ? "none" : "block" }}
                  >
                    {PLACEHOLDER_SPECS[placeholderIdx]}
                  </motion.span>
                </AnimatePresence>
                <textarea
                  ref={textareaRef}
                  value={spec}
                  onChange={handleSpecChange}
                  rows={5}
                  maxLength={4000}
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-indigo-500 rounded-lg px-4 py-3 text-sm text-zinc-100 outline-none transition-colors resize-none"
                  style={{ minHeight: "7rem" }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-zinc-600">Min 10 characters</span>
                <span className="text-xs text-zinc-600">{spec.length}/4000</span>
              </div>
            </div>

            {/* Repo input */}
            <RepoConnect
              value={repoUrl}
              onChange={setRepoUrl}
              token={null}
              onValidated={(_fullName, _branch) => setRepoValid(true)}
            />

            {/* GitHub token */}
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="block text-sm font-medium text-zinc-300">
                  GitHub Personal Access Token
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                  >
                    <HelpCircle className="w-4 h-4 text-zinc-500 hover:text-zinc-300" />
                  </button>
                  <AnimatePresence>
                    {showTooltip && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute left-0 bottom-6 w-72 bg-zinc-800 border border-zinc-600 rounded-lg p-3 text-xs text-zinc-300 z-20 shadow-xl"
                      >
                        <p className="font-semibold mb-1">Why do I need this?</p>
                        <p>YANTRA uses your token to clone the repo and open a PR on your behalf. It&apos;s stored encrypted (AES-256) and never exposed to the frontend. Requires the <code className="bg-zinc-700 px-1 rounded">repo</code> scope.</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="ghp_..."
                  className="w-full bg-zinc-900 border border-zinc-700 focus:border-indigo-500 rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-zinc-600">
                Stored encrypted. Needs <code className="text-zinc-400">repo</code> scope.
              </p>
            </div>

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all text-sm"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Rocket className="w-4 h-4" />
              )}
              {submitting ? "Launching..." : "Launch YANTRA"}
            </button>
          </div>
        </div>

        {/* Right: Preview skeleton */}
        <div className="hidden lg:block">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden h-full min-h-96">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              <span className="ml-2 text-xs text-zinc-600 font-mono">live agent log preview</span>
            </div>
            <div className="p-6 space-y-3">
              {["ingest", "index", "plan", "implement", "test", "open_pr"].map((step) => (
                <div key={step} className="flex items-center gap-3 opacity-30">
                  <span className="w-16 h-5 bg-zinc-800 rounded text-xs" />
                  <span className="flex-1 h-4 bg-zinc-800 rounded" />
                </div>
              ))}
              <div className="mt-6 pt-6 border-t border-zinc-800 text-center text-xs text-zinc-600">
                Live logs will stream here after launch
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
