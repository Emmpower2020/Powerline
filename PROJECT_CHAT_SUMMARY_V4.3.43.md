# Project Chat Summary — Powerline Web v4.3.43

## This turn
- Contractor module aligned to the current live DB structure:
  `id`, `contractor_code`, `contractor_name`, `ceo_name`, `contractor_phone`, `mobile`, `address`, `status`, `created_at`, `updated_at`.
- Removed contractor dependence on `organization_id` from contractor CRUD code.
- Contractor API now reads/writes the live column names (`contractor_name`, `contractor_phone`).
- Fixed contract/purchases/work-order/invoice/crew joins to use `contractor_name` instead of the old `contractors.name`.
- Contractor form/editor/import keys now match the live DB.
- Existing contract creation bug was addressed: contractor lookup in the contract dialog and contract listing now use `contractor_name`, avoiding the stale `ct.name` SQL reference.
- Removed duplicate generic bulk-operation button from Lines and Towers; their specialized bulk menus remain.
- Added Contract bulk-change action into the specialized Lines and Towers bulk menus, so the contract operation is still available without duplicate buttons.
- Conductors (wire types) remain outside contract scope.

## Current contractor field names
- `id`
- `contractor_code`
- `contractor_name`
- `ceo_name`
- `contractor_phone`
- `mobile`
- `address`
- `status`
- `created_at`
- `updated_at`
