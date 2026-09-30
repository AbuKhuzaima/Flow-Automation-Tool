---
name: Flow UI / Selector Update Report
about: Report a change in Google Flow's DOM or UI that affects automation
title: '[FLOW DOM UPDATE] '
labels: dom-update, needs-triage
assignees: ''
---

**Which element changed?**
- [ ] Prompt Input Textarea / Box
- [ ] Submit / Generate Arrow Button
- [ ] Generation In-Progress Indicator (Spinner/Progressbar)
- [ ] Generation Completed Signal
- [ ] Download Button / Link
- [ ] Flow Page URL / Routing

**Flow Page URL:**
e.g. `https://flow.google.com` or `https://labs.google/flow` or internal test URL.

**Observed Behavior:**
What error or status message does the extension show? (e.g. "Could not locate Flow prompt input" or "Submit button not found").

**Inspected HTML Snippet:**
Please open Chrome Developer Tools (`Ctrl+Shift+I` or `Cmd+Option+I`), inspect the target element, and paste its outer HTML or key attributes:

```html
<!-- Paste the element's HTML here -->
```

**Key Attributes Identified:**
- `aria-label`: 
- `placeholder`: 
- `role`: 
- `class`: 
- `data-testid`: 
- SVG icon paths (if applicable):

**Proposed Fix (if known):**
Which selector or heuristic should be added to `src/content/flow-selectors.ts`?
