# Stretching workflow
- [x] Diagnose and repair sequence creation without weakening private write access.
- [x] Separate Yoga and Stretching gallery/category views while sharing pose records.
- [x] Verify create, save, reopen and edit for both practice modes, including offline persistence.

# Offline desktop audit
- [x] Correct local startup, core data access, bundled library and essential assets without overwriting existing data.
- [x] Test offline pose and sequence workflows, SQLite migrations, images and database reopen persistence (not a packaged Mac restart).
- [x] Document audit findings and Mac-specific validation steps.
- [ ] Test the actual packaged macOS app disconnected (requires macOS; this environment is Linux).