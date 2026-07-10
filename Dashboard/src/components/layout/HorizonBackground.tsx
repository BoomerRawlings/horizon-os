export function HorizonBackground() {
  return (
    <div aria-hidden="true" className="horizon-background">
      <div className="horizon-theme-layer horizon-theme-nebula" />
      <div className="horizon-theme-layer horizon-theme-midnight" />
      <div className="horizon-theme-layer horizon-theme-soft" />
      <div className="horizon-workspace-glow" />
      <div className="horizon-ambient-group">
        <div className="horizon-stars horizon-stars-primary" />
        <div className="horizon-stars horizon-stars-secondary" />
        <div className="horizon-orbit-field" />
        <div className="horizon-atmosphere" />
        <div className="horizon-planet" />
      </div>
      <div className="horizon-background-vignette" />
    </div>
  );
}
