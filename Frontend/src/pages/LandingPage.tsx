import { useNavigate } from 'react-router-dom'
import './LandingPage.css'

const features = [
  'Cash-flow forecasting',
  'Receivables and payment tracking',
  'Cash-flow scenarios',
  'Invoice & payment tracking',
  'Invoice tax detail review',
  'Account-secured access',
]

export default function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="page-wrapper">
      <main className="landing-layout" aria-label="BAAKI Landing Page">
        {/* Left Column */}
        <section className="landing-left" aria-labelledby="landing-headline">
          {/* Brand */}
          <div className="landing-brand">
            <img
              src="/assets/brand/rupee_logo.png"
              alt="BAAKI rupee logo"
              className="landing-rupee-logo"
              width={28}
              height={28}
            />
            <span className="landing-wordmark">BAAKI</span>
          </div>

          {/* Headline */}
          <h1 className="landing-headline" id="landing-headline">
            KNOW YOUR CASH.<br />
            BEFORE IT GETS TIGHT.
          </h1>

          {/* Subtext */}
          <p className="landing-subtext">
            Recover payments. Predict cash gaps. Stay ahead.
          </p>

          {/* CTA */}
          <button
            id="get-started-btn"
            className="landing-cta"
            onClick={() => navigate('/auth')}
            aria-label="Get started with BAAKI"
          >
            GET STARTED
          </button>

          {/* Feature list */}
          <ul className="landing-features" aria-label="BAAKI features">
            {features.map((feature, index) => (
              <li key={index} className="landing-feature-item">
                <span className="landing-feature-text">{feature}</span>
              </li>
            ))}
          </ul>

          {/* Resource planning */}
          <p className="landing-resource-tag" aria-label="Resource planning">
            Resource planning
          </p>
        </section>

        {/* Right Column — Poster */}
        <aside className="poster-panel" aria-label="BAAKI poster artwork">
          <img
            src="/assets/illustrations/Opening.png"
            alt="In this economy, and you're not productive? — BAAKI editorial poster"
            className="poster-image"
          />
        </aside>
      </main>
    </div>
  )
}
