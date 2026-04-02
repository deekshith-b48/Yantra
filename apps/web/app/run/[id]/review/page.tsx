"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { Loader2 } from "lucide-react"
import { useRun } from "@/lib/hooks/use-run"
import { PlanReview } from "@/components/plan-review"
import { Plan } from "@/lib/api"

export default function ReviewPage() {
  const params = useParams()
  const runId = params.id as string
  const router = useRouter()
  const { getToken } = useAuth()

  const [token, setToken] = useState<string | null>(null)
  useEffect(() => { getToken().then(setToken) }, [getToken])

  const { run, loading } = useRun(runId)

  const handleApproved = () => {
    router.push(`/run/${runId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    )
  }

  if (!run?.plan) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">
        No plan available yet. Return to the{" "}
        <a href={`/run/${runId}`} className="text-indigo-400 ml-1">run page</a>.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <h1 className="text-xl font-bold mb-6">Review Plan</h1>
        <PlanReview
          plan={run.plan as unknown as Plan}
          runId={runId}
          token={token}
          onApproved={handleApproved}
        />
      </div>
    </div>
  )
}
