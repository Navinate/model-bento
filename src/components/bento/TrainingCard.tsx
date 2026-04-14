interface TrainingCardProps {
  data: { trainingDataCutoff: string };
}

export function TrainingCard({ data }: TrainingCardProps) {
  return (
    <div className="col-span-2 row-span-1 rounded-3xl bg-white p-6 flex flex-col justify-between" data-card>
      <p className="text-sm font-medium text-slate-500">Training Data</p>
      <p className="text-2xl font-bold text-slate-900">Cutoff: {data.trainingDataCutoff}</p>
    </div>
  );
}
