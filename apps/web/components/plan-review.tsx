"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  FileCode,
  FilePlus,
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Loader2,
  GitMerge,
} from "lucide-react"
import { toast } from "sonner"
import { Plan } from "@/lib/api"

interface PlanReviewProps {
  plan: Plan
  runId: string
  onApproved: () => void
  token: string | null
}

export function PlanReview({ plan, runId, onApproved, token }: PlanReviewProps) {
  const [showRedirect, setShowRedirect] = useState(false)
  const [redirectNote, setRedirectNote] = useState("")
  const [approving, setApproving] = useState(false)

  const handleApprove = async (withRedirect = false) => {
    if (approving) return
    setApproving(true)

    try {
      const { api } = await import("@/lib/api")
      await api.approvePlan(runId, token || "", withRedirect ? redirectNote : undefined)
      toast.success("Plan approved! YANTRA is now implementing...")
      onApproved()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to approve"
      toast.error(msg)
      setApproving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-2">
        <GitMerge className="w-4 h-4 text-indigo-400" />
        <span className="font-semibold text-sm">Implementation Plan</span>
        <span className="ml-auto text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
          Awaiting approval
        </span>
      </div>

      <div className="p-5 space-y-5">
        {/* Files to modify */}
        {plan.files_to_modify.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FileCode className="w-3.5 h-3.5" />
              Files to modify ({plan.files_to_modify.length})
            </h4>
            <div className="space-y-2">
              {plan.files_to_modify.map((f, i) => (
                <div key={i} className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="font-mono text-xs text-indigo-300 mb-1">{f.path}</div>
                  <div className="text-xs text-zinc-400">{f.reason}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Files to create */}
        {plan.files_to_create.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FilePlus className="w-3.5 h-3.5" />
              Files to create ({plan.files_to_create.length})
            </h4>
            <div className="space-y-2">
              {plan.files_to_create.map((f, i) => (
                <div key={i} className="bg-zinc-800/50 rounded-lg p-3">
                  <div className="font-mono text-xs text-emerald-300 mb-1">{f.path}</div>
                  <div className="text-xs text-zinc-400">{f.purpose}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Approach */}
        <div>
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Approach
          </h4>
          <p className="text-sm text-zinc-300 leading-relaxed">{plan.approach}</p>
        </div>

        {/* Risks */}
        {plan.risks.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Risks
            </h4>
            <div className="flex flex-wrap gap-2">
              {plan.risks.map((risk, i) => (
                <span
                  key={i}
                  className="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg px-2.5 py-1"
                >
                  {risk}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Redirect textarea */}
        <AnimatePresence>
          {showRedirect && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Redirect instructions (optional)
              </label>
              <textarea
                value={redirectNote}
                onChange={(e) => setRedirectNote(e.target.value.slice(0, 500))}
                placeholder="e.g. Use TypeScript strict mode. Don&apos;t modify the database schema."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors resize-none"
              />
              <p className="text-xs text-zinc-600 mt-1">{redirectNote.length}/500</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => handleApprove(showRedirect && !!redirectNote)}
            disabled={approving}
            className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm py-2.5 rounded-lg transition-colors"
          >
            {approving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            {approving ? "Approving..." : "Approve"}
          </button>

          <button
            onClick={() => setShowRedirect((v) => !v)}
            disabled={approving}
            className="flex items-center gap-1.5 border border-zinc-700 hover:border-zinc-500 text-zinc-300 hover:text-white text-sm px-4 py-2.5 rounded-lg transition-colors"
          >
            Redirect
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showRedirect ? "rotate-90" : ""}`} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export function PlanWaiting() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4"
      >
        <GitMerge className="w-6 h-6 text-amber-400" />
      </motion.div>
      <p className="text-sm font-semibold text-zinc-200 mb-1">Waiting for your approval</p>
      <p className="text-xs text-zinc-500">The plan will appear here once YANTRA finishes planning.</p>
    </div>
  )
}
