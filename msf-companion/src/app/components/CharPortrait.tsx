"use client";

import { useState } from "react";

/**
 * Standardized character portrait with graceful fallback.
 *
 * UX Standard:
 * - Always shows a first-letter initial when the image fails or is missing.
 * - Uses onError to handle broken CDN images gracefully.
 * - Consistent fallback styling: surface-light bg, muted text, centered initial.
 */
export function CharPortrait({
  src,
  name,
  imgClassName = "",
  fallbackClassName = "",
  ...rest
}: {
  src?: string | null;
  name: string;
  /** Classes for the <img> element */
  imgClassName?: string;
  /** Classes for the fallback <div> (must include sizing, shape, centering) */
  fallbackClassName?: string;
  "data-testid"?: string;
}) {
  const [failed, setFailed] = useState(false);

  const initial = name ? name.charAt(0).toUpperCase() : "?";

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={name}
        className={imgClassName}
        onError={() => setFailed(true)}
        loading="lazy"
        {...rest}
      />
    );
  }

  return (
    <div className={fallbackClassName} {...rest}>
      {initial}
    </div>
  );
}
