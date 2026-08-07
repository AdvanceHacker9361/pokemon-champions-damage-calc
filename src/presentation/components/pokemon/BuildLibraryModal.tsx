import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useBuildLibraryStore, loadRegisteredBuild, BUILD_LIBRARY_MAX,
  type RegisteredBuild, type ImportResult,
} from '@/presentation/store/buildLibraryStore'
import { useAttackerStore, useDefenderStore } from '@/presentation/store/pokemonStore'
import { toKatakana } from '../../../utils/japanese'

async function tryCopy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function matches(target: string, query: string, queryKata: string, queryLower: string): boolean {
  return (
    target.includes(query) ||
    toKatakana(target).includes(queryKata) ||
    target.toLowerCase().includes(queryLower)
  )
}

interface BuildLibraryModalProps {
  side: 'attacker' | 'defender'
  onClose: () => void
}

export function BuildLibraryModal({ side, onClose }: BuildLibraryModalProps) {
  const builds = useBuildLibraryStore(s => s.builds)
  const importBuilds = useBuildLibraryStore(s => s.importBuilds)
  const exportAllText = useBuildLibraryStore(s => s.exportAllText)
  const attackerPokemonId = useAttackerStore(s => s.pokemonId)
  const defenderPokemonId = useDefenderStore(s => s.pokemonId)
  const liveHasPokemon = (side === 'attacker' ? attackerPokemonId : defenderPokemonId) != null

  const [query, setQuery] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [copyAllFeedback, setCopyAllFeedback] = useState<string | null>(null)
  const [copyAllFallback, setCopyAllFallback] = useState<string | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const filteredBuilds = useMemo(() => {
    const q = query.trim()
    if (!q) return builds
    const qKata = toKatakana(q)
    const ql = q.toLowerCase()
    return builds.filter(b =>
      matches(b.nickname, q, qKata, ql) || matches(b.snapshot.pokemonName, q, qKata, ql)
    )
  }, [builds, query])

  function handleLoad(build: RegisteredBuild) {
    loadRegisteredBuild(side, build)
    onClose()
  }

  async function handleCopyAll() {
    const text = exportAllText()
    const ok = await tryCopy(text)
    if (ok) {
      setCopyAllFeedback('コピーしました')
      window.setTimeout(() => setCopyAllFeedback(null), 2000)
    } else {
      setCopyAllFallback(text)
    }
  }

  function handleImport() {
    const result = importBuilds(importText)
    setImportResult(result)
    if (result.ok) setImportText('')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="個体ライブラリ"
        onClick={e => e.stopPropagation()}
        className="panel w-full max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden"
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-edge flex-shrink-0">
          <h2 className="text-sm font-semibold text-fg">
            個体ライブラリ{' '}
            <span className="text-xs font-normal text-fg-subtle">{builds.length}/{BUILD_LIBRARY_MAX}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-fg-subtle hover:text-fg rounded px-1.5 py-1 hover:bg-surface-3"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {/* 検索 */}
        <div className="px-3 py-2 border-b border-edge flex-shrink-0">
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ニックネーム・ポケモン名で検索..."
            aria-label="個体を検索"
            className="input-base w-full"
          />
        </div>

        {/* 一覧 */}
        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-edge">
          {filteredBuilds.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-fg-subtle">
              {builds.length === 0
                ? '登録された個体はありません。各パネルの「登録」から追加できます'
                : `「${query}」に一致する個体がありません`}
            </p>
          ) : (
            filteredBuilds.map(build => (
              <BuildRow
                key={build.id}
                build={build}
                side={side}
                liveHasPokemon={liveHasPokemon}
                onLoad={handleLoad}
              />
            ))
          )}
        </div>

        {/* フッター */}
        <div className="border-t border-edge px-3 py-2 flex-shrink-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCopyAll}
              disabled={builds.length === 0}
              className="text-xs px-2 py-1 rounded border border-edge text-fg-muted hover:bg-surface-3 disabled:opacity-40"
            >
              {copyAllFeedback ?? '全コピー'}
            </button>
            <button
              type="button"
              onClick={() => { setShowImport(v => !v); setImportResult(null) }}
              className="text-xs px-2 py-1 rounded border border-edge text-fg-muted hover:bg-surface-3"
            >
              {showImport ? 'インポートを閉じる' : 'インポート'}
            </button>
          </div>

          {copyAllFallback != null && (
            <CopyFallback text={copyAllFallback} onClose={() => setCopyAllFallback(null)} />
          )}

          {showImport && (
            <div className="space-y-1.5">
              <textarea
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder="エクスポートしたテキストを貼り付け..."
                className="input-base w-full h-20 text-xs resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!importText.trim()}
                  className="text-xs px-2 py-1 rounded border border-accent-border bg-accent-bg text-accent disabled:opacity-40"
                >
                  取り込む
                </button>
                {importResult && (
                  <p className={`text-[11px] ${importResult.ok ? 'text-accent' : 'text-danger-2'}`}>
                    {importResult.ok ? `${importResult.added}件取り込みました` : importResult.error}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CopyFallback({ text, onClose }: { text: string; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-fg-subtle">コピーに失敗しました。以下を選択してコピーしてください。</p>
      <textarea
        ref={ref}
        readOnly
        value={text}
        onFocus={e => e.currentTarget.select()}
        className="input-base w-full h-16 text-[11px] resize-none"
      />
      <button type="button" onClick={onClose} className="text-[11px] text-fg-muted hover:text-fg">
        閉じる
      </button>
    </div>
  )
}

interface BuildRowProps {
  build: RegisteredBuild
  side: 'attacker' | 'defender'
  liveHasPokemon: boolean
  onLoad: (build: RegisteredBuild) => void
}

function BuildRow({ build, side, liveHasPokemon, onLoad }: BuildRowProps) {
  const renameBuild = useBuildLibraryStore(s => s.renameBuild)
  const removeBuild = useBuildLibraryStore(s => s.removeBuild)
  const overwriteBuild = useBuildLibraryStore(s => s.overwriteBuild)
  const exportOneText = useBuildLibraryStore(s => s.exportOneText)

  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState(build.nickname)
  const [confirmAction, setConfirmAction] = useState<'overwrite' | 'remove' | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [fallbackText, setFallbackText] = useState<string | null>(null)

  const confirmTimeoutRef = useRef<number | null>(null)
  const feedbackTimeoutRef = useRef<number | null>(null)

  useEffect(() => () => {
    if (confirmTimeoutRef.current != null) window.clearTimeout(confirmTimeoutRef.current)
    if (feedbackTimeoutRef.current != null) window.clearTimeout(feedbackTimeoutRef.current)
  }, [])

  function flashFeedback(text: string) {
    setFeedback(text)
    if (feedbackTimeoutRef.current != null) window.clearTimeout(feedbackTimeoutRef.current)
    feedbackTimeoutRef.current = window.setTimeout(() => setFeedback(null), 2000)
  }

  function requestConfirm(action: 'overwrite' | 'remove') {
    setConfirmAction(action)
    if (confirmTimeoutRef.current != null) window.clearTimeout(confirmTimeoutRef.current)
    confirmTimeoutRef.current = window.setTimeout(() => setConfirmAction(null), 3000)
  }

  function clearConfirm() {
    if (confirmTimeoutRef.current != null) window.clearTimeout(confirmTimeoutRef.current)
    setConfirmAction(null)
  }

  function beginRename() {
    setRenameDraft(build.nickname)
    setRenaming(true)
  }

  function commitRename() {
    renameBuild(build.id, renameDraft)
    setRenaming(false)
  }

  async function handleCopy() {
    const text = exportOneText(build.id)
    if (!text) return
    const ok = await tryCopy(text)
    if (ok) {
      flashFeedback('コピーしました')
    } else {
      setFallbackText(text)
    }
  }

  function handleOverwrite() {
    if (confirmAction === 'overwrite') {
      clearConfirm()
      const source = side === 'attacker' ? useAttackerStore.getState() : useDefenderStore.getState()
      const ok = overwriteBuild(build.id, source)
      flashFeedback(ok ? '上書きしました' : '上書きに失敗しました')
    } else {
      requestConfirm('overwrite')
    }
  }

  function handleRemove() {
    if (confirmAction === 'remove') {
      clearConfirm()
      removeBuild(build.id)
    } else {
      requestConfirm('remove')
    }
  }

  return (
    <div className="px-2 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              type="text"
              value={renameDraft}
              onChange={e => setRenameDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => {
                if (e.nativeEvent.isComposing) return
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') setRenaming(false)
              }}
              aria-label="ニックネームを変更"
              className="input-base w-full text-xs"
            />
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-medium text-fg truncate">{build.nickname}</span>
              {build.snapshot.isMega && (
                <span className="text-[10px] px-1 rounded bg-accent-bg text-accent border border-accent-border flex-shrink-0">
                  メガ
                </span>
              )}
            </div>
          )}
          <p className="text-[11px] text-fg-subtle truncate">
            {build.snapshot.pokemonName}
            {build.snapshot.itemName ? ` ・ ${build.snapshot.itemName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
          <button
            type="button"
            onClick={() => onLoad(build)}
            className="text-xs px-2 py-0.5 rounded border bg-accent-bg text-accent border-accent-border"
          >
            読込
          </button>
          <button
            type="button"
            onClick={beginRename}
            aria-label="名前を変更"
            title="名前を変更"
            className="text-xs px-1.5 py-0.5 rounded border text-fg-muted border-edge hover:bg-surface-3"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs px-2 py-0.5 rounded border text-fg-muted border-edge hover:bg-surface-3"
          >
            コピー
          </button>
          <button
            type="button"
            onClick={handleOverwrite}
            disabled={!liveHasPokemon}
            className={`text-xs px-2 py-0.5 rounded border transition-colors disabled:opacity-40 ${
              confirmAction === 'overwrite'
                ? 'bg-danger-2 text-white border-danger-2'
                : 'text-fg-muted border-edge hover:bg-surface-3'
            }`}
          >
            {confirmAction === 'overwrite' ? '確定?' : '上書'}
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${
              confirmAction === 'remove'
                ? 'bg-danger-2 text-white border-danger-2'
                : 'text-fg-muted border-edge hover:bg-surface-3'
            }`}
          >
            {confirmAction === 'remove' ? '確定?' : '削除'}
          </button>
        </div>
      </div>

      {feedback && <p className="text-[11px] text-accent mt-1">{feedback}</p>}
      {fallbackText != null && (
        <div className="mt-1.5">
          <CopyFallback text={fallbackText} onClose={() => setFallbackText(null)} />
        </div>
      )}
    </div>
  )
}
