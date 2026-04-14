interface LimitationsCardProps {
  data: { limitations: string[] };
}

export function LimitationsCard({ data }: LimitationsCardProps) {
  return (
    <div className="col-span-2 row-span-1 rounded-3xl bg-white p-6" data-card>
      <p className="text-sm font-medium text-slate-500 mb-3">Limitations</p>
      <ul className="space-y-1">
        {data.limitations.map((lim) => (
          <li key={lim} className="text-sm text-slate-600">
            • {lim}
          </li>
        ))}
      </ul>
    </div>
  );
}
