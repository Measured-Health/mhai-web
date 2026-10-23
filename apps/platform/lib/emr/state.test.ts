import { describe, expect, it } from "vitest";
import type {
  ConnectorType,
  EmrConnection,
  EmrConnectionSummary,
} from "@/lib/api/emr-contract";
import {
  canSwitchOn,
  connectionState,
  validateConnection,
  type ConnectionForm,
} from "./state";

const AT = "2026-10-23T09:00:00.000Z";
const summary = (
  over: Partial<EmrConnectionSummary> = {},
): EmrConnectionSummary => ({
  id: "emr_1",
  hospital: { id: "h_havana", name: "Havana Hospital" },
  type: "fhir_r4",
  type_label: "FHIR R4 server",
  source_label: "Main record",
  enabled: true,
  health: "ok",
  last_test: { at: AT, ok: true, code: null },
  last_sync: { at: AT, ok: true, records: 10 },
  errors_24h: 0,
  ...over,
});
const full = (over: Partial<EmrConnection> = {}): EmrConnection => ({
  ...summary(),
  base_url: "https://records.havana.example/fhir",
  settings: { client_id: "a" },
  credentials: [{ key: "private_key", set_at: AT }],
  errors: [],
  updated_by: null,
  updated_at: null,
  version: 1,
  ...over,
});

const TYPE: ConnectorType = {
  id: "fhir_r4",
  label: "FHIR R4 server",
  summary: "Reads records from a FHIR R4 server",
  fields: [
    {
      key: "client_id",
      label: "Client ID",
      kind: "text",
      required: true,
      max: 200,
    },
    { key: "scope", label: "Scope", kind: "text", required: false, max: 10 },
    {
      key: "private_key",
      label: "Private key",
      kind: "secret",
      required: true,
      max: 4000,
    },
  ],
};
const form = (over: Partial<ConnectionForm> = {}): ConnectionForm => ({
  source_label: "Main record",
  base_url: "https://records.havana.example/fhir",
  settings: { client_id: "mhai" },
  credentials: { private_key: "k" },
  ...over,
});

describe("connectionState", () => {
  it("the four states", () => {
    expect(connectionState(summary({ enabled: false, last_test: null }))).toBe(
      "not_tested",
    );
    expect(
      connectionState(
        summary({
          enabled: false,
          last_test: { at: AT, ok: false, code: "unreachable" },
        }),
      ),
    ).toBe("not_tested");
    expect(connectionState(summary({ enabled: false }))).toBe("off");
    expect(connectionState(summary({ health: "errors" }))).toBe(
      "needs_attention",
    );
    expect(connectionState(summary())).toBe("connected");
    // On with nothing read yet is still Connected ("No updates yet").
    expect(connectionState(summary({ health: "never", last_sync: null }))).toBe(
      "connected",
    );
    // Switched off wins over errors.
    expect(connectionState(summary({ enabled: false, health: "errors" }))).toBe(
      "off",
    );
  });
});

describe("canSwitchOn", () => {
  it("only after a passing test of the saved settings", () => {
    expect(canSwitchOn(full())).toBe(true);
    expect(canSwitchOn(full({ last_test: null }))).toBe(false);
    expect(
      canSwitchOn(
        full({ last_test: { at: AT, ok: false, code: "sign_in_refused" } }),
      ),
    ).toBe(false);
  });
});

describe("validateConnection", () => {
  it("a good form has no errors", () => {
    expect(validateConnection(form(), TYPE)).toEqual({});
  });

  it("words the source label and the base address", () => {
    expect(validateConnection(form({ source_label: "  " }), TYPE)).toEqual({
      source_label: "Enter the name the hospital sees.",
    });
    expect(
      validateConnection(form({ source_label: "x".repeat(41) }), TYPE),
    ).toEqual({ source_label: "Use 40 characters or fewer." });
    expect(
      validateConnection(form({ source_label: "x".repeat(40) }), TYPE),
    ).toEqual({});
    expect(validateConnection(form({ base_url: "" }), TYPE)).toEqual({
      base_url: "Enter the base address.",
    });
    for (const base_url of [
      "http://records.havana.example/",
      "records.havana.example",
      "ftp://records.havana.example/",
      "https://",
    ])
      expect(validateConnection(form({ base_url }), TYPE), base_url).toEqual({
        base_url: "Use an address that starts with https://.",
      });
    expect(
      validateConnection(
        form({ base_url: `https://a.example/${"x".repeat(483)}` }),
        TYPE,
      ),
    ).toEqual({ base_url: "Use 500 characters or fewer." });
  });

  it("required fields say Enter {label}.", () => {
    expect(
      validateConnection(form({ settings: { client_id: " " } }), TYPE),
    ).toEqual({ client_id: "Enter Client ID." });
    expect(
      validateConnection(form({ settings: { scope: "x".repeat(11) } }), TYPE),
    ).toEqual({
      client_id: "Enter Client ID.",
      scope: "Use 10 characters or fewer.",
    });
  });

  it("secrets are required on add only", () => {
    expect(validateConnection(form({ credentials: {} }), TYPE)).toEqual({
      private_key: "Enter Private key.",
    });
    expect(validateConnection(form({ credentials: {} }), TYPE, "edit")).toEqual(
      {},
    );
    expect(
      validateConnection(
        form({ credentials: { private_key: "" } }),
        TYPE,
        "edit",
      ),
    ).toEqual({});
    expect(
      validateConnection(
        form({ credentials: { private_key: "x".repeat(4001) } }),
        TYPE,
        "edit",
      ),
    ).toEqual({ private_key: "Use 4000 characters or fewer." });
  });
});
