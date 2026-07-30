/**
 * Generic component registry: manifest schema, audit, search, and the
 * `createComponentRegistry` factory. Browser-safe — this barrel imports no
 * `node:*`. Filesystem verification lives on the separate
 * `studio/components/verify` export path.
 */

export {
  auditManifest,
  defaultAuditRules,
  defaultStatusBoost,
  meetsStatus,
  searchManifests,
} from "./manifest";
export type {
  AuditIssue,
  AuditOptions,
  AuditRule,
  ComponentManifest,
  ComponentStatus,
  DataSpec,
  ExampleSpec,
  KeySpec,
  PortSpec,
  PortStatus,
  PropSpec,
  SearchHit,
  SearchOptions,
  SlotSpec,
  StateSpec,
} from "./manifest";
export { createComponentRegistry } from "./registry";
export type {
  ComponentRegistry,
  CreateComponentRegistryOptions,
  RegistryHealth,
} from "./registry";
