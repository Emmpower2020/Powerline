"use client";

import { useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/api-config";
import type { SearchableOption } from "@/components/searchable-select";

export interface ContractOptionRow {
  id: number;
  contract_code?: string | null;
  title?: string | null;
  contractor_name?: string | null;
  status?: string | null;
}

/** گزینه‌های قرارداد، مشترک همه فرم‌های عملیاتی */
export function useContractOptions(enabled = true) {
  const [rows, setRows] = useState<ContractOptionRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    apiClient.get<any>(API_ENDPOINTS.contracts, { page: 1, page_size: 1000 })
      .then((res) => {
        if (!alive) return;
        setRows((res?.data || []).map((r: any) => ({
          id: Number(r.id),
          contract_code: r.contract_code ?? null,
          title: r.title ?? null,
          contractor_name: r.contractor_name ?? null,
          status: r.status ?? null,
        })));
      })
      .catch(() => { if (alive) setRows([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [enabled]);

  const options = useMemo<SearchableOption[]>(() => rows.map((r) => ({
    value: String(r.id),
    label: r.title || `قرارداد #${r.id}`,
    // عنوان قرارداد اصلی است و نام پیمانکار مانند قبل به‌صورت توضیح کم‌رنگ نمایش داده می‌شود.
    description: r.contractor_name || undefined,
  })), [rows]);

  return { rows, options, loading };
}
