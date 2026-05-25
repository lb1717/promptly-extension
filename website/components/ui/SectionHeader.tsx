type Props = {
  eyebrow: string;
  title: string;
  subtitle?: string;
};

export function SectionHeader({ eyebrow, title, subtitle }: Props) {
  return (
    <div className="mx-auto mb-8 max-w-3xl text-center">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-faint">{eyebrow}</p>
      <h2 className="mb-3 text-3xl font-semibold text-ink sm:text-4xl">{title}</h2>
      {subtitle ? <p className="text-muted">{subtitle}</p> : null}
    </div>
  );
}
