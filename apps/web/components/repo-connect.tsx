"use client"

import { useState } from "react"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

interface RepoConnectProps {
  value: string
  onChange: (val: string) => void
  token: string | null
  onValidated: (fullName: string, branch: string) => void
}

export function RepoConnect({ value, onChange, token, onValidated }: RepoConnectProps) {
  const [validating, setValidating] = useState(false)
  const [valid, setValid] = useState<boolean | null>(null)
  const [repoInfo, setRepoInfo] = useState<{ fullName: string; branch: string } | null>(null)

  const handleBlur = async () => {
    if (!value.trim()) return
    setValidating(true)
    try {
      const result = await api.validateRepo(value, token || "")
      setValid(result.valid)
      if (result.valid && result.full_name) {
        setRepoInfo({ fullName: result.full_name, branch: result.default_branch || "main" })
        onValidated(result.full_name, result.default_branch || "main")
      }
    } catch {
      setValid(false)
    } finally {
      setValidating(false)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">
        GitHub Repository
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setValid(null)
            setRepoInfo(null)
          }}
          onBlur={handleBlur}
          placeholder="owner/repo or https://github.com/owner/repo"
          className={cn(
            "w-full bg-zinc-900 border rounded-lg px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-colors pr-10",
            valid === true && "border-emerald-500",
            valid === false && "border-red-500",
            valid === null && "border-zinc-700 focus:border-indigo-500",
          )}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          {validating && <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />}
          {!validating && valid === true && <CheckCircle className="w-4 h-4 text-emerald-500" />}
          {!validating && valid === false && <XCircle className="w-4 h-4 text-red-500" />}
        </div>
      </div>
      {valid === true && repoInfo && (
        <p className="mt-1.5 text-xs text-emerald-400">
          {repoInfo.fullName} · default branch: {repoInfo.branch}
        </p>
      )}
      {valid === false && (
        <p className="mt-1.5 text-xs text-red-400">
          Invalid repo URL. Use owner/repo format or a full GitHub URL.
        </p>
      )}
    </div>
  )
}
