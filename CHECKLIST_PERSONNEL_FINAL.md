# Checklist - Personnel final cleanup

- [ ] Backup the database.
- [ ] Run `database/migration_v4.3.68_personnel_cleanup.sql` once.
- [ ] Confirm `personnel_type`, `phone`, `collaboration_start`, `contract_end_date` are removed.
- [ ] Confirm `position`, `mobile`, `hire_date`, `father_name`, `supervisor_name` exist.
- [ ] Push this source to GitHub.
- [ ] Deploy on Vercel.
- [ ] Test Personnel list, create/edit, Excel import/export, and line/tower personnel selectors.
