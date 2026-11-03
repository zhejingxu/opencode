import { createEffect, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { useServerSDK } from "@/runtime/server/client"
import { useWorkspaceLocation } from "@/workspaces/location"
import { useLanguage } from "@/runtime/i18n/language"
import { Definition, type Health as ModelHealth } from "./health-rpc"

type ModelTarget = {
  readonly id: string
  readonly provider: {
    readonly id: string
  }
}

const [results, setResults] = createStore<Record<string, ModelHealth | undefined>>({})

const [pending, setPending] = createStore<Record<string, boolean | undefined>>({})

const inflight = new Map<string, Promise<void>>()

// Servers without the model-health plugin answer with one of these; stop probing them.
const missing = new Set(["rpc.unavailable", "rpc.method_not_found"])

const [unsupported, setUnsupported] = createStore<Record<string, boolean | undefined>>({})

const errorType = (error: unknown) =>
  typeof error === "object" && error !== null && "type" in error && typeof error.type === "string"
    ? error.type
    : undefined

export function createModelHealth() {
  const sdk = useServerSDK()
  const location = useWorkspaceLocation()
  const [store, setStore] = createStore({ now: Date.now() })

  const key = (providerID: string, modelID: string) =>
    JSON.stringify([sdk.scope, location().ref, providerID, modelID])

  createEffect(() => {
    const timer = setInterval(() => setStore("now", Date.now()), 10000)
    onCleanup(() => clearInterval(timer))
  })

  const scope = () => JSON.stringify([sdk.scope, location().ref])

  const supported = () => !unsupported[scope()]

  const result = (providerID: string, modelID: string) => {
    const value = results[key(providerID, modelID)]

    return value && store.now - Number(value.checkedAt) < 60000 ? value : undefined
  }

  const check = (providerID: string, modelID: string, options?: { force?: boolean }) => {
    const target = key(providerID, modelID)

    if (!supported()) return Promise.resolve()
    if (!options?.force && result(providerID, modelID)) return Promise.resolve()
    const existing = inflight.get(target)

    if (existing) return existing

    setPending(target, true)

    const current = scope()
    const task = sdk.api
      .rpc(Definition)
      .check({ providerID, modelID, force: options?.force }, { location: location().ref })
      .then((response) => setResults(target, response))
      .catch((error: unknown) => {
        const type = errorType(error)

        if (type && missing.has(type)) return setUnsupported(current, true)
        setResults(target, { status: "unavailable", checkedAt: Date.now(), reason: "network" })
      })
      .finally(() => {
        inflight.delete(target)
        setPending(target, undefined)
        setStore("now", Date.now())
      })

    inflight.set(target, task)

    return task
  }

  const checkAll = async (items: readonly ModelTarget[], options?: { force?: boolean }) => {
    if (!supported()) return
    const queue = items.filter((item) => options?.force || !result(item.provider.id, item.id))

    if (queue.length === 0) return
    let index = 0

    const worker = async () => {
      while (index < queue.length) {
        const current = queue[index]
        index += 1

        if (current) await check(current.provider.id, current.id, options)
      }
    }

    await Promise.all([worker(), worker()])
  }

  return {
    supported,
    checking: () => Object.values(pending).some(Boolean),
    pending: (providerID: string, modelID: string) => Boolean(pending[key(providerID, modelID)]),
    result,
    check,
    checkAll,
  }
}

export function ModelHealthIndicator(props: { result?: ModelHealth; pending?: boolean }) {
  const language = useLanguage()
  const status = () => props.result?.status ?? (props.pending ? "checking" : "unknown")

  const label = () => {
    if (props.pending && !props.result) return language.t("model.health.checking")
    const current = props.result?.status ?? "unknown"
    const text = language.t(`model.health.${current}`)

    if (!props.result) return text

    const detail = language.t("model.health.detail", {
      status: text,
      time: new Date(Number(props.result.checkedAt)).toLocaleTimeString(),
    })

    return props.result.reason
      ? `${detail} · ${language.t(`model.health.reason.${props.result.reason}`)}`
      : detail
  }

  return <span class="model-health-indicator" data-status={status()} role="img" aria-label={label()} title={label()} />
}
