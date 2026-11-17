"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Input } from "@/components/ui/primitives";

/**
 * Campo di testo che resta compilato dopo un errore del server: dopo l'invio React
 * svuota i campi non controllati, questo tiene il valore scritto.
 */
export function KeepInput({
  defaultValue = "",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue"> & {
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return <Input {...props} value={value} onChange={(e) => setValue(e.target.value)} />;
}
