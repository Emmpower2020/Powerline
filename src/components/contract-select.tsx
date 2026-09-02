"use client";

import { SearchableSelect } from "@/components/searchable-select";
import { useContractOptions } from "@/hooks/use-contract-options";

export function ContractSelect({
  value,
  onChange,
  disabled = false,
  placeholder = "انتخاب قرارداد...",
  className,
  preserveUnknownValue = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  preserveUnknownValue?: boolean;
}) {
  const { options, loading } = useContractOptions(true);

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={loading ? "در حال بارگذاری قراردادها..." : placeholder}
      searchPlaceholder="جستجوی عنوان قرارداد..."
      disabled={disabled}
      className={className}
      preserveUnknownValue={preserveUnknownValue}
      optionItemClassName="hover:bg-indigo-50 hover:text-indigo-800 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-200"
    />
  );
}
