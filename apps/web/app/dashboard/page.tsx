"use client"

import Link from "next/link"
import { Plus, Rocket } from "lucide-react"
import { RunCard } from "@/components/run-card"
import { useRuns } from "@/lib/hooks/use-run"

export default function DashboardPage() {
  const { runs, loading } = useRuns()

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Runs</h1>
          <p className="text-zinc-500 text-sm mt-1">
            {runs.length > 0
              ? `${runs.length} run${runs.length !== 1 ? "s" : ""}`
              : "No runs yet"}
          </p>
        </div>
        <Link
          href="/run/new"
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-5 py-2.5 rounded-xl transition-all text-sm hover:scale-105 active:scale-100"
        >
          <Plus className="w-4 h-4" />
          New run
        </Link>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 animate-pulse">
              <div className="h-3 bg-zinc-800 rounded w-1/3 mb-3" />
              <div className="h-4 bg-zinc-800 rounded w-3/4 mb-2" />
              <div className="h-3 bg-zinc-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Runs grid */}
      {!loading && runs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {runs.map((run) => (
            <RunCard key={run.id} run={run} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && runs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-6">
            <Rocket className="w-10 h-10 text-zinc-700" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No runs yet</h2>
          <p className="text-zinc-500 mb-8 max-w-sm">
            Launch your first YANTRA run to turn a spec into a pull request — autonomously.
          </p>
          <Link
            href="/run/new"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-xl transition-all"
          >
            <Rocket className="w-4 h-4" />
            Launch your first run
          </Link>
        </div>
      )}
    </div>
  )
}
