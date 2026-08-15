import Nav from '@/components/landing/Nav';
import SmoothScroll from '@/components/landing/SmoothScroll';
import Hero from '@/components/landing/Hero';
import LiveStats from '@/components/landing/LiveStats';
import GapSection from '@/components/landing/GapSection';
import Pillars from '@/components/landing/Pillars';
import Proof from '@/components/landing/Proof';
import HowItWorks from '@/components/landing/HowItWorks';
import TryTeaser from '@/components/landing/TryTeaser';
import Adrs from '@/components/landing/Adrs';
import PriorWork from '@/components/landing/PriorWork';
import Cta from '@/components/landing/Cta';
import Footer from '@/components/landing/Footer';
import '@/components/landing/landing.css';

export default function HomePage() {
  return (
    <div className="rialto-landing">
      <SmoothScroll />
      <Nav />
      <Hero />
      <LiveStats />
      <GapSection />
      <Pillars />
      <Proof />
      <HowItWorks />
      <TryTeaser />
      <Adrs />
      <PriorWork />
      <Cta />
      <Footer />
    </div>
  );
}
