"use client";
import { useFormStatus } from "react-dom";

/*
 * The sign-in form painted on the mascot's rocket (public/brand/rocket-signin.webp,
 * 596×1024). Real inputs sit exactly over the painted fields. All three painted
 * boxes share the same tilt, so one CSS matrix (unit vectors of the top edge and
 * side edge) maps an upright box onto each; positions are % of the image and
 * sizes are cqw of the image width, so everything scales with the artwork.
 */
const FIELD_H = (34.7 / 596) * 100; // cqw
const BUTTON_H = (38.13 / 596) * 100;

export function RocketSignIn({ error }: { error: boolean }) {
  return (
    <div className="rocket-stage" role="group" aria-label="Sign in" data-error={error || undefined}>
      <div className="rocket-art">
        <img src="/brand/rocket-signin.webp" alt="" width={596} height={1024} draggable={false} className="block h-full w-full select-none" />
        <label htmlFor="email" className="sr-only">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required autoFocus={!error}
          className="rocket-field" aria-invalid={error || undefined}
          style={{ left: "56.656%", top: "50.475%", width: `${(191.86 / 596) * 100}cqw`, height: `${FIELD_H}cqw` }} />
        <label htmlFor="password" className="sr-only">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus={error}
          className="rocket-field" aria-invalid={error || undefined}
          style={{ left: "51.947%", top: "57.588%", width: `${(189.24 / 596) * 100}cqw`, height: `${FIELD_H}cqw` }} />
        <SubmitButton />
      </div>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rocket-button" data-pending={pending || undefined}
      style={{ left: "48.171%", top: "63.563%", width: `${(182.3 / 596) * 100}cqw`, height: `${BUTTON_H}cqw` }}>
      {pending ? <span aria-live="polite">Signing in…</span> : <span className="sr-only">Sign in</span>}
    </button>
  );
}
