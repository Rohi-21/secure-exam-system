import React from "react";
import ResponsiveHeroBanner from "./responsive-hero-banner";

export const HeroDemo: React.FC = () => {
  return (
    <ResponsiveHeroBanner
      badgeLabel="Secure Digital Platform"
      badgeText="Cryptographically Enforced Examination Integrity"
      title="Examinations Built on Trust."
      titleLine2="Secured by Cryptography."
      description="A secure online examination platform designed to protect examination data, preserve answer integrity, and support transparent result verification."
      primaryButtonText="Access Platform"
      primaryButtonHref="/login"
      secondaryButtonText="Explore Security"
      secondaryButtonHref="#security"
      ctaButtonText="Access Platform"
      ctaButtonHref="/login"
      partnersTitle="Cryptographic Security Invariants & System Guarantees"
    />
  );
};

export default HeroDemo;
