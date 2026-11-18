"use client";

import { useState } from "react";
import { Input } from "@/components/ui/primitives";

export function LoginPassword({ show, hide }: { show: string; hide: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id="password"
        name="password"
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        required
        className="pr-24"
      />
      <button
        type="button"
        aria-controls="password"
        onClick={() => setVisible(!visible)}
        className="absolute inset-y-0 right-0 px-3 text-sm font-medium text-muted underline underline-offset-4 hover:text-fg"
      >
        {visible ? hide : show}
      </button>
    </div>
  );
}
