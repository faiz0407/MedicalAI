import Navbar from '@/components/shared/Navbar'
import Footer from '@/components/shared/Footer'
import Hero from '@/components/landing/Hero'
import MedicalInfoSection from '@/components/landing/MedicalInfoSection'
import AIOverviewSection from '@/components/landing/AIOverviewSection'
import TrustSection from '@/components/landing/TrustSection'
import NewsPreviewSection from '@/components/landing/NewsPreviewSection'

export default function LandingPage() {
  return (
    <main>
      <Navbar />
      <Hero />
      <MedicalInfoSection />
      <AIOverviewSection />
      <TrustSection />
      <NewsPreviewSection />
      <Footer />
    </main>
  )
}
