/** White flag — "show me the solution". Sits in the header like Journeyman's. */
export default function FlagIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "inline-block", verticalAlign: "-0.18em" }}
    >
      <path d="M4 22V3" />
      <path d="M4 4c3-2 6-2 9 0s6 2 8 0v10c-2 2-5 2-8 0s-6-2-9 0" fill="currentColor" fillOpacity={0.12} />
    </svg>
  );
}
