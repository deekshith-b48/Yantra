"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, AlertCircle, Plus, ExternalLink } from "lucide-react"
import confetti from "canvas-confetti"
import { toast } from "sonner"

import { AgentLog } from "@/components/agent-log"
import { PlanReview, PlanWaiting } from "@/components/plan-review"
import { DiffViewer } from "@/components/diff-viewer"
import { useSSE } from "@/lib/hooks/use-sse"
import { useRun } from "@/lib/hooks/use-run"
import { formatRelativeTime, truncate } from "@/lib/utils"
import { RunStatus } from "@/lib/api"

const STATUS_LABELS: Record<RunStatus, string> = {
  queued: "Queued",
  indexing: "Indexing",
  planning: "Planning",
  awaiting_approval: "Needs Approval",
  implementing: "Implementing",
  testing: "Testing",
  opening_pr: "Opening PR",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
}

const STATUS_COLORS: Record<RunStatus, string> = {
  queued: "bg-zinc-800 text-zinc-400",
  indexing: "bg-violet-500/20 text-violet-300",
  planning: "bg-amber-500/20 text-amber-300",
  awaiting_approval: "bg-yellow-500/20 text-yellow-300",
  implementing: "bg-blue-500/20 text-blue-300",
  testing: "bg-emerald-500/20 text-emerald-300",
  opening_pr: "bg-green-500/20 text-green-300",
  done: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/20 text-red-400",
  cancelled: "bg-zinc-800 text-zinc-500",
}

const SPINNER_STATUSES = new Set([
  "indexing", "planning", "implementing", "testing", "opening_pr",
])

export default function RunPage() {
  const params = useParams()
  const runId = params.id as string
  const router = useRouter()
  const { getToken } = useAuth()

  const [token, setToken] = useState<string | null>(null)
  const [approved, setApproved] = useState(false)
  const confettiFired = useRef(false)

  useEffect(() => {
    getToken().then(setToken)
  }, [getToken])

  const { run, mutate } = useRun(runId)
  const {
    logEvents,
    plan,
    prUrl,
    currentStatus,
    connectionStatus,
  } = useSSE(runId, token)

  // Merge SSE status into run status for display
  const displayStatus = (currentStatus || run?.status || "queued") as RunStatus
  const displayPrUrl = prUrl || run?.pr_url || null

  // Fire confetti on done
  useEffect(() => {
    if (displayStatus === "done" && !confettiFired.current) {
      confettiFired.current = true
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } })
      mutate()
    }
  }, [displayStatus, mutate])

  // Toast on failure
  useEffect(() => {
    if (displayStatus === "failed") {
      toast.error("Run failed. See error details below.")
      mutate()
    }
  }, [displayStatus, mutate])

  const logLines = logEvents.map((e) => ({ step: e.step, msg: e.msg }))
  const activeStep = logLines[logLines.length - 1]?.step ?? null

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Nav */}
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-zinc-950/95 backdrop-blur z-10">
        <a href="/dashboard" className="font-bold text-lg tracking-tight">
          <span className="text-indigo-400">Y</span>ANTRA
        </a>
        {connectionStatus === "reconnecting" && (
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Reconnecting...
          </div>
        )}
        <a
          href="/run/new"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New run
        </a>
      </nav>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        {/* Desktop: 3-column, Mobile: stacked */}
        <div className="grid grid-cols-1 lg:grid-cols-[28%_44%_28%] gap-5">
          {/* LEFT: Run metadata */}
          <div className="space-y-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_COLORS[displayStatus]}`}>
                  {SPINNER_STATUSES.has(displayStatus) && (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  )}
                  {STATUS_LABELS[displayStatus] || displayStatus}
                </span>
              </div>

              {run && (
                <>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Repository</div>
                      <div className="text-sm font-mono text-zinc-200">{run.repo_full_name || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Branch</div>
                      <div className="text-sm font-mono text-zinc-300">{run.branch_name || "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Spec</div>
                      <div className="text-sm text-zinc-300 leading-relaxed">
                        {truncate(run.spec, 200)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Started</div>
                      <div className="text-sm text-zinc-400">
                        {formatRelativeTime(run.created_at)}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {displayPrUrl && (
                <a
                  href={displayPrUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 flex items-center gap-2 w-full justify-center bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open PR on GitHub
                </a>
              )}
            </div>

            {/* Failure card */}
            <AnimatePresence>
              {displayStatus === "failed" && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-950/30 border border-red-800/50 rounded-xl p-4"
                >
                  <div className="flex items-start gap-2 mb-3">
                    <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold text-red-300 mb-1">Run failed</div>
                      <div className="text-xs text-red-400/80">{run?.error || "An unexpected error occurred."}</div>
                    </div>
                  </div>
                  <a
                    href="/run/new"
                    className="flex items-center justify-center gap-1.5 text-xs border border-red-700/50 hover:border-red-600 text-red-300 hover:text-red-200 py-2 rounded-lg transition-colors"
                  >
                    Start a new run
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* CENTER: Agent log */}
          <div>
            <AgentLog lines={logLines} activeStep={activeStep} status={displayStatus} />

            {/* Diff viewer after PR */}
            <AnimatePresence>
              {displayPrUrl && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-5"
                >
                  <DiffViewer runId={runId} prUrl={displayPrUrl} token={token} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* RIGHT: Plan review */}
          <div>
            <AnimatePresence mode="wait">
              {plan && !approved && displayStatus === "awaiting_approval" ? (
                <PlanReview
                  key="review"
                  plan={plan as any}
                  runId={runId}
                  token={token}
                  onApproved={() => setApproved(true)}
                />
              ) : plan && (approved || displayStatus !== "awaiting_approval") ? null : (
                <PlanWaiting key="waiting" />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
