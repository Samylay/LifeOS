import {
  actionKey as filingKey, actionLabel as filingLabel, describeEffect as filingEffect,
  isPerformable as canFile, parseActionRequest, proposedAction, selectableActions,
  type Action as FilingAction, type ActionSubject,
} from "./actions";

export type HomelabAction = { id: "homelab-skill" | "homelab-reference"; params: Record<string, never> };
export type Action = FilingAction | HomelabAction;
export type ActionId = Action["id"];
export { proposedAction };

export function isHomelabAction(action: Action): action is HomelabAction {
  return action.id === "homelab-skill" || action.id === "homelab-reference";
}
export function isPerformable(action: Action): boolean { return isHomelabAction(action) || canFile(action); }
export function actionKey(action: Action): string { return isHomelabAction(action) ? action.id : filingKey(action); }
export function actionLabel(action: Action): string {
  return action.id === "homelab-skill" ? "Queue skill install" : action.id === "homelab-reference" ? "Save UI reference" : filingLabel(action as FilingAction);
}
export function describeEffect(action: Action, item: ActionSubject, options?: { compact?: boolean }): string {
  if (action.id === "homelab-skill") return "Queue an install request for Claude. Start it from Send to Claude.";
  if (action.id === "homelab-reference") return "Save for future UI work. Relevant requests will bring it back.";
  return filingEffect(action as FilingAction, item, options);
}
export function selectableDecideActions(item: ActionSubject, current?: Action | null): Action[] {
  const options: Action[] = selectableActions(item, current && !isHomelabAction(current) ? current : null);
  if (item.url && /^https?:\/\//i.test(item.url)) options.push(
    { id: "homelab-skill", params: {} }, { id: "homelab-reference", params: {} },
  );
  return options;
}
// The filing action boundary stays unchanged. Homelab actions have a separate,
// equally closed boundary, accepting no instruction, URL, or caller metadata.
export function parseDecideAction(body: unknown): Action | null {
  if (typeof body === "object" && body !== null && "action" in body &&
      (body.action === "homelab-skill" || body.action === "homelab-reference")) {
    return { id: body.action, params: {} };
  }
  return parseActionRequest(body);
}
