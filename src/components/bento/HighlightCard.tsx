interface HighlightCardProps {
  data: { label: string; value: string };
}

export function HighlightCard({ data }: HighlightCardProps) {
  return (
    <div className="col-span-1 row-span-1 rounded-3xl bg-white p-6 flex flex-col justify-between" data-card>
      <p className="text-sm font-medium text-slate-500">{data.label}</p>
      <p className="text-3xl font-bold text-slate-900">{data.value}</p>
    </div>
  );
}
