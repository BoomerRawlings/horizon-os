type BrandMarkProps = {
  brand?: string;
  iconSrc?: string;
  label: string;
  className?: string;
};

export function BrandMark({ brand, iconSrc, label, className = "h-9 w-9" }: BrandMarkProps) {
  if (iconSrc) {
    return <img alt="" aria-hidden="true" className={`${className} object-contain`} decoding="async" loading="eager" src={iconSrc} title={label} />;
  }

  if (brand === "obsidian") {
    return (
      <span
        aria-hidden="true"
        className={`${className} rounded-[8px] bg-gradient-to-br from-violet-300 via-violet-600 to-indigo-950`}
        title={label}
      />
    );
  }

  if (brand === "microsoft") {
    return (
      <span
        aria-hidden="true"
        className={`grid ${className} grid-cols-2 grid-rows-2 gap-[2px]`}
        title={label}
      >
        <span className="min-h-0 min-w-0 bg-[#f25022]" />
        <span className="min-h-0 min-w-0 bg-[#7fba00]" />
        <span className="min-h-0 min-w-0 bg-[#00a4ef]" />
        <span className="min-h-0 min-w-0 bg-[#ffb900]" />
      </span>
    );
  }

  return null;
}
