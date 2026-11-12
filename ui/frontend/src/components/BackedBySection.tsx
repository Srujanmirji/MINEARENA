import React from 'react';

export const BackedBySection: React.FC = () => {
  const backersList = [
    {
      name: 'SEC EDGAR 10-K',
      style: {
        fontFamily: '"Times New Roman", Times, serif',
        fontWeight: 400,
        letterSpacing: '0.02em',
        fontSize: '14px',
      },
    },
    {
      name: 'US GAAP',
      style: {
        fontFamily: '"Arial Black", Gadget, sans-serif',
        fontWeight: 900,
        letterSpacing: '0.08em',
        fontSize: '16px',
      },
    },
    {
      name: 'XBRL FACTS',
      style: {
        fontFamily: 'Impact, "Arial Narrow", sans-serif',
        fontWeight: 700,
        letterSpacing: '0.05em',
        fontSize: '18px',
      },
    },
    {
      name: 'Apple (AAPL)',
      style: {
        fontFamily: 'Georgia, serif',
        fontWeight: 600,
        letterSpacing: '-0.02em',
        fontSize: '17px',
      },
    },
    {
      name: 'NVIDIA (NVDA)',
      style: {
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontWeight: 700,
        letterSpacing: '-0.01em',
        fontSize: '15px',
      },
    },
    {
      name: 'MICROSOFT',
      style: {
        fontFamily: 'Verdana, sans-serif',
        fontWeight: 700,
        letterSpacing: '0.06em',
        fontSize: '14px',
        textTransform: 'uppercase' as const,
      },
    },
    {
      name: 'AMAZON',
      style: {
        fontFamily: '"Courier New", monospace',
        fontWeight: 700,
        letterSpacing: '0.18em',
        fontSize: '14px',
      },
    },
    {
      name: 'Alphabet',
      style: {
        fontFamily: 'Palatino, "Book Antiqua", serif',
        fontWeight: 500,
        letterSpacing: '0.03em',
        fontSize: '15px',
      },
    },
  ];

  return (
    <section className="bg-[#F5F5F5] px-6 py-12 md:py-16">
      <div className="max-w-[88rem] mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 items-center">
        {/* Scoped style for backers marquee */}
        <style>{`
          @keyframes backers-marquee {
            0% {
              transform: translateX(0);
            }
            100% {
              transform: translateX(-50%);
            }
          }
          .backers-track {
            display: flex;
            width: max-content;
            animation: backers-marquee 30s linear infinite;
          }
          .backers-track:hover {
            animation-play-state: paused;
          }
        `}</style>

        {/* Left Col (1/4) */}
        <div className="md:col-span-1">
          <p className="text-black/70 text-base leading-relaxed whitespace-pre-line">
            {"Engineered for SEC EDGAR\nand US GAAP filing standards."}
          </p>
        </div>

        {/* Right Col (3/4): Infinite Marquee */}
        <div className="md:col-span-3 overflow-hidden relative py-2">
          {/* Subtle edge fades */}
          <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#F5F5F5] to-transparent pointer-events-none z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#F5F5F5] to-transparent pointer-events-none z-10" />

          <div className="backers-track">
            {/* First render */}
            {backersList.map((backer, idx) => (
              <span
                key={`backer-1-${idx}`}
                className="mx-10 shrink-0 text-black/50 whitespace-nowrap select-none hover:text-black transition-colors duration-150 cursor-default"
                style={backer.style}
              >
                {backer.name}
              </span>
            ))}
            {/* Second render for seamless loop */}
            {backersList.map((backer, idx) => (
              <span
                key={`backer-2-${idx}`}
                className="mx-10 shrink-0 text-black/50 whitespace-nowrap select-none hover:text-black transition-colors duration-150 cursor-default"
                style={backer.style}
              >
                {backer.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

