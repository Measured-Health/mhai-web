import { describe, expect, it } from "vitest";
import { readConnectorTypes } from "./emr-schema";

// Core openapi 1.42.0: `EmrConnectorType.id` gains `hl7v2_file` (HL7 v2
// message files over SFTP). The connector-types read is strict, so the
// type must be in the enum before core offers it, or the add-connection
// screen fails to load.
const HL7 = {
  id: "hl7v2_file",
  label: "HL7 v2 message files",
  summary:
    "Reads HL7 v2 result and medication messages from files in a secure folder.",
  fields: [
    { key: "folder", label: "Folder", kind: "text", required: true, max: 200 },
    {
      key: "username",
      label: "User name",
      kind: "text",
      required: true,
      max: 32,
    },
    {
      key: "host_key_fingerprint",
      label: "Host key fingerprint",
      kind: "text",
      required: true,
      max: 100,
    },
    {
      key: "expected_every_minutes",
      label: "Expected every (minutes)",
      kind: "text",
      required: true,
      max: 6,
    },
    {
      key: "time_zone",
      label: "Time zone for times without an offset",
      kind: "text",
      required: false,
      max: 64,
    },
    {
      key: "sending_facility",
      label: "Sending facility (MSH-4)",
      kind: "text",
      required: false,
      max: 60,
    },
    {
      key: "mrn_namespace",
      label: "MRN identifier system",
      kind: "text",
      required: false,
      max: 200,
    },
    {
      key: "mrn_identifier_type",
      label: "MRN identifier type (PID-3.5)",
      kind: "text",
      required: false,
      max: 5,
    },
    {
      key: "mrn_assigning_authority",
      label: "MRN assigning authority (PID-3.4)",
      kind: "text",
      required: false,
      max: 60,
    },
    {
      key: "access_key",
      label: "Access key",
      kind: "secret",
      required: true,
      max: 4000,
    },
  ],
};

describe("readConnectorTypes", () => {
  it("reads the HL7 v2 message files type", () => {
    const out = readConnectorTypes({ types: [HL7] });
    expect(out.types.map((t) => t.id)).toEqual(["hl7v2_file"]);
    expect(out.types[0].fields).toHaveLength(10);
  });

  it("still refuses a type it doesn't know", () => {
    expect(() =>
      readConnectorTypes({ types: [{ ...HL7, id: "hl7v2_feed" }] }),
    ).toThrow();
  });
});
