import { FilterForm } from "@/components/ui/filter-form";
import { Button, Field, Select } from "@/components/ui/primitives";

export interface CompetitionChoice {
  code: string | null;
  name: string;
}

/** Filtro per competizione via GET (`?c=SA`), come nel Match Center. */
export function CompetitionFilter({
  competitions,
  selected,
  label,
  submitLabel,
}: {
  competitions: readonly CompetitionChoice[];
  selected: string | null;
  label: string;
  submitLabel: string;
}) {
  return (
    <FilterForm className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,24rem)_auto] sm:items-end">
      <Field label={label} htmlFor="c">
        <Select id="c" name="c" defaultValue={selected ?? undefined}>
          {competitions.map((c) =>
            c.code ? (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ) : null,
          )}
        </Select>
      </Field>
      <Button type="submit" variant="secondary" className="sm:w-fit">
        {submitLabel}
      </Button>
    </FilterForm>
  );
}
