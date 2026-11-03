import { Schema } from "effect"
import { Rpc } from "@opencode/schema/rpc"

// Mirror of the `model-health` plugin contract (opencode-plugins/packages/model-health/src/rpc.ts).
// The server side is provided by that plugin; without it the selector simply shows no health state.
export const Reason = Schema.Literals([
  "not_found",
  "unsupported",
  "configuration",
  "authentication",
  "rate_limit",
  "quota",
  "provider",
  "timeout",
  "network",
  "unknown",
])

export const Health = Schema.Struct({
  status: Schema.Literals(["available", "unavailable", "unknown"]),
  checkedAt: Schema.Number,
  latencyMs: Schema.optional(Schema.Number),
  reason: Schema.optional(Reason),
})
export type Health = typeof Health.Type

export const Definition = Rpc.define({
  id: "model-health",
  methods: {
    check: {
      input: Schema.toStandardSchemaV1(
        Schema.Struct({
          providerID: Schema.String,
          modelID: Schema.String,
          force: Schema.optional(Schema.Boolean),
        }),
      ),
      output: Schema.toStandardSchemaV1(Health),
    },
  },
  events: {},
})
