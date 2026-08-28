(() => {
  const selector = ".classic-party-card";

  const style = document.createElement("style");
  style.textContent = `
    .ao-star-card {
      width: min(100%, 600px) !important;
      margin: 0 auto !important;
      padding: 0 !important;
      overflow: visible !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    .ao-star-svg { display: block; width: 100%; height: auto; overflow: visible; }
    @media (max-width: 560px) {
      .ao-star-card { width: calc(100% + 16px) !important; margin-left: -8px !important; }
    }
  `;
  document.head.appendChild(style);

  const readScore = (card) => {
    const exact = Array.from(card.querySelectorAll("text, strong, b, span"))
      .map((node) => node.textContent.trim())
      .find((value) => /^(?:100|[1-9]?\d)$/.test(value));
    const fallback = card.textContent.match(/(?:^|\D)(100|[1-9]?\d)(?:\D|$)/)?.[1];
    return Math.max(0, Math.min(100, Number(exact || fallback || 100)));
  };

  const createStar = (score, intro) => {
    const title = score === 100 ? "恭喜满分通过" : "恭喜通过考试";
    const scoreSize = score === 100 ? 150 : 164;

    return `
      <svg class="ao-star-svg${intro ? " ao-star-intro" : ""}" viewBox="0 0 800 720" role="img" aria-labelledby="ao-star-title ao-star-desc">
        <title id="ao-star-title">${title}</title>
        <desc id="ao-star-desc">考试成绩 ${score} 分，考试通过</desc>
        <defs>
          <linearGradient id="star-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fcf4d6"/><stop offset=".28" stop-color="#f9e085"/><stop offset=".68" stop-color="#f4c76e"/><stop offset="1" stop-color="#e7a56c"/>
          </linearGradient>
          <linearGradient id="star-gold-edge" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#fcf4d6"/><stop offset=".5" stop-color="#f9e085"/><stop offset="1" stop-color="#e7a56c"/>
          </linearGradient>
          <radialGradient id="star-ivory" cx="46%" cy="37%" r="68%">
            <stop offset="0" stop-color="#fefefe"/><stop offset=".72" stop-color="#fcf4d6"/><stop offset="1" stop-color="#efe3c3"/>
          </radialGradient>
          <linearGradient id="star-coral" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ee897f"/><stop offset=".48" stop-color="#e97769"/><stop offset="1" stop-color="#e26c59"/>
          </linearGradient>
          <linearGradient id="star-coral-edge" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#e97769"/><stop offset="1" stop-color="#ca5640"/>
          </linearGradient>
          <linearGradient id="star-score" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ee897f"/><stop offset=".42" stop-color="#e97769"/><stop offset="1" stop-color="#e26c59"/>
          </linearGradient>
          <linearGradient id="star-blue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#79bdd2"/><stop offset=".4" stop-color="#4f84e9"/><stop offset="1" stop-color="#2a52c9"/>
          </linearGradient>
          <linearGradient id="star-blue-dark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#3b63c5"/><stop offset="1" stop-color="#203595"/>
          </linearGradient>
          <linearGradient id="star-cyan" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#afdee7"/><stop offset=".5" stop-color="#79bdd2"/><stop offset="1" stop-color="#5693af"/>
          </linearGradient>
          <filter id="star-shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy="16" stdDeviation="15" flood-color="#646574" flood-opacity=".2"/>
          </filter>
          <filter id="star-score-shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy="7" stdDeviation="3" flood-color="#ca5640" flood-opacity=".36"/>
          </filter>
          <filter id="star-text-shadow" x="-20%" y="-40%" width="140%" height="190%">
            <feDropShadow dx="0" dy="5" stdDeviation="2" flood-color="#ca5640" flood-opacity=".56"/>
          </filter>
        </defs>
        <style>
          .star-whole{transform-origin:400px 365px;animation:star-float 5s ease-in-out infinite}.star-ribbon{transform-origin:400px 445px}.star-score{transform-origin:400px 295px}.star-burst{transform-box:fill-box;transform-origin:center;animation:star-twinkle 2.7s ease-in-out infinite}.star-burst.b2{animation-delay:-.9s}.star-burst.b3{animation-delay:-1.8s}.star-streamer{transform-box:fill-box;transform-origin:center;animation:star-streamer 4.5s ease-in-out infinite}.star-streamer.r2{animation-delay:-1.4s}.star-streamer.r3{animation-delay:-2.8s}.ao-star-intro .star-whole{animation:star-enter 900ms cubic-bezier(.16,.9,.25,1.16) both,star-float 5s 1.15s ease-in-out infinite}.ao-star-intro .star-ribbon{animation:ribbon-enter 720ms 380ms cubic-bezier(.16,.9,.22,1.18) both}.ao-star-intro .star-score{animation:score-enter 650ms 620ms cubic-bezier(.18,.9,.2,1.3) both}.ao-star-intro .star-party{animation:party-enter 900ms 650ms cubic-bezier(.1,.8,.2,1) both}@keyframes star-enter{0%{opacity:0;transform:translateY(36px) scale(.58) rotate(-5deg)}65%{opacity:1;transform:translateY(-7px) scale(1.04) rotate(1deg)}100%{opacity:1;transform:none}}@keyframes ribbon-enter{0%{opacity:0;transform:scaleX(.35) rotate(-4deg)}70%{opacity:1;transform:scaleX(1.05) rotate(1deg)}100%{opacity:1;transform:none}}@keyframes score-enter{0%{opacity:0;transform:scale(.12) rotate(-12deg)}70%{opacity:1;transform:scale(1.1) rotate(2deg)}100%{opacity:1;transform:none}}@keyframes party-enter{0%{opacity:0;transform:scale(.5)}100%{opacity:1;transform:none}}@keyframes star-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}@keyframes star-twinkle{0%,100%{opacity:.55;transform:scale(.82) rotate(0)}50%{opacity:1;transform:scale(1.08) rotate(12deg)}}@keyframes star-streamer{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(3px) rotate(2deg)}}@media(prefers-reduced-motion:reduce){.ao-star-svg *{animation:none!important}}
        </style>

        <g class="star-whole" filter="url(#star-shadow)">
          <g class="star-party">
            <g class="star-streamer" fill="none" stroke-linecap="round" stroke-width="14">
              <path d="M151 125c-32-28-61 17-22 35" stroke="#e97769"/>
              <path d="M650 133c38-20 59 24 18 39" stroke="#ee897f"/>
              <path d="M93 310c-35 7-34 45 4 36" stroke="#79bdd2"/>
              <path d="M702 303c35-4 43 31 8 42" stroke="#79bdd2"/>
            </g>
            <g class="star-streamer r2" fill="none" stroke-linecap="round" stroke-width="12">
              <path d="M202 95c12 33 43 5 31-21" stroke="#afdee7"/>
              <path d="M582 89c-7 35-40 19-34-9" stroke="#79bdd2"/>
              <path d="M86 245c24-30 50-1 29 24" stroke="#4f84e9"/>
              <path d="M714 230c-14 37-51 13-30-15" stroke="#4f84e9"/>
            </g>
            <g class="star-streamer r3" fill="none" stroke-linecap="round" stroke-width="11">
              <path d="M116 183c-24-2-26-31-5-40" stroke="#afdee7"/>
              <path d="M689 178c26 7 36-20 18-34" stroke="#ee897f"/>
            </g>
            <g fill="#f9e085" stroke="#e7a56c" stroke-width="3">
              <path class="star-burst" d="m100 183 11 22 25 4-18 17 4 25-22-12-22 12 4-25-18-17 25-4Z"/>
              <path class="star-burst b2" d="m665 141 13 27 30 4-22 21 6 30-27-15-27 15 5-30-21-21 30-4Z"/>
              <path class="star-burst b3" d="m696 386 8 17 19 3-14 13 4 19-17-9-17 9 3-19-14-13 19-3Z"/>
            </g>
            <g>
              <circle cx="161" cy="64" r="10" fill="#f9e085" stroke="#e7a56c" stroke-width="3"/>
              <circle cx="635" cy="84" r="10" fill="#f9e085" stroke="#e7a56c" stroke-width="3"/>
              <circle cx="724" cy="277" r="8" fill="#f4c76e"/>
              <circle cx="76" cy="285" r="8" fill="#f4c76e"/>
              <circle cx="108" cy="374" r="9" fill="#79bdd2"/>
              <circle cx="682" cy="368" r="9" fill="#79bdd2"/>
              <circle cx="534" cy="80" r="12" fill="url(#star-blue)"/>
              <rect x="57" y="103" width="20" height="20" rx="3" transform="rotate(38 67 113)" fill="#e97769"/>
              <rect x="722" y="103" width="20" height="20" rx="3" transform="rotate(-22 732 113)" fill="#ee897f"/>
              <rect x="257" y="54" width="12" height="29" rx="3" transform="rotate(27 263 68)" fill="#79bdd2"/>
            </g>
          </g>

          <path d="M229 408C212 515 289 604 400 623c111-19 188-108 171-215-39 77-96 119-171 128-75-9-132-51-171-128Z" fill="#afdee7" stroke="#79bdd2" stroke-width="9"/>
          <path d="M256 430c21 79 74 129 144 148 70-19 123-69 144-148-42 52-90 79-144 86-54-7-102-34-144-86Z" fill="url(#star-cyan)" stroke="#5693af" stroke-width="6"/>
          <g stroke="#203595" stroke-width="6" stroke-linejoin="round">
            <path d="M310 190c-61 20-108 61-133 116l-55 41 55 25-45 62 79 1-26 83 130-68 22-158Z" fill="url(#star-blue-dark)"/>
            <path d="M291 221c-43 25-75 59-92 99l-41 30 48 20-35 45 64 5-13 56 90-50 18-116Z" fill="url(#star-blue)"/>
            <path d="M490 190c61 20 108 61 133 116l55 41-55 25 45 62-79 1 26 83-130-68-22-158Z" fill="url(#star-blue-dark)"/>
            <path d="M509 221c43 25 75 59 92 99l41 30-48 20 35 45-64 5 13 56-90-50-18-116Z" fill="url(#star-blue)"/>
          </g>
          <g fill="url(#star-cyan)" stroke="#5693af" stroke-width="5">
            <path d="M276 226c-69 34-107 93-91 145 8 27 31 39 51 23 13-11 8-27-7-34-20-11-15-53 12-76 14-13 33-23 53-31Z"/>
            <path d="M524 226c69 34 107 93 91 145-8 27-31 39-51 23-13-11-8-27 7-34 20-11 15-53-12-76-14-13-33-23-53-31Z"/>
            <path d="M222 397c-28 30-14 69 28 84l32-25c-33-13-42-31-25-47Z"/>
            <path d="M578 397c28 30 14 69-28 84l-32-25c33-13 42-31 25-47Z"/>
          </g>

          <path d="M400 91c15 0 25 17 43 62l20 48 53 4c48 4 63 12 67 27 4 14-8 29-43 61l-39 36 13 52c12 45 11 65-2 74-13 10-31 2-72-22l-40-24-40 24c-41 24-59 32-72 22-13-9-14-29-2-74l13-52-39-36c-35-32-47-47-43-61 4-15 19-23 67-27l53-4 20-48c18-45 28-62 43-62Z" fill="url(#star-gold)" stroke="#e7a56c" stroke-width="12" stroke-linejoin="round"/>
          <path d="M400 111c11 0 18 16 34 56l17 45 49 4c39 3 53 9 56 20 3 10-8 22-37 49l-36 33 12 48c10 37 9 52 0 59-9 7-24 0-58-20l-37-22-37 22c-34 20-49 27-58 20-9-7-10-22 0-59l12-48-36-33c-29-27-40-39-37-49 3-11 17-17 56-20l49-4 17-45c16-40 23-56 34-56Z" fill="none" stroke="#fcf4d6" stroke-width="6" opacity=".9"/>
          <ellipse cx="400" cy="307" rx="137" ry="125" fill="url(#star-ivory)" stroke="#f4c76e" stroke-width="8"/>
          <ellipse cx="374" cy="267" rx="92" ry="65" fill="#fff" opacity=".28"/>

          <g class="star-score">
            <text x="400" y="363" fill="url(#star-score)" stroke="#ca5640" stroke-width="4" paint-order="stroke" font-family="Georgia,'Times New Roman',serif" font-size="${scoreSize}" font-weight="800" letter-spacing="-9" text-anchor="middle" filter="url(#star-score-shadow)">${score}</text>
          </g>

          <path d="M181 407 65 455l53 38-33 71 167-52Z" fill="url(#star-coral-edge)" stroke="#ca5640" stroke-width="7" stroke-linejoin="round"/>
          <path d="m619 407 116 48-53 38 33 71-167-52Z" fill="url(#star-coral-edge)" stroke="#ca5640" stroke-width="7" stroke-linejoin="round"/>
          <path d="m177 490-59 3 62 53 66-44Z" fill="#ca5640"/>
          <path d="m623 490 59 3-62 53-66-44Z" fill="#ca5640"/>
          <g class="star-ribbon">
            <path d="M143 395Q400 340 657 395l-30 139Q400 479 173 534Z" fill="url(#star-coral)" stroke="#ca5640" stroke-width="8" stroke-linejoin="round"/>
            <path d="M159 405Q400 357 641 405" fill="none" stroke="#f3cebc" stroke-width="6" opacity=".9"/>
            <path d="M172 517Q400 464 628 517" fill="none" stroke="#ca5640" stroke-width="5" opacity=".62"/>
            <text x="400" y="469" fill="#fefefe" font-family="'Songti SC','STSong','Noto Serif SC',serif" font-size="56" font-weight="900" letter-spacing="2" text-anchor="middle" filter="url(#star-text-shadow)">${title}</text>
          </g>

          <path d="M286 524Q400 598 514 524l-13 72Q400 655 299 596Z" fill="url(#star-cyan)" stroke="#5693af" stroke-width="7"/>
          <path d="M400 563 441 606 400 652 359 606Z" fill="url(#star-gold-edge)" stroke="#e7a56c" stroke-width="7"/>
          <path d="m400 579 25 27-25 29-25-29Z" fill="#79bdd2" stroke="#5693af" stroke-width="5"/>
          <path d="m400 586 14 20-14 18-14-18Z" fill="#fcf4d6"/>
        </g>
      </svg>`;
  };

  const decorate = (card) => {
    if (card.dataset.aoStarReady === "true") return;
    const score = readScore(card);
    const intro = card.classList.contains("is-intro");
    card.dataset.aoStarReady = "true";
    card.classList.add("ao-star-card");
    card.innerHTML = createStar(score, intro);
  };

  const decorateAll = (root = document) => {
    if (root.matches?.(selector)) decorate(root);
    root.querySelectorAll?.(selector).forEach(decorate);
  };

  decorateAll();
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) decorateAll(node);
    }));
  }).observe(document.body, { childList: true, subtree: true });
})();
