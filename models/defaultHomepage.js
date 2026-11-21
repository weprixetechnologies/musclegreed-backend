const defaultHomepageData = {
  hero: {
    bgDesktop: "/images/hero-bg.jpg",
    bgMobile: "/images/hero-bg.jpg",
    headingLine1: "REACH YOUR",
    headingHighlight: "FITNESS",
    headingLine2Suffix: "GOALS",
    reviewCount: "95+",
    reviewLabel: "Reviews",
    subText: "REDEFINE YOUR LIFE WITH\nTHE BEST GUIDANCE & TRUE\nSPIRIT GAIN",
    ctaText: "Connect Now",
    ctaLink: "/contact",
    reviewAvatars: [
      "/images/avatar-1.jpg",
      "/images/avatar-2.jpg",
      "/images/avatar-3.jpg"
    ],
    scrollingTiles: [
      { id: 1, src: "/images/hero-card-1-hd.jpg", alt: "Athlete performing dumbbell row" },
      { id: 2, src: "/images/hero-card-2-hd.jpg", alt: "Modern gym facility with overhead circular lighting" },
      { id: 3, src: "/images/hero-card-3-hd.jpg", alt: "Gym barbell strength workout" },
      { id: 4, src: "/images/hero-card-4.jpg", alt: "Functional fitness training" },
      { id: 5, src: "/images/hero-card-5.jpg", alt: "Weightlifting area" }
    ]
  },
  services: [
    { id: "hip-hop", title: "HIP-HOP DANCE", imageSrc: "/images/service-hiphop-hd.jpg", link: "/services#hip-hop" },
    { id: "muscle-training", title: "MUSCLE TRAINING", imageSrc: "/images/service-muscle-hd.jpg", link: "/services#muscle-training" },
    { id: "arm-wrestling", title: "ARM WRESTLING", imageSrc: "/images/service-armwrestle-hd.jpg", link: "/services#arm-wrestling" },
    { id: "swimming", title: "SWIMMING", imageSrc: "/images/service-swimming-hd.jpg", link: "/services#swimming" }
  ],
  mission: {
    badge: "CORE PURPOSE",
    title: "OUR MISSION",
    tagline: "Dismantle Complacency. Forge Real Strength.",
    description: "Our mission is to provide an uncompromising training ground free of commercial distractions, fitness fads, and performative vanity. We equip athletes with calibrated competition hardware, rigorous progressive overload principles, and direct guidance to shatter plateaus and build lifelong physical sovereignty.",
    items: [
      { title: "Uncut Calibrated Iron:", text: "Eleiko competition racks, solid oak platforms, and calibrated plates." },
      { title: "Biomechanical Rigor:", text: "Every rep is governed by joint safety and motor unit recruitment." },
      { title: "High-Standard Community:", text: "An iron brotherhood of lifters who hold you to your highest standard." }
    ]
  },
  goals: {
    badge: "PERFORMANCE BENCHMARKS",
    title: "OUR GOALS",
    tagline: "Quantifiable Milestones. Zero Casualties.",
    description: "Our goal is to redefine athletic training by merging raw power with longevity. We aim to empower every member to achieve verifiable PRs while maintaining resilient tendons, mobile joints, and an ironclad mindset that transfers into every facet of life.",
    items: [
      { title: "100% Measurable Progress:", text: "Data-driven programming designed around progressive overload metrics." },
      { title: "Injury-Proof Durability:", text: "Structural tendon conditioning and balanced multi-planar training." },
      { title: "Universal Inclusivity for Grit:", text: "Welcoming anyone with relentless hunger, from beginner to world champion." }
    ]
  },
  about: {
    badge: "ABOUT MUSCLEGREED",
    headingLine1: "BUILT FOR ATHLETES WHO",
    headingOutline: "REFUSE",
    headingHighlight: "MEDIOCRITY",
    subText: "Founded in 2019 as the unapologetic antidote to soft commercial fitness chains. We merged sports biomechanics, calibrated competition steel, and an unbreakable culture to create a sanctuary where serious lifters thrive."
  },
  testimonials: [
    {
      id: 1,
      avatar: "/images/avatar-1.jpg",
      quote: "\"The training atmosphere at MUSCLEGREED is just the best. Period. The energy here transforms you.\"",
      author: "- Fernando, Pro Physique Competitor"
    },
    {
      id: 2,
      avatar: "/images/avatar-2.jpg",
      quote: "\"I switched to MUSCLEGREED 3 years ago and never looked back. The intensity and coaching are world-class.\"",
      author: "- Andy, Strength & Conditioning Coach"
    },
    {
      id: 3,
      avatar: "/images/avatar-3.jpg",
      quote: "\"I've been searching for a training environment like MUSCLEGREED for YEARS. So glad I finally found one!\"",
      author: "- Pete, National Powerlifting Competitor"
    },
    {
      id: 4,
      avatar: "/images/avatar-1.jpg",
      quote: "\"MUSCLEGREED's coaching and community are unparalleled. They push you past what you thought was your absolute limit.\"",
      author: "- Olivia, Elite Endurance & Functional Athlete"
    },
    {
      id: 5,
      avatar: "/images/avatar-2.jpg",
      quote: "\"Every session at MUSCLEGREED challenges you to evolve. The culture and iron brotherhood are unmatched.\"",
      author: "- Marcus, Heavyweight Athlete"
    }
  ],
  culture: [
    {
      id: "card-1",
      type: "image",
      src: "/images/culture-card-1-hd.jpg",
      title: "Lat Pulldown Workout"
    },
    {
      id: "card-2",
      type: "image",
      src: "/images/culture-card-2-hd.jpg",
      title: "Core Conditioning"
    },
    {
      id: "card-3",
      type: "image",
      src: "/images/culture-card-3-hd.jpg",
      title: "Sunlight Strength Focus"
    },
    {
      id: "card-4",
      type: "video",
      src: "/videos/workout-loop.mp4",
      poster: "/images/culture-card-2-hd.jpg",
      title: "Workout Motion Capture"
    },
    {
      id: "card-5",
      type: "image",
      src: "/images/culture-card-4-hd.jpg",
      title: "Back Dumbbell Rows"
    }
  ],
  stats: [
    { value: "18,000", label: "Sq Ft Iron Floor", highlight: false },
    { value: "40,000+", label: "Lbs Calibrated Steel", highlight: true },
    { value: "2,400+", label: "Active Athletes", highlight: false },
    { value: "24/7/365", label: "Keycard Access", highlight: false }
  ]
};

module.exports = {
  defaultHomepageData,
};
