import clsx from "clsx";
import React from "react";

export type AimtutorWordmarkVariant = "toolbar" | "welcome" | "card";

/**
 * Text mark: **Aim** (blue) + **Tutor** + **.ai** (black / white in dark) → AimTutor.ai
 * Font: Plus Jakarta Sans (loaded in index.html).
 */
export const AimtutorWordmark: React.FC<{
  variant?: AimtutorWordmarkVariant;
  /** White treatment on primary-colored surfaces (e.g. export Card-icon). */
  onPrimary?: boolean;
  className?: string;
}> = ({ variant = "toolbar", onPrimary = false, className }) => (
  <span
    className={clsx(
      "aimtutor-wordmark",
      `aimtutor-wordmark--${variant}`,
      onPrimary && "aimtutor-wordmark--on-primary",
      className,
    )}
  >
    <span className="aimtutor-wordmark__aim">Aim</span>
    <span className="aimtutor-wordmark__rest">Tutor</span>
    <span className="aimtutor-wordmark__tld">.ai</span>
  </span>
);
