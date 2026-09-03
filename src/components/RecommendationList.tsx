export function RecommendationList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-col">
      {items.map((body, i) => (
        <div
          key={i}
          className={`py-[11px] text-[12.6px] text-[var(--ink-secondary)] ${
            i < items.length - 1 ? "border-b border-dashed border-[var(--border)]" : ""
          }`}
        >
          {body}
        </div>
      ))}
    </div>
  );
}
