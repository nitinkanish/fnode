interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-[10px] bg-card text-center">
      <p className="text-[13px] font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-[12px] text-muted-foreground">{description}</p>
    </div>
  );
}
