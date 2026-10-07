/** Editable prompt text that follows a derived suggestion until the user changes it. */
export interface PromptField {
  text: string;
  edited: boolean;
}

export const startField = (suggested: string): PromptField => ({ text: suggested, edited: false });
export const resetField = startField;

/** The suggestion changed: unedited text follows it, edited text stays. */
export const syncField = (field: PromptField, suggested: string): PromptField =>
  field.edited || field.text === suggested ? field : { text: suggested, edited: false };

/** The user typed `text`; it counts as edited unless it equals the current suggestion. */
export const editField = (_field: PromptField, text: string, suggested: string): PromptField => ({ text, edited: text !== suggested });
