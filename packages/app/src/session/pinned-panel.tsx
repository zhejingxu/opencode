import type { SessionMessageInfo } from "@opencode/client/promise"
import { For, Show, createMemo } from "solid-js"
import { createStore } from "solid-js/store"
import { Icon } from "@opencode/ui/icon"
import { IconButton } from "@opencode/ui/icon-button"
import { Tooltip } from "@opencode/ui/tooltip"
import {
  createReactiveTimelineProjection,
  TimelineRow,
  type ReasoningMode,
} from "@opencode/session-ui/timeline/projection"
import { createSessionTimelineRowRenderer } from "@opencode/session-ui/timeline/row"
import { parseCommentNote, readPromptPresentation } from "@/composer/comment-note"
import { useLanguage } from "@/runtime/i18n/language"
import { useSettings } from "@/settings/model"
import type { SessionModel } from "./model"
import { SessionPanelFrame } from "./session-frame"

function selectTurnMessages(messages: SessionMessageInfo[], turnID: string): SessionMessageInfo[] {
  const start = messages.findIndex((msg) => msg.id === turnID)

  if (start === -1) return []
  const first = messages[start]!

  if (first.type === "shell") return [first]
  const slice: SessionMessageInfo[] = [first]

  for (let i = start + 1; i < messages.length; i++) {
    const current = messages[i]!

    if (current.type === "user" || current.type === "shell") break
    slice.push(current)
  }

  return slice
}

function summarizeTurnLabel(messages: SessionMessageInfo[], turnID: string, fallbackIndex: number): string {
  const target = messages.find((msg) => msg.id === turnID)

  if (target?.type === "user") {
    const presentation = readPromptPresentation(target.metadata)
    const raw = (presentation?.displayText ?? target.text).replace(/\s+/g, " ").trim()

    if (raw) return raw.length > 28 ? `${raw.slice(0, 28)}…` : raw
  }

  return `#${fallbackIndex + 1}`
}

export function SessionPinnedPanel(props: {
  session: SessionModel
  onRevealMessage?: (messageID: string) => void
}) {
  const language = useLanguage()
  const settings = useSettings()
  const pin = () => props.session.layout.view().pin
  const items = createMemo(() => pin().items())
  const activeID = createMemo(() => pin().active())

  const turnMessages = createMemo(() => {
    const id = activeID()

    if (!id) return []

    return selectTurnMessages(props.session.history.messages(), id)
  })

  const timelineDetail = createMemo(() => {
    const detail = settings.general.timelineDetail()

    return {
      shell: { ...detail.shell },
      edit: { ...detail.edit },
      thinking: { ...detail.thinking },
      subagents: { ...detail.subagents },
      notices: { ...detail.notices },
      tools: { ...detail.tools },
      commentary: { ...detail.commentary },
    }
  })

  const reasoningMode = (): ReasoningMode =>
    timelineDetail().thinking.placement === "hidden"
      ? "hidden"
      : timelineDetail().thinking.details === "expanded"
        ? "full"
        : "compact"

  const shellToolDefaultOpen = () => timelineDetail().shell.details === "expanded"
  const editToolDefaultOpen = () => timelineDetail().edit.details === "expanded"

  const projection = createReactiveTimelineProjection({
    sessionMessages: turnMessages,
    status: () => ({ type: "idle" as const }),
    reasoningMode,
    shellToolDefaultOpen,
    editToolDefaultOpen,
    timelineDetail,
  })

  const [disclosure, setDisclosure] = createStore<Record<string, boolean | undefined>>({})

  const rowRenderer = createSessionTimelineRowRenderer({
    sessionID: () => props.session.identity.sessionID() ?? "",
    status: () => ({ type: "idle" as const }),
    projection,
    presentation: (message) => {
      const value = readPromptPresentation(message.metadata)
      const parsed = value ? undefined : parseCommentNote(message.text)

      return {
        displayText: value?.displayText,
        comments: value?.comments ?? (parsed ? [parsed] : []),
        references: value?.attachments,
      }
    },
    actions: {
      pin: {
        isPinned: (messageID: string) => pin().isPinned(messageID),
        toggle: ({ messageID }) => pin().toggle(messageID),
      },
    },
    reasoningMode,
    shellToolDefaultOpen,
    editToolDefaultOpen,
    timelineDetail,
    disclosure: {
      value: (key) => disclosure[key],
      set: (key, open) => setDisclosure(key, open),
    },
    centered: () => false,
    padding: () => "px-4",
  })

  const rowKeys = createMemo(() => projection.rows().map(TimelineRow.key))

  function Row(rowProps: { rowKey: string }) {
    const initial = projection.rowByKey().get(rowProps.rowKey)!
    const row = createMemo(() => projection.rowByKey().get(rowProps.rowKey) ?? initial)

    return <rowRenderer.Row row={row} />
  }

  return (
    <SessionPanelFrame raised>
      <div
        data-component="session-pinned-panel"
        class="flex h-full min-h-0 w-full flex-col overflow-hidden bg-v2-background-bg-base"
      >
        <div
          data-slot="session-pinned-header"
          class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-v2-border-border-weak px-3.5"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="flex size-5 shrink-0 items-center justify-center text-v2-icon-icon-base">
              <Icon name="pin-active" size="small" />
            </span>
            <span class="truncate text-[13px] font-[530] leading-4 tracking-[-0.04px] text-v2-text-text-base">
              {language.t("session.pinned.title")}
            </span>
            <Show when={items().length > 1}>
              <span class="rounded-[4px] bg-v2-background-bg-layer-01 px-1.5 py-0.5 text-[11px] font-[500] leading-4 text-v2-text-text-muted tabular-nums">
                {items().indexOf(activeID() ?? "") + 1}/{items().length}
              </span>
            </Show>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Show when={activeID() && props.onRevealMessage}>
              <Tooltip appearance="compact" value={language.t("session.pinned.jumpToMessage")} placement="bottom">
                <IconButton
                  icon={<Icon name="magnifying-glass" size="small" />}
                  size="normal"
                  variant="ghost-muted"
                  aria-label={language.t("session.pinned.jumpToMessage")}
                  onClick={() => {
                    const id = activeID()

                    if (id) props.onRevealMessage?.(id)
                  }}
                />
              </Tooltip>
            </Show>
            <Show when={items().length > 1}>
              <Tooltip appearance="compact" value={language.t("session.pinned.clearAll")} placement="bottom">
                <IconButton
                  icon={<Icon name="outline-trash" size="small" />}
                  size="normal"
                  variant="ghost-muted"
                  aria-label={language.t("session.pinned.clearAll")}
                  onClick={() => pin().clear()}
                />
              </Tooltip>
            </Show>
            <Tooltip appearance="compact" value={language.t("session.pinned.unpin")} placement="bottom">
              <IconButton
                icon={<Icon name="close-small" size="small" />}
                size="normal"
                variant="ghost-muted"
                aria-label={language.t("session.pinned.unpin")}
                onClick={() => {
                  const id = activeID()

                  if (id) pin().remove(id)
                }}
              />
            </Tooltip>
          </div>
        </div>

        <Show when={items().length > 1}>
          <div
            data-slot="session-pinned-tabs"
            class="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-v2-border-border-weak px-3 py-1.5 no-scrollbar"
          >
            <For each={items()}>
              {(itemID, index) => {
                const selected = () => activeID() === itemID
                const label = createMemo(() => summarizeTurnLabel(props.session.history.messages(), itemID, index()))

                return (
                  <div
                    class="group flex shrink-0 items-center gap-1 rounded-[6px] pl-2.5 pr-1 py-1 text-[12px] leading-4 transition-colors cursor-pointer select-none"
                    classList={{
                      "bg-v2-background-bg-layer-02 text-v2-text-text-base font-[530]": selected(),
                      "text-v2-text-text-muted hover:bg-v2-overlay-simple-overlay-hover hover:text-v2-text-text-base":
                        !selected(),
                    }}
                    onClick={() => pin().select(itemID)}
                  >
                    <span class="max-w-[160px] truncate">{label()}</span>
                    <button
                      type="button"
                      class="flex size-4 items-center justify-center rounded-[4px] text-v2-icon-icon-muted opacity-60 hover:bg-v2-overlay-simple-overlay-pressed hover:opacity-100"
                      aria-label={language.t("session.pinned.unpin")}
                      onClick={(event) => {
                        event.stopPropagation()
                        pin().remove(itemID)
                      }}
                    >
                      <Icon name="close-small" size="small" />
                    </button>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>

        <div
          data-slot="session-pinned-scroll"
          class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-4 select-text"
        >
          <div class="flex flex-col pb-6">
            <For each={rowKeys()}>{(rowKey) => <Row rowKey={rowKey} />}</For>
          </div>
        </div>
      </div>
    </SessionPanelFrame>
  )
}
