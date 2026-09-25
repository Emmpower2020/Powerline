-- ============================================================
-- کنترل داده‌های نمونه Powerline
-- ============================================================

SELECT 'contracts' AS table_name, COUNT(*) AS demo_count FROM contracts WHERE id >= 90000 AND contract_code LIKE 'DEMO-%'
UNION ALL
SELECT 'crews', COUNT(*) FROM crews WHERE id >= 90000 AND crew_code LIKE 'DEMO-%'
UNION ALL
SELECT 'inspections', COUNT(*) FROM inspections WHERE id >= 90000 AND inspection_code LIKE 'DEMO-%'
UNION ALL
SELECT 'defects', COUNT(*) FROM defects WHERE id >= 90000 AND defect_code LIKE 'DEMO-%'
UNION ALL
SELECT 'work_orders', COUNT(*) FROM work_orders WHERE id >= 90000 AND wo_code LIKE 'DEMO-%'
UNION ALL
SELECT 'invoices', COUNT(*) FROM invoices WHERE id >= 90000 AND invoice_code LIKE 'DEMO-%';

-- برنامه بازدید نمونه و ارتباط با خط/دکل/اکیپ
SELECT
    i.inspection_code,
    i.inspection_date,
    i.status,
    c.name AS crew_name,
    l.line_code,
    l.name AS line_name,
    t.tower_code,
    t.tower_number
FROM inspections i
LEFT JOIN crews c ON c.id = i.crew_id
LEFT JOIN lines l ON l.id = i.line_id
LEFT JOIN towers t ON t.id = i.tower_id
WHERE i.id >= 90000
ORDER BY i.inspection_date, i.id;

-- عیب‌ها و مسیر تأیید/تعمیر
SELECT
    d.defect_code,
    d.title,
    d.status,
    i.inspection_code,
    t.tower_code,
    wo.wo_code,
    wo.status AS work_order_status
FROM defects d
LEFT JOIN inspections i ON i.id = d.inspection_id
LEFT JOIN towers t ON t.id = d.tower_id
LEFT JOIN work_orders wo ON wo.defect_id = d.id
WHERE d.id >= 90000
ORDER BY d.id;

-- اقلام صورت‌وضعیت دمو
SELECT
    inv.invoice_code,
    inv.status AS invoice_status,
    ii.description,
    ii.unit,
    ii.quantity,
    ii.unit_price,
    ii.total_price
FROM invoice_items ii
JOIN invoices inv ON inv.id = ii.invoice_id
WHERE inv.id = 90001
ORDER BY ii.id;

-- جمع صورت‌وضعیت دمو
SELECT
    invoice_code,
    total_amount,
    tax_amount,
    final_amount,
    status
FROM invoices
WHERE id = 90001;
