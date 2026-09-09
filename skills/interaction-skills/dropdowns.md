# Interaction Skill: Dropdowns, Comboboxes, and Listboxes

## Purpose
Enables reliable selection across both native HTML `<select>` elements and modern ARIA-driven custom dropdown components (`role="combobox"`, `role="listbox"`, and popover menus).

## Implementation in PrivaPilot
1. **Native `<select>`**:
   - `ActionExecutor` sets `selectElement.selectedIndex`, updates `option.selected = true`, and fires bubbling `input` and `change` events.
2. **Custom ARIA Comboboxes**:
   - Extracted with `role: 'select'` and `ActionCapability: 'select'`.
   - Multi-step pattern: (1) click combobox trigger, (2) observe expanded options list, (3) click desired option matching `selectOptionValue`.
3. **Postcondition Verification**:
   - `{ kind: 'select_changed', expectedOptionValue: ... }`.
