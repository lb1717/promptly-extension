type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
};

export function SectionHeader({ eyebrow, title, subtitle, className = "mb-8" }: Props) {
  return (
    <div className={`mx-auto max-w-3xl text-center ${className}`}>
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-faint">{eyebrow}</p>
      ) : null}
      <h2 className={`text-3xl font-semibold text-ink sm:text-4xl ${subtitle ? "mb-3" : ""}`}>{title}</h2>
      {subtitle ? <p className="text-muted">{subtitle}</p> : null}
    </div>
  );
}
