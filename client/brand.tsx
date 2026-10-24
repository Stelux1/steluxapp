import { useId } from 'react';

const logoSource = '/brand/blitzkrieg-reference.png';

/** Display the supplied artwork at its native proportions without its page margins. */
export function BrandIcon({ className = '' }: { className?: string }) {
  const clipId = useId();
  return <svg className={`brand-icon ${className}`} viewBox="0 0 324 324" aria-hidden="true">
    <defs><clipPath id={clipId}><rect width="324" height="324" rx="88"/></clipPath></defs>
    <image href={logoSource} x="-173" y="-307" width="1672" height="941" clipPath={`url(#${clipId})`}/>
  </svg>;
}

export function Wordmark({ dark = false }: { dark?: boolean }) {
  const inkId = useId();
  return <span className={`wordmark ${dark ? 'dark' : ''}`} role="img" aria-label="Blitzkrieg">
    <BrandIcon/>
    <svg className="wordmark-name" viewBox="546 357 977 240" aria-hidden="true">
      <defs>
        {/* Recover the original lettering as a mask, then render it in the theme's ink. */}
        <filter id={inkId} colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.2126 -0.7152 -0.0722 0 1" result="lettering"/>
          <feFlood floodColor="currentColor"/>
          <feComposite in2="lettering" operator="in"/>
        </filter>
      </defs>
      <image href={logoSource} width="1672" height="941" filter={`url(#${inkId})`}/>
    </svg>
  </span>;
}
