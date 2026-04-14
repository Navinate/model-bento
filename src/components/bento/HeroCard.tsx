interface HeroCardProps {
  data: { displayName: string; provider: string; description?: string };
}

export function HeroCard({ data }: HeroCardProps) {
  return (
    <div className="col-span-2 row-span-2 rounded-3xl bg-gradient-to-br from-slate-50 to-slate-100 p-8 flex flex-col justify-between" data-card>
      <div>
        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">
          {data.provider}
        </p>
        <h2 className="mt-2 text-4xl font-bold text-slate-900">{data.displayName}</h2>
      </div>
      {data.description && (
        <p className="mt-4 text-base text-slate-600 line-clamp-3">{data.description}</p>
      )}
    </div>
  );
}
