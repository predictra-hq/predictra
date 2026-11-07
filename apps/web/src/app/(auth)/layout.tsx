import { getMessages } from "@/lib/i18n";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  const m = getMessages();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <p className="text-2xl font-bold tracking-[0.2em]">
          {m.app.name}
          <span className="text-positive">.</span>
        </p>
        <p className="mt-1 text-xs uppercase tracking-widest text-muted">{m.app.tagline}</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-10 max-w-sm text-center text-xs text-subtle">{m.app.disclaimer}</p>
    </main>
  );
}
