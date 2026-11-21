const defaultServicesData = [
  {
    id: "muscle-training",
    number: "01",
    title: "MUSCLE TRAINING & BODYBUILDING",
    shortTitle: "Muscle Training",
    tagline: "Hyper-target muscle groups, master compound mechanics, and build dense contractile mass.",
    image: "/images/service-muscle-hd.jpg",
    category: "strength",
    badge: "MOST POPULAR",
    badgeColor: "red",
    curriculum: [
      "Hypertrophy Mechanics & Fiber Recruitment",
      "Periodized Progressive Overload Protocol",
      "Targeted Weak-Point Specialization",
      "Compound Lift Form Diagnostics (Squat, Bench, Deadlift)"
    ],
    included: [
      "Custom workout program updated every 4 weeks",
      "Unlimited access to Heavy Iron Pit & specialty machines",
      "Bi-weekly InBody 570 body composition scans",
      "1-on-1 macronutrient and peri-workout nutrition guide",
      "Infrared sauna & contrast therapy recovery access"
    ],
    prices: [
      { plan: "Monthly Pass", price: "₹2,500", desc: "Full gym & bodybuilding floor access" },
      { plan: "Quarterly Pass", price: "₹6,500", desc: "Includes free locker + diet guide (Save 13%)" },
      { plan: "Annual Championship", price: "₹18,000", desc: "Best value + 4 personal training sessions" }
    ],
    trainer: "Marcus 'The Titan' Vance (IFBB Pro Coach)"
  },
  {
    id: "hip-hop",
    number: "02",
    title: "HIP-HOP DANCE & RHYTHMIC CONDITIONING",
    shortTitle: "Hip-Hop Dance",
    tagline: "Explosive choreography, syncopated footwork, and high-cadence functional conditioning.",
    image: "/images/service-hiphop-hd.jpg",
    category: "cardio",
    badge: "HIGH ENERGY",
    badgeColor: "amber",
    curriculum: [
      "Street Style Foundations & Popping/Locking Mechanics",
      "High-BPM Anaerobic Interval Routines",
      "Spatial Agility & Core Rotation Control",
      "Endurance Choreography Sets"
    ],
    included: [
      "Step-by-step breakdown suitable for all skill levels",
      "Burn 600-850 calories per high-octane 60-min session",
      "Dynamic group energy that keeps you accountable",
      "Access to open practice studios during non-class hours",
      "Guest workshops by international dance creators"
    ],
    prices: [
      { plan: "Monthly (3 classes/week)", price: "₹2,000", desc: "All street dance sessions" },
      { plan: "Quarterly Pass", price: "₹5,200", desc: "Save 15% on all dance conditioning" },
      { plan: "Annual Unlimited", price: "₹15,000", desc: "Includes guest choreographers workshops" }
    ],
    trainer: "Maya Lin (Choreographer & Movement Coach)"
  },
  {
    id: "arm-wrestling",
    number: "03",
    title: "ARM WRESTLING & GRIP MASTERY",
    shortTitle: "Arm Wrestling",
    tagline: "Develop steel-cable tendons, pronation dominance, and crushing hand grip strength.",
    image: "/images/service-armwrestle-hd.jpg",
    category: "combat",
    badge: "SIGNATURE DISCIPLINE",
    badgeColor: "red",
    curriculum: [
      "Biomechanics of the Toproll, Hook & Flop Wrist Press",
      "Tendon & Ligament Heavy Isometric Loading",
      "Cupping, Pronation & Supination Micro-Movements",
      "Live Super-Match Sparring & Table Safety Protocols"
    ],
    included: [
      "Custom grip dyno testing to benchmark your hand strength",
      "Dedicated arm wrestling tables and specialized strap gear",
      "Joint preservation and tendon recovery protocols",
      "Pre-competition weight cut & tournament readiness guidance",
      "Monthly in-house fight nights and refereed sparring"
    ],
    prices: [
      { plan: "Monthly Pass", price: "₹2,200", desc: "3 table sessions per week + gym floor" },
      { plan: "Quarterly Pass", price: "₹5,800", desc: "Includes tournament prep protocol" },
      { plan: "Annual Combat Pass", price: "₹16,500", desc: "Priority sparring & national coaching camp" }
    ],
    trainer: "Dmitri 'The Vise' Volkov (National Champion)"
  },
  {
    id: "swimming",
    number: "04",
    title: "SWIMMING & AQUATIC ENDURANCE",
    shortTitle: "Swimming",
    tagline: "Zero-impact cardiovascular conditioning, stroke biomechanics, and VO2-max expansion.",
    image: "/images/service-swim-hd.jpg",
    category: "wellness",
    badge: "ALL AGES",
    badgeColor: "blue",
    curriculum: [
      "Hydrodynamic Efficiency & Drag Reduction Drills",
      "Freestyle, Breaststroke & Butterfly Mechanics",
      "Hypoxic Breath-Hold & Cadence Calibration",
      "High-Threshold Aerobic Lap Circuits"
    ],
    included: [
      "Temperature-regulated 25-meter semi-Olympic lap pool",
      "Underwater HD video stroke analysis review",
      "Low-impact rehab friendly for joint and spine recovery",
      "Dedicated clean locker suites with steam showers",
      "Open swimming hours throughout the entire day"
    ],
    prices: [
      { plan: "Monthly Pool Pass", price: "₹2,500", desc: "Unlimited lap swimming & coaching" },
      { plan: "Quarterly Pass", price: "₹6,500", desc: "Includes 2 stroke correction clinics" },
      { plan: "Annual Aquatic Elite", price: "₹18,000", desc: "Full pool + gym access combo" }
    ],
    trainer: "Elena Rostova (Olympic Trials Qualifier)"
  },
  {
    id: "combat-mma",
    number: "05",
    title: "COMBAT & MMA STRIKING",
    shortTitle: "MMA Striking",
    tagline: "Devastating Muay Thai striking, boxing head movement, and Dutch kickboxing combinations.",
    image: "/images/service-combat-hd.jpg",
    category: "combat",
    badge: "INTENSE COMBAT",
    badgeColor: "red",
    curriculum: [
      "Muay Thai Low-Kick & Teep Mechanics",
      "Peek-a-Boo Boxing Defense & Angles",
      "Clinched Knees, Elbows & Balance Breaks",
      "Conditioning Bag Rounds & Pad Work"
    ],
    included: [
      "Regulation 24ft competition Octagon and tatami mats",
      "Fairtex heavy bags, teardrop bags & uppercut wall units",
      "Hand wrapping technique guidance and glove gear lockers",
      "Strict safety protocols with compulsory shin & mouth guards",
      "Sparring privileges upon certified level clearance"
    ],
    prices: [
      { plan: "Monthly Combat", price: "₹3,000", desc: "All striking & bag conditioning classes" },
      { plan: "Quarterly Combat", price: "₹8,000", desc: "Includes free competition hand wraps" },
      { plan: "Annual Warrior Pass", price: "₹22,000", desc: "Includes sparring gear kit + gym access" }
    ],
    trainer: "Tariq 'The Anvil' Sterling (Pro MMA Fighter)"
  },
  {
    id: "powerlifting",
    number: "06",
    title: "POWERLIFTING & MAX STRENGTH",
    shortTitle: "Powerlifting",
    tagline: "Move maximum absolute poundages across the Big Three: Squat, Bench, and Deadlift.",
    image: "/images/service-powerlift-hd.jpg",
    category: "strength",
    badge: "MAX INTENSITY",
    badgeColor: "red",
    curriculum: [
      "Squat Biomechanics (Low-Bar vs. High-Bar)",
      "Bench Arch Optimization & Leg Drive Mechanics",
      "Conventional & Sumo Deadlift Wedge Dynamics",
      "Peaking Cycles & RPE Load Management"
    ],
    included: [
      "IPF-spec calibrated steel plates and competition racks",
      "Specialty bars: Texas Power Bar, Kabuki Duffalo, Safety Squat",
      "Chalk stations, deadlift jacks & band peg accessories",
      "Competition attempt selection strategy consults",
      "Quarterly mock meet testing days with certified judges"
    ],
    prices: [
      { plan: "Monthly Lifter", price: "₹2,600", desc: "Calibrated plates & platform access" },
      { plan: "Quarterly Pass", price: "₹6,800", desc: "Includes peaking cycle review" },
      { plan: "Annual Iron Breed", price: "₹19,000", desc: "Best value + powerlifting belt locker" }
    ],
    trainer: "Jackson Cole (800kg Total Competitor)"
  }
];

module.exports = {
  defaultServicesData,
};
