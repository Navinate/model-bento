interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <input
      type="text"
      data-search-input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search models..."
      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 placeholder-slate-400 outline-none focus:border-slate-400"
    />
  );
}
