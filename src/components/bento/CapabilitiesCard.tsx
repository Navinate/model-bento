interface CapabilitiesCardProps {
  data: { capabilities: string[] };
}

export function CapabilitiesCard({ data }: CapabilitiesCardProps) {
  return (
    <div className="col-span-2 row-span-1 rounded-3xl bg-white p-6" data-card>
      <p className="text-sm font-medium text-slate-500 mb-3">Capabilities</p>
      <div className="flex flex-wrap gap-2">
        {data.capabilities.map((cap) => (
          <span
            key={cap}
            className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
          >
            {cap}
          </span>
        ))}
      </div>
    </div>
  );
}
