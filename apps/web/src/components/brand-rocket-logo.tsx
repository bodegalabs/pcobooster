export const BrandRocketLogo = ({ maskId }: { maskId: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="46 42 168 168"
    fill="none"
    aria-hidden
    className="text-chart-2 size-full overflow-visible"
  >
    <defs>
      <mask
        id={`${maskId}-fin-clearance`}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="256"
        height="256"
      >
        <rect
          width="256"
          height="256"
          fill="var(--color-pc-services-foreground)"
        />
        <path
          d="M121 103C158 89 196 100 219 122Q225 128 219 134C196 156 158 167 121 153Q112 149 112 140V116Q112 107 121 103Z"
          fill="var(--color-overlay-shadow)"
          stroke="var(--color-overlay-shadow)"
          strokeWidth="12"
          strokeLinejoin="round"
        />
      </mask>
      <mask
        id={`${maskId}-rocket-window`}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="256"
        height="256"
      >
        <rect
          width="256"
          height="256"
          fill="var(--color-pc-services-foreground)"
        />
        <circle cx="176" cy="128" r="13" fill="var(--color-overlay-shadow)" />
      </mask>
    </defs>
    <g className="sidebar-brand-rocket-flight">
      <g
        transform="translate(128 128) rotate(-45) scale(1.12) translate(-128 -128)"
        fill="currentColor"
      >
        <g mask={`url(#${maskId}-fin-clearance)`}>
          <path d="M150 104C137 90 127 83 118 82Q112 82 112 89V104Z" />
          <path d="M150 152C137 166 127 173 118 174Q112 174 112 167V152Z" />
        </g>
        <path
          d="M121 103C158 89 196 100 219 122Q225 128 219 134C196 156 158 167 121 153Q112 149 112 140V116Q112 107 121 103Z"
          mask={`url(#${maskId}-rocket-window)`}
        />
        <g className="sidebar-brand-rocket-exhaust">
          <rect x="71" y="104" width="33" height="12" rx="6" />
          <rect x="65" y="122" width="33" height="12" rx="6" />
          <rect x="71" y="140" width="33" height="12" rx="6" />
          <circle cx="59" cy="110" r="6" />
          <circle cx="53" cy="128" r="6" />
          <circle cx="59" cy="146" r="6" />
        </g>
      </g>
    </g>
  </svg>
);
