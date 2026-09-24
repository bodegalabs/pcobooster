/** Shown for unknown paths and for accounts outside the admin allowlist. */
export const AdminNotFound = () => (
  <main className="bg-background flex min-h-0 flex-1 items-center justify-center px-4">
    <div className="flex items-center gap-5">
      <h1 className="border-border border-r pr-5 text-2xl leading-12.25 font-medium">
        404
      </h1>
      <h2 className="text-sm">This page could not be found.</h2>
    </div>
  </main>
);
