import type { SVGProps } from "react";

export const PlanningCenterServicesIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 42 42"
    fill="none"
    aria-hidden="true"
    {...props}
  >
    <path
      fill="url(#services-color-logomark)"
      d="M21 0C4.196 0 0 4.2 0 21s4.197 21 21 21c16.801 0 21-4.197 21-21S37.8 0 21 0"
    />
    <path
      fill="var(--color-pc-services-foreground)"
      d="M11.398 16.544a2.216 2.216 0 1 0 0-4.433 2.216 2.216 0 0 0 0 4.433m0 7.209a2.216 2.216 0 1 0 0-4.432 2.216 2.216 0 0 0 0 4.432m0 7.21a2.216 2.216 0 1 0 0-4.433 2.216 2.216 0 0 0 0 4.433m20.016-15.649c0 .561-.455 1.016-1.016 1.016H17.036a1.016 1.016 0 0 1-1.016-1.016V13.34c0-.561.455-1.016 1.016-1.016h13.359c.56 0 1.015.455 1.015 1.016zm-15.391 4.851c0-.35.284-.632.633-.632h14.126c.349 0 .631.283.631.632v2.744a.63.63 0 0 1-.631.632H16.656a.63.63 0 0 1-.633-.632zm0 7.21c0-.35.284-.633.633-.633h14.126c.349 0 .631.283.631.633v2.744a.63.63 0 0 1-.631.632H16.656a.63.63 0 0 1-.633-.632z"
    />
    <defs>
      <linearGradient
        id="services-color-logomark"
        x1="-12.6"
        x2="21"
        y1="21"
        y2="54.599"
        gradientUnits="userSpaceOnUse"
      >
        <stop stopColor="var(--color-pc-services-gradient-start)" />
        <stop offset=".999" stopColor="var(--color-pc-services-gradient-end)" />
      </linearGradient>
    </defs>
  </svg>
);
