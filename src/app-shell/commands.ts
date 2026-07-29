import type { CommandOption } from "hudsonkit";
import type { StudioPage, StudioRegistry } from "../registry";
import type {
  TreatmentDecision,
  TreatmentId,
} from "../doc/decisions";
import {
  createTurnDecision,
  createWinnerDecision,
} from "../doc/decisions";

/**
 * Helpers for turning a studio + current page context into commands that
 * the Hudson assistant (and command palette) can invoke.
 *
 * This is the "agentic surface". When you pass `useCommands` (or `commands`)
 * to `StudioHudsonApp`, the in-app assistant (and any MCP clients that talk
 * to the same command surface) can participate in the design iteration loop:
 * record turns, declare winners, etc.
 *
 * Because it's all driven by the same registry + decisions you already have,
 * humans using the UI and agents using chat / MCP stay in sync.
 */

export interface StudioCommandContext<
  Bucket extends string,
  Surface extends string,
  Status extends string,
> {
  registry: StudioRegistry<Bucket, Surface, Status>;
  currentPage?: StudioPage<Bucket, Surface, Status>;
  /** Current decisions for the active page (you manage storage). */
  decisions?: TreatmentDecision[];
  /** Callback when a decision is recorded (persist it, write a file, etc.). */
  onDecision?: (decision: TreatmentDecision) => void | Promise<void>;
}

/**
 * Generate a set of studio iteration commands for the current context.
 * These are safe no-ops when there's no current page.
 */
export function createStudioIterationCommands<
  Bucket extends string,
  Surface extends string,
  Status extends string,
>(ctx: StudioCommandContext<Bucket, Surface, Status>): CommandOption[] {
  const { currentPage, decisions = [], onDecision } = ctx;
  if (!currentPage) return [];

  const pageHref = currentPage.href;
  const pageLabel = currentPage.label;

  const commands: CommandOption[] = [
    {
      id: "studio:log-turn",
      label: `Log turn on ${pageLabel}`,
      // "Record an iteration / refinement on the current treatment" (Studio group)
      action: async () => {
        // In a real integration you would open a small composer or take
        // the rest of the command args. For now we create a minimal turn.
        const decision = createTurnDecision({
          pageHref,
          treatmentId: currentPage.href,
          summary: "Iteration recorded via assistant",
          author: "assistant",
        });
        await onDecision?.(decision);
      },
    },
    {
      id: "studio:declare-winner",
      label: `Declare winner for ${pageLabel}`,
      // "Mark the current (or specified) treatment as the chosen one"
      action: async () => {
        const decision = createWinnerDecision({
          pageHref,
          treatmentId: currentPage.href,
          summary: "Marked as winner via assistant",
          author: "assistant",
        });
        await onDecision?.(decision);
      },
    },
    {
      id: "studio:list-decisions",
      label: `List decisions for ${pageLabel}`,
      // "Show recent turns and winners for the current page"
      action: () => {
        if (decisions.length === 0) {
          // In a real command this would surface in the palette result area.
          console.log("No decisions recorded yet for this page.");
        } else {
          console.log(
            decisions
              .slice()
              .reverse()
              .slice(0, 8)
              .map((d) => {
                const t = d.treatmentId ? ` [${d.treatmentId}]` : "";
                return `${d.kind.toUpperCase()}${t}: ${d.summary}`;
              })
              .join("\n"),
          );
        }
      },
    },
  ];

  // Bonus: if there are multiple pages in the same bucket/family, offer a
  // lightweight "compare" command.
  const siblings = ctx.registry
    .pagesIn(currentPage.bucket)
    .filter((p) => p.href !== currentPage.href);

  if (siblings.length > 0) {
    commands.push({
      id: "studio:compare-siblings",
      label: `Compare treatments in ${currentPage.bucket}`,
      // "List peer pages in the same bucket for side-by-side thinking"
      action: () => {
        console.log(
          siblings
            .map((s) => `${s.label} — ${s.href}${s.status ? ` (${s.status})` : ""}`)
            .join("\n"),
        );
      },
    });
  }

  return commands;
}

/**
 * Example of how a consumer can wire this up with `StudioHudsonApp`:
 *
 * const [decisions, setDecisions] = useState<TreatmentDecision[]>([]);
 *
 * <StudioHudsonApp
 *   ...
 *   useCommands={() => [
 *     ...createStudioIterationCommands({
 *       registry,
 *       currentPage: registry.pageForPath(pathname),
 *       decisions,
 *       onDecision: (d) => setDecisions((prev) => [...prev, d]),
 *     }),
 *     // your other app-specific commands
 *   ]}
 * />
 *
 * The assistant (and command palette) will now surface these automatically.
 * You can persist `decisions` to a file, to the page's source, to a small
 * local index, etc. Agents that have filesystem access will see the same
 * decisions the UI does.
 */
