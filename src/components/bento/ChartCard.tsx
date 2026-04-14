import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts';

interface ChartCardProps {
  data: { benchmarks: Array<{ name: string; score: number }> };
}

export function ChartCard({ data }: ChartCardProps) {
  return (
    <div className="col-span-2 row-span-2 rounded-3xl bg-white p-6" data-card>
      <p className="text-sm font-medium text-slate-500 mb-4">Benchmarks</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data.benchmarks} layout="vertical">
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12 }} />
          <Bar dataKey="score" radius={[0, 4, 4, 0]}>
            {data.benchmarks.map((_, i) => (
              <Cell key={i} fill="#1e293b" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
