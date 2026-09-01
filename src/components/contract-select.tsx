"use client";

import { SearchableSelect } from "@/components/searchable-select";
import { useContractOptions } from "@/hooks/use-contract-options";

export function ContractSelect({
  value,
  onChange,
  disabled = false,
  placeholder = "انتخاب قرارداد...",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const { options, loading } = useContractOptions(true);
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={loading ? "در حال بارگذاری قراردادها..." : placeholder}
      searchPlaceholder="جستجوی کد یا عنوان قرارداد..."
      allowClear
      disabled={disabled}
    />
  );
}
