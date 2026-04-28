'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

/* ─── Section IDs for smooth-scroll ─── */
const SECTIONS = ['features', 'pricing', 'testimonials'] as const;

/* ─── Feature data ─── */
const FEATURES = [
  {
    title: 'Real-Time Sync',
    description:
      'Sub-100ms timer synchronization across 500+ concurrent participants. Every second counts in a live quiz.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    title: 'Multiple Quiz Modes',
    description:
      'Regular, Elimination, and Fastest-Finger-First modes to keep every event fresh and engaging.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    title: 'Live Leaderboard',
    description:
      'Animated leaderboards with streak bonuses, speed scoring, and dramatic big-screen displays for audiences.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    title: 'Team Management',
    description:
      'Invite team members, assign roles, and collaborate on quiz creation within your organization.',
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

/* ─── Pricing data ─── */
const PRICING_TIERS = [
  {
    name: 'Free',
    price: '₹0',
    period: '/month',
    features: [
      '10 participants per session',
      '3 sessions per month',
      'Basic quiz modes',
      'Community support',
    ],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '₹999',
    period: '/month',
    features: [
      '100 participants per session',
      'Unlimited sessions',
      'All quiz modes',
      'Basic branding',
      'Email support',
    ],
    cta: 'Start Pro Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: '₹4,999',
    period: '/month',
    features: [
      '500 participants per session',
      'Unlimited sessions',
      'Custom branding',
      'Priority support',
      'Dedicated account manager',
    ],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

/* ─── Testimonials data ─── */
const TESTIMONIALS = [
  {
    quote:
      'CTX Quiz transformed our annual conference. The real-time leaderboard had 400 attendees on the edge of their seats.',
    author: 'Priya Sharma',
    role: 'Event Director, TechSummit India',
  },
  {
    quote:
      'We use it every week for classroom engagement. The elimination mode is a student favorite — participation went up 3x.',
    author: 'Rahul Menon',
    role: 'Professor, IIT Madras',
  },
  {
    quote:
      'Setup took five minutes and the big-screen display looked incredible on stage. Our sponsors loved the branding options.',
    author: 'Ananya Desai',
    role: 'Head of Events, PurpleHat',
  },
];

/* ─── Smooth-scroll helper ─── */
function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ─── Navigation ─── */
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-normal ${
        scrolled ? 'neu-raised-sm py-3' : 'py-5 bg-transparent'
      }`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="font-display text-h3 font-bold text-primary tracking-tight"
          aria-label="Scroll to top"
        >
          CTX Quiz
        </button>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-8">
          {SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => scrollToSection(s)}
              className="text-body-sm font-medium text-[var(--text-secondary)] hover:text-primary transition-colors capitalize"
            >
              {s}
            </button>
          ))}
          <Link
            href="/auth/login"
            className="text-body-sm font-medium text-[var(--text-secondary)] hover:text-primary transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/auth/register"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-primary text-white text-body-sm font-semibold hover:bg-primary-light transition-colors touch-target"
          >
            Get Started
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 rounded-md neu-raised-sm touch-target"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
        >
          <svg className="w-6 h-6 text-[var(--text-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden mt-2 mx-4 p-4 rounded-md neu-raised animate-fade-in">
          <div className="flex flex-col gap-3">
            {SECTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  scrollToSection(s);
                  setMobileOpen(false);
                }}
                className="text-body font-medium text-[var(--text-secondary)] hover:text-primary transition-colors capitalize text-left py-2"
              >
                {s}
              </button>
            ))}
            <Link
              href="/auth/login"
              className="text-body font-medium text-[var(--text-secondary)] hover:text-primary transition-colors py-2"
              onClick={() => setMobileOpen(false)}
            >
              Sign In
            </Link>
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-md bg-primary text-white text-body font-semibold hover:bg-primary-light transition-colors touch-target mt-1"
              onClick={() => setMobileOpen(false)}
            >
              Get Started
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

/* ─── Hero Section ─── */
function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 sm:px-6 pt-24 pb-16">
      <div className="max-w-3xl mx-auto text-center">
        {/* Logo mark */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full neu-raised-lg mb-8">
          <span className="font-display text-display font-bold text-primary" aria-hidden="true">
            Q
          </span>
        </div>

        <h1 className="font-display text-h1 sm:text-display font-bold text-[var(--text-primary)] mb-4 text-balance">
          Live Quizzes That Electrify Your Events
        </h1>

        <p className="text-body-lg text-[var(--text-secondary)] max-w-xl mx-auto mb-10 text-balance">
          Real-time synchronized quiz platform for conferences, classrooms, and game shows.
          Engage 500+ participants with sub-100ms precision.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/auth/register"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-md bg-primary text-white text-body-lg font-semibold hover:bg-primary-light transition-colors touch-target w-full sm:w-auto"
          >
            Get Started
          </Link>
          <button
            onClick={() => scrollToSection('features')}
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-md neu-raised text-body-lg font-medium text-[var(--text-primary)] hover:shadow-neu-raised-sm transition-all touch-target w-full sm:w-auto"
          >
            Learn More
          </button>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce-subtle" aria-hidden="true">
        <svg className="w-6 h-6 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </div>
    </section>
  );
}

/* ─── Features Section ─── */
function FeaturesSection() {
  return (
    <section id="features" className="py-20 sm:py-28 px-4 sm:px-6" aria-labelledby="features-heading">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 id="features-heading" className="font-display text-h2 sm:text-h1 font-bold text-[var(--text-primary)] mb-3">
            Built for Live Events
          </h2>
          <p className="text-body-lg text-[var(--text-secondary)] max-w-lg mx-auto">
            Everything you need to run engaging, real-time quizzes at any scale.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="neu-raised rounded-md p-6 hover:shadow-neu-raised-lg transition-shadow duration-normal"
            >
              <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center text-primary mb-4">
                {f.icon}
              </div>
              <h3 className="text-h3 font-semibold text-[var(--text-primary)] mb-2">{f.title}</h3>
              <p className="text-body-sm text-[var(--text-secondary)] leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Pricing Section ─── */
function PricingSection() {
  return (
    <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6" aria-labelledby="pricing-heading">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 id="pricing-heading" className="font-display text-h2 sm:text-h1 font-bold text-[var(--text-primary)] mb-3">
            Simple, Transparent Pricing
          </h2>
          <p className="text-body-lg text-[var(--text-secondary)] max-w-lg mx-auto">
            Start free. Scale as you grow. No hidden fees.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`rounded-md p-6 sm:p-8 flex flex-col ${
                tier.highlighted
                  ? 'neu-raised-lg ring-2 ring-primary relative'
                  : 'neu-raised'
              }`}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-caption font-semibold px-3 py-1 rounded-full">
                  Most Popular
                </span>
              )}

              <h3 className="font-display text-h3 font-bold text-[var(--text-primary)]">{tier.name}</h3>

              <div className="mt-4 mb-6">
                <span className="font-display text-display font-bold text-[var(--text-primary)]">
                  {tier.price}
                </span>
                <span className="text-body-sm text-[var(--text-muted)]">{tier.period}</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1" role="list">
                {tier.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-body-sm text-[var(--text-secondary)]">
                    <svg
                      className="w-5 h-5 text-success flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feat}
                  </li>
                ))}
              </ul>

              <Link
                href={`/auth/register?tier=${tier.name.toLowerCase()}`}
                className={`inline-flex items-center justify-center px-6 py-3 rounded-md text-body font-semibold transition-colors touch-target w-full ${
                  tier.highlighted
                    ? 'bg-primary text-white hover:bg-primary-light'
                    : 'neu-raised-sm text-[var(--text-primary)] hover:shadow-neu-raised transition-shadow'
                }`}
              >
                {tier.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Testimonials Section ─── */
function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-20 sm:py-28 px-4 sm:px-6" aria-labelledby="testimonials-heading">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 id="testimonials-heading" className="font-display text-h2 sm:text-h1 font-bold text-[var(--text-primary)] mb-3">
            Loved by Event Organizers
          </h2>
          <p className="text-body-lg text-[var(--text-secondary)] max-w-lg mx-auto">
            See what teams across India are saying about CTX Quiz.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.author} className="neu-raised rounded-md p-6 sm:p-8 flex flex-col">
              {/* Quote icon */}
              <svg
                className="w-8 h-8 text-primary/30 mb-4 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10H14.017zM0 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151C7.546 6.068 5.983 8.789 5.983 11h4v10H0z" />
              </svg>
              <blockquote className="text-body text-[var(--text-secondary)] leading-relaxed mb-6 flex-1">
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <div>
                <p className="text-body font-semibold text-[var(--text-primary)]">{t.author}</p>
                <p className="text-body-sm text-[var(--text-muted)]">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer className="py-12 px-4 sm:px-6 border-t border-[var(--border)]" role="contentinfo">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <p className="font-display text-body-lg font-bold text-primary">CTX Quiz</p>
            <p className="text-caption text-[var(--text-muted)] mt-1">
              Powered by CTX Quiz &middot;{' '}
              <a
                href="https://ctx.works"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors"
              >
                ctx.works
              </a>
            </p>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-6" aria-label="Footer navigation">
            <a href="/terms" className="text-body-sm text-[var(--text-secondary)] hover:text-primary transition-colors">
              Terms of Service
            </a>
            <a href="/privacy" className="text-body-sm text-[var(--text-secondary)] hover:text-primary transition-colors">
              Privacy Policy
            </a>
            <a href="/contact" className="text-body-sm text-[var(--text-secondary)] hover:text-primary transition-colors">
              Contact
            </a>
          </nav>
        </div>

        <p className="text-caption text-[var(--text-muted)] text-center mt-8">
          &copy; {new Date().getFullYear()} CTX Quiz. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

/* ─── Page ─── */
export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--neu-bg)]">
      <Navbar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <PricingSection />
        <TestimonialsSection />
      </main>
      <Footer />
    </div>
  );
}
