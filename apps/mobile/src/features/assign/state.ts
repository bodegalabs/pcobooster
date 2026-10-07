export interface AssignViewState {
  selection: string;
  filter: string;
  selected: string | null;
  /** The last add failure per person, shown under their row until they are tried again. */
  errors: ReadonlyMap<string, string>;
  offersNext: boolean;
}
export type AssignViewAction =
  | { kind: "position"; selection: string }
  | { kind: "filter"; text: string }
  | { kind: "inspect"; id: string | null }
  | { kind: "dismissNext" }
  | {
      kind: "assigned";
      selection: string;
      id: string;
      /** The message to show, or null when the add landed. */
      error: string | null;
      offersNext: boolean;
    };
export const initialViewState = (selection: string): AssignViewState => ({
  selection,
  filter: "",
  selected: null,
  errors: new Map(),
  offersNext: false,
});
export const assignViewReducer = (
  state: AssignViewState,
  action: AssignViewAction
): AssignViewState => {
  switch (action.kind) {
    case "position": {
      return initialViewState(action.selection);
    }
    case "filter": {
      return { ...state, filter: action.text };
    }
    case "inspect": {
      return { ...state, selected: action.id };
    }
    case "dismissNext": {
      return { ...state, offersNext: false };
    }
    case "assigned": {
      if (state.selection !== action.selection) {
        return state;
      }
      const errors = new Map(state.errors);
      if (action.error === null) {
        errors.delete(action.id);
      } else {
        errors.set(action.id, action.error);
      }
      return { ...state, errors, offersNext: action.offersNext };
    }
    default: {
      return action satisfies never;
    }
  }
};
