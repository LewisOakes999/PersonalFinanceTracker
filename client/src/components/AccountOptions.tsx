import type { Account } from "../types";
import { formatDate } from "../lib/format";

/**
 * The <option>s for an account picker. Active accounts come first; inactive
 * ones sit in their own group, still selectable so history from before they
 * went inactive can be recorded or viewed.
 */
export function AccountOptions({ accounts }: { accounts: Account[] }) {
  const active = accounts.filter((a) => !a.closedAt);
  const inactive = accounts.filter((a) => a.closedAt);
  return (
    <>
      {active.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
      {inactive.length > 0 && (
        <optgroup label="Inactive">
          {inactive.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} (inactive {formatDate(a.closedAt!)})
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}
