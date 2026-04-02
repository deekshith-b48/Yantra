"use client"

import Link from "next/link"
import { Loader2, GitPullRequest, ExternalLink } from "lucide-react"
import { Run, RunStatus } from "@/lib/api"
import { formatRelativeTime, truncate } from "@/lib/utils"
import { cn } from "@/lib/utils"

const STATUS_CONFIG: Record<RunStatus, { label: string; color: string; spinner?: boolean }> = {
  queued: { label: "Queued", color: "bg-zinc-800 text-zinc-400" },
  indexing: { label: "Indexing", color: "bg-violet-500/20 text-violet-300", spinner: true },
  planning: { label: "Planning", color: "bg-amber-500/20 text-amber-300", spinner: true },
  awaiting_approval: { label: "Needs Approval", color: "bg-yellow-500/20 text-yellow-300" },
  implementing: { label: "Implementing", color: "bg-blue-500/20 text-blue-300", spinner: true },
  testing: { label: "Testing", color: "bg-emerald-500/20 text-emerald-300", spinner: true },
  opening_pr: { label: "Opening PR", color: "bg-green-500/20 text-green-300", spinner: true },
  done: { label: "Done", color: "bg-emerald-500/20 text-emerald-400" },
  failed: { label: "Failed", color: "bg-red-500/20 text-red-400" },
  cancelled: { label: "Cancelled", color: "bg-zinc-800 text-zinc-500" },
}

interface RunCardProps {
  run: Run
}

export function RunCard({ run }: RunCardProps) {
  const config = STATUS_CONFIG[run.status] || STATUS_CONFIG["queued"]

  return (
    <Link
      href={`/run/${run.id}`}
      className="group block bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-2xl p-5 transition-all hover:shadow-xl hover:shadow-black/20"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-indigo-300 mb-1 truncate">
            {run.repo_full_name || "Unknown repo"}
          </div>
          <p className="text-sm text-zinc-200 leading-snug">
            {truncate(run.spec, 80)}
          </p>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full shrink-0", config.color)}>
          {config.spinner && <Loader2 className="w-3 h-3 animate-spin" />}
          {config.label}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-600">{formatRelativeTime(run.created_at)}</span>
        <div className="flex items-center gap-3">
          {run.pr_url && (
            <a
              href={run.pr_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <GitPullRequest className="w-3 h-3" />
              PR #{run.pr_number}
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
          {run.status === "awaiting_approval" && (
            <span className="text-xs text-yellow-400 font-medium">Action required</span>
          )}
        </div>
      </div>
    </Link>
  )
}
