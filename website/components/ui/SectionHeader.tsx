type Props = {
  eyebrow: string;
  title: string;
  subtitle?: string;
};

export function SectionHeader({ eyebrow, title, subtitle }: Props) {
  return (
    <div className="mx-auto mb-8 max-w-3xl text-center">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">{eyebrow}</p>
      <h2 className="mb-3 text-3xl font-semibold text-white sm:text-4xl">{title}</h2>
      {subtitle ? <p className="text-violet-100/80">{subtitle}</p> : null}
    </div>
  );
}
