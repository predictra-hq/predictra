import { Logo } from "@/components/shell/logo";
import { getMessages } from "@/lib/i18n";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  const m = getMessages();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-4 flex w-full max-w-sm items-center gap-2.5">
        <Logo className="size-9" />
        <p className="text-lg font-bold tracking-[0.2em]">
          {m.app.name}
          <span className="text-positive">.</span>
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-10 max-w-sm text-center text-xs text-subtle">{m.app.disclaimer}</p>
    </main>
  );
}
