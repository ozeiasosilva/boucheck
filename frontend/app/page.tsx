import type { Metadata } from 'next'
import { fetchSettingByKey } from '@/lib/api'
import { LandingHeader } from '@/components/landing/landing-header'
import { HeroSection } from '@/components/landing/hero-section'
import { SocialProofSection } from '@/components/landing/social-proof-section'
import { BenefitsSection } from '@/components/landing/benefits-section'
import { HowItWorksSection } from '@/components/landing/how-it-works-section'
import { CtaFinalSection } from '@/components/landing/cta-final-section'
import { LandingFooter } from '@/components/landing/landing-footer'

export const metadata: Metadata = {
  title: 'Raio-X de Maturidade de TI | BouCheck',
  description:
    'Avalie gratuitamente a maturidade de TI da sua empresa. Diagnóstico online em 12 minutos com relatório visual e recomendações práticas.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Raio-X de Maturidade de TI | BouCheck',
    description:
      'Avalie gratuitamente a maturidade de TI da sua empresa. Diagnóstico online em 12 minutos com relatório visual imediato.',
    url: '/',
    type: 'website',
    images: ['/og-image.png'],
  },
}

export default async function HomePage() {
  let surveySlug: string | null = null
  try {
    const setting = await fetchSettingByKey('landing_survey_link')
    surveySlug = setting.value
  } catch {
    surveySlug = null
  }

  return (
    <>
      <LandingHeader surveySlug={surveySlug} />
      <main>
        <HeroSection surveySlug={surveySlug} />
        <SocialProofSection />
        <BenefitsSection />
        <HowItWorksSection surveySlug={surveySlug} />
        <CtaFinalSection surveySlug={surveySlug} />
      </main>
      <LandingFooter />
    </>
  )
}
