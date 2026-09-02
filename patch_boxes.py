# -*- coding: utf-8 -*-
import io

# ── کمکی: بازسازی create-dialogs.tsx با FormSection ──
p = 'src/components/create-dialogs.tsx'
s = io.open(p, encoding='utf-8').read()

# import
old_imp = 'import { ContractSelect } from "@/components/contract-select";'
assert old_imp in s
s = s.replace(old_imp, old_imp + '\nimport { FormSection } from "@/components/form-section";', 1)

# ── قرارداد: عنوان + پیمانکار/نوع در یک باکس؛ تاریخ‌ها/مبلغ در باکس دوم؛ توضیحات باکس سوم ──
old = """    <Shell open={open} onClose={onClose} title="قرارداد جدید" submitting={submitting} error={error} onSubmit={submit}>
      <Field label="عنوان (اجباری)"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="text-right" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="پیمانکار (اجباری)"><Select value={form.contractor_id} onValueChange={v => setForm({ ...form, contractor_id: v })}><SelectTrigger className="w-full"><SelectValue placeholder="انتخاب..." /></SelectTrigger><SelectContent className="max-h-60">{contractors.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.contractor_name}</SelectItem>)}</SelectContent></Select></Field>
        <Field label="نوع قرارداد"><Select value={form.contract_type} onValueChange={v => setForm({ ...form, contract_type: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maintenance">نگهداری</SelectItem><SelectItem value="construction">ساخت</SelectItem><SelectItem value="inspection">بازدید</SelectItem></SelectContent></Select></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="تاریخ شروع قرارداد">
          <Input value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} placeholder="1405/05/30" dir="ltr" className="text-left bg-white" />
        </Field>
        <Field label="تاریخ پایان قرارداد">
          <Input value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} placeholder="1405/05/30" dir="ltr" className="text-left bg-white" />
        </Field>
        <Field label="مبلغ (ریال)"><Input type="text" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, '') })} dir="ltr" className="text-left" /></Field>
      </div>
      <p className="text-[12px] text-slate-500 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2 text-right">
        توضیح: تاریخ می‌بایست با فرمت <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400" dir="ltr">1405/05/30</span> نوشته شود
      </p>
      <Field label="توضیحات"><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="text-right" /></Field>
    </Shell>"""
new = """    <Shell open={open} onClose={onClose} title="قرارداد جدید" submitting={submitting} error={error} onSubmit={submit}>
      <FormSection title="اطلاعات اصلی">
        <Field label="عنوان (اجباری)"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="text-right" /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="پیمانکار (اجباری)"><Select value={form.contractor_id} onValueChange={v => setForm({ ...form, contractor_id: v })}><SelectTrigger className="w-full"><SelectValue placeholder="انتخاب..." /></SelectTrigger><SelectContent className="max-h-60">{contractors.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.contractor_name}</SelectItem>)}</SelectContent></Select></Field>
          <Field label="نوع قرارداد"><Select value={form.contract_type} onValueChange={v => setForm({ ...form, contract_type: v })}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="maintenance">نگهداری</SelectItem><SelectItem value="construction">ساخت</SelectItem><SelectItem value="inspection">بازدید</SelectItem></SelectContent></Select></Field>
        </div>
      </FormSection>
      <FormSection title="تاریخ‌ها و مبلغ" accent="bg-indigo-600">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="تاریخ شروع قرارداد">
            <Input value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} placeholder="1405/05/30" dir="ltr" className="text-left bg-white" />
          </Field>
          <Field label="تاریخ پایان قرارداد">
            <Input value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} placeholder="1405/05/30" dir="ltr" className="text-left bg-white" />
          </Field>
          <Field label="مبلغ (ریال)"><Input type="text" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value.replace(/[^0-9]/g, '') })} dir="ltr" className="text-left" /></Field>
        </div>
        <p className="text-[12px] text-slate-500 text-right">
          توضیح: تاریخ می‌بایست با فرمت <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400" dir="ltr">1405/05/30</span> نوشته شود
        </p>
      </FormSection>
      <FormSection title="توضیحات" accent="bg-slate-400">
        <Field label="توضیحات"><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="text-right" /></Field>
      </FormSection>
    </Shell>"""
assert old in s, 'contract dialog block not found'
s = s.replace(old, new, 1)

# ── حادثه ایمنی ──
old = """    <Shell open={open} onClose={onClose} title="ثبت حادثه ایمنی" submitting={submitting} error={error} onSubmit={submit}>
      <Field label="عنوان (اجباری)"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="text-right" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="نوع حادثه">"""
new = """    <Shell open={open} onClose={onClose} title="ثبت حادثه ایمنی" submitting={submitting} error={error} onSubmit={submit}>
      <FormSection title="اطلاعات حادثه">
      <Field label="عنوان (اجباری)"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="text-right" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="نوع حادثه">"""
assert old in s
s = s.replace(old, new, 1)
old = """      <Field label="توضیحات"><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="text-right" /></Field>
    </Shell>"""
new = """      <Field label="توضیحات"><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="text-right" /></Field>
      </FormSection>
    </Shell>"""
assert old in s
s = s.replace(old, new, 1)

# ── پرسنل (create-dialogs) ──
old = """    <Shell open={open} onClose={onClose} title="ثبت پرسنل جدید" submitting={submitting} error={error} onSubmit={submit}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="نام (اجباری)"><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="text-right" /></Field>
        <Field label="نام خانوادگی"><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="text-right" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="سمت"><Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="text-right" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="تلفن"><Input value={form.contractor_phone} onChange={e => setForm({ ...form, contractor_phone: e.target.value })} dir="ltr" className="text-left" /></Field>
        <Field label="موبایل"><Input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} dir="ltr" className="text-left" /></Field>
        <Field label="تاریخ استخدام"><JalaliDatePicker value={form.hire_date} onChange={v => setForm({ ...form, hire_date: v })} /></Field>
      </div>
      <Field label="ایمیل"><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} dir="ltr" className="text-left" /></Field>
    </Shell>"""
new = """    <Shell open={open} onClose={onClose} title="ثبت پرسنل جدید" submitting={submitting} error={error} onSubmit={submit}>
      <FormSection title="اطلاعات فردی">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="نام (اجباری)"><Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="text-right" /></Field>
          <Field label="نام خانوادگی"><Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="text-right" /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="سمت"><Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="text-right" /></Field>
        </div>
      </FormSection>
      <FormSection title="اطلاعات تماس" accent="bg-indigo-600">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="تلفن"><Input value={form.contractor_phone} onChange={e => setForm({ ...form, contractor_phone: e.target.value })} dir="ltr" className="text-left" /></Field>
          <Field label="موبایل"><Input value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} dir="ltr" className="text-left" /></Field>
          <Field label="تاریخ استخدام"><JalaliDatePicker value={form.hire_date} onChange={v => setForm({ ...form, hire_date: v })} /></Field>
        </div>
        <Field label="ایمیل"><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} dir="ltr" className="text-left" /></Field>
      </FormSection>
    </Shell>"""
assert old in s
s = s.replace(old, new, 1)

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('create-dialogs: contract/safety/personnel sectioned')
