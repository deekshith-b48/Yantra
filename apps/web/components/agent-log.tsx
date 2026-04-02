"use client"

import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"

interface LogLine {
  step: string
  msg: string
  ts?: string
}

interface AgentLogProps {
  lines: LogLine[]
  activeStep?: string | null
  status?: string | null
}

const STEP_COLORS: Record<string, string> = {
  ingest: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  index: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  plan: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  human_gate: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  implement: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  test: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  open_pr: "bg-green-500/20 text-green-300 border-green-500/30",
}

const STEP_LABELS: Record<string, string> = {
  ingest: "ingest",
  index: "index",
  plan: "plan",
  human_gate: "gate",
  implement: "impl",
  test: "test",
  open_pr: "pr",
}

function StepBadge({ step }: { step: string }) {
  const cls = STEP_COLORS[step] || "bg-zinc-800 text-zinc-400 border-zinc-700"
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-mono font-medium uppercase shrink-0 ${cls}`}>
      {STEP_LABELS[step] || step}
    </span>
  )
}

export function AgentLog({ lines, activeStep, status }: AgentLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new lines
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [lines.length])

  const isEmpty = lines.length === 0

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-col h-full min-h-96">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          {activeStep && status !== "done" && status !== "failed" && (
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          )}
          {status === "done" && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
          {status === "failed" && <span className="w-2 h-2 rounded-full bg-red-500" />}
          {!activeStep && status !== "done" && status !== "failed" && (
            <span className="w-2 h-2 rounded-full bg-zinc-600" />
          )}
          <span className="text-xs font-mono text-zinc-400">
            {activeStep ? `Running: ${activeStep}` : status === "done" ? "Completed" : status === "failed" ? "Failed" : "Agent log"}
          </span>
        </div>
        <div className="ml-auto text-xs text-zinc-600 font-mono">{lines.length} lines</div>
      </div>

      {/* Log content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono">
        {isEmpty && (
          <div className="flex items-center gap-2 text-zinc-600 text-sm">
            <span className="animate-pulse">|</span>
            <span>Waiting for agent to start...</span>
          </div>
        )}

        <AnimatePresence initial={false}>
          {lines.map((line, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="log-line flex items-start gap-2.5"
            >
              <span className="text-zinc-600 text-[10px] mt-0.5 shrink-0 w-16 tabular-nums">
                {line.ts || formatTime()}
              </span>
              <StepBadge step={line.step} />
              <span className="text-zinc-300 break-all">{line.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function formatTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
