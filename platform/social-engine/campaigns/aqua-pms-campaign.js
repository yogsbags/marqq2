/**
 * AQUA PMS Video Campaign Configuration
 *
 * Pre-configured campaign for generating AQUA PMS promotional videos
 */

module.exports = {
  id: 'aqua-pms-video',
  name: 'AQUA PMS Strategy Video',
  platform: 'linkedin',
  format: 'testimonial',

  topic: 'AQUA Quantitative PMS: 76% Returns Through Systematic Investing',

  description: `
    AQUA PMS delivered exceptional 76% returns in its debut year,
    outperforming the benchmark by 37.5 percentage points through
    systematic quantitative strategies. This video explains the
    6S framework, market regime detection, factor rotation, and
    dynamic asset allocation that drives AQUA's success.
  `,

  keyPoints: [
    '76% returns in debut year (vs 38% benchmark)',
    '37.5% alpha through systematic approach',
    '6S Framework: Market Regime Detection, Factor Rotation, Dynamic Allocation',
    'Client success: ₹5 Cr → ₹8.8 Cr in 12 months',
    '80-year legacy, Siddharth Vora fund manager',
    'Data-driven, bias-free quantitative investing'
  ],

  // Prompts array for video-generator.js
  prompts: [
    'Professional Indian financial advisor in modern office, confidently presenting to camera, AQUA PMS logo visible on screen, clean corporate background, natural lighting, photorealistic 4K quality',
    'Animated chart showing AQUA PMS performance: 76% returns highlighted in bold green text, benchmark at 38% shown in blue, upward trending line graph, professional financial dashboard style, modern minimalist design',
    'Split screen showing systematic quantitative approach: left side shows traditional emotional investing with red X marks, right side shows AQUA systematic process with green checkmarks, data-driven visualization, clean corporate style',
    'Animated 6S framework visualization: six interconnected circles representing Market Regime Detection, Factor Rotation, Dynamic Asset Allocation, Risk Management, Portfolio Optimization, and Performance Monitoring, smooth camera movement, professional infographic style',
    'Market regime detection visualization: four quadrants showing Bull Market, Bear Market, High Volatility, and Trending Market, animated transitions between regimes, 27 quantitative indicators highlighted, professional data visualization',
    'Factor rotation animation: six factors (Value, Momentum, Quality, Low Volatility, Size, Growth) rotating and highlighting top 2-3 factors, dynamic allocation bars showing percentage changes, modern financial dashboard aesthetic',
    'Dynamic asset allocation visualization: equity allocation ranging from 20% to 95% based on market conditions, animated timeline showing allocation changes during March 2020 crash (90% equity), smooth transitions, professional chart style',
    'Client success story visualization: portfolio growth from ₹5 Crore to ₹8.8 Crore over 12 months, animated timeline with quarterly milestones, satisfied Indian HNI client silhouette, warm professional tone, trustworthy presentation style',
    'PL Capital branding: 80-year legacy timeline, AQUA PMS logo, Siddharth Vora fund manager introduction, professional credentials display, trust-building elements, corporate excellence aesthetic',
    'Call to action: "Book Your Portfolio Review" text with calendar icon, contact information, website URL plcapital.in, professional CTA design, warm inviting tone, clear next steps visualization',
    'Closing shot: AQUA PMS logo with tagline "Systematic. Data-Driven. Results.", contact details, social media handles, professional closing frame, brand consistency, memorable final impression'
  ],

  // Video config for generate-video.js
  config: {
    duration: 8,
    aspectRatio: '16:9',
    provider: 'fal' // or 'gemini'
  },

  script: `
    Hi, I'm Siddharth Vora, Fund Manager at PL Capital.

    Our AQUA Quantitative PMS delivered 76% returns in its debut year—that's 37.5% alpha over the benchmark.

    How? Through systematic, data-driven investing that eliminates emotional decision-making.

    AQUA uses our proprietary 6S Framework: Market Regime Detection identifies bull, bear, and trending markets using 27 quantitative indicators.

    Factor Rotation dynamically allocates to the top-performing factors—Value, Momentum, Quality—while reducing exposure to underperformers.

    Dynamic Asset Allocation ranges from 20% to 95% equity based on opportunity. During the March 2020 crash, we went 90% equity and captured the recovery.

    One client invested ₹5 Crore in January 2024. By December, their portfolio grew to ₹8.8 Crore—a 76% return.

    With PL Capital's 80-year legacy and systematic approach, we help HNIs achieve superior risk-adjusted returns.

    Book your portfolio review at plcapital.in and discover how AQUA can transform your wealth creation journey.

    AQUA PMS: Systematic. Data-Driven. Results.
  `,

  captions: [
    '76% Returns in Year 1',
    '37.5% Alpha vs Benchmark',
    'Systematic Quantitative Approach',
    '6S Framework',
    'Market Regime Detection',
    'Factor Rotation Strategy',
    'Dynamic Asset Allocation',
    '₹5 Cr → ₹8.8 Cr Success Story',
    '80-Year Legacy',
    'Book Portfolio Review'
  ],

  hashtags: [
    '#AQUAPMS',
    '#QuantitativeInvesting',
    '#SystematicInvesting',
    '#WealthManagement',
    '#PortfolioManagement',
    '#HNIs',
    '#InvestmentStrategy',
    '#PLCapital',
    '#FinancialPlanning',
    '#IndiaInvesting'
  ],

  cta: {
    text: 'Book Your Portfolio Review',
    url: 'https://plindia.com',
    buttonText: 'Schedule Call'
  }
};

