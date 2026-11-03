import { afterEach, expect, mock, setSystemTime, test } from "bun:test"
import { createRoot } from "solid-js"

const request = mock(async () => ({ status: "available" as const, checkedAt: Date.now() }))
const rpc = mock((definition: { id: string }) => ({ id: definition.id, check: request }))

mock.module("@/runtime/server/client", () => ({
  useServerSDK: () => ({ scope: "health-test", api: { rpc } }),
}))

mock.module("@/workspaces/location", () => ({
  useWorkspaceLocation: () => () => ({ ref: { directory: "/health-test" } }),
}))

const { createModelHealth } = await import("./health")

afterEach(() => setSystemTime())

// Owns the UI contract: a probe goes through the model-health plugin RPC and
// updates only the exact model that was checked.
test("model health is scoped to the checked model", async () => {
  const root = createRoot((dispose) => ({ health: createModelHealth(), dispose }))
  expect(request).not.toHaveBeenCalled()
  expect(root.health.result("gateway", "opus")).toBeUndefined()
  await root.health.check("gateway", "opus")
  expect(rpc.mock.results[0]?.value).toMatchObject({ id: "model-health" })
  expect(request).toHaveBeenCalledWith(
    { providerID: "gateway", modelID: "opus", force: undefined },
    { location: { directory: "/health-test" } },
  )
  expect(root.health.result("gateway", "opus")?.status).toBe("available")
  expect(root.health.result("relay", "opus")).toBeUndefined()
  expect(root.health.result("gateway", "sonnet")).toBeUndefined()
  expect(root.health.checking()).toBe(false)
  root.dispose()
})

test("stops probing when the server has no model-health plugin", async () => {
  request.mockImplementationOnce(async () => {
    throw { type: "rpc.unavailable", message: "RPC is unavailable: model-health" }
  })
  const root = createRoot((dispose) => ({ health: createModelHealth(), dispose }))
  await root.health.check("missing", "model")
  expect(root.health.supported()).toBe(false)
  const calls = request.mock.calls.length
  await root.health.checkAll([{ id: "other", provider: { id: "missing" } }])
  expect(request.mock.calls.length).toBe(calls)
  root.dispose()
})
