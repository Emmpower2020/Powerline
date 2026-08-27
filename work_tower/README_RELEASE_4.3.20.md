# Powerline Web v4.3.20

## Database Compatibility Fix

Fixed the line create/update/import endpoint to match the actual `lines` table schema from the supplied SQL dump.

### Fix
- Removed references to the non-existent `lines.voltage` column.
- `voltage_kv` is now the single database field used for voltage.
- API response still exposes `voltage` as a compatibility alias mapped from `voltage_kv` so the frontend does not break.
- Bulk import no longer attempts to insert into the non-existent `voltage` column.

Verified with PHP syntax check: `api_powerline/endpoints/lines.php` has no syntax errors.
