import type { SVGProps } from "react";

type HorizonIconProps = SVGProps<SVGSVGElement> & {
  strokeWidth?: number;
};

export function ConstellationIcon({ className, ...props }: HorizonIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M5.2 2.7 6.1 6l3.3.9-3.3.9-.9 3.3-.9-3.3L1 6.9 4.3 6l.9-3.3Z" fill="currentColor" />
      <path d="m15.4 3.8.65 2.35 2.35.65-2.35.65-.65 2.35-.65-2.35-2.35-.65 2.35-.65.65-2.35Z" fill="currentColor" />
      <path d="m10.7 11.1.75 2.7 2.7.75-2.7.75-.75 2.7-.75-2.7-2.7-.75 2.7-.75.75-2.7Z" fill="currentColor" />
      <path d="m19 13.5.7 2.5 2.5.7-2.5.7L19 20l-.7-2.6-2.5-.7 2.5-.7.7-2.5Z" fill="currentColor" />
      <circle cx="4.2" cy="17.6" fill="currentColor" r="1.25" />
    </svg>
  );
}

export function FocusIcon({ className, strokeWidth = 1.8, ...props }: HorizonIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <circle cx="12" cy="12" r="2.25" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M4.3 12c1.8-3.35 4.36-5.2 7.7-5.2s5.9 1.85 7.7 5.2c-1.8 3.35-4.36 5.2-7.7 5.2S6.1 15.35 4.3 12Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
      <path d="M12 3.5c2.25 1.2 3.45 3.02 3.45 5.2M12 20.5c-2.25-1.2-3.45-3.02-3.45-5.2" stroke="currentColor" strokeLinecap="round" strokeWidth={strokeWidth * 0.72} />
    </svg>
  );
}
