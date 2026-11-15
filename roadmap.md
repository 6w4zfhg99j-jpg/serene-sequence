# Stretching workflow
- [x] Diagnose and repair sequence creation without weakening private write access.
- [x] Separate Yoga and Stretching gallery/category views while sharing pose records.
- [x] Verify create, save, reopen and edit for both practice modes, including offline persistence.

# Offline desktop audit
- [x] Correct local startup, core data access, bundled library and essential assets without overwriting existing data.
- [x] Test offline pose and sequence workflows, SQLite migrations, images and database reopen persistence (not a packaged Mac restart).
- [x] Document audit findings and Mac-specific validation steps.
- [ ] Test the actual packaged macOS app disconnected (requires macOS; this environment is Linux).

# Independent exercise assignment
- [x] Add explicit Yoga / Stretching / Both membership to local exercises and the pose editor.
- [x] Filter gallery and builder by membership while preserving category structures and saved-sequence references.
- [x] Verify assignment changes, shared edits, legacy preservation and offline persistence (37 tests and browser workflow passed).

# Uncategorized system section
- [x] Add an always-last automatic Uncategorized filter and section in the gallery and builder without storing a category or changing existing data.
- [x] Verify category changes, mode membership, protected system behavior and persistence through browser and SQLite reopen (45 tests and browser create/edit/reload/sequence workflow passed).