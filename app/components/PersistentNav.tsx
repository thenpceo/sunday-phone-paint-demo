export function PersistentNav() {
  return (
    <header className="persistent-nav" data-testid="persistent-navbar">
      <a className="brand-icon" href="#top" aria-label="Sunday home">
        <span className="brand-logo-crop brand-icon-crop" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/artwork/sunday-logo-source.png" alt="" />
        </span>
      </a>
      <a className="brand-wordmark" href="#top" aria-label="Sunday home">
        <span className="brand-logo-crop brand-wordmark-crop" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/artwork/sunday-logo-source.png" alt="" />
        </span>
      </a>
      <a className="nav-menu" href="#top" aria-label="Return to the top">
        <span />
        <span />
      </a>
    </header>
  );
}
