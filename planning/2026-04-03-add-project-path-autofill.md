# Plan: Autofill Project Path On Add-Project Entry

## Problem
Desktop users currently have to open the add-project modal and then click `Browse` before Prism can populate the project path. This adds a redundant step to the most common path-first action.

## Scope
- Desktop portfolio entry points that open the add-project modal
- Initial project-path state inside the modal

## Acceptance Criteria
- When the user opens the add-project flow from the portfolio, Prism immediately offers directory selection.
- If the user selects a directory, the modal opens with `Project path` already populated.
- If the selected directory has a trailing segment and the project name is blank, the create flow derives the name from that segment.
- If the user cancels directory selection, the add-project modal does not open.

## Out Of Scope
- Changing client creation fields or client data model
- Altering project registration validation rules
