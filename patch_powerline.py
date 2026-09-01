from pathlib import Path
root=Path('/mnt/data/Github_work')

def p(path): return root/path

def replace(path, old, new, count=-1):
    f=p(path); s=f.read_text(); n=s.count(old)
    if n<count if count!=-1 else False: raise SystemExit(f'not enough {path}: {n} < {count}')
    if n==0: raise SystemExit(f'not found {path}: {old[:80]}')
    f.write_text(s.replace(old,new,count if count!=-1 else -1))

# Generic module config + contract selector
f=p('src/components/pages/generic-module-page.tsx'); s=f.read_text()
s=s.replace('import { Loader2, Plus, Upload as UploadIcon } from "lucide-react";', 'import { Loader2, Plus, Upload as UploadIcon } from "lucide-react";\nimport { ContractSelect } from "@/components/contract-select";')
s=s.replace('invoices: { title: "صورت‌وضعیت‌ها", editKeys: ["contract_id","contractor_id","period_start","period_end","total_amount"], importKeys: ["contract_id","contractor_id","period_start","period_end","total_amount"], columns: [\n    { key: "invoice_code", header: "کد", sortable: true, filterable: true, align: "left" },\n    { key: "contractor_name", header: "پیمانکار", sortable: true, filterable: true },', 'invoices: { title: "صورت‌وضعیت‌ها", editKeys: ["contract_id","contractor_id","period_start","period_end","total_amount"], importKeys: ["contract_id","contractor_id","period_start","period_end","total_amount"], columns: [\n    { key: "invoice_code", header: "کد", sortable: true, filterable: true, align: "left" },\n    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },\n    { key: "contractor_name", header: "پیمانکار", sortable: true, filterable: true },')
s=s.replace('"safety-incidents": { title: "حوادث ایمنی", create: "safety", editKeys: ["title","incident_type","severity","description","location_desc","occurred_at","status"], importKeys: ["title","incident_type","severity","description","location_desc","occurred_at"], columns: [\n    { key: "incident_code", header: "کد", sortable: true, filterable: true, align: "left" },', '"safety-incidents": { title: "حوادث ایمنی", create: "safety", editKeys: ["contract_id","title","incident_type","severity","description","location_desc","occurred_at","status"], importKeys: ["contract_id","title","incident_type","severity","description","location_desc","occurred_at"], columns: [\n    { key: "incident_code", header: "کد", sortable: true, filterable: true, align: "left" },\n    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },')
s=s.replace('"line-incidents": { title: "حوادث خطوط", create: "safety", editKeys: ["title","incident_type","severity","description","location_desc","occurred_at","line_id","tower_id","status"], importKeys: ["title","incident_type","severity","description","location_desc","occurred_at","line_id","tower_id"], columns: [\n    { key: "incident_code", header: "کد", sortable: true, filterable: true, align: "left" },', '"line-incidents": { title: "حوادث خطوط", create: "safety", editKeys: ["contract_id","title","incident_type","severity","description","location_desc","occurred_at","line_id","tower_id","status"], importKeys: ["contract_id","title","incident_type","severity","description","location_desc","occurred_at","line_id","tower_id"], columns: [\n    { key: "incident_code", header: "کد", sortable: true, filterable: true, align: "left" },\n    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },')
s=s.replace('personnel: { title: "پرسنل", create: "personnel", editKeys: ["first_name","last_name","personnel_type","position","phone","mobile","email"], importKeys: ["first_name","last_name","personnel_type","position","phone","mobile","email"], columns: [\n    { key: "personnel_code", header: "کد", sortable: true, filterable: true, align: "left" },', 'personnel: { title: "پرسنل", create: "personnel", editKeys: ["contract_id","first_name","last_name","personnel_type","position","phone","mobile","email"], importKeys: ["contract_id","first_name","last_name","personnel_type","position","phone","mobile","email"], columns: [\n    { key: "personnel_code", header: "کد", sortable: true, filterable: true, align: "left" },\n    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },')
s=s.replace('equipment: { title: "تجهیزات", create: "equipment", editKeys: ["serial_number","manufacturer","model","install_date","warranty_expiry","is_active"], importKeys: ["serial_number","manufacturer","model","install_date","warranty_expiry"], columns: [\n    { key: "serial_number", header: "سریال", sortable: true, filterable: true, align: "left" },', 'equipment: { title: "تجهیزات", create: "equipment", editKeys: ["contract_id","serial_number","manufacturer","model","install_date","warranty_expiry","is_active"], importKeys: ["contract_id","serial_number","manufacturer","model","install_date","warranty_expiry"], columns: [\n    { key: "serial_number", header: "سریال", sortable: true, filterable: true, align: "left" },\n    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },')
# Special contract input in generic editor
old='{keys.map(k => <div key={k} className="space-y-1">\n            <label className="text-sm text-slate-600">{k}</label>\n            {k === "notes" || k === "description" || k === "address" ? <Textarea value={form[k] || ""} onChange={e => setForm({...form,[k]:e.target.value})} /> : <Input value={form[k] || ""} onChange={e => setForm({...form,[k]:e.target.value})} dir={/(_id|amount|phone|mobile)/.test(k) ? "ltr" : "rtl"} />}\n          </div>)}'
new='{keys.map(k => <div key={k} className="space-y-1">\n            <label className="text-sm text-slate-600">{k === "contract_id" ? "قرارداد" : k}</label>\n            {k === "contract_id" ? <ContractSelect value={form[k] || ""} onChange={v => setForm({...form, [k]: v})} />\n              : k === "notes" || k === "description" || k === "address" ? <Textarea value={form[k] || ""} onChange={e => setForm({...form,[k]:e.target.value})} />\n              : <Input value={form[k] || ""} onChange={e => setForm({...form,[k]:e.target.value})} dir={/(_id|amount|phone|mobile)/.test(k) ? "ltr" : "rtl"} />}\n          </div>)}'
if old not in s: raise SystemExit('generic editor pattern missing')
s=s.replace(old,new)
f.write_text(s)

# Lines UI + form/import
f=p('src/components/create-line-dialog.tsx'); s=f.read_text()
s=s.replace('import { useTowerReferences } from "@/hooks/use-tower-references";', 'import { useTowerReferences } from "@/hooks/use-tower-references";\nimport { ContractSelect } from "@/components/contract-select";')
s=s.replace('  line_supervisor: string; line_expert: string; notes: string;', '  line_supervisor: string; line_expert: string; notes: string; contract_id: string;')
s=s.replace('  commission_year: "", line_supervisor: "", line_expert: "", notes: "",\n};', '  commission_year: "", line_supervisor: "", line_expert: "", notes: "", contract_id: "",\n};')
s=s.replace('          notes: sourceRow.notes || "",\n        });', '          notes: sourceRow.notes || "",\n          contract_id: sourceRow.contract_id != null ? String(sourceRow.contract_id) : "",\n        });')
s=s.replace('        notes: form.notes || null,\n      };', '        notes: form.notes || null,\n        contract_id: form.contract_id ? Number(form.contract_id) : null,\n      };')
needle='            <Field label="نام مجموعه خط"><Input value={form.group_name} onChange={e => set("group_name", e.target.value)} className="text-right" /></Field>\n            <Field label="نام خط (اجباری)"><Input value={form.name} onChange={e => set("name", e.target.value)} className="text-right" /></Field>'
repl='            <Field label="نام مجموعه خط"><Input value={form.group_name} onChange={e => set("group_name", e.target.value)} className="text-right" /></Field>\n            <Field label="نام خط (اجباری)"><Input value={form.name} onChange={e => set("name", e.target.value)} className="text-right" /></Field>\n            <Field label="قرارداد"><ContractSelect value={form.contract_id} onChange={v => set("contract_id", v)} /></Field>'
if needle not in s: raise SystemExit('line form fields missing')
s=s.replace(needle,repl)
f.write_text(s)

f=p('src/components/pages/lines-page.tsx'); s=f.read_text()
s=s.replace('      "owner_org_id", "contractor_id", "is_active",', '      "owner_org_id", "contractor_id", "contract_id", "is_active",')
s=s.replace('                    "owner_org_id", "contractor_id"].includes(key)', '                    "owner_org_id", "contractor_id", "contract_id"].includes(key)')
s=s.replace('    { key: "line_name", header: "نام خط", sortable: true, filterable: true, wrap: true,', '    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true, width: "240px", align: "right" },\n    { key: "line_name", header: "نام خط", sortable: true, filterable: true, wrap: true,')
# search keys line
s=s.replace('searchKeys={["line_code", "line_name", "dispatch_code", "conductor_type", "tower_structure", "voltage_kv", "contractor_name"]}', 'searchKeys={["line_code", "line_name", "dispatch_code", "conductor_type", "tower_structure", "voltage_kv", "contractor_name", "contract_title"]}')
f.write_text(s)

# Towers UI/form/import
f=p('src/components/towers/create-tower-dialog.tsx'); s=f.read_text()
s=s.replace('import { Loader2, Sparkles } from "lucide-react";', 'import { Loader2, Sparkles } from "lucide-react";\nimport { ContractSelect } from "@/components/contract-select";') if 'import { Loader2' in s else s
# actual icon import line inspect-safe generic import replacement
if 'ContractSelect' not in s:
    s=s.replace('import { Loader2,', 'import { ContractSelect } from "@/components/contract-select";\nimport { Loader2,')
# add contract in form object by finding typical structure
s=s.replace('    line_supervisor: "",', '    line_supervisor: "",\n    contract_id: "",')
s=s.replace('      line_supervisor: sourceRow?.line_supervisor || "",', '      line_supervisor: sourceRow?.line_supervisor || "",\n      contract_id: sourceRow?.contract_id != null ? String(sourceRow.contract_id) : "",')
s=s.replace('        line_supervisor: form.line_supervisor || null,', '        line_supervisor: form.line_supervisor || null,\n        contract_id: form.contract_id ? Number(form.contract_id) : null,')
# insert field near line selector after it (first label occurrence)
needle='              <div className="space-y-2">\n                <Label>خط انتقال</Label>'
if needle in s:
    # use a later, simple insertion before dialog footer if label uncertain
    pass
# robust insert before first closing section after line selector by adding field before "کد دکل" label if present
for marker in ['<Label>کد دکل</Label>', '<Label>شماره دکل</Label>']:
    if marker in s:
        s=s.replace(marker, '<Label>قرارداد</Label>\n              <ContractSelect value={form.contract_id} onChange={v => setForm(p => ({ ...p, contract_id: v }))} />\n            </div>\n            <div className="space-y-2">\n              '+marker, 1)
        break
f.write_text(s)

f=p('src/components/pages/towers-page.tsx'); s=f.read_text()
s=s.replace('      "line_id", "tower_code", "tower_number", "tower_structure",', '      "line_id", "tower_code", "tower_number", "tower_structure",\n      "contract_id",')
s=s.replace('"insulator_count_r2", "insulator_count_s2", "insulator_count_t2", "line_id"].includes(key)', '"insulator_count_r2", "insulator_count_s2", "insulator_count_t2", "line_id", "contract_id"].includes(key)')
s=s.replace('{ key: "tower_code", header: "کد دکل", sortable: true, filterable: true, align: "right" },', '{ key: "tower_code", header: "کد دکل", sortable: true, filterable: true, align: "right" },\n    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true, align: "right" },')
s=s.replace('"tower_type", "tower_type_code", "line_supervisor", "voltage_kv"]', '"tower_type", "tower_type_code", "line_supervisor", "voltage_kv", "contract_title"]')
f.write_text(s)

# Circuits
f=p('src/components/pages/circuits-page.tsx'); s=f.read_text()
s=s.replace('import { GenericBulkActions } from "@/components/generic-bulk-actions";', 'import { GenericBulkActions } from "@/components/generic-bulk-actions";\nimport { ContractSelect } from "@/components/contract-select";')
s=s.replace('  created_at?: string | null;\n}', '  contract_id?: number | null;\n  contract_title?: string | null;\n  created_at?: string | null;\n}')
s=s.replace('{ key: "dispatch_code", header: "کد دیسپاچینگ", sortable: true, filterable: true, align: "right",', '{ key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true, align: "right" },\n    { key: "dispatch_code", header: "کد دیسپاچینگ", sortable: true, filterable: true, align: "right",')
s=s.replace('  const [form, setForm] = useState({ dispatch_code: "", name: "", voltage: "" });', '  const [form, setForm] = useState({ dispatch_code: "", name: "", voltage: "", contract_id: "" });')
s=s.replace('        voltage: sourceRow?.voltage != null ? String(sourceRow.voltage) : "",\n      });', '        voltage: sourceRow?.voltage != null ? String(sourceRow.voltage) : "",\n        contract_id: sourceRow?.contract_id != null ? String(sourceRow.contract_id) : "",\n      });')
s=s.replace('        voltage: Number(form.voltage),\n      };', '        voltage: Number(form.voltage),\n        contract_id: form.contract_id ? Number(form.contract_id) : null,\n      };')
needle='          <div className="space-y-2">\n            <Label className="text-right block">نام مدار</Label>'
if needle in s:
    s=s.replace(needle, '          <div className="space-y-2">\n            <Label className="text-right block">قرارداد</Label>\n            <ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v })} />\n          </div>\n'+needle,1)
f.write_text(s)

# Personnel UI
f=p('src/components/pages/personnel-page.tsx'); s=f.read_text()
if 'ContractSelect' not in s: s=s.replace('import { SearchableSelect } from "@/components/searchable-select";', 'import { SearchableSelect } from "@/components/searchable-select";\nimport { ContractSelect } from "@/components/contract-select";')
s=s.replace('  mobile?: string | null;\n}', '  mobile?: string | null;\n  contract_id?: number | null;\n  contract_title?: string | null;\n}')
s=s.replace('{ key: "personnel_code", header: "کد", sortable: true, filterable: true, align: "left" },', '{ key: "personnel_code", header: "کد", sortable: true, filterable: true, align: "left" },\n    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },')
s=s.replace('    collaboration_start: "",\n  });', '    collaboration_start: "",\n    contract_id: "",\n  });')
s=s.replace('        collaboration_start: sourceRow?.collaboration_start || "",\n      });', '        collaboration_start: sourceRow?.collaboration_start || "",\n        contract_id: sourceRow?.contract_id != null ? String(sourceRow.contract_id) : "",\n      });')
s=s.replace('        collaboration_start: form.collaboration_start.trim() || null,\n      };', '        collaboration_start: form.collaboration_start.trim() || null,\n        contract_id: form.contract_id ? Number(form.contract_id) : null,\n      };')
needle='          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">\n            <div className="space-y-2">\n              <Label className="text-right block">نوع پرسنل (اجباری)</Label>'
if needle in s:
    s=s.replace(needle, '          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">\n            <div className="space-y-2">\n              <Label className="text-right block">قرارداد</Label>\n              <ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v })} />\n            </div>\n            <div className="space-y-2">\n              <Label className="text-right block">نوع پرسنل (اجباری)</Label>',1)
f.write_text(s)

# Defects UI
f=p('src/components/defects/create-defect-dialog.tsx'); s=f.read_text()
if 'ContractSelect' not in s: s=s.replace('import { SearchableSelect } from "@/components/searchable-select";', 'import { SearchableSelect } from "@/components/searchable-select";\nimport { ContractSelect } from "@/components/contract-select";')
s=s.replace('    defect_type: "",\n  });', '    defect_type: "",\n    contract_id: "",\n  });')
s=s.replace('          defect_type: sourceRow.defect_type || (sourceRow as any).category_name || "",\n        });', '          defect_type: sourceRow.defect_type || (sourceRow as any).category_name || "",\n          contract_id: sourceRow.contract_id != null ? String(sourceRow.contract_id) : "",\n        });')
s=s.replace('        location_desc: form.location_desc.trim() || null,\n      };', '        location_desc: form.location_desc.trim() || null,\n        contract_id: form.contract_id ? Number(form.contract_id) : null,\n      };')
# add before title block
needle='          <div className="space-y-2">\n            <Label className="text-right block">عنوان عیب (اجباری)</Label>'
if needle in s: s=s.replace(needle, '          <div className="space-y-2">\n            <Label className="text-right block">قرارداد</Label>\n            <ContractSelect value={form.contract_id} onChange={v => setForm({ ...form, contract_id: v })} />\n          </div>\n\n'+needle,1)
f.write_text(s)

# Defects columns
f=p('src/components/pages/defects-page.tsx'); s=f.read_text()
s=s.replace('{ key: "defect_code", header: "کد عیب",', '{ key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },\n    { key: "defect_code", header: "کد عیب",',1)
f.write_text(s)

# Inspection/work order page: add contract column (forms patched later through create-dialogs)
f=p('src/components/pages/inspections-work-orders-page.tsx'); s=f.read_text()
# Add contract column right after code in each table
s=s.replace('{ key: "inspection_code", header: "کد",', '{ key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },\n    { key: "inspection_code", header: "کد",',1)
s=s.replace('{ key: "wo_code", header: "کد",', '{ key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },\n    { key: "wo_code", header: "کد",',1)
f.write_text(s)

# Price lists: contract column on list selector table/items and create form later simple
f=p('src/components/pages/price-lists-page.tsx'); s=f.read_text()
s=s.replace('interface PriceList {', 'interface PriceList {')
s=s.replace('  id: number;\n  name: string;', '  id: number;\n  contract_id?: number | null;\n  contract_title?: string | null;\n  name: string;',1)
s=s.replace('  const columns: DataTableColumn<PriceListItem>[] = [', '  const columns: DataTableColumn<PriceListItem>[] = [\n    { key: "contract_title", header: "قرارداد", sortable: true, filterable: true, wrap: true },')
# use selected list-derived contract in items without changing item schema
s=s.replace('const [items, setItems] = useState<PriceListItem[]>([]);', 'const [items, setItems] = useState<PriceListItem[]>([]);')
s=s.replace('setItems(res?.data || []);', 'setItems((res?.data || []).map((item: any) => ({ ...item, contract_title: selectedList?.contract_title || null })));')
# Need selectedList declared before load? likely loadItems can capture; see compile later.
f.write_text(s)

print('patched')
