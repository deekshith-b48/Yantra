"use client"

import { useState, useEffect } from "react"
import { ExternalLink, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { api } from "@/lib/api"

interface DiffViewerProps {
  runId: string
  prUrl: string
  token: string | null
}

interface FileDiff {
  filename: string
  additions: number
  deletions: number
  patch: string
}

function parseDiff(raw: string): FileDiff[] {
  const files: FileDiff[] = []
  const sections = raw.split(/^diff --git /m).slice(1)

  for (const section of sections) {
    const lines = section.split("\n")
    const filenameMatch = lines[0]?.match(/b\/(.+)$/)
    const filename = filenameMatch ? filenameMatch[1] : "unknown"
    const additions = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length
    const deletions = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length
    const patch = lines.join("\n")
    files.push({ filename, additions, deletions, patch })
  }
  return files
}

function FileDiffBlock({ file }: { file: FileDiff }) {
  const [open, setOpen] = useState(true)
  const lines = file.patch.split("\n")

  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-zinc-900 hover:bg-zinc-800/70 transition-colors text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
        <span className="font-mono text-sm text-zinc-200 flex-1">{file.filename}</span>
        <span className="text-xs text-emerald-400">+{file.additions}</span>
        <span className="text-xs text-red-400 ml-2">-{file.deletions}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <tbody>
                  {lines.map((line, i) => {
                    const isAdd = line.startsWith("+") && !line.startsWith("+++")
                    const isDel = line.startsWith("-") && !line.startsWith("---")
                    const isHunk = line.startsWith("@@")
                    return (
                      <tr
                        key={i}
                        className={
                          isAdd
                            ? "bg-emerald-950/40"
                            : isDel
                            ? "bg-red-950/40"
                            : isHunk
                            ? "bg-blue-950/30"
                            : ""
                        }
                      >
                        <td className="w-8 px-2 py-0.5 text-zinc-600 select-none border-r border-zinc-800 text-right">
                          {i + 1}
                        </td>
                        <td
                          className={`px-3 py-0.5 whitespace-pre ${
                            isAdd
                              ? "text-emerald-300"
                              : isDel
                              ? "text-red-300"
                              : isHunk
                              ? "text-blue-300"
                              : "text-zinc-400"
                          }`}
                        >
                          {line}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function DiffViewer({ runId, prUrl, token }: DiffViewerProps) {
  const [files, setFiles] = useState<FileDiff[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api.getRunDiff(runId, token || "")
        setFiles(parseDiff(result.diff))
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load diff")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [runId, token])

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-800">
        <span className="font-semibold text-sm">Changes</span>
        {!loading && files.length > 0 && (
          <span className="text-xs text-zinc-500">{files.length} file{files.length !== 1 ? "s" : ""}</span>
        )}
        <a
          href={prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          Open PR on GitHub
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="p-4 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-zinc-500 text-sm py-8 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading diff...
          </div>
        )}
        {!loading && error && (
          <div className="text-sm text-red-400 text-center py-8">{error}</div>
        )}
        {!loading && !error && files.length === 0 && (
          <div className="text-sm text-zinc-500 text-center py-8">No diff available</div>
        )}
        {files.map((f, i) => (
          <FileDiffBlock key={i} file={f} />
        ))}
      </div>
    </div>
  )
}
